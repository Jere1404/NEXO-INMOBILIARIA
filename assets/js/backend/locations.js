import { createAdminAuth } from './auth.js';
import { AdminAccessDenied } from './admin-properties.js';

export function locationName(value) {
  if (typeof value !== 'string') throw new Error('Ingresá un nombre válido.');
  const name = value.trim().replace(/\s+/g,' ');
  if (!name || name.length > 100) throw new Error('Ingresá un nombre de entre 1 y 100 caracteres.');
  return name;
}
export function createLocationRepository(client) {
  const auth = createAdminAuth(client);
  const authorize = async () => { if (!await auth.getCurrentAdmin()) throw new AdminAccessDenied(); };
  // Read each scoped list in pages instead of silently truncating at the API row limit.
  async function read(table, selection, key, value) {
    await authorize();
    const rows = [];
    for (let offset=0; ; offset+=500) {
      let query = client.from(table).select(selection).order('name').order(table==='provinces'?'code':table==='zones'?'slug':'id');
      if (key) query = query.eq(key,value);
      const result = await query.range(offset,offset+499);
      if (result.error || !Array.isArray(result.data)) throw new Error('No pudimos cargar las ubicaciones. Comprobá que la migración V5B.3 esté aplicada e intentá nuevamente.');
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  }
  return {
    provinces:()=>read('provinces','code,name'),
    localities:province=>read('localities','id,province_code,name','province_code',province),
    zones:locality=>read('zones','slug,name,locality_id','locality_id',locality),
    async locality(id) {
      await authorize();
      const result = await client.from('localities').select('id,province_code,name').eq('id',id).single();
      if (result.error || !result.data) throw new Error('No pudimos identificar la localidad de esta zona. Revisá la migración V5B.3.');
      return result.data;
    },
    async create(province,locality,zone) {
      await authorize();
      if (!/^\d{2}$/.test(province)) throw new Error('Seleccioná una provincia válida.');
      const result = await client.rpc('admin_create_location',{
        p_province:province,p_locality:locationName(locality),p_zone:locationName(zone),
      }).single();
      if (result.error?.code === '42501') throw new AdminAccessDenied();
      if (result.error || !result.data?.slug || !result.data?.locality_id) throw new Error('No pudimos confirmar la nueva ubicación. Volvé a cargar las opciones antes de reintentar; puede haberse guardado.');
      return result.data;
    },
  };
}
