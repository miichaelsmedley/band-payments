-- Super paid outside the app (e.g. AustralianSuper Employer Portal clearing house) before any API integration.
-- Fund labels are names only: never member numbers, TFNs or bank details.
create table band_finance.external_super_payments (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), engagement_id uuid not null,
  revision_id uuid not null, person_id uuid not null, amount_cents bigint not null check(amount_cents>0),
  qe_day date not null, paid_on date not null check(paid_on>=qe_day),
  portal_reference text not null check(length(trim(portal_reference)) between 1 and 100),
  fund_label text not null check(length(trim(fund_label)) between 1 and 120 and fund_label !~ '[0-9]{5,}'),
  status text not null default 'paid_via_portal' check(status in ('paid_via_portal','fund_receipt_confirmed')),
  receipt_evidence text check(receipt_evidence is null or length(trim(receipt_evidence)) between 3 and 500),
  recorded_by uuid not null, recorded_at timestamptz not null default now(), confirmed_by uuid, confirmed_at timestamptz,
  check((status='fund_receipt_confirmed')=(receipt_evidence is not null and confirmed_by is not null and confirmed_at is not null)),
  primary key(workspace_id,id), unique(workspace_id,engagement_id),
  foreign key(workspace_id,engagement_id) references band_finance.engagements(workspace_id,id),
  foreign key(workspace_id,revision_id) references band_finance.revisions(workspace_id,id),
  foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id)
);
alter table band_finance.external_super_payments enable row level security;
revoke all on band_finance.external_super_payments from public, anon, authenticated;
grant select on band_finance.external_super_payments to authenticated;
grant all on band_finance.external_super_payments to service_role;
create policy external_super_scoped on band_finance.external_super_payments for select to authenticated using(band_finance.can_review(workspace_id) or band_finance.is_person(workspace_id,person_id));

create function band_finance.record_external_super(w uuid,engagement uuid,revision uuid,amount bigint,qe_day date,paid_on date,reference text,fund_label text) returns uuid language plpgsql security definer set search_path='' as $$
declare e band_finance.engagements; g band_finance.gigs; r band_finance.revisions; x band_finance.external_super_payments; required bigint;
 today date:=(now() at time zone 'Australia/Melbourne')::date; begin
 perform finance_private.require_manager(w); perform finance_private.require_mfa();
 select * into e from band_finance.engagements where workspace_id=w and id=engagement;
 if not found then raise exception 'not_found'; end if;
 -- Same gig lock as prepare_run: a portal record and a pay run cannot race for one engagement.
 select * into g from band_finance.gigs where workspace_id=w and id=e.gig_id for update;
 select * into x from band_finance.external_super_payments where workspace_id=w and engagement_id=engagement;
 if found then
   if x.revision_id=revision and x.amount_cents=amount and x.qe_day=record_external_super.qe_day and x.paid_on=record_external_super.paid_on
     and x.portal_reference=reference and x.fund_label=record_external_super.fund_label then return x.id; end if;
   raise exception 'external_super_already_recorded';
 end if;
 if exists(select 1 from band_finance.contributions where workspace_id=w and engagement_id=engagement) then raise exception 'super_already_in_pay_run'; end if;
 select * into r from band_finance.revisions where workspace_id=w and id=revision and gig_id=e.gig_id;
 if not found or r.gig_version<>g.version then raise exception 'stale_version'; end if;
 -- Same source as prepare_run: the allocation's super cents in the authoritative revision. Never adjusted.
 select (a->>'super')::bigint into required from jsonb_array_elements(r.result->'allocations') a where a->>'id'=engagement::text;
 if required is null or required<=0 or amount is distinct from required then raise exception 'external_super_amount_mismatch'; end if;
 if qe_day is null or paid_on is null or paid_on<qe_day or qe_day>today or paid_on>today then raise exception 'external_super_date_invalid'; end if;
 if length(trim(coalesce(reference,''))) not between 1 and 100 or length(trim(coalesce(fund_label,''))) not between 1 and 120 or fund_label ~ '[0-9]{5,}' then raise exception 'external_super_details_invalid'; end if;
 insert into band_finance.external_super_payments(workspace_id,engagement_id,revision_id,person_id,amount_cents,qe_day,paid_on,portal_reference,fund_label,recorded_by)
 values(w,engagement,revision,e.person_id,amount,qe_day,paid_on,reference,fund_label,auth.uid()) returning * into x;
 perform finance_private.audit(w,'super.external_portal_recorded',x.id,jsonb_build_object('engagementId',engagement,'revisionId',revision,'amountCents',amount,'qeDay',qe_day,'paidOn',paid_on));
 return x.id;
end $$;
create function band_finance.confirm_external_super_receipt(w uuid,id uuid,evidence text) returns uuid language plpgsql security definer set search_path='' as $$
declare x band_finance.external_super_payments; begin
 perform finance_private.require_manager(w); perform finance_private.require_mfa();
 select * into x from band_finance.external_super_payments p where p.workspace_id=w and p.id=confirm_external_super_receipt.id for update;
 if not found then raise exception 'not_found'; end if;
 if x.status='fund_receipt_confirmed' then
   if x.receipt_evidence=evidence then return x.id; end if;
   raise exception 'external_super_already_confirmed';
 end if;
 if length(trim(coalesce(evidence,''))) not between 3 and 500 then raise exception 'receipt_evidence_required'; end if;
 update band_finance.external_super_payments p set status='fund_receipt_confirmed',receipt_evidence=evidence,confirmed_by=auth.uid(),confirmed_at=now()
 where p.workspace_id=w and p.id=x.id;
 perform finance_private.audit(w,'super.external_fund_receipt_confirmed',x.id);
 return x.id;
end $$;
revoke all on function band_finance.record_external_super(uuid,uuid,uuid,bigint,date,date,text,text),band_finance.confirm_external_super_receipt(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function band_finance.record_external_super(uuid,uuid,uuid,bigint,date,date,text,text),band_finance.confirm_external_super_receipt(uuid,uuid,text) to authenticated;

-- prepare_run REFUSES (external_super_recorded) rather than excluding externally paid engagements:
-- the funding check, the gig-wide agreement/fund check and the snapshot all cover every allocation, and an
-- exclusion would silently drop super if a later revision changed the amount. Otherwise identical to 202610190003.
create or replace function band_finance.prepare_run(w uuid,revision uuid,funding_available bigint,funding_evidence text) returns uuid language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from band_finance.external_super_payments x join band_finance.engagements e on e.workspace_id=x.workspace_id and e.id=x.engagement_id where x.workspace_id=w and e.gig_id=g.id) then raise exception 'external_super_recorded'; end if;
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
