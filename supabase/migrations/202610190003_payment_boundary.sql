-- Provider activation is deployment configuration, never a browser command.
alter table finance_private.configuration add column deadline_rules_reviewed boolean not null default false;
alter table finance_private.configuration add column funding_method text;
alter table finance_private.configuration add column provider_fee_cents bigint check(provider_fee_cents>=0);

create function band_finance.prepare_run(w uuid,revision uuid,funding_available bigint,funding_evidence text) returns uuid language plpgsql security definer set search_path='' as $$
declare r band_finance.revisions; g band_finance.gigs; payer band_finance.workspaces; cfg finance_private.configuration;
 run uuid; snapshot jsonb; items jsonb; existing uuid; begin
 perform finance_private.require_manager(w);
 select * into cfg from finance_private.configuration where id;
 if not found or not cfg.provider_ready or cfg.environment='local' or not cfg.deadline_rules_reviewed or cfg.funding_method is null or cfg.provider_fee_cents is null then raise exception 'provider_and_deadline_setup_required'; end if;
 select * into r from band_finance.revisions where workspace_id=w and id=revision;
 if not found then raise exception 'not_found'; end if;
 select * into g from band_finance.gigs where workspace_id=w and id=r.gig_id for update;
 if g.version<>r.gig_version then raise exception 'stale_version'; end if;
 select id into existing from band_finance.pay_runs where workspace_id=w and revision_id=revision;
 if found then return existing; end if;
 if (r.result->>'balance')::bigint<0 or (r.result->>'residual')::bigint<>0 then raise exception 'settlement_review_required'; end if;
 if funding_available<(r.result->>'upcomingCashBeforeRecordedTransfers')::bigint+cfg.provider_fee_cents or length(trim(funding_evidence))<3 then raise exception 'funding_check_required'; end if;
 select * into payer from band_finance.workspaces where id=w;
 if payer.legal_name is null or payer.abn is null or payer.provider_employer_ref is null or payer.mandate_ref is null then raise exception 'payer_setup_required'; end if;
 if exists(select 1 from band_finance.engagements e join band_finance.people p on p.workspace_id=e.workspace_id and p.id=e.person_id where e.workspace_id=w and e.gig_id=g.id and
   (e.response<>'accepted' or p.fund_status<>'verified' or p.provider_member_ref is null)) then raise exception 'agreement_or_fund_required'; end if;
 select jsonb_agg(jsonb_build_object('engagementId',e.id,'engagementVersion',e.version,'personId',p.id,'memberRef',p.provider_member_ref,'destinationVersion',p.destination_version,'amountCents',(a->>'super')::bigint)) into items
 from jsonb_array_elements(r.result->'allocations') a join band_finance.engagements e on e.workspace_id=w and e.id=(a->>'id')::uuid
 join band_finance.people p on p.workspace_id=w and p.id=e.person_id where (a->>'super')::bigint>0;
 if items is null then raise exception 'no_contributions'; end if;
 snapshot:=jsonb_build_object('workspaceId',w,'gigId',g.id,'revisionId',revision,'revisionDigest',r.digest,'payerVersion',payer.payer_version,
 'employerRef',payer.provider_employer_ref,'mandateRef',payer.mandate_ref,'payday',g.payday,'ruleVersion',r.rule_version,
 'fundingMethod',cfg.funding_method,'providerFeeCents',cfg.provider_fee_cents,'fundingAvailable',funding_available,'fundingEvidence',funding_evidence,'items',items);
 insert into band_finance.pay_runs(workspace_id,revision_id,digest,snapshot,environment) values(w,revision,encode(extensions.digest(snapshot::text,'sha256'),'hex'),snapshot,cfg.environment) returning id into run;
 insert into band_finance.contributions(workspace_id,run_id,engagement_id,person_id,amount_cents,destination_version,member_ref)
 select w,run,(x->>'engagementId')::uuid,(x->>'personId')::uuid,(x->>'amountCents')::bigint,(x->>'destinationVersion')::integer,x->>'memberRef' from jsonb_array_elements(items) x;
 perform finance_private.audit(w,'pay_run.prepared',run); return run;
end $$;

create function band_finance.authorise_run(w uuid,run uuid,expected_digest text,command_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p band_finance.pay_runs; a band_finance.approvals; cfg finance_private.configuration; begin
 perform finance_private.require_manager(w); perform finance_private.require_mfa();
 if not exists(select 1 from band_finance.memberships where workspace_id=w and user_id=auth.uid() and can_approve) then raise exception 'approver_required' using errcode='42501'; end if;
 -- Serialise at the workspace too: a reused key on two different runs cannot race.
 perform 1 from band_finance.workspaces where id=w for update;
 select * into p from band_finance.pay_runs where workspace_id=w and id=run for update;
 if not found or p.digest<>expected_digest then raise exception 'snapshot_mismatch'; end if;
 select * into a from band_finance.approvals where workspace_id=w and idempotency_key=command_key;
 if found then
   if a.run_id=run and a.digest=expected_digest then return a.id; end if;
   raise exception 'idempotency_conflict';
 end if;
 select * into a from band_finance.approvals where workspace_id=w and run_id=run;
 if found then return a.id; end if;
 select * into cfg from finance_private.configuration where id;
 if not found or not cfg.provider_ready or not cfg.submission_enabled or cfg.environment<>p.environment then raise exception 'provider_unavailable'; end if;
 if p.revoked_at is not null then raise exception 'approval_revoked'; end if;
 if not exists(select 1 from band_finance.workspaces where id=w and payer_version=(p.snapshot->>'payerVersion')::integer) then raise exception 'payer_changed'; end if;
 if exists(select 1 from band_finance.contributions c join band_finance.people x on x.workspace_id=c.workspace_id and x.id=c.person_id
  join band_finance.engagements e on e.workspace_id=c.workspace_id and e.id=c.engagement_id
  where c.workspace_id=w and c.run_id=run and (x.destination_version<>c.destination_version or x.fund_status<>'verified' or e.response<>'accepted')) then raise exception 'destination_or_agreement_changed'; end if;
 insert into band_finance.approvals(workspace_id,run_id,idempotency_key,digest,approved_by,aal) values(w,run,command_key,expected_digest,auth.uid(),'aal2') returning * into a;
 insert into band_finance.outbox_jobs(workspace_id,run_id) values(w,run);
 update band_finance.pay_runs set status='queued' where workspace_id=w and id=run;
 perform finance_private.audit(w,'pay_run.authorised',run,jsonb_build_object('digest',expected_digest,'approvalId',a.id)); return a.id;
end $$;
create function band_finance.revoke_run(w uuid,run uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform finance_private.require_manager(w); perform finance_private.require_mfa();
 perform 1 from band_finance.pay_runs where workspace_id=w and id=run for update;
 if exists(select 1 from band_finance.outbox_jobs where workspace_id=w and run_id=run and started_at is not null) then raise exception 'provider_reconciliation_required'; end if;
 update band_finance.pay_runs set revoked_at=now(),status='revoked' where workspace_id=w and id=run;
 update band_finance.outbox_jobs set state='blocked',last_error_code='revoked' where workspace_id=w and run_id=run;
 perform finance_private.audit(w,'pay_run.revoked',run);
end $$;
grant execute on function band_finance.prepare_run(uuid,uuid,bigint,text),band_finance.authorise_run(uuid,uuid,text,uuid),band_finance.revoke_run(uuid,uuid) to authenticated;

-- Worker-only primitives. An expired post-start lease never authorises a fresh submit.
create function band_finance.claim_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j band_finance.outbox_jobs; p band_finance.pay_runs; cfg finance_private.configuration; begin
 select * into cfg from finance_private.configuration where id;
 if not found or not cfg.provider_ready or not cfg.submission_enabled then return null; end if;
 select * into j from band_finance.outbox_jobs where state in ('queued','leased','submission_uncertain') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by next_attempt_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into p from band_finance.pay_runs where workspace_id=j.workspace_id and id=j.run_id for update;
 if p.environment<>cfg.environment or p.revoked_at is not null or not exists(select 1 from band_finance.approvals where workspace_id=j.workspace_id and run_id=j.run_id and expires_at>now()) or
 exists(select 1 from band_finance.contributions c join band_finance.people x on x.workspace_id=c.workspace_id and x.id=c.person_id where c.workspace_id=j.workspace_id and c.run_id=j.run_id and (x.destination_version<>c.destination_version or x.fund_status<>'verified' or c.external_reference is not null)) then
   update band_finance.outbox_jobs set state='blocked',last_error_code='authority_or_destination_changed' where workspace_id=j.workspace_id and id=j.id; return null;
 end if;
 update band_finance.outbox_jobs set state=case when started_at is null then 'leased' else 'submission_uncertain' end,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where workspace_id=j.workspace_id and id=j.id returning * into j;
 return jsonb_build_object('job',to_jsonb(j),'snapshot',p.snapshot,'digest',p.digest,'environment',p.environment,'action',case when j.started_at is null then 'submit' else 'reconcile' end);
end $$;
create function band_finance.mark_submission_started(w uuid,job uuid,token uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 update band_finance.outbox_jobs set started_at=now(),attempts=attempts+1,state='submission_uncertain' where workspace_id=w and id=job and lease_token=token and lease_until>now() and started_at is null;
 if not found then raise exception 'lease_or_attempt_invalid'; end if;
end $$;
create function band_finance.hold_uncertain_job(w uuid,job uuid,token uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 update band_finance.outbox_jobs set state='manual_reconciliation',last_error_code='outcome_unestablished',lease_until=null where workspace_id=w and id=job and lease_token=token and lease_until>now();
 if not found then raise exception 'lease_invalid'; end if;
end $$;
grant execute on function band_finance.claim_job(),band_finance.mark_submission_started(uuid,uuid,uuid),band_finance.hold_uncertain_job(uuid,uuid,uuid) to service_role;
