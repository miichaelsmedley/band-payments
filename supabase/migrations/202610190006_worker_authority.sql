create function finance_private.run_authority_valid(w uuid,run uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from band_finance.pay_runs p
 join band_finance.workspaces payer on payer.id=p.workspace_id
 join band_finance.approvals a on a.workspace_id=p.workspace_id and a.run_id=p.id
 join band_finance.memberships m on m.workspace_id=a.workspace_id and m.user_id=a.approved_by
 cross join finance_private.configuration cfg
 where p.workspace_id=w and p.id=run and p.revoked_at is null and a.expires_at>now()
 and m.can_approve and m.role in ('owner','finance_manager') and cfg.provider_ready and cfg.submission_enabled
 and cfg.environment=p.environment and payer.payer_version=(p.snapshot->>'payerVersion')::integer
 and not exists(select 1 from band_finance.contributions c
   join band_finance.people x on x.workspace_id=c.workspace_id and x.id=c.person_id
   join band_finance.engagements e on e.workspace_id=c.workspace_id and e.id=c.engagement_id
   where c.workspace_id=w and c.run_id=run and (x.destination_version<>c.destination_version or x.fund_status<>'verified' or x.provider_member_ref is distinct from c.member_ref or e.response<>'accepted' or c.external_reference is not null)))
$$;
revoke all on function finance_private.run_authority_valid(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function band_finance.claim_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare j band_finance.outbox_jobs; p band_finance.pay_runs; cfg finance_private.configuration; begin
 select * into cfg from finance_private.configuration where id;
 if not found or not cfg.provider_ready or not cfg.submission_enabled then return null; end if;
 select * into j from band_finance.outbox_jobs where state in ('queued','leased','submission_uncertain') and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by next_attempt_at for update skip locked limit 1;
 if not found then return null; end if;
 select * into p from band_finance.pay_runs where workspace_id=j.workspace_id and id=j.run_id for update;
 if not finance_private.run_authority_valid(j.workspace_id,j.run_id) then
   update band_finance.outbox_jobs set state='blocked',last_error_code='authority_or_destination_changed' where workspace_id=j.workspace_id and id=j.id; return null;
 end if;
 update band_finance.outbox_jobs set state=case when started_at is null then 'leased' else 'submission_uncertain' end,lease_token=gen_random_uuid(),lease_until=now()+interval '60 seconds' where workspace_id=j.workspace_id and id=j.id returning * into j;
 return jsonb_build_object('job',to_jsonb(j),'snapshot',p.snapshot,'digest',p.digest,'environment',p.environment,'action',case when j.started_at is null then 'submit' else 'reconcile' end);
end $$;
create or replace function band_finance.mark_submission_started(w uuid,job uuid,token uuid) returns void language plpgsql security definer set search_path='' as $$
declare j band_finance.outbox_jobs; begin
 select * into j from band_finance.outbox_jobs where workspace_id=w and id=job for update;
 if not found or not finance_private.run_authority_valid(w,j.run_id) then raise exception 'authority_changed'; end if;
 update band_finance.outbox_jobs set started_at=now(),attempts=attempts+1,state='submission_uncertain' where workspace_id=w and id=job and lease_token=token and lease_until>now() and started_at is null;
 if not found then raise exception 'lease_or_attempt_invalid'; end if;
end $$;
