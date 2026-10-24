begin;

-- SECURITY INVOKER: all statements remain subject to existing grants and RLS.
-- One transaction for the property, its version and its amenity links.
create function public.admin_save_property(
  p_id uuid, p_version bigint, p_data jsonb, p_amenities text[]
) returns public.properties
language plpgsql security invoker set search_path = '' as $$
declare
  candidate public.properties;
  saved public.properties;
  current_version bigint;
begin
  if not (select nexo_private.is_admin()) then
    raise exception 'Administrative membership required' using errcode = '42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or p_amenities is null
    or array_position(p_amenities, null) is not null then
    raise exception 'Invalid property payload' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_data) as k(key) where key not in
    ('public_code','title','description','property_type','operation','status','price','currency',
     'zone_slug','city','area','bedrooms','bathrooms','approximate_location','featured','is_demo')) then
    raise exception 'Unsupported property field' using errcode = '22023';
  end if;
  select * into candidate from jsonb_populate_record(null::public.properties, p_data);
  if candidate.featured is null or candidate.is_demo is null then
    raise exception 'Property flags required' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_amenities) s(slug)
    where not exists (select 1 from public.amenities a where a.slug = s.slug)) then
    raise exception 'Unknown amenity' using errcode = '23503';
  end if;

  if p_id is null then
    if p_version is not null or candidate.status is distinct from 'draft' then
      raise exception 'New properties must be drafts' using errcode = '22023';
    end if;
    insert into public.properties(public_code,title,description,property_type,operation,status,
      price,currency,zone_slug,city,area,bedrooms,bathrooms,approximate_location,featured,is_demo)
    values(candidate.public_code,candidate.title,candidate.description,candidate.property_type,
      candidate.operation,'draft',candidate.price,candidate.currency,candidate.zone_slug,
      candidate.city,candidate.area,candidate.bedrooms,candidate.bathrooms,
      candidate.approximate_location,candidate.featured,candidate.is_demo)
    returning * into saved;
  else
    select version into current_version from public.properties where id = p_id for update;
    if not found or p_version is null or current_version <> p_version then
      raise exception 'Property changed or unavailable; reload before saving' using errcode = '40001';
    end if;
    if candidate.public_code is distinct from (select public_code from public.properties where id = p_id) then
      raise exception 'Public code cannot change' using errcode = '22023';
    end if;
    update public.properties set title=candidate.title,description=candidate.description,
      property_type=candidate.property_type,operation=candidate.operation,status=candidate.status,
      price=candidate.price,currency=candidate.currency,zone_slug=candidate.zone_slug,
      city=candidate.city,area=candidate.area,bedrooms=candidate.bedrooms,bathrooms=candidate.bathrooms,
      approximate_location=candidate.approximate_location,featured=candidate.featured,is_demo=candidate.is_demo
    where id = p_id returning * into saved;
  end if;
  delete from public.property_amenities where property_id = saved.id;
  insert into public.property_amenities(property_id,amenity_slug)
    select saved.id,slug from (select distinct unnest(p_amenities) as slug) s;
  return saved;
end;
$$;
revoke all on function public.admin_save_property(uuid,bigint,jsonb,text[]) from public, anon;
grant execute on function public.admin_save_property(uuid,bigint,jsonb,text[]) to authenticated;

commit;
