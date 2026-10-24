begin;

create schema if not exists nexo_private;
revoke all on schema nexo_private from public;

create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create function nexo_private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admin_memberships
    where user_id = (select auth.uid()) and role = 'admin' and enabled);
$$;
revoke all on function nexo_private.is_admin() from public;
grant usage on schema nexo_private to anon, authenticated;
grant execute on function nexo_private.is_admin() to anon, authenticated;

create table public.zones (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 100)
);
create table public.amenities (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 1 and 100)
);
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  public_code text not null unique check (public_code ~ '^[a-z0-9][a-z0-9_-]{2,79}$'),
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null check (length(trim(description)) between 1 and 20000),
  property_type text not null check (property_type in ('casa','departamento','terreno')),
  operation text not null check (operation in ('venta','alquiler')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  price numeric(14,2) not null check (price > 0 and price <> 'NaN'::numeric),
  currency text not null check (currency in ('ARS','USD')),
  zone_slug text not null references public.zones(slug),
  city text not null default 'Corrientes Capital' check (length(trim(city)) between 1 and 100),
  area numeric(12,2) not null check (area > 0 and area <> 'NaN'::numeric),
  area_unit text not null default 'm²' check (area_unit = 'm²'),
  bedrooms smallint check (bedrooms >= 0),
  bathrooms smallint check (bathrooms >= 0),
  approximate_location text not null check (length(trim(approximate_location)) between 1 and 1000),
  featured boolean not null default false,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  constraint land_without_rooms check (property_type <> 'terreno' or (bedrooms is null and bathrooms is null))
);
create table public.property_amenities (
  property_id uuid not null references public.properties(id) on delete cascade,
  amenity_slug text not null references public.amenities(slug),
  primary key (property_id, amenity_slug)
);
create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  position integer not null check (position >= 0),
  is_primary boolean not null default false,
  processing_status text not null default 'pending' check (processing_status in ('pending','ready','failed')),
  source_kind text not null check (source_kind in ('ai','licensed','owner_authorized')),
  illustrative boolean not null default true,
  jpeg_path text check (length(jpeg_path) between 1 and 2048),
  width integer check (width > 0),
  height integer check (height > 0),
  alt text not null default '' check (length(alt) <= 500),
  webp_variants jsonb not null default '[]'::jsonb check (jsonb_typeof(webp_variants) = 'array'),
  jpeg_variants jsonb not null default '[]'::jsonb check (jsonb_typeof(jpeg_variants) = 'array'),
  created_at timestamptz not null default now(),
  unique(property_id, position),
  constraint ready_image_metadata check (processing_status <> 'ready' or
    (jpeg_path is not null and width is not null and height is not null and length(trim(alt)) > 0))
);
create unique index property_one_primary_image on public.property_images(property_id) where is_primary;
create index properties_public_listing on public.properties(status, created_at desc, id);
create index properties_search on public.properties(status, property_type, operation, zone_slug);
create index properties_price on public.properties(status, currency, price);
create index properties_area on public.properties(status, area);
create index property_amenities_lookup on public.property_amenities(amenity_slug, property_id);

create function nexo_private.touch_property() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.id := old.id;
  new.public_code := old.public_code;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function nexo_private.touch_property() from public;
create trigger properties_updated before update on public.properties
  for each row execute function nexo_private.touch_property();

alter table public.admin_memberships enable row level security;
alter table public.zones enable row level security;
alter table public.amenities enable row level security;
alter table public.properties enable row level security;
alter table public.property_amenities enable row level security;
alter table public.property_images enable row level security;

revoke all on public.admin_memberships, public.zones, public.amenities, public.properties,
  public.property_amenities, public.property_images from public, anon, authenticated;
grant select on public.zones, public.amenities, public.properties, public.property_amenities, public.property_images to anon, authenticated;
grant select on public.admin_memberships to authenticated;
grant insert, update, delete on public.zones, public.amenities, public.properties, public.property_amenities, public.property_images to authenticated;

-- No client can insert/update/delete memberships, including administrators.
create policy membership_self_read on public.admin_memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy zones_read on public.zones for select to anon, authenticated using (true);
create policy zones_admin on public.zones for all to authenticated
  using ((select nexo_private.is_admin())) with check ((select nexo_private.is_admin()));
create policy amenities_read on public.amenities for select to anon, authenticated using (true);
create policy amenities_admin on public.amenities for all to authenticated
  using ((select nexo_private.is_admin())) with check ((select nexo_private.is_admin()));
create policy properties_read on public.properties for select to anon, authenticated
  using (status = 'published' or (select nexo_private.is_admin()));
create policy properties_admin on public.properties for all to authenticated
  using ((select nexo_private.is_admin())) with check ((select nexo_private.is_admin()));
create policy property_amenities_read on public.property_amenities for select to anon, authenticated
  using ((select nexo_private.is_admin()) or exists
    (select 1 from public.properties p where p.id = property_id and p.status = 'published'));
create policy property_amenities_admin on public.property_amenities for all to authenticated
  using ((select nexo_private.is_admin())) with check ((select nexo_private.is_admin()));
create policy property_images_read on public.property_images for select to anon, authenticated
  using ((select nexo_private.is_admin()) or (processing_status = 'ready' and exists
    (select 1 from public.properties p where p.id = property_id and p.status = 'published')));
create policy property_images_admin on public.property_images for all to authenticated
  using ((select nexo_private.is_admin())) with check ((select nexo_private.is_admin()));

commit;
