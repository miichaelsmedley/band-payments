-- Supabase may define global default EXECUTE grants for authenticated/anon.
-- Schema-scoped defaults cannot subtract global defaults; explicitly close every function.
revoke all on all functions in schema finance_private from public,anon,authenticated,service_role;
revoke all on all functions in schema band_finance from public,anon,authenticated,service_role;
grant execute on function
 band_finance.role_for(uuid),band_finance.is_manager(uuid),band_finance.can_review(uuid),band_finance.is_person(uuid,uuid),
 band_finance.add_person(uuid,text,text),band_finance.save_draft(uuid,uuid,integer,jsonb),band_finance.commit_revision(text,text),
 band_finance.create_invitation(uuid,uuid,uuid,text),band_finance.revoke_invitation(uuid,uuid),band_finance.claim_invitation(text),
 band_finance.update_profile(uuid,uuid,integer,text,text,boolean,boolean),band_finance.respond_agreement(uuid,uuid,integer,text,text),
 band_finance.player_gigs(uuid),band_finance.submit_invoice(uuid,uuid,uuid,text,text,integer,text,text,bigint),
 band_finance.review_invoice(uuid,uuid,uuid),band_finance.record_transfer(uuid,uuid,bigint,date,text),
 band_finance.prepare_run(uuid,uuid,bigint,text),band_finance.authorise_run(uuid,uuid,text,uuid),band_finance.revoke_run(uuid,uuid)
 to authenticated;
grant execute on function band_finance.claim_job(),band_finance.mark_submission_started(uuid,uuid,uuid),band_finance.hold_uncertain_job(uuid,uuid,uuid) to service_role;
