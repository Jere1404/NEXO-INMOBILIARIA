import { createAdminAuth } from './auth.js';

export class AdminAccessDenied extends Error {
  constructor() { super('La sesión no tiene permisos de administración.'); this.name = 'AdminAccessDenied'; }
}
export const propertyStatuses = { draft:'Borrador', published:'Publicada', archived:'Archivada' };
export const adminPropertyTypes = { casa:'Casa', departamento:'Departamento', terreno:'Terreno' };
export function normalizeAdminQuery({ search='', status='', type='', page=0, pageSize=10 } = {}) {
  if (typeof search !== 'string' || search.trim().length > 100) throw new Error('La búsqueda admite hasta 100 caracteres.');
  if ((status && !Object.hasOwn(propertyStatuses,status)) || (type && !Object.hasOwn(adminPropertyTypes,type))) throw new Error('Filtro no válido.');
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100 || !Number.isSafeInteger((page+1)*pageSize)) throw new Error('Paginación no válida.');
  return { search:search.trim(),status,type,page,pageSize };
}
export function searchExpression(search) {
  // Quote the entire PostgREST value; escape ILIKE wildcards and the quoting layer separately.
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
  const quoted = `"${pattern.replaceAll('\\','\\\\').replaceAll('"','\\"')}"`;
  return `title.ilike.${quoted},public_code.ilike.${quoted}`;
}
const selection = 'id,public_code,title,property_type,operation,price,currency,status,updated_at';
export function createAdminPropertyRepository(client) {
  const auth = createAdminAuth(client);
  const withSignal = (query, signal) => signal ? query.abortSignal(signal) : query;
  return {
    async load(options = {}, { includeIndicators=true, signal } = {}) {
      const filters = normalizeAdminQuery(options);
      const user = await auth.getCurrentAdmin();
      if (!user) throw new AdminAccessDenied();
      let query = client.from('properties').select(selection,{count:'exact'})
        .order('updated_at',{ascending:false}).order('id',{ascending:true});
      if (filters.status) query = query.eq('status',filters.status);
      if (filters.type) query = query.eq('property_type',filters.type);
      if (filters.search) query = query.or(searchExpression(filters.search));
      query = withSignal(query.range(filters.page*filters.pageSize,(filters.page+1)*filters.pageSize-1),signal);
      const requests = [query];
      if (includeIndicators) {
        for (const status of ['', 'published', 'draft']) {
          let count = client.from('properties').select('id',{count:'exact',head:true});
          if (status) count = count.eq('status',status);
          requests.push(withSignal(count,signal));
        }
      }
      const results = await Promise.all(requests);
      if (results.some(result=>result.error)) throw new Error('No pudimos cargar las propiedades. Intentá nuevamente.');
      if (results.some(result=>!Number.isSafeInteger(result.count) || result.count < 0) || !Array.isArray(results[0].data)) throw new Error('La respuesta del catálogo no está completa.');
      return { user, rows:results[0].data,total:results[0].count,filters,
        indicators:includeIndicators ? {total:results[1].count,published:results[2].count,draft:results[3].count} : null };
    },
  };
}
export function formatAdminPrice(row) {
  const amount = row.price === null || row.price === undefined || row.price === '' ? NaN : Number(row.price);
  return Number.isFinite(amount) && ['ARS','USD'].includes(row.currency)
    ? `${row.currency} ${new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(amount)}${row.operation==='alquiler'?' / mes':''}` : 'No informado';
}
export function formatAdminDate(value) {
  const date = typeof value === 'string' ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-AR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Argentina/Cordoba'}).format(date) : 'No informada';
}
