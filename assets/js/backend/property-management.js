import { createAdminAuth } from './auth.js';
import { AdminAccessDenied, propertyStatuses, adminPropertyTypes } from './admin-properties.js';

export class PropertyConflict extends Error {
  constructor() { super('Otra edición cambió esta propiedad. Recargá los datos antes de guardar; tus cambios no se guardaron.'); this.name = 'PropertyConflict'; }
}
const text = (value, name, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${name}: completá un texto de hasta ${max} caracteres.`);
  return value.trim();
};
const decimal = (value, name, whole) => {
  const raw = String(value ?? '');
  if (!new RegExp(`^\\d{1,${whole}}(?:\\.\\d{1,2})?$`).test(raw) || Number(raw) <= 0) throw new Error(`${name}: ingresá un número positivo con hasta dos decimales.`);
  return raw;
};
const rooms = (value, name) => {
  if (value === '' || value === null || value === undefined) return null;
  if (!/^\d+$/.test(String(value)) || Number(value) > 32767) throw new Error(`${name}: ingresá un entero entre 0 y 32767 o dejá el campo vacío.`);
  return Number(value);
};
export function validateProperty(input, zones, amenities) {
  if (!input || !Object.hasOwn(adminPropertyTypes,input.property_type) || !['venta','alquiler'].includes(input.operation) || !Object.hasOwn(propertyStatuses,input.status) || !['ARS','USD'].includes(input.currency)) throw new Error('Seleccioná tipo, operación, estado y moneda válidos.');
  if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(input.public_code || '')) throw new Error('El código público no es válido.');
  if (!zones.some(zone=>zone.slug === input.zone_slug)) throw new Error('Seleccioná una zona disponible.');
  if (!Array.isArray(input.amenities) || input.amenities.some(slug=>!amenities.some(a=>a.slug === slug))) throw new Error('Seleccioná comodidades disponibles.');
  if (typeof input.featured !== 'boolean' || typeof input.is_demo !== 'boolean') throw new Error('Las opciones de propiedad no son válidas.');
  const data = {
    public_code:input.public_code,title:text(input.title,'Título',200),description:text(input.description,'Descripción',20000),
    property_type:input.property_type,operation:input.operation,status:input.status,
    price:decimal(input.price,'Precio',12),currency:input.currency,zone_slug:input.zone_slug,
    city:text(input.city,'Ciudad',100),area:decimal(input.area,'Superficie',10),
    bedrooms:rooms(input.bedrooms,'Habitaciones'),bathrooms:rooms(input.bathrooms,'Baños'),
    approximate_location:text(input.approximate_location,'Ubicación aproximada',1000),featured:input.featured,is_demo:input.is_demo,
  };
  if (data.property_type === 'terreno' && (data.bedrooms !== null || data.bathrooms !== null)) throw new Error('Los terrenos deben guardar habitaciones y baños sin informar.');
  return {data,amenities:[...new Set(input.amenities)]};
}
export function createPropertyManager(client) {
  const auth = createAdminAuth(client);
  const authorize = async () => { const user = await auth.getCurrentAdmin(); if (!user) throw new AdminAccessDenied(); return user; };
  return {
    async open(id) {
      const user = await authorize();
      const results = await Promise.all([
        client.from('zones').select('slug,name').order('name'),
        client.from('amenities').select('slug,name').order('name'),
        ...(id ? [client.from('properties').select('*').eq('id',id).maybeSingle(),client.from('property_amenities').select('amenity_slug').eq('property_id',id)] : []),
      ]);
      if (results.some(r=>r.error)) throw new Error('No pudimos cargar los datos de edición. Intentá nuevamente.');
      if (id && !results[2].data) throw new Error('La propiedad no existe o ya no está disponible.');
      return {user,zones:results[0].data,amenities:results[1].data,property:id?results[2].data:null,selected:id?results[3].data.map(a=>a.amenity_slug):[]};
    },
    async save(input, context) {
      await authorize();
      const {data,amenities} = validateProperty(input,context.zones,context.amenities);
      if (!context.property && data.status !== 'draft') throw new Error('Guardá primero la nueva propiedad como borrador.');
      const result = await client.rpc('admin_save_property',{
        p_id:context.property?.id ?? null,p_version:context.property?.version ?? null,p_data:data,p_amenities:amenities,
      }).single();
      if (result.error) {
        if (result.error.code === '40001') throw new PropertyConflict();
        if (result.error.code === '23505') throw new Error('Este código ya existe. Comprobá el listado antes de reintentar para evitar duplicados.');
        if (result.error.code === '42501') throw new AdminAccessDenied();
        if (result.error.code === 'PGRST202') throw new Error('Falta aplicar la migración V5B.2 en Supabase. No se guardaron cambios.');
        throw new Error('No pudimos confirmar el guardado. Conservamos el formulario: revisá el listado antes de reintentar.');
      }
      if (!result.data?.id || !result.data?.version) throw new Error('Respuesta incompleta. Revisá el listado antes de reintentar el guardado.');
      return result.data;
    },
  };
}
