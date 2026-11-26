-- PPS Lens – KI-Bildbewertung: Tabellen + Funktionen (lens-gate_v2, Claude 26.11.2026) – ersetzt 20261126120000 (v1)
-- v2: nach dem Datenschutz-Konzept (konzept_datenschutz_foto_bewertungs_app.md) überarbeitet
--     (Eric 26.11.: „Kannst du diesen Worker … daraufhin nochmal checken, nochmal einen neuen erstellen“):
--   - Einwilligung „Foto geht zur Bewertung an OpenAI“ wird mit Zeitpunkt + Textversion gespeichert (lc_einwilligungen)
--   - Kontingent zählt in lc_nutzung (nur Zahlen) → Nutzer dürfen ihre Bewertungen jetzt LÖSCHEN (Art. 17 DSGVO),
--     ohne dass das Monatskontingent zurückgesetzt wird
--   - „Meine Daten“ als Export (Art. 15/20): lc_meine_daten()
--   - Bildrechte: jede Bewertung speichert, dass der Nutzer die Rechte am Bild bestätigt hat
--   - Vorschaubild nur, wenn der Nutzer es für den Verlauf will (Standard: kein Bild gespeichert)
-- Einmal im Supabase-Projekt „Web Login“ (rkgjuq…) ausführen: SQL Editor → einfügen → Run.
-- Darf mehrfach laufen, auch nach v1. Ändert nichts an user_access, book_access oder book_products.
--
-- Pläne (Eric 26.11.: Pro = MemberAbo „ja“, Limits „ja“): free = 3 je Kalendermonat · pro = 300 je Monat
-- Weitere Pro-Produkte:  insert into public.lc_pro_produkte values ('<digistore-id>', '<name>');

-- 1) Welche Digistore-Produkte schalten Lens Pro frei
create table if not exists public.lc_pro_produkte (
  product_id text primary key,
  name       text not null,
  created_at timestamptz not null default now()
);
insert into public.lc_pro_produkte (product_id, name) values ('629796', 'MemberAbo')
on conflict (product_id) do update set name = excluded.name;
alter table public.lc_pro_produkte enable row level security;
grant select on public.lc_pro_produkte to authenticated;
grant all on public.lc_pro_produkte to service_role;
drop policy if exists "Alle Angemeldeten lesen Pro-Produkte" on public.lc_pro_produkte;
create policy "Alle Angemeldeten lesen Pro-Produkte" on public.lc_pro_produkte
  for select to authenticated using (true);

-- 2) Bewertungen (das Foto selbst wird nie gespeichert)
create table if not exists public.lc_analysen (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  titel      text,
  gesamt     numeric(3,1) not null,
  bildaufbau numeric(3,1),
  licht      numeric(3,1),
  schaerfe   numeric(3,1),
  farbe      numeric(3,1),
  ergebnis   jsonb not null,
  exif       jsonb,
  thumb      text,
  modell     text,
  sprache    text
);
alter table public.lc_analysen add column if not exists rechte_bestaetigt boolean not null default false; -- v2
create index if not exists lc_analysen_user_zeit_idx on public.lc_analysen (user_id, created_at desc);
alter table public.lc_analysen enable row level security;
grant select on public.lc_analysen to authenticated;
grant all on public.lc_analysen to service_role;
drop policy if exists "Nutzer lesen eigene Bewertungen" on public.lc_analysen;
create policy "Nutzer lesen eigene Bewertungen" on public.lc_analysen
  for select to authenticated using (user_id = auth.uid());

-- 3) Nutzung je Monat – nur Zahlen, bleibt beim Löschen von Bewertungen stehen (v2)
create table if not exists public.lc_nutzung (
  user_id uuid not null references auth.users(id) on delete cascade,
  monat   text not null,                 -- 'YYYY-MM' nach deutscher Zeit
  anzahl  int  not null default 0,
  primary key (user_id, monat)
);
alter table public.lc_nutzung enable row level security;
grant select on public.lc_nutzung to authenticated;
grant all on public.lc_nutzung to service_role;
drop policy if exists "Nutzer lesen eigene Nutzung" on public.lc_nutzung;
create policy "Nutzer lesen eigene Nutzung" on public.lc_nutzung
  for select to authenticated using (user_id = auth.uid());
-- Übernahme aus v1: bisherige Bewertungen als Nutzung zählen (nur einmal, da „do nothing“)
insert into public.lc_nutzung (user_id, monat, anzahl)
select user_id, to_char(created_at at time zone 'Europe/Berlin', 'YYYY-MM'), count(*)
  from public.lc_analysen group by 1, 2
on conflict (user_id, monat) do nothing;

-- 4) Einwilligungen (Nachweis nach Art. 7 DSGVO): wer, wofür, welche Textversion, wann (v2)
create table if not exists public.lc_einwilligungen (
  user_id    uuid not null references auth.users(id) on delete cascade,
  art        text not null,              -- 'ki_bewertung' = Foto geht zur Bewertung an OpenAI
  version    text not null,              -- Version des Hinweistextes in der App, z. B. '2026-11-26'
  created_at timestamptz not null default now(),
  widerrufen_at timestamptz,
  primary key (user_id, art, version)
);
alter table public.lc_einwilligungen enable row level security;
grant select on public.lc_einwilligungen to authenticated;
grant all on public.lc_einwilligungen to service_role;
drop policy if exists "Nutzer lesen eigene Einwilligungen" on public.lc_einwilligungen;
create policy "Nutzer lesen eigene Einwilligungen" on public.lc_einwilligungen
  for select to authenticated using (user_id = auth.uid());

-- 5) Plan: 'keins' (nicht angemeldet) · 'free' · 'pro'  (unverändert zu v1)
create or replace function public.lc_mein_plan()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'keins'
    when exists (select 1 from auth.users u
                  where u.id = auth.uid() and lower(u.email) = 'support@prophotoskills.com') then 'pro'
    when exists (select 1 from public.book_access ba
                   join public.lc_pro_produkte p on p.product_id = ba.product_id
                  where ba.user_id = auth.uid() and ba.revoked_at is null) then 'pro'
    when exists (select 1 from public.user_access ua
                   join public.lc_pro_produkte p on p.product_id = ua.digistore_product_id
                  where ua.user_id = auth.uid() and ua.has_access = true and ua.revoked_at is null) then 'pro'
    else 'free'
  end
$$;
revoke all on function public.lc_mein_plan() from public, anon;
grant execute on function public.lc_mein_plan() to authenticated;

-- 6) Stand: Plan, genutzt, Limit, Monat + ob die Einwilligung für diese Textversion vorliegt
drop function if exists public.lc_mein_stand();   -- v1 hatte keinen Parameter
create or replace function public.lc_mein_stand(p_version text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan  text := public.lc_mein_plan();
  v_monat text := to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM');
  v_genutzt int := 0;
  v_ok boolean := false;
begin
  if v_plan <> 'keins' then
    select coalesce(max(anzahl), 0) into v_genutzt from public.lc_nutzung where user_id = auth.uid() and monat = v_monat;
    select exists (select 1 from public.lc_einwilligungen
                    where user_id = auth.uid() and art = 'ki_bewertung' and widerrufen_at is null
                      and (p_version is null or version = p_version)) into v_ok;
  end if;
  return jsonb_build_object('plan', v_plan, 'genutzt', v_genutzt,
    'limit', case v_plan when 'pro' then 300 when 'free' then 3 else 0 end,
    'monat', v_monat, 'einwilligung', v_ok);
end
$$;
revoke all on function public.lc_mein_stand(text) from public, anon;
grant execute on function public.lc_mein_stand(text) to authenticated;

-- 7) Einwilligung geben / widerrufen
create or replace function public.lc_einwilligung(p_version text, p_erteilt boolean default true)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'nicht angemeldet' using errcode = '42501'; end if;
  if p_version is null or length(p_version) > 40 then raise exception 'Version fehlt' using errcode = '22023'; end if;
  if p_erteilt then
    insert into public.lc_einwilligungen (user_id, art, version) values (auth.uid(), 'ki_bewertung', p_version)
    on conflict (user_id, art, version) do update set widerrufen_at = null, created_at = now();
  else
    update public.lc_einwilligungen set widerrufen_at = now()
     where user_id = auth.uid() and art = 'ki_bewertung' and widerrufen_at is null;
  end if;
  return public.lc_mein_stand(p_version);
end
$$;
revoke all on function public.lc_einwilligung(text, boolean) from public, anon;
grant execute on function public.lc_einwilligung(text, boolean) to authenticated;

-- 8) Bewertung speichern + Kontingent buchen (ruft der Worker nach der KI-Antwort auf)
drop function if exists public.lc_analyse_speichern(jsonb, jsonb, text, text, text);  -- Fassung v1
create or replace function public.lc_analyse_speichern(
  p_ergebnis jsonb,
  p_version  text,
  p_rechte   boolean,
  p_exif     jsonb default null,
  p_thumb    text  default null,
  p_modell   text  default null,
  p_sprache  text  default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_stand jsonb;
  v_id    uuid;
  s       jsonb := p_ergebnis -> 'scores';
begin
  if auth.uid() is null then raise exception 'nicht angemeldet' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('lc_analyse:' || auth.uid()::text));
  v_stand := public.lc_mein_stand(p_version);
  if not (v_stand ->> 'einwilligung')::boolean then
    return v_stand || jsonb_build_object('ok', false, 'grund', 'einwilligung');
  end if;
  if p_rechte is not true then
    return v_stand || jsonb_build_object('ok', false, 'grund', 'rechte');
  end if;
  if (v_stand ->> 'genutzt')::int >= (v_stand ->> 'limit')::int then
    return v_stand || jsonb_build_object('ok', false, 'grund', 'kontingent');
  end if;
  if coalesce(jsonb_typeof(s -> 'total'), '') <> 'number' then
    raise exception 'Ergebnis ohne scores.total' using errcode = '22023';
  end if;
  if p_thumb is not null and (length(p_thumb) > 40000 or p_thumb not like 'data:image/jpeg;base64,%') then
    p_thumb := null;
  end if;

  insert into public.lc_analysen (user_id, titel, gesamt, bildaufbau, licht, schaerfe, farbe, ergebnis, exif, thumb, modell, sprache, rechte_bestaetigt)
  values (auth.uid(), left(p_ergebnis ->> 'title', 120),
          least(10, greatest(0, (s ->> 'total')::numeric)),
          least(10, greatest(0, (s ->> 'comp')::numeric)),
          least(10, greatest(0, (s ->> 'light')::numeric)),
          least(10, greatest(0, (s ->> 'sharp')::numeric)),
          least(10, greatest(0, (s ->> 'color')::numeric)),
          p_ergebnis, p_exif, p_thumb, left(p_modell, 60), left(p_sprache, 5), true)
  returning id into v_id;

  insert into public.lc_nutzung (user_id, monat, anzahl) values (auth.uid(), v_stand ->> 'monat', 1)
  on conflict (user_id, monat) do update set anzahl = public.lc_nutzung.anzahl + 1;

  return jsonb_build_object('ok', true, 'id', v_id, 'plan', v_stand ->> 'plan',
                            'genutzt', (v_stand ->> 'genutzt')::int + 1, 'limit', (v_stand ->> 'limit')::int);
end
$$;
revoke all on function public.lc_analyse_speichern(jsonb, text, boolean, jsonb, text, text, text) from public, anon;
grant execute on function public.lc_analyse_speichern(jsonb, text, boolean, jsonb, text, text, text) to authenticated;

-- 9) Löschen (Art. 17): eine Bewertung (p_id) oder alle (p_id = null). Kontingent bleibt.
create or replace function public.lc_analysen_loeschen(p_id uuid default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'nicht angemeldet' using errcode = '42501'; end if;
  delete from public.lc_analysen where user_id = auth.uid() and (p_id is null or id = p_id);
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.lc_analysen_loeschen(uuid) from public, anon;
grant execute on function public.lc_analysen_loeschen(uuid) to authenticated;

-- 10) Meine Daten (Art. 15/20): alles, was Lens über den Nutzer speichert
create or replace function public.lc_meine_daten()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'erstellt', now(),
    'konto', (select jsonb_build_object('id', u.id, 'email', u.email) from auth.users u where u.id = auth.uid()),
    'plan', public.lc_mein_plan(),
    'einwilligungen', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.created_at) from public.lc_einwilligungen e where e.user_id = auth.uid()), '[]'::jsonb),
    'nutzung', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id' order by n.monat) from public.lc_nutzung n where n.user_id = auth.uid()), '[]'::jsonb),
    'bewertungen', coalesce((select jsonb_agg(to_jsonb(a) - 'user_id' order by a.created_at) from public.lc_analysen a where a.user_id = auth.uid()), '[]'::jsonb))
  end
$$;
revoke all on function public.lc_meine_daten() from public, anon;
grant execute on function public.lc_meine_daten() to authenticated;
