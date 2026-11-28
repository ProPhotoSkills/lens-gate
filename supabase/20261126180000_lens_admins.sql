-- PPS Lens – Admin-Konten mit (praktisch) unbegrenzten Bewertungen
-- lens-gate_v5 (Eric 26.11.: „wir brauchen diese eine E-Mail, die alles darf … auch Support“)
-- Ausführen: Supabase-Projekt „Web Login“ → SQL Editor → New query → einfügen → Run. Mehrfach ausführbar.
-- Wirkt NUR auf PPS Lens (lc_-Funktionen). Books, Web-Login und Rollen (user_roles) bleiben unverändert.
--
-- Weitere Admin-Adresse später:   insert into public.lc_admins (email) values ('neu@example.com') on conflict do nothing;
-- Admin entfernen:                delete from public.lc_admins where email = 'neu@example.com';

-- 1) Liste der Admin-Adressen (nur für die Lens-Funktionen lesbar, nicht für Nutzer)
create table if not exists public.lc_admins (
  email      text primary key check (email = lower(email)),
  notiz      text,
  created_at timestamptz not null default now()
);
alter table public.lc_admins enable row level security;   -- keine Policy → kein Nutzer kann sie lesen/ändern
revoke all on public.lc_admins from anon, authenticated;
grant all on public.lc_admins to service_role;

insert into public.lc_admins (email, notiz) values
  ('support@prophotoskills.com', 'war bisher fest im Code als Pro'),
  ('prophotoskills@gmail.com',   'Eric 26.11.2026: Admin, unbegrenzt')
on conflict (email) do nothing;

-- 2) Bin ich Admin?
create or replace function public.lc_ist_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u join public.lc_admins a on a.email = lower(u.email)
                  where u.id = auth.uid())
$$;
revoke all on function public.lc_ist_admin() from public, anon;
grant execute on function public.lc_ist_admin() to authenticated;

-- 3) Plan: Admins = 'pro' (App zeigt PRO), sonst wie bisher
create or replace function public.lc_mein_plan()
returns text language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'keins'
    when public.lc_ist_admin() then 'pro'
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

-- 4) Stand: wie bisher, aber Admins haben 100000 Bewertungen im Monat (= unbegrenzt)
create or replace function public.lc_mein_stand(p_version text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_plan  text := public.lc_mein_plan();
  v_monat text := to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM');
  v_genutzt int := 0;
  v_ok boolean := false;
  v_limit int;
begin
  if v_plan <> 'keins' then
    select coalesce(max(anzahl), 0) into v_genutzt from public.lc_nutzung where user_id = auth.uid() and monat = v_monat;
    select exists (select 1 from public.lc_einwilligungen
                    where user_id = auth.uid() and art = 'ki_bewertung' and widerrufen_at is null
                      and (p_version is null or version = p_version)) into v_ok;
  end if;
  v_limit := case when v_plan <> 'keins' and public.lc_ist_admin() then 100000
                  when v_plan = 'pro' then 300 when v_plan = 'free' then 3 else 0 end;
  return jsonb_build_object('plan', v_plan, 'genutzt', v_genutzt, 'limit', v_limit,
    'monat', v_monat, 'einwilligung', v_ok);
end
$$;
revoke all on function public.lc_mein_stand(text) from public, anon;
grant execute on function public.lc_mein_stand(text) to authenticated;
