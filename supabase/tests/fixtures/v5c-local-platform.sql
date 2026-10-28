-- TEST ONLY: minimal Auth/Storage SQL interfaces, not a Supabase installation.
-- All identities and objects are synthetic. No external connections are used.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_storage_admin nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Reproduce audited broad defaults so missing REVOKEs cannot pass unnoticed.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
create schema storage authorization supabase_storage_admin;
create type storage.buckettype as enum ('STANDARD');
create table storage.buckets (
  id text primary key, name text not null unique,
  public boolean default false,
  file_size_limit bigint, allowed_mime_types text[],
  type storage.buckettype default 'STANDARD',
  versioning_status text default 'DISABLED',
  avif_autodetection boolean default false,
  lifecycle_configuration jsonb, lifecycle_configuration_generation uuid
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id), name text not null,
  unique(bucket_id, name)
);
alter table storage.buckets owner to supabase_storage_admin;
alter table storage.objects owner to supabase_storage_admin;
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated;
grant all on storage.buckets, storage.objects to service_role;
insert into auth.users values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222');
