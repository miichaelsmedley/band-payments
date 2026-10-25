begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(25);
-- Disposable records and configuration changes roll back at the end.
insert into auth.users(id,email,email_confirmed_at) values('ffffffff-0000-4000-8000-000000000001','external-manager@example.test',now()),('ffffffff-0000-4000-8000-000000000009','external-player@example.test',now());
insert into auth.sessions(id,user_id,aal) values('ffffffff-0000-4000-8000-000000000002','ffffffff-0000-4000-8000-000000000001','aal2'),('ffffffff-0000-4000-8000-000000000010','ffffffff-0000-4000-8000-000000000009','aal1');
insert into band_finance.workspaces(id,name,legal_name,abn,provider_employer_ref,mandate_ref) values('ffffffff-0000-4000-8000-000000000003','External super test','Synthetic payer','12345678901','test-employer','test-mandate');
insert into band_finance.people(workspace_id,id,name,email,auth_user_id) values
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000004','Player one','external-player@example.test','ffffffff-0000-4000-8000-000000000009'),
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000011','Player two','two@example.test',null),
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000013','Player three','three@example.test',null);
insert into band_finance.memberships(workspace_id,user_id,role,can_approve,person_id) values
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000001','owner',true,null),
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000009','player',false,'ffffffff-0000-4000-8000-000000000004');
insert into band_finance.gigs(workspace_id,id,title,performance_date,payday,draft,version) values('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000005','External fixture','2026-10-17','2026-10-20','{}',2);
insert into band_finance.engagements(workspace_id,id,gig_id,person_id,terms,response) values
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000005','ffffffff-0000-4000-8000-000000000004','{}','accepted'),
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000012','ffffffff-0000-4000-8000-000000000005','ffffffff-0000-4000-8000-000000000011','{}','accepted'),
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000014','ffffffff-0000-4000-8000-000000000005','ffffffff-0000-4000-8000-000000000013','{}','accepted');
insert into band_finance.revisions(workspace_id,id,gig_id,gig_version,input,result,digest,rule_version,created_by) values
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000007','ffffffff-0000-4000-8000-000000000005',1,'{}','{"balance":0,"residual":0,"upcomingCashBeforeRecordedTransfers":11200,"allocations":[{"id":"ffffffff-0000-4000-8000-000000000006","super":1100}]}','stale-digest','test-rule','ffffffff-0000-4000-8000-000000000001'),
 ('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000008','ffffffff-0000-4000-8000-000000000005',2,'{}','{"balance":0,"residual":0,"upcomingCashBeforeRecordedTransfers":11200,"allocations":[{"id":"ffffffff-0000-4000-8000-000000000006","super":1200},{"id":"ffffffff-0000-4000-8000-000000000012","super":900},{"id":"ffffffff-0000-4000-8000-000000000014","super":600}]}','test-digest','test-rule','ffffffff-0000-4000-8000-000000000001');
update finance_private.configuration set environment='sandbox',provider_ready=true,submission_enabled=true,deadline_rules_reviewed=true,funding_method='test-only',provider_fee_cents=0;
create temporary table test_context(recorded uuid, other uuid);
grant all on test_context to authenticated;
insert into test_context default values;
create function pg_temp.as_manager(aal text) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','ffffffff-0000-4000-8000-000000000001','session_id','ffffffff-0000-4000-8000-000000000002','aal',aal,'role','authenticated')::text,true)
$$;
create function pg_temp.as_player() returns void language sql as $$
 select set_config('request.jwt.claims','{"sub":"ffffffff-0000-4000-8000-000000000009","session_id":"ffffffff-0000-4000-8000-000000000010","aal":"aal2","role":"authenticated"}',true)
$$;
grant execute on function pg_temp.as_manager(text), pg_temp.as_player() to authenticated;
set local role authenticated;

select pg_temp.as_player();
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20','2026-10-22','AS-PORTAL-1','AustralianSuper')$$,'42501','forbidden','player cannot record external super');
select pg_temp.as_manager('aal1');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20','2026-10-22','AS-PORTAL-1','AustralianSuper')$$,'42501','mfa_required','manager without MFA is denied');
select pg_temp.as_manager('aal2');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1199,'2026-10-20','2026-10-22','AS-PORTAL-1','AustralianSuper')$$,'P0001','external_super_amount_mismatch','amount must exactly equal required super');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000007',1100,'2026-10-20','2026-10-22','AS-PORTAL-1','AustralianSuper')$$,'P0001','stale_version','superseded revision is rejected');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20',(now() at time zone 'Australia/Melbourne')::date+2,'AS-PORTAL-1','AustralianSuper')$$,'P0001','external_super_date_invalid','future paid date is rejected');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-22','2026-10-20','AS-PORTAL-1','AustralianSuper')$$,'P0001','external_super_date_invalid','paid date before the player was paid is rejected');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20','2026-10-22','AS-PORTAL-1','Member 123456789')$$,'P0001','external_super_details_invalid','fund label cannot carry member numbers');
update test_context set recorded=band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20','2026-10-22','AS-PORTAL-1','AustralianSuper');
select is((select status from band_finance.external_super_payments x join test_context t on t.recorded=x.id),'paid_via_portal','records a portal payment');
select is((select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20','2026-10-22','AS-PORTAL-1','AustralianSuper')),(select recorded from test_context),'identical repeat returns the same record');
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000008',1200,'2026-10-20','2026-10-23','AS-PORTAL-2','AustralianSuper')$$,'P0001','external_super_already_recorded','changed repeat conflicts');
select is((select count(*)::integer from band_finance.audit_events where workspace_id='ffffffff-0000-4000-8000-000000000003' and action='super.external_portal_recorded'),1,'one audit event for one record');
select throws_ok($$select band_finance.prepare_run('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000008',11200,'Test funding evidence')$$,'P0001','external_super_recorded','pay run refuses a gig with portal-paid super');
select is((select count(*)::integer from band_finance.contributions where workspace_id='ffffffff-0000-4000-8000-000000000003'),0,'no contribution was created');
select throws_ok($$insert into band_finance.external_super_payments(workspace_id,engagement_id,revision_id,person_id,amount_cents,qe_day,paid_on,portal_reference,fund_label,recorded_by) values('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000014','ffffffff-0000-4000-8000-000000000008','ffffffff-0000-4000-8000-000000000013',600,'2026-10-20','2026-10-22','x','y','ffffffff-0000-4000-8000-000000000001')$$,'42501',null,'clients cannot insert directly');

-- A contribution already in a pay run blocks the portal path.
reset role;
insert into band_finance.pay_runs(workspace_id,id,revision_id,digest,snapshot,environment) values('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000015','ffffffff-0000-4000-8000-000000000008','run-digest','{}','sandbox');
insert into band_finance.contributions(workspace_id,run_id,engagement_id,person_id,amount_cents,destination_version,member_ref) values('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000015','ffffffff-0000-4000-8000-000000000012','ffffffff-0000-4000-8000-000000000011',900,1,'test-member');
set local role authenticated;
select throws_ok($$select band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000012','ffffffff-0000-4000-8000-000000000008',900,'2026-10-20','2026-10-22','AS-PORTAL-3','AustralianSuper')$$,'P0001','super_already_in_pay_run','existing contribution blocks a portal record');

-- Receipt confirmation.
select pg_temp.as_manager('aal1');
select throws_ok($$select band_finance.confirm_external_super_receipt('ffffffff-0000-4000-8000-000000000003',(select recorded from test_context),'Fund statement 24 Oct')$$,'42501','mfa_required','confirmation requires MFA');
select pg_temp.as_manager('aal2');
select throws_ok($$select band_finance.confirm_external_super_receipt('ffffffff-0000-4000-8000-000000000003',(select recorded from test_context),' ')$$,'P0001','receipt_evidence_required','confirmation requires evidence');
select is((select band_finance.confirm_external_super_receipt('ffffffff-0000-4000-8000-000000000003',recorded,'Fund statement 24 Oct') from test_context),(select recorded from test_context),'confirms fund receipt');
select is((select status from band_finance.external_super_payments x join test_context t on t.recorded=x.id),'fund_receipt_confirmed','status moves to fund_receipt_confirmed');
select is((select band_finance.confirm_external_super_receipt('ffffffff-0000-4000-8000-000000000003',recorded,'Fund statement 24 Oct') from test_context),(select recorded from test_context),'identical confirmation repeat is accepted');
select throws_ok($$select band_finance.confirm_external_super_receipt('ffffffff-0000-4000-8000-000000000003',(select recorded from test_context),'Different evidence')$$,'P0001','external_super_already_confirmed','changed confirmation conflicts');

-- Players see only their own rows; managers see the workspace.
update test_context set other=band_finance.record_external_super('ffffffff-0000-4000-8000-000000000003','ffffffff-0000-4000-8000-000000000014','ffffffff-0000-4000-8000-000000000008',600,'2026-10-20','2026-10-22','AS-PORTAL-4','AustralianSuper');
select is((select count(*)::integer from band_finance.external_super_payments where workspace_id='ffffffff-0000-4000-8000-000000000003'),2,'manager sees every workspace record');
select pg_temp.as_player();
select is((select count(*)::integer from band_finance.external_super_payments),1,'player sees one record');
select is((select person_id from band_finance.external_super_payments),'ffffffff-0000-4000-8000-000000000004'::uuid,'player sees only their own record');
select throws_ok($$select band_finance.confirm_external_super_receipt('ffffffff-0000-4000-8000-000000000003',(select other from test_context),'Fund statement')$$,'42501','forbidden','player cannot confirm receipt');
reset role;
select * from finish();
rollback;
