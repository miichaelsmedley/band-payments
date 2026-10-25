create function band_finance.session_valid() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid() and (s.not_after is null or s.not_after>now()))
$$;
revoke all on function band_finance.session_valid() from public,anon,authenticated,service_role;
grant execute on function band_finance.session_valid() to authenticated;
create or replace function band_finance.role_for(w uuid) returns text language sql stable security definer set search_path='' as $$
 select role from band_finance.memberships where workspace_id=w and user_id=auth.uid() and band_finance.session_valid()
$$;
create or replace function band_finance.is_person(w uuid,p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select band_finance.session_valid() and exists(select 1 from band_finance.people x join band_finance.memberships m on m.workspace_id=x.workspace_id and m.user_id=auth.uid()
 where x.workspace_id=w and x.id=p and x.auth_user_id=auth.uid())
$$;
drop policy membership_self on band_finance.memberships;
create policy membership_self on band_finance.memberships for select to authenticated using(user_id=auth.uid() and band_finance.session_valid());
create or replace function band_finance.claim_invitation(hashed_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i band_finance.invitations; verified_email text; begin
 if not band_finance.session_valid() then raise exception 'invitation_unavailable'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from band_finance.invitations where token_hash=hashed_token for update;
 if verified_email is null or not found or i.email<>verified_email or i.revoked_at is not null or i.claimed_at is not null or i.expires_at<=now() then raise exception 'invitation_unavailable'; end if;
 if exists(select 1 from band_finance.people where workspace_id=i.workspace_id and id=i.person_id and auth_user_id is not null and auth_user_id<>auth.uid()) then raise exception 'invitation_unavailable'; end if;
 update band_finance.people set auth_user_id=auth.uid() where workspace_id=i.workspace_id and id=i.person_id;
 insert into band_finance.memberships(workspace_id,user_id,role,person_id) values(i.workspace_id,auth.uid(),'player',i.person_id) on conflict(workspace_id,user_id) do nothing;
 update band_finance.invitations set claimed_by=auth.uid(),claimed_at=now() where workspace_id=i.workspace_id and id=i.id;
 perform finance_private.audit(i.workspace_id,'invitation.claimed',i.id); return i.workspace_id;
end $$;
revoke all on all tables in schema finance_private from public,anon,authenticated,service_role;
