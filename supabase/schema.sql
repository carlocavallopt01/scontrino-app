-- Schema per l'app Incassi (scontrino-app).
-- Incollare per intero in Supabase -> SQL Editor -> Run (installazione nuova).
--
-- Modello di sicurezza: l'app non usa account personali, solo un PIN per
-- sede + un PIN Titolare. A differenza di una prima versione di questo
-- schema, QUI il PIN viene verificato dentro al database per ogni singola
-- lettura o scrittura (non solo nell'interfaccia): le tabelle con dati
-- sensibili (incassi, chiusure, fondo cassa, PIN delle sedi) non hanno
-- nessuna policy diretta per il ruolo "anon" (quindi sono completamente
-- bloccate dal Row Level Security), e l'unico modo per leggerle o
-- scriverle è chiamare le funzioni RPC qui sotto, che controllano il PIN
-- giusto prima di fare qualsiasi cosa. Così, anche chi scopre l'indirizzo
-- e la chiave pubblica del progetto (sempre recuperabili dal codice del
-- sito, è inevitabile) non può leggere o modificare nulla senza conoscere
-- un PIN valido.
-- Resta comunque possibile provare PIN a forza bruta sulle funzioni di
-- verifica (nessun limite di tentativi): per un livello di sicurezza
-- ancora più alto servirebbe un vero login (Supabase Auth) con limiti sui
-- tentativi, estensione futura possibile ma non necessaria per l'uso
-- interno attuale.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabella sedi
-- ---------------------------------------------------------------------
create table if not exists locations (
  id text primary key,
  name text not null,
  type text not null check (type in ('palestra', 'negozio')),
  pin text not null,
  logo text,
  staff jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table locations enable row level security;

-- Nessuna policy per anon sulla tabella base: non leggibile né scrivibile
-- direttamente (i PIN delle sedi non devono mai uscire in chiaro, e la
-- scrittura passa solo dalla RPC update_location, con PIN Titolare).

-- Vista pubblica senza colonna pin: usata per la selezione sede staff e
-- per la dashboard, leggibile senza PIN (nomi/loghi sedi, nessun dato
-- sensibile). Le viste in Postgres girano di default con i permessi di
-- chi le ha create (postgres), quindi restano leggibili da "anon" anche
-- se la tabella sottostante ha RLS senza policy SELECT.
create or replace view locations_public as
  select id, name, type, logo, staff, created_at, sort_order from locations;

grant select on locations_public to anon;

-- ---------------------------------------------------------------------
-- Tabella incassi/uscite (una riga per voce)
-- ---------------------------------------------------------------------
create table if not exists entries (
  id text primary key,
  location_id text not null references locations(id) on delete cascade,
  date date not null,
  contanti numeric not null default 0,
  contanti_inviato boolean not null default false,
  pos numeric not null default 0,
  altro_incasso numeric not null default 0,
  spese jsonb not null default '[]'::jsonb,
  note text default '',
  cliente text default '',
  abbonamento text default '',
  operatore text default '',
  entered_at timestamptz not null default now()
);

create index if not exists entries_location_date_idx on entries (location_id, date);

alter table entries enable row level security;
-- Nessuna policy per anon: accesso solo tramite le RPC pin-gated qui sotto.

-- ---------------------------------------------------------------------
-- Fondo cassa iniziale (uno per sede e giornata)
-- ---------------------------------------------------------------------
create table if not exists cash_floats (
  location_id text not null references locations(id) on delete cascade,
  date date not null,
  amount numeric not null default 0,
  primary key (location_id, date)
);

alter table cash_floats enable row level security;
-- Nessuna policy per anon: accesso solo tramite le RPC pin-gated qui sotto.

-- ---------------------------------------------------------------------
-- Chiusure di cassa: una per sede/giornata. Presente = quel giorno è
-- bloccato per lo staff (non può più aggiungere/cancellare voci). Solo
-- il Titolare può modificarne i numeri o riaprirla (eliminandola); lo
-- staff può solo segnalare una richiesta di riapertura.
-- ---------------------------------------------------------------------
create table if not exists closures (
  id text primary key,
  location_id text not null references locations(id) on delete cascade,
  date date not null,
  contanti numeric not null default 0,
  pos numeric not null default 0,
  altro_incasso numeric not null default 0,
  totale_uscite numeric not null default 0,
  fondo_cassa numeric,
  operatore text default '',
  submitted_at timestamptz not null default now(),
  reopen_requested boolean not null default false,
  unique (location_id, date)
);

alter table closures enable row level security;
-- Nessuna policy per anon: accesso solo tramite le RPC pin-gated qui sotto.

-- ---------------------------------------------------------------------
-- Tabella impostazioni (PIN Titolare, tipi abbonamento)
-- ---------------------------------------------------------------------
create table if not exists settings (
  key text primary key,
  value jsonb not null
);

alter table settings enable row level security;

-- Il PIN Titolare NON è mai selezionabile/aggiornabile direttamente da
-- anon: solo tramite le funzioni verify_owner_pin / set_owner_pin.
-- I tipi di abbonamento restano leggibili senza PIN (servono allo staff
-- per compilare il modulo), ma scrivibili solo con PIN Titolare tramite
-- save_subscription_types.
drop policy if exists "settings anon select subscription_types" on settings;
create policy "settings anon select subscription_types" on settings
  for select to anon using (key = 'subscription_types');

-- ---------------------------------------------------------------------
-- Funzioni RPC: ogni lettura/scrittura sensibile verifica il PIN giusto
-- (di sede o Titolare) PRIMA di accedere ai dati.
-- ---------------------------------------------------------------------
create or replace function verify_location_pin(p_location_id text, p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from locations where id = p_location_id and pin = p_pin
  );
$$;
grant execute on function verify_location_pin(text, text) to anon;

create or replace function verify_owner_pin(p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from settings where key = 'owner_pin' and value->>'pin' = p_pin
  );
$$;
grant execute on function verify_owner_pin(text) to anon;

create or replace function set_owner_pin(p_old_pin text, p_new_pin text)
returns void
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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

-- Usata solo dalla schermata Impostazioni (richiede il PIN Titolare) per
-- mostrare/modificare i PIN delle sedi.
create or replace function get_locations_admin(p_owner_pin text)
returns setof locations
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from locations order by sort_order;
end;
$$;
grant execute on function get_locations_admin(text) to anon;

create or replace function update_location(
  p_owner_pin text,
  p_id text,
  p_name text,
  p_type text,
  p_pin text,
  p_logo text,
  p_staff jsonb
)
returns void
language plpgsql
security definer
set search_path = public
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

-- Incassi: lo staff legge/scrive solo la propria sede (PIN sede), il
-- Titolare legge tutto (PIN Titolare).
create or replace function get_entries_for_location(p_location_id text, p_pin text, p_date date)
returns setof entries
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  delete from entries;
end;
$$;
grant execute on function clear_all_entries(text) to anon;

-- Fondo cassa: stesso schema (PIN sede per lo staff, PIN Titolare per la
-- vista aggregata del Titolare).
create or replace function get_cash_float(p_location_id text, p_pin text, p_date date)
returns numeric
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  return query select * from cash_floats order by date desc;
end;
$$;
grant execute on function get_cash_floats_admin(text) to anon;

-- Chiusure di cassa: stesso schema, più la verifica sulla richiesta di
-- riapertura dello staff.
create or replace function get_closure(p_location_id text, p_pin text, p_date date)
returns setof closures
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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

create or replace function request_closure_reopen(p_location_id text, p_pin text, p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from locations where id = p_location_id and pin = p_pin) then
    raise exception 'PIN non valido';
  end if;
  update closures set reopen_requested = true where id = p_id and location_id = p_location_id;
end;
$$;
grant execute on function request_closure_reopen(text, text, text) to anon;

create or replace function dismiss_closure_reopen_request(p_owner_pin text, p_id text)
returns void
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
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
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from settings where key = 'owner_pin' and value->>'pin' = p_owner_pin) then
    raise exception 'PIN non valido';
  end if;
  delete from closures where id = p_id;
end;
$$;
grant execute on function reopen_closure(text, text) to anon;

-- ---------------------------------------------------------------------
-- Dati iniziali (eseguire una sola volta; ON CONFLICT evita duplicati)
-- ---------------------------------------------------------------------
insert into locations (id, name, type, pin, logo, staff, sort_order) values
  ('palestra-1', 'FITPOINT ACTIVE', 'palestra', '1111', null, '[]', 1),
  ('palestra-2', 'GIRL POWER', 'palestra', '2222', null, '[]', 2),
  ('negozio-1', 'SPEED SAVA', 'negozio', '3333', null, '[]', 3),
  ('negozio-2', 'SPEED MANDURIA', 'negozio', '4444', null, '[]', 4),
  ('negozio-3', 'SPEED FRANCAVILLA F.', 'negozio', '5555', null, '[]', 5)
on conflict (id) do nothing;

insert into settings (key, value) values
  ('owner_pin', '{"pin": "9999"}'),
  ('subscription_types', '["Mensile", "Trimestrale", "Semestrale", "Annuale", "Ingresso singolo", "Altro"]')
on conflict (key) do nothing;
