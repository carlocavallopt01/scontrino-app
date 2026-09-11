-- Migrazione: richiesta di riapertura chiusura da parte dello staff.
-- Incollare in Supabase -> SQL Editor -> Run (progetto già esistente).

alter table closures add column if not exists reopen_requested boolean not null default false;

create or replace function request_closure_reopen(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update closures set reopen_requested = true where id = p_id;
$$;
grant execute on function request_closure_reopen(text) to anon;

create or replace function dismiss_closure_reopen_request(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update closures set reopen_requested = false where id = p_id;
$$;
grant execute on function dismiss_closure_reopen_request(text) to anon;
