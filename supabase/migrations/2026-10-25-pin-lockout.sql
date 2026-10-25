-- Blocco temporaneo dopo troppi tentativi di PIN sbagliati, per impedire
-- di provare tutte le combinazioni a forza di tentativi automatici.
-- Dopo 5 PIN sbagliati di fila (per una sede, o per il PIN Titolare), i
-- tentativi successivi vengono rifiutati per 5 minuti — anche se nel
-- frattempo si indovina il PIN giusto, per non rivelare a chi sta
-- tentando "da fuori" che è stato bloccato (vede sempre "PIN errato",
-- punto, come se stesse ancora sbagliando). Un PIN corretto inserito PRIMA
-- di raggiungere il blocco resetta subito il conteggio.
--
-- Incollare per intero in Supabase -> SQL Editor -> Run.

create table if not exists pin_attempts (
  target text primary key,
  failed_count integer not null default 0,
  locked_until timestamptz
);

alter table pin_attempts enable row level security;
-- Nessuna policy per anon: la tabella è usata solo internamente dalle
-- funzioni qui sotto (security definer), mai letta/scritta direttamente.

create or replace function verify_location_pin(p_location_id text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until timestamptz;
  v_ok boolean;
begin
  select locked_until into v_locked_until from pin_attempts where target = p_location_id;
  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  select exists (
    select 1 from locations where id = p_location_id and pin = p_pin
  ) into v_ok;

  if v_ok then
    delete from pin_attempts where target = p_location_id;
  else
    insert into pin_attempts (target, failed_count, locked_until)
    values (p_location_id, 1, null)
    on conflict (target) do update
      set failed_count = pin_attempts.failed_count + 1,
          locked_until = case
            when pin_attempts.failed_count + 1 >= 5 then now() + interval '5 minutes'
            else null
          end;
  end if;

  return v_ok;
end;
$$;
grant execute on function verify_location_pin(text, text) to anon;

create or replace function verify_owner_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until timestamptz;
  v_ok boolean;
begin
  select locked_until into v_locked_until from pin_attempts where target = 'owner';
  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  select exists (
    select 1 from settings where key = 'owner_pin' and value->>'pin' = p_pin
  ) into v_ok;

  if v_ok then
    delete from pin_attempts where target = 'owner';
  else
    insert into pin_attempts (target, failed_count, locked_until)
    values ('owner', 1, null)
    on conflict (target) do update
      set failed_count = pin_attempts.failed_count + 1,
          locked_until = case
            when pin_attempts.failed_count + 1 >= 5 then now() + interval '5 minutes'
            else null
          end;
  end if;

  return v_ok;
end;
$$;
grant execute on function verify_owner_pin(text) to anon;
