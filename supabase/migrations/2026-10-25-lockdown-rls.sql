-- Blocca l'accesso diretto al database da chi conosce solo l'indirizzo e la
-- chiave pubblica del progetto (bypassando l'app), senza toccare nessuna
-- riga esistente: nessun DROP TABLE, nessun DELETE, nessun dato perso.
--
-- Prima: le tabelle entries/cash_floats/closures erano leggibili e
-- scrivibili da chiunque ("for all to anon using(true)"), e le funzioni che
-- cambiano il PIN Titolare o le sedi non controllavano il PIN attuale.
-- Dopo: queste tabelle non hanno più nessuna policy per "anon" (quindi RLS
-- blocca tutto), e l'unico modo per leggere/scrivere è chiamare le funzioni
-- qui sotto, che verificano il PIN giusto (di sede o Titolare) PRIMA di fare
-- qualsiasi cosa — non solo lato interfaccia come prima.
--
-- Incollare per intero in Supabase -> SQL Editor -> Run.

-- ---------------------------------------------------------------------
-- Chiude le porte dirette: via le policy permissive
-- ---------------------------------------------------------------------
drop policy if exists "locations anon update" on locations;
drop policy if exists "locations anon insert" on locations;
drop policy if exists "entries anon all" on entries;
drop policy if exists "cash_floats anon all" on cash_floats;
drop policy if exists "closures anon all" on closures;
drop policy if exists "settings anon update subscription_types" on settings;
drop policy if exists "settings anon insert subscription_types" on settings;
-- La sola policy che resta per "settings" è la SELECT su subscription_types
-- (serve allo staff per compilare il modulo, nessun PIN coinvolto, nessun
-- dato sensibile). Il PIN Titolare resta, come già prima, mai leggibile.

-- ---------------------------------------------------------------------
-- Sedi: lettura admin e scrittura ora richiedono il PIN Titolare
-- ---------------------------------------------------------------------
drop function if exists get_locations_admin();
create or replace function get_locations_admin(p_owner_pin text)
returns setof locations
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from locations order by sort_order;
end;
$$;
grant execute on function get_locations_admin(text) to anon;

drop function if exists update_location(text, text, text, text, text, jsonb);
create or replace function update_location(
  p_owner_pin text, p_id text, p_name text, p_type text, p_pin text, p_logo text, p_staff jsonb
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  update locations
  set name = p_name, type = p_type, pin = p_pin, logo = p_logo, staff = p_staff
  where id = p_id;
end;
$$;
grant execute on function update_location(text, text, text, text, text, text, jsonb) to anon;

-- ---------------------------------------------------------------------
-- PIN Titolare: ora serve il PIN attuale per poterlo cambiare
-- ---------------------------------------------------------------------
drop function if exists set_owner_pin(text);
create or replace function set_owner_pin(p_old_pin text, p_new_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_old_pin) then
    raise exception 'PIN attuale errato';
  end if;
  insert into settings (key, value) values ('owner_pin', jsonb_build_object('pin', p_new_pin))
  on conflict (key) do update set value = excluded.value;
end;
$$;
grant execute on function set_owner_pin(text, text) to anon;

create or replace function save_subscription_types(p_owner_pin text, p_value jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  insert into settings (key, value) values ('subscription_types', p_value)
  on conflict (key) do update set value = excluded.value;
end;
$$;
grant execute on function save_subscription_types(text, jsonb) to anon;

-- ---------------------------------------------------------------------
-- Incassi: lo staff vede/scrive solo la propria sede (PIN sede), il
-- Titolare vede tutto (PIN Titolare)
-- ---------------------------------------------------------------------
create or replace function get_entries_for_location(p_location_id text, p_pin text, p_date date)
returns setof entries
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from entries where location_id = p_location_id and date = p_date order by entered_at;
end;
$$;
grant execute on function get_entries_for_location(text, text, date) to anon;

create or replace function add_entry(
  p_location_id text, p_pin text, p_id text, p_date date, p_contanti numeric,
  p_contanti_inviato boolean, p_pos numeric, p_altro_incasso numeric, p_spese jsonb,
  p_note text, p_cliente text, p_abbonamento text, p_operatore text, p_entered_at timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  insert into entries (
    id, location_id, date, contanti, contanti_inviato, pos, altro_incasso,
    spese, note, cliente, abbonamento, operatore, entered_at
  ) values (
    p_id, p_location_id, p_date, p_contanti, p_contanti_inviato, p_pos, p_altro_incasso,
    p_spese, p_note, p_cliente, p_abbonamento, p_operatore, p_entered_at
  );
end;
$$;
grant execute on function add_entry(
  text, text, text, date, numeric, boolean, numeric, numeric, jsonb, text, text, text, text, timestamptz
) to anon;

create or replace function delete_entry(p_id text, p_location_id text, p_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  delete from entries where id = p_id and location_id = p_location_id;
end;
$$;
grant execute on function delete_entry(text, text, text) to anon;

create or replace function get_entries_admin(p_owner_pin text)
returns setof entries
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from entries order by entered_at;
end;
$$;
grant execute on function get_entries_admin(text) to anon;

create or replace function clear_all_entries(p_owner_pin text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  delete from entries;
end;
$$;
grant execute on function clear_all_entries(text) to anon;

-- ---------------------------------------------------------------------
-- Fondo cassa: stesso schema (PIN sede per lo staff, PIN Titolare per
-- la vista aggregata del Titolare)
-- ---------------------------------------------------------------------
create or replace function get_cash_float(p_location_id text, p_pin text, p_date date)
returns numeric
language plpgsql security definer set search_path = public
as $$
declare v_amount numeric;
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  select amount into v_amount from cash_floats where location_id = p_location_id and date = p_date;
  return v_amount;
end;
$$;
grant execute on function get_cash_float(text, text, date) to anon;

create or replace function set_cash_float(p_location_id text, p_pin text, p_date date, p_amount numeric)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  insert into cash_floats (location_id, date, amount) values (p_location_id, p_date, p_amount)
  on conflict (location_id, date) do update set amount = excluded.amount;
end;
$$;
grant execute on function set_cash_float(text, text, date, numeric) to anon;

create or replace function get_cash_floats_admin(p_owner_pin text)
returns setof cash_floats
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from cash_floats order by date desc;
end;
$$;
grant execute on function get_cash_floats_admin(text) to anon;

-- ---------------------------------------------------------------------
-- Chiusure di cassa: stesso schema, più la verifica sulla richiesta di
-- riapertura (prima non controllava affatto il PIN di chi la chiamava)
-- ---------------------------------------------------------------------
create or replace function get_closure(p_location_id text, p_pin text, p_date date)
returns setof closures
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from closures where location_id = p_location_id and date = p_date;
end;
$$;
grant execute on function get_closure(text, text, date) to anon;

create or replace function submit_closure(
  p_location_id text, p_pin text, p_id text, p_date date, p_contanti numeric,
  p_pos numeric, p_altro_incasso numeric, p_totale_uscite numeric, p_fondo_cassa numeric,
  p_operatore text, p_submitted_at timestamptz
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  insert into closures (
    id, location_id, date, contanti, pos, altro_incasso, totale_uscite, fondo_cassa, operatore, submitted_at
  ) values (
    p_id, p_location_id, p_date, p_contanti, p_pos, p_altro_incasso, p_totale_uscite, p_fondo_cassa, p_operatore, p_submitted_at
  );
end;
$$;
grant execute on function submit_closure(
  text, text, text, date, numeric, numeric, numeric, numeric, numeric, text, timestamptz
) to anon;

drop function if exists request_closure_reopen(text);
create or replace function request_closure_reopen(p_location_id text, p_pin text, p_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  update closures set reopen_requested = true where id = p_id and location_id = p_location_id;
end;
$$;
grant execute on function request_closure_reopen(text, text, text) to anon;

drop function if exists dismiss_closure_reopen_request(text);
create or replace function dismiss_closure_reopen_request(p_owner_pin text, p_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  update closures set reopen_requested = false where id = p_id;
end;
$$;
grant execute on function dismiss_closure_reopen_request(text, text) to anon;

create or replace function get_closures_admin(p_owner_pin text)
returns setof closures
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from closures order by date desc;
end;
$$;
grant execute on function get_closures_admin(text) to anon;

create or replace function edit_closure(
  p_owner_pin text, p_id text, p_contanti numeric, p_pos numeric, p_altro_incasso numeric,
  p_totale_uscite numeric, p_fondo_cassa numeric
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  update closures
  set contanti = p_contanti, pos = p_pos, altro_incasso = p_altro_incasso,
      totale_uscite = p_totale_uscite, fondo_cassa = p_fondo_cassa
  where id = p_id;
end;
$$;
grant execute on function edit_closure(text, text, numeric, numeric, numeric, numeric, numeric) to anon;

create or replace function reopen_closure(p_owner_pin text, p_id text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  delete from closures where id = p_id;
end;
$$;
grant execute on function reopen_closure(text, text) to anon;
