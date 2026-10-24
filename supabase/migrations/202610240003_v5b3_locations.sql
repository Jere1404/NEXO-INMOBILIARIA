begin;

-- Abort rather than guessing locations for unexpected legacy records.
do $$ begin
  if exists (select 1 from public.properties where city is distinct from 'Corrientes Capital') then
    raise exception 'Review legacy city values before applying V5B.3; no properties were changed';
  end if;
end $$;

create table public.provinces (
  code text primary key check (code ~ '^[0-9]{2}$'),
  name text not null unique check (length(trim(name)) between 1 and 100)
);
insert into public.provinces(code,name) values
  ('02','Ciudad Autónoma de Buenos Aires'),('06','Buenos Aires'),('10','Catamarca'),
  ('14','Córdoba'),('18','Corrientes'),('22','Chaco'),('26','Chubut'),('30','Entre Ríos'),
  ('34','Formosa'),('38','Jujuy'),('42','La Pampa'),('46','La Rioja'),('50','Mendoza'),
  ('54','Misiones'),('58','Neuquén'),('62','Río Negro'),('66','Salta'),('70','San Juan'),
  ('74','San Luis'),('78','Santa Cruz'),('82','Santa Fe'),('86','Santiago del Estero'),
  ('90','Tucumán'),('94','Tierra del Fuego, Antártida e Islas del Atlántico Sur');

create table public.localities (
  id uuid primary key default gen_random_uuid(),
  province_code text not null references public.provinces(code),
  name text not null check (length(trim(name)) between 1 and 100)
);
create unique index locality_name_unique on public.localities
  (province_code, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
insert into public.localities(id,province_code,name)
  values ('00000000-0000-4000-8000-000000000018','18','Corrientes Capital');

-- Default preserves old zone inserts; existing slugs and all property rows stay intact.
alter table public.zones add column locality_id uuid not null
  default '00000000-0000-4000-8000-000000000018' references public.localities(id);
create unique index zone_name_locality_unique on public.zones
  (locality_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

alter table public.provinces enable row level security;
alter table public.localities enable row level security;
revoke all on public.provinces, public.localities from public, anon, authenticated;
grant select on public.provinces, public.localities to anon, authenticated;
grant insert on public.localities to authenticated;
create policy provinces_read on public.provinces for select to anon, authenticated using (true);
create policy localities_read on public.localities for select to anon, authenticated using (true);
create policy localities_admin_insert on public.localities for insert to authenticated
  with check ((select nexo_private.is_admin()));

-- A zone cannot be moved to another locality behind existing properties.
create function nexo_private.keep_zone_location() returns trigger
language plpgsql set search_path = '' as $$ begin
  if new.locality_id is distinct from old.locality_id or new.slug is distinct from old.slug then
    raise exception 'Zone identifiers and locality are permanent; create another zone' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function nexo_private.keep_zone_location() from public;
create trigger zones_keep_location before update on public.zones
  for each row execute function nexo_private.keep_zone_location();

-- Keep the existing city contract while preventing mismatched locality/zone data.
-- Installing this trigger does not update existing properties or their versions.
create function nexo_private.check_property_locality() returns trigger
language plpgsql set search_path = '' as $$
declare locality_name text;
begin
  select l.name into locality_name from public.zones z
    join public.localities l on l.id = z.locality_id where z.slug = new.zone_slug;
  if locality_name is null or new.city is distinct from locality_name then
    raise exception 'City must match the selected zone locality' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function nexo_private.check_property_locality() from public;
create trigger properties_check_locality before insert or update of zone_slug,city on public.properties
  for each row execute function nexo_private.check_property_locality();

-- Reuse matching names safely, including concurrent/repeated requests.
create function public.admin_create_location(p_province text, p_locality text, p_zone text)
returns public.zones language plpgsql security invoker set search_path = '' as $$
declare
  locality_name text := regexp_replace(btrim(p_locality), '\s+', ' ', 'g');
  zone_name text := regexp_replace(btrim(p_zone), '\s+', ' ', 'g');
  locality_uuid uuid;
  result public.zones;
begin
  if not (select nexo_private.is_admin()) then
    raise exception 'Administrative membership required' using errcode = '42501';
  end if;
  if locality_name is null or length(locality_name) not between 1 and 100
    or zone_name is null or length(zone_name) not between 1 and 100 then
    raise exception 'Locality and zone names must contain 1 to 100 characters' using errcode = '22023';
  end if;
  insert into public.localities(province_code,name) values (p_province,locality_name)
    on conflict (province_code, (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))) do nothing;
  select id into locality_uuid from public.localities where province_code=p_province
    and lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))=lower(locality_name);
  insert into public.zones(slug,name,locality_id)
    values ('zona-' || replace(gen_random_uuid()::text,'-',''),zone_name,locality_uuid)
    on conflict (locality_id, (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')))) do nothing;
  select * into result from public.zones where locality_id=locality_uuid
    and lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))=lower(zone_name);
  return result;
end $$;
revoke all on function public.admin_create_location(text,text,text) from public, anon;
grant execute on function public.admin_create_location(text,text,text) to authenticated;

commit;
