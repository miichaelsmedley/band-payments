create function finance_private.require_manager(w uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not band_finance.is_manager(w) then raise exception 'forbidden' using errcode='42501'; end if;
end $$;
create function finance_private.require_mfa() returns void language plpgsql security definer set search_path='' as $$ begin
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'mfa_required' using errcode='42501'; end if;
end $$;
create function band_finance.add_person(w uuid, person_name text, person_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare p uuid; begin
 perform finance_private.require_manager(w);
 if length(person_name) not between 1 and 120 or person_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'invalid_person'; end if;
 insert into band_finance.people(workspace_id,name,email) values(w,person_name,lower(trim(person_email))) returning id into p;
 perform finance_private.audit(w,'person.created',p); return p;
end $$;

create function band_finance.save_draft(w uuid, gig uuid, expected_version integer, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g band_finance.gigs; e jsonb; x jsonb; existing band_finance.engagements; begin
 perform finance_private.require_manager(w);
 if jsonb_typeof(payload)<>'object' or length(payload->>'title') not between 1 and 120 or jsonb_typeof(payload->'engagements')<>'array' then raise exception 'invalid_draft'; end if;
 if exists(select 1 from band_finance.revisions r join band_finance.pay_runs p on p.workspace_id=r.workspace_id and p.revision_id=r.id where r.workspace_id=w and r.gig_id=gig and p.revoked_at is null) then raise exception 'pay_run_locked'; end if;
 if expected_version=0 then
   insert into band_finance.gigs(workspace_id,id,title,performance_date,payday,draft) values(w,gig,payload->>'title',(payload->>'performanceDate')::date,(payload->>'payday')::date,payload) returning * into g;
 else
   select * into g from band_finance.gigs where workspace_id=w and id=gig for update;
   if not found then raise exception 'not_found'; end if;
   if g.version<>expected_version then raise exception 'stale_version' using errcode='40001'; end if;
   -- Removal after an engagement is recorded needs a separate, reviewed cancellation.
   if exists(select 1 from band_finance.engagements en where en.workspace_id=w and en.gig_id=gig and not exists(select 1 from jsonb_array_elements(payload->'engagements') a where (a->>'id')::uuid=en.id)) then raise exception 'engagement_removal_requires_review'; end if;
   update band_finance.gigs set title=payload->>'title',performance_date=(payload->>'performanceDate')::date,payday=(payload->>'payday')::date,draft=payload,version=version+1,updated_at=now() where workspace_id=w and id=gig returning * into g;
 end if;
 for x in select value from jsonb_array_elements(payload->'drawings') loop
   if not exists(select 1 from band_finance.people where workspace_id=w and id=(x->>'personId')::uuid) then raise exception 'invalid_workspace_person'; end if;
 end loop;
 for x in select value from jsonb_array_elements(payload->'expenses') loop
   if x->>'paidBy'='person' and not exists(select 1 from band_finance.people where workspace_id=w and id=(x->>'personId')::uuid) then raise exception 'invalid_workspace_person'; end if;
 end loop;
 for e in select value from jsonb_array_elements(payload->'engagements') loop
   select * into existing from band_finance.engagements where workspace_id=w and id=(e->>'id')::uuid;
   if found and (existing.gig_id<>gig or existing.person_id<>(e->>'personId')::uuid) then raise exception 'engagement_identity_locked'; end if;
   insert into band_finance.engagements(workspace_id,id,gig_id,person_id,terms)
     values(w,(e->>'id')::uuid,gig,(e->>'personId')::uuid,e)
   on conflict(workspace_id,id) do update set terms=excluded.terms,
     version=band_finance.engagements.version+case when band_finance.engagements.terms<>excluded.terms then 1 else 0 end,
     response=case when band_finance.engagements.terms<>excluded.terms then 'pending' else band_finance.engagements.response end,
     responded_at=case when band_finance.engagements.terms<>excluded.terms then null else band_finance.engagements.responded_at end;
 end loop;
 perform finance_private.audit(w,'gig.draft_saved',gig,jsonb_build_object('version',g.version));
 return jsonb_build_object('id',g.id,'version',g.version);
end $$;

create function band_finance.commit_revision(payload_text text, signature text) returns uuid language plpgsql security definer set search_path='' as $$
declare p jsonb; w uuid; g band_finance.gigs; secret text; calculated text; revision uuid; begin
 select signing_key into secret from finance_private.configuration where id;
 calculated:=encode(extensions.hmac(convert_to(payload_text,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex');
 if secret is null or signature is distinct from calculated then raise exception 'invalid_server_attestation' using errcode='42501'; end if;
 p:=payload_text::jsonb; w:=(p->>'workspaceId')::uuid;
 perform finance_private.require_manager(w);
 if (p->>'actorId')::uuid is distinct from auth.uid() or (p->>'expiresAt')::timestamptz<now() then raise exception 'expired_attestation'; end if;
 select * into g from band_finance.gigs where workspace_id=w and id=(p->>'gigId')::uuid for update;
 if not found or g.version<>(p->>'version')::integer or g.draft is distinct from p->'input' then raise exception 'stale_version' using errcode='40001'; end if;
 insert into band_finance.revisions(workspace_id,gig_id,gig_version,input,result,digest,rule_version,created_by)
 values(w,g.id,g.version,g.draft,p->'result',encode(extensions.digest(convert_to(payload_text,'UTF8'),'sha256'),'hex'),p->'result'->>'ruleVersion',auth.uid())
 on conflict(workspace_id,gig_id,gig_version) do nothing returning id into revision;
 if revision is null then select id into revision from band_finance.revisions where workspace_id=w and gig_id=g.id and gig_version=g.version;
 else perform finance_private.audit(w,'calculation.validated',revision,jsonb_build_object('gigVersion',g.version)); end if;
 return revision;
end $$;

create function band_finance.create_invitation(w uuid,gig uuid,person uuid,hashed_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i uuid; recipient text; begin
 perform finance_private.require_manager(w);
 if not exists(select 1 from band_finance.engagements where workspace_id=w and gig_id=gig and person_id=person) then raise exception 'engagement_required'; end if;
 select email into recipient from band_finance.people where workspace_id=w and id=person;
 insert into band_finance.invitations(workspace_id,gig_id,person_id,email,token_hash,expires_at,created_by) values(w,gig,person,recipient,hashed_token,now()+interval '7 days',auth.uid()) returning id into i;
 perform finance_private.audit(w,'invitation.created_not_sent',i); return i;
end $$;
create function band_finance.revoke_invitation(w uuid,invitation uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform finance_private.require_manager(w);
 update band_finance.invitations set revoked_at=now() where workspace_id=w and id=invitation and claimed_at is null;
 if not found then raise exception 'invitation_unavailable'; end if;
 perform finance_private.audit(w,'invitation.revoked',invitation);
end $$;
create function band_finance.claim_invitation(hashed_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i band_finance.invitations; verified_email text; begin
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from band_finance.invitations where token_hash=hashed_token for update;
 if verified_email is null or not found or i.email<>verified_email or i.revoked_at is not null or i.claimed_at is not null or i.expires_at<=now() then raise exception 'invitation_unavailable'; end if;
 if exists(select 1 from band_finance.people where workspace_id=i.workspace_id and id=i.person_id and auth_user_id is not null and auth_user_id<>auth.uid()) then raise exception 'invitation_unavailable'; end if;
 update band_finance.people set auth_user_id=auth.uid() where workspace_id=i.workspace_id and id=i.person_id;
 insert into band_finance.memberships(workspace_id,user_id,role,person_id) values(i.workspace_id,auth.uid(),'player',i.person_id) on conflict(workspace_id,user_id) do nothing;
 update band_finance.invitations set claimed_by=auth.uid(),claimed_at=now() where workspace_id=i.workspace_id and id=i.id;
 perform finance_private.audit(i.workspace_id,'invitation.claimed',i.id); return i.workspace_id;
end $$;

create function band_finance.update_profile(w uuid,person uuid,expected_version integer,legal_name text,abn_value text,gst boolean,notice_accepted boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if not band_finance.is_person(w,person) then raise exception 'forbidden' using errcode='42501'; end if;
 if not notice_accepted or length(legal_name) not between 1 and 120 then raise exception 'notice_and_name_required'; end if;
 update band_finance.people set name=legal_name,abn=nullif(abn_value,''),gst_registered=gst,notice_accepted_at=coalesce(notice_accepted_at,now()),profile_version=profile_version+1,
   bank_status=case when bank_status='verified' then 'needs_correction' else bank_status end,
   fund_status=case when fund_status='verified' then 'needs_correction' else fund_status end,destination_version=destination_version+1
 where workspace_id=w and id=person and profile_version=expected_version;
 if not found then raise exception 'stale_version' using errcode='40001'; end if;
 perform finance_private.audit(w,'profile.updated_verification_invalidated',person);
end $$;
create function band_finance.respond_agreement(w uuid,engagement uuid,expected_version integer,response_value text,note text) returns void language plpgsql security definer set search_path='' as $$
declare e band_finance.engagements; begin
 select * into e from band_finance.engagements where workspace_id=w and id=engagement for update;
 if not found or not band_finance.is_person(w,e.person_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if e.version<>expected_version then raise exception 'stale_version' using errcode='40001'; end if;
 if response_value not in ('accepted','correction_requested') or length(note)>2000 or (response_value='correction_requested' and length(trim(note))=0) then raise exception 'invalid_response'; end if;
 update band_finance.engagements set response=response_value,response_note=note,responded_at=now() where workspace_id=w and id=engagement;
 perform finance_private.audit(w,'agreement.'||response_value,engagement,jsonb_build_object('version',e.version));
end $$;
create function band_finance.player_gigs(w uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'gigId',g.id,'title',g.title,'performanceDate',g.performance_date,'payday',g.payday,'terms',e.terms,'version',e.version,'response',e.response,'personId',e.person_id)), '[]'::jsonb)
 from band_finance.engagements e join band_finance.gigs g on g.workspace_id=e.workspace_id and g.id=e.gig_id
 where e.workspace_id=w and band_finance.is_person(w,e.person_id)
$$;

create function band_finance.submit_invoice(w uuid,engagement uuid,document uuid,object_path text,mime_type text,size_bytes integer,file_hash text,number text,amount bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare e band_finance.engagements; invoice uuid; begin
 select * into e from band_finance.engagements where workspace_id=w and id=engagement;
 if not found or not band_finance.is_person(w,e.person_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if object_path<>w::text||'/'||auth.uid()::text||'/'||document::text then raise exception 'invalid_path'; end if;
 if not exists(select 1 from storage.objects where bucket_id='band-documents' and name=object_path and owner_id=auth.uid()::text) then raise exception 'upload_missing'; end if;
 insert into band_finance.documents(workspace_id,id,person_id,uploaded_by,path,mime,bytes,sha256) values(w,document,e.person_id,auth.uid(),object_path,mime_type,size_bytes,file_hash);
 insert into band_finance.invoices(workspace_id,engagement_id,person_id,document_id,invoice_number,amount_cents) values(w,engagement,e.person_id,document,number,amount) returning id into invoice;
 perform finance_private.audit(w,'invoice.submitted_quarantined',invoice); return invoice;
end $$;
create function band_finance.review_invoice(w uuid,invoice uuid,revision uuid) returns void language plpgsql security definer set search_path='' as $$
declare i band_finance.invoices; r band_finance.revisions; e band_finance.engagements; amount bigint; begin
 perform finance_private.require_manager(w);
 select * into i from band_finance.invoices where workspace_id=w and id=invoice for update;
 if not found then raise exception 'not_found'; end if;
 select * into e from band_finance.engagements where workspace_id=w and id=i.engagement_id;
 select * into r from band_finance.revisions where workspace_id=w and id=revision and gig_id=e.gig_id;
 if not found or not exists(select 1 from band_finance.gigs where workspace_id=w and id=r.gig_id and version=r.gig_version) then raise exception 'stale_version'; end if;
 if not exists(select 1 from band_finance.documents where workspace_id=w and id=i.document_id and scan_status='clean') then raise exception 'document_scan_required'; end if;
 select (a->>'invoice')::bigint into amount from jsonb_array_elements(r.result->'allocations') a where a->>'id'=i.engagement_id::text;
 if amount is distinct from i.amount_cents then raise exception 'invoice_amount_mismatch'; end if;
 update band_finance.invoices set status='matched',reviewed_revision_id=revision where workspace_id=w and id=invoice;
 perform finance_private.audit(w,'invoice.matched',invoice);
end $$;
create function band_finance.record_transfer(w uuid,invoice uuid,amount bigint,paid_date date,evidence text) returns uuid language plpgsql security definer set search_path='' as $$
declare i band_finance.invoices; t band_finance.bank_transfers; begin
 perform finance_private.require_manager(w); perform finance_private.require_mfa();
 select * into i from band_finance.invoices where workspace_id=w and id=invoice for update;
 if not found then raise exception 'not_found'; end if;
 select * into t from band_finance.bank_transfers where workspace_id=w and invoice_id=invoice;
 if found then
   if t.amount_cents=amount and t.paid_on=paid_date and t.evidence_reference=evidence then return t.id; end if;
   raise exception 'transfer_already_recorded';
 end if;
 if i.status<>'matched' or i.amount_cents<>amount or length(trim(evidence))<3 or paid_date>current_date then raise exception 'transfer_evidence_required'; end if;
 if not exists(select 1 from band_finance.people where workspace_id=w and id=i.person_id and bank_status='verified' and bank_secure_reference is not null) then raise exception 'bank_verification_required'; end if;
 if not exists(select 1 from band_finance.revisions r join band_finance.gigs g on g.workspace_id=r.workspace_id and g.id=r.gig_id where r.workspace_id=w and r.id=i.reviewed_revision_id and r.gig_version=g.version) then raise exception 'stale_version'; end if;
 insert into band_finance.bank_transfers(workspace_id,invoice_id,amount_cents,paid_on,evidence_reference,recorded_by) values(w,invoice,amount,paid_date,evidence,auth.uid()) returning * into t;
 perform finance_private.audit(w,'invoice.transfer_operator_recorded',t.id); return t.id;
end $$;

grant execute on function band_finance.add_person(uuid,text,text),band_finance.save_draft(uuid,uuid,integer,jsonb),band_finance.commit_revision(text,text),band_finance.create_invitation(uuid,uuid,uuid,text),band_finance.revoke_invitation(uuid,uuid),band_finance.claim_invitation(text),band_finance.update_profile(uuid,uuid,integer,text,text,boolean,boolean),band_finance.respond_agreement(uuid,uuid,integer,text,text),band_finance.player_gigs(uuid),band_finance.submit_invoice(uuid,uuid,uuid,text,text,integer,text,text,bigint),band_finance.review_invoice(uuid,uuid,uuid),band_finance.record_transfer(uuid,uuid,bigint,date,text) to authenticated;
