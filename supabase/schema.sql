-- Schema per l'app Incassi (scontrino-app).
-- Incollare per intero in Supabase -> SQL Editor -> Run.
--
-- Modello di sicurezza: l'app non usa account personali, solo un PIN per
-- sede + un PIN Titolare, esattamente come la versione precedente.
-- Per evitare che i PIN vengano letti in chiaro da chiunque apra l'app
-- (come succedeva prima, dove il PIN Titolare finiva in memoria nel
-- browser di ogni visitatore), i PIN non sono mai restituiti da una
-- semplice SELECT: si verificano tramite funzioni RPC dedicate.
-- Questo non è sicurezza "bancaria" (chi conosce l'URL e la chiave
-- pubblica del progetto potrebbe comunque leggere/scrivere le sedi e gli
-- incassi, e provare PIN a forza bruta sulle RPC): per un livello di
-- sicurezza più alto servirebbe un vero login (Supabase Auth), che è
-- un'estensione futura possibile ma non necessaria per l'uso interno
-- attuale.

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

-- Nessuna policy SELECT per anon: la tabella base (con i PIN) non è
-- leggibile direttamente dal client pubblico.
drop policy if exists "locations anon update" on locations;
create policy "locations anon update" on locations
  for update to anon using (true) with check (true);

drop policy if exists "locations anon insert" on locations;
create policy "locations anon insert" on locations
  for insert to anon with check (true);

-- Vista pubblica senza colonna pin: usata per la selezione sede staff e
-- per la dashboard. Le viste in Postgres girano di default con i
-- permessi di chi le ha create (postgres), quindi restano leggibili da
-- "anon" anche se la tabella sottostante ha RLS senza policy SELECT.
create or replace view locations_public as
  select id, name, type, logo, staff, created_at, sort_order from locations;

grant select on locations_public to anon;

-- ---------------------------------------------------------------------
-- Tabella incassi/uscite (una riga per voce, non più un unico blob)
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

drop policy if exists "entries anon all" on entries;
create policy "entries anon all" on entries
  for all to anon using (true) with check (true);

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
drop policy if exists "settings anon select subscription_types" on settings;
create policy "settings anon select subscription_types" on settings
  for select to anon using (key = 'subscription_types');

drop policy if exists "settings anon update subscription_types" on settings;
create policy "settings anon update subscription_types" on settings
  for update to anon using (key = 'subscription_types') with check (key = 'subscription_types');

drop policy if exists "settings anon insert subscription_types" on settings;
create policy "settings anon insert subscription_types" on settings
  for insert to anon with check (key = 'subscription_types');

-- ---------------------------------------------------------------------
-- Funzioni RPC per verificare/impostare i PIN senza esporli in SELECT
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

create or replace function set_owner_pin(p_pin text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into settings (key, value) values ('owner_pin', jsonb_build_object('pin', p_pin))
  on conflict (key) do update set value = excluded.value;
$$;
grant execute on function set_owner_pin(text) to anon;

-- Usata solo dalla schermata Impostazioni (già protetta dal PIN
-- Titolare lato interfaccia) per mostrare/modificare i PIN delle sedi.
create or replace function get_locations_admin()
returns setof locations
language sql
security definer
set search_path = public
as $$
  select * from locations order by sort_order;
$$;
grant execute on function get_locations_admin() to anon;

-- Aggiorna una sede con privilegi elevati, bypassando la RLS di anon per
-- questa scrittura: su questo progetto un UPDATE diretto come anon non
-- risultava mai effettivo (nessun errore, ma la riga restava invariata,
-- anche con policy e grant corretti) nonostante il comportamento fosse
-- quello previsto in teoria. Passare da qui evita del tutto il problema.
create or replace function update_location(
  p_id text,
  p_name text,
  p_type text,
  p_pin text,
  p_logo text,
  p_staff jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update locations
  set name = p_name, type = p_type, pin = p_pin, logo = p_logo, staff = p_staff
  where id = p_id;
$$;
grant execute on function update_location(text, text, text, text, text, jsonb) to anon;

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

drop policy if exists "cash_floats anon all" on cash_floats;
create policy "cash_floats anon all" on cash_floats
  for all to anon using (true) with check (true);

-- ---------------------------------------------------------------------
-- Chiusure di cassa: una per sede/giornata. Presente = quel giorno è
-- bloccato per lo staff (non può più aggiungere/cancellare voci). Solo
-- il Titolare può modificarne i numeri o riaprirla (eliminandola).
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
  unique (location_id, date)
);

alter table closures enable row level security;

drop policy if exists "closures anon all" on closures;
create policy "closures anon all" on closures
  for all to anon using (true) with check (true);

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
