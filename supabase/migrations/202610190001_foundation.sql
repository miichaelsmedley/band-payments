create schema band_finance;
create schema finance_private;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema band_finance from public, anon;
revoke all on schema finance_private from public, anon, authenticated;
grant usage on schema band_finance to authenticated, service_role;
alter default privileges in schema band_finance revoke execute on functions from public;
alter default privileges in schema finance_private revoke execute on functions from public;

create table finance_private.configuration (
  id boolean primary key default true check (id),
  signing_key text not null,
  environment text not null check (environment in ('local','sandbox','production')),
  provider_ready boolean not null default false,
  submission_enabled boolean not null default false
);

create table band_finance.workspaces (
  id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 1 and 120),
  legal_name text, abn text, brand_colour text not null default '#203e33',
  pris_workspace_id integer unique, payer_version integer not null default 1,
  provider_employer_ref text, mandate_ref text,
  created_at timestamptz not null default now()
);
create table band_finance.people (
  workspace_id uuid not null references band_finance.workspaces(id), id uuid not null default gen_random_uuid(),
  auth_user_id uuid references auth.users(id), pris_contact_id uuid,
  name text not null check (length(name) between 1 and 120), email text not null,
  abn text check (abn is null or abn ~ '^[0-9]{11}$'), gst_registered boolean not null default false,
  notice_accepted_at timestamptz, profile_version integer not null default 1,
  bank_status text not null default 'not_started' check (bank_status in ('not_started','submitted','verified','needs_correction','expired')),
  fund_status text not null default 'not_started' check (fund_status in ('not_started','submitted','verified','needs_correction','expired')),
  bank_masked text, bank_secure_reference text, fund_masked text, provider_member_ref text,
  destination_version integer not null default 1,
  primary key (workspace_id,id), unique (workspace_id,auth_user_id), unique(workspace_id,email)
);
create table band_finance.memberships (
  workspace_id uuid not null references band_finance.workspaces(id), user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','finance_manager','player','reviewer')),
  can_approve boolean not null default false, person_id uuid,
  primary key(workspace_id,user_id), foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id),
  check (not can_approve or role in ('owner','finance_manager'))
);
create function band_finance.role_for(w uuid) returns text language sql stable security definer set search_path = '' as $$
  select role from band_finance.memberships where workspace_id=w and user_id=auth.uid()
$$;
create function band_finance.is_manager(w uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(band_finance.role_for(w) in ('owner','finance_manager'),false)
$$;
create function band_finance.can_review(w uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(band_finance.role_for(w) in ('owner','finance_manager','reviewer'),false)
$$;
create function band_finance.is_person(w uuid,p uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from band_finance.people x join band_finance.memberships m on m.workspace_id=x.workspace_id and m.user_id=auth.uid()
  where x.workspace_id=w and x.id=p and x.auth_user_id=auth.uid())
$$;
grant execute on function band_finance.role_for(uuid), band_finance.is_manager(uuid), band_finance.can_review(uuid), band_finance.is_person(uuid,uuid) to authenticated;

create table band_finance.gigs (
  workspace_id uuid not null references band_finance.workspaces(id), id uuid not null default gen_random_uuid(),
  pris_gig_id integer, title text not null, performance_date date not null, payday date not null,
  draft jsonb not null, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(workspace_id,id), unique(workspace_id,pris_gig_id)
);
create table band_finance.engagements (
  workspace_id uuid not null, id uuid not null, gig_id uuid not null, person_id uuid not null,
  terms jsonb not null, version integer not null default 1,
  response text not null default 'pending' check (response in ('pending','accepted','correction_requested')),
  response_note text, responded_at timestamptz,
  primary key(workspace_id,id), unique(workspace_id,gig_id,person_id),
  foreign key(workspace_id,gig_id) references band_finance.gigs(workspace_id,id),
  foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id)
);
create table band_finance.revisions (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), gig_id uuid not null,
  gig_version integer not null, input jsonb not null, result jsonb not null,
  digest text not null, rule_version text not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  primary key(workspace_id,id), unique(workspace_id,gig_id,gig_version),
  foreign key(workspace_id,gig_id) references band_finance.gigs(workspace_id,id)
);
create table band_finance.invitations (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), gig_id uuid not null, person_id uuid not null,
  email text not null, token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null, revoked_at timestamptz, claimed_at timestamptz, claimed_by uuid,
  created_by uuid not null, created_at timestamptz not null default now(),
  delivery_status text not null default 'not_sent',
  primary key(workspace_id,id), foreign key(workspace_id,gig_id) references band_finance.gigs(workspace_id,id),
  foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id)
);
create table band_finance.documents (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), person_id uuid not null,
  uploaded_by uuid not null, path text not null unique, mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
  bytes integer not null check(bytes between 1 and 8388608), sha256 text not null,
  scan_status text not null default 'pending_scan' check(scan_status in ('pending_scan','clean','rejected')),
  created_at timestamptz not null default now(),
  primary key(workspace_id,id), foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id)
);
create table band_finance.invoices (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), engagement_id uuid not null, person_id uuid not null,
  document_id uuid not null, invoice_number text not null check(length(invoice_number) between 1 and 100),
  amount_cents bigint not null check(amount_cents between 0 and 1000000000),
  status text not null default 'submitted' check(status in ('submitted','matched','needs_correction')),
  reviewed_revision_id uuid, submitted_at timestamptz not null default now(),
  primary key(workspace_id,id), unique(workspace_id,person_id,invoice_number), unique(workspace_id,engagement_id),
  foreign key(workspace_id,engagement_id) references band_finance.engagements(workspace_id,id),
  foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id),
  foreign key(workspace_id,document_id) references band_finance.documents(workspace_id,id),
  foreign key(workspace_id,reviewed_revision_id) references band_finance.revisions(workspace_id,id)
);
create table band_finance.bank_transfers (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), invoice_id uuid not null,
  amount_cents bigint not null check(amount_cents>0), paid_on date not null, evidence_reference text not null,
  source text not null default 'operator_recorded' check(source='operator_recorded'),
  recorded_by uuid not null, recorded_at timestamptz not null default now(),
  primary key(workspace_id,id), unique(workspace_id,invoice_id),
  foreign key(workspace_id,invoice_id) references band_finance.invoices(workspace_id,id)
);
create table band_finance.pay_runs (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), revision_id uuid not null,
  digest text not null, snapshot jsonb not null, environment text not null check(environment in ('sandbox','production')),
  status text not null default 'ready_for_review', revoked_at timestamptz,
  created_at timestamptz not null default now(), primary key(workspace_id,id), unique(workspace_id,revision_id),
  foreign key(workspace_id,revision_id) references band_finance.revisions(workspace_id,id)
);
create table band_finance.approvals (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), run_id uuid not null,
  idempotency_key uuid not null, digest text not null, approved_by uuid not null, approved_at timestamptz not null default now(),
  expires_at timestamptz not null default(now()+interval '1 day'), aal text not null check(aal='aal2'),
  primary key(workspace_id,id), unique(workspace_id,run_id), unique(workspace_id,idempotency_key),
  foreign key(workspace_id,run_id) references band_finance.pay_runs(workspace_id,id)
);
create table band_finance.contributions (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), run_id uuid not null, engagement_id uuid not null,
  person_id uuid not null, amount_cents bigint not null check(amount_cents>0), destination_version integer not null,
  member_ref text not null, status text not null default 'queued', provider_reference text, external_reference text,
  primary key(workspace_id,id), unique(workspace_id,engagement_id),
  foreign key(workspace_id,run_id) references band_finance.pay_runs(workspace_id,id),
  foreign key(workspace_id,engagement_id) references band_finance.engagements(workspace_id,id),
  foreign key(workspace_id,person_id) references band_finance.people(workspace_id,id)
);
create table band_finance.outbox_jobs (
  workspace_id uuid not null, id uuid not null default gen_random_uuid(), run_id uuid not null,
  operation_ref uuid not null default gen_random_uuid() unique,
  state text not null default 'queued' check(state in ('queued','leased','submission_uncertain','blocked','complete','manual_reconciliation')),
  attempts integer not null default 0, lease_token uuid, lease_until timestamptz, started_at timestamptz,
  next_attempt_at timestamptz not null default now(), last_error_code text,
  primary key(workspace_id,id), unique(workspace_id,run_id),
  foreign key(workspace_id,run_id) references band_finance.pay_runs(workspace_id,id)
);
create table band_finance.provider_events (
  workspace_id uuid not null, provider text not null, event_id text not null, contribution_id uuid not null,
  safe_metadata jsonb not null, received_at timestamptz not null default now(),
  primary key(provider,event_id), foreign key(workspace_id,contribution_id) references band_finance.contributions(workspace_id,id)
);
create table band_finance.audit_events (
  workspace_id uuid not null references band_finance.workspaces(id), id uuid primary key default gen_random_uuid(),
  actor_id uuid, action text not null, entity_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create function finance_private.audit(w uuid, action_name text, entity uuid, metadata jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into band_finance.audit_events(workspace_id,actor_id,action,entity_id,metadata) values(w,auth.uid(),action_name,entity,metadata)
$$;

-- No client has INSERT/UPDATE/DELETE privileges on authoritative tables.
do $$ declare t text; begin
  foreach t in array array['workspaces','people','memberships','gigs','engagements','revisions','invitations','documents','invoices','bank_transfers','pay_runs','approvals','contributions','outbox_jobs','provider_events','audit_events'] loop
    execute format('alter table band_finance.%I enable row level security',t);
    execute format('revoke all on band_finance.%I from public, anon, authenticated',t);
    execute format('grant select on band_finance.%I to authenticated',t);
    execute format('grant all on band_finance.%I to service_role',t);
  end loop;
end $$;
create policy membership_self on band_finance.memberships for select to authenticated using(user_id=auth.uid());
create policy workspace_member on band_finance.workspaces for select to authenticated using(band_finance.role_for(id) is not null);
create policy people_scoped on band_finance.people for select to authenticated using(band_finance.can_review(workspace_id) or band_finance.is_person(workspace_id,id));
create policy engagement_scoped on band_finance.engagements for select to authenticated using(band_finance.can_review(workspace_id) or band_finance.is_person(workspace_id,person_id));
create policy invoices_scoped on band_finance.invoices for select to authenticated using(band_finance.can_review(workspace_id) or band_finance.is_person(workspace_id,person_id));
create policy documents_scoped on band_finance.documents for select to authenticated using(band_finance.can_review(workspace_id) or band_finance.is_person(workspace_id,person_id));
create policy contribution_scoped on band_finance.contributions for select to authenticated using(band_finance.can_review(workspace_id) or band_finance.is_person(workspace_id,person_id));
create policy transfer_scoped on band_finance.bank_transfers for select to authenticated using(band_finance.can_review(workspace_id) or exists(select 1 from band_finance.invoices i where i.workspace_id=bank_transfers.workspace_id and i.id=bank_transfers.invoice_id and band_finance.is_person(i.workspace_id,i.person_id)));
do $$ declare t text; begin
  foreach t in array array['gigs','revisions','invitations','pay_runs','approvals','outbox_jobs','provider_events','audit_events'] loop
    execute format('create policy managers_read on band_finance.%I for select to authenticated using(band_finance.can_review(workspace_id))',t);
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('band-documents','band-documents',false,8388608,array['application/pdf','image/jpeg','image/png']);
create policy band_document_upload on storage.objects for insert to authenticated with check(
  bucket_id='band-documents' and (storage.foldername(name))[2]=auth.uid()::text and
  exists(select 1 from band_finance.memberships m where m.workspace_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid())
);
create policy band_document_download on storage.objects for select to authenticated using(
 bucket_id='band-documents' and exists(select 1 from band_finance.documents d where d.path=name and d.scan_status='clean' and
 (band_finance.can_review(d.workspace_id) or band_finance.is_person(d.workspace_id,d.person_id)))
);
