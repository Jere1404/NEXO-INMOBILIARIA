// Adapter preserves the existing Spanish property contract; the public site does not import this module yet.
export function adaptProperty(row) {
  if (!row?.public_code || !row.zone) throw new Error('Registro de backend incompleto.');
  const images = (row.images || []).filter(image => image.processing_status === 'ready').sort((a,b) => a.position - b.position);
  const primary = images.find(image => image.is_primary) || images[0];
  const adaptImage = image => image ? ({ src: image.jpeg_path, width: image.width, height: image.height, alt: image.alt, webp: image.webp_variants || [], jpeg: image.jpeg_variants || [] }) : null;
  return {
    id:row.public_code, titulo:row.title, tipo:row.property_type, operacion:row.operation,
    zona:row.zone_slug, ubicacion:row.zone.name, ciudad:row.city, precio:Number(row.price), moneda:row.currency,
    superficie:Number(row.area), unidadSuperficie:row.area_unit, habitaciones:row.bedrooms, banos:row.bathrooms,
    descripcion:row.description, ubicacionAproximada:row.approximate_location, destacada:row.featured, ficticia:row.is_demo,
    comodidades:(row.property_amenities || []).map(item => item.amenity_slug),
    imagen:adaptImage(primary), fotografias:images.filter(image => image !== primary).map(adaptImage),
  };
}
const selection = 'public_code,title,description,property_type,operation,price,currency,zone_slug,city,area,area_unit,bedrooms,bathrooms,approximate_location,featured,is_demo,zone:zones(name),images:property_images(position,is_primary,processing_status,jpeg_path,width,height,alt,webp_variants,jpeg_variants),property_amenities(amenity_slug)';
export function createPublicRepository(client) {
  return {
    async listPublished({ page = 0, pageSize = 24 } = {}) {
      if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Paginación inválida.');
      const result = await client.from('properties').select(selection, { count:'exact' }).eq('status','published').order('created_at', { ascending:false }).order('id').range(page*pageSize,(page+1)*pageSize-1);
      if (result.error) throw new Error('No se pudo consultar el catálogo.');
      return { properties:(result.data || []).map(adaptProperty), total:result.count ?? 0 };
    },
    async getPublished(publicCode) {
      if (typeof publicCode !== 'string' || !/^[a-z0-9][a-z0-9_-]{2,79}$/.test(publicCode)) return null;
      const result = await client.from('properties').select(selection).eq('status','published').eq('public_code',publicCode).maybeSingle();
      if (result.error) throw new Error('No se pudo consultar la propiedad.');
      return result.data ? adaptProperty(result.data) : null;
    },
  };
}
