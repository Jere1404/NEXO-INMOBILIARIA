import { getAdminClient } from './supabase-client.js';
import { createAdminAuth } from '../backend/auth.js';
import { createAdminPropertyRepository, AdminAccessDenied, propertyStatuses, adminPropertyTypes, formatAdminPrice, formatAdminDate } from '../backend/admin-properties.js';

const $ = id => document.getElementById(id);
let client, auth, repository, request, sequence = 0, authorized = false, indicators = null;
let filters = { search:'', status:'', type:'', page:0, pageSize:10 };
let total = 0;
function controls(disabled) {
  $('search-controls').disabled = disabled;
  $('refresh-list').disabled = disabled;
  $('previous-page').disabled = disabled || filters.page === 0;
  $('next-page').disabled = disabled || (filters.page+1)*filters.pageSize >= total;
}
function clearPrivateData() {
  authorized = false; indicators = null; total = 0;
  $('admin-content').hidden = true; $('admin-session').hidden = true;
  $('admin-identity').textContent = '';
  $('admin-properties').replaceChildren();
  for (const field of ['total','published','draft']) $('indicator-'+field).textContent = '—';
  $('list-status').textContent = ''; $('page-description').textContent = '';
  controls(true);
}
function showAccess(title, text, retry = false) {
  clearPrivateData();
  $('access-state').hidden = false;
  $('access-title').textContent = title; $('panel-status').textContent = text;
  $('access-login').hidden = false; $('access-retry').hidden = !retry;
}
function renderRows(rows) {
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const tr = document.createElement('tr'); tr.dataset.propertyId = row.id; tr.setAttribute('role','row');
    const values = [
      ['Propiedad',row.title],['Tipo',adminPropertyTypes[row.property_type] || 'No informado'],
      ['Operación',{venta:'Venta',alquiler:'Alquiler'}[row.operation] || 'No informada'],
      ['Precio',formatAdminPrice(row)],['Estado',propertyStatuses[row.status] || 'No informado'],['Actualización',formatAdminDate(row.updated_at)],
    ];
    values.forEach(([label,value],index) => {
      const td = document.createElement('td'); td.dataset.label = label; td.setAttribute('role','cell');
      const content = document.createElement('span');content.textContent = value;
      if (index === 0) {
        td.className = 'property-cell';const code = document.createElement('small');code.textContent = row.public_code;content.append(code);
      }
      if (label === 'Estado') content.className = `status-badge ${Object.hasOwn(propertyStatuses,row.status) ? row.status : ''}`;
      td.append(content);tr.append(td);
    });
    fragment.append(tr);
  }
  $('admin-properties').replaceChildren(fragment);
}
async function load({ includeIndicators = false, conceal = false, focus = false } = {}) {
  const run = ++sequence;
  request?.abort(); request = new AbortController();
  controls(true);
  $('admin-properties').replaceChildren(); $('list-empty').hidden = true;
  $('list-status').textContent = 'Cargando propiedades…';
  $('properties-table-wrap').setAttribute('aria-busy','true');
  if (!authorized || conceal) {
    $('admin-content').hidden = true; $('admin-session').hidden = true;
    $('access-state').hidden = false; $('access-title').textContent = 'Verificando acceso';
    $('panel-status').textContent = 'Comprobando tu sesión y permisos…';
    $('access-login').hidden = true; $('access-retry').hidden = true;
  }
  try {
    const result = await repository.load(filters,{includeIndicators:includeIndicators || !indicators,signal:request.signal});
    if (run !== sequence) return;
    authorized = true;total = result.total;
    if (result.indicators) indicators = result.indicators;
    $('admin-identity').textContent = result.user.email || 'Cuenta autorizada';
    $('admin-session').hidden = false;
    for (const field of ['total','published','draft']) $('indicator-'+field).textContent = new Intl.NumberFormat('es-AR').format(indicators[field]);
    renderRows(result.rows);
    $('list-status').textContent = `${total} ${total === 1 ? 'propiedad encontrada' : 'propiedades encontradas'}.`;
    $('list-empty').hidden = result.rows.length > 0;
    $('properties-table-wrap').hidden = result.rows.length === 0;
    $('page-description').textContent = total ? `Página ${filters.page+1} de ${Math.ceil(total/filters.pageSize)}` : 'Sin resultados';
    $('access-state').hidden = true; $('admin-content').hidden = false;controls(false);
    if (focus) $('list-title').focus();
  } catch (error) {
    if (run !== sequence) return;
    showAccess(error instanceof AdminAccessDenied ? 'Acceso no autorizado' : 'No pudimos cargar el panel',
      error instanceof AdminAccessDenied ? 'Iniciá sesión con una cuenta que tenga membresía administrativa habilitada.' : 'No pudimos verificar el acceso o consultar los datos. Intentá nuevamente.', !(error instanceof AdminAccessDenied));
  } finally {
    if (run === sequence) $('properties-table-wrap').setAttribute('aria-busy','false');
  }
}
async function logout() {
  ++sequence;request?.abort();clearPrivateData();$('admin-logout').disabled = true;
  try { await auth.signOut();showAccess('Sesión cerrada','Tu sesión de administración finalizó.'); }
  catch {
    showAccess('Cierre de sesión pendiente','No pudimos confirmar el cierre. Volvé a intentar cerrar la sesión.');
    $('admin-session').hidden = false;
    $('admin-identity').textContent = 'Cierre no confirmado';
  } finally { $('admin-logout').disabled = false; }
}
async function init() {
  try { client = getAdminClient();auth = createAdminAuth(client);repository = createAdminPropertyRepository(client); }
  catch { showAccess('Panel no disponible','No pudimos iniciar el acceso de administración.');return; }
  $('admin-logout').addEventListener('click',logout);
  $('access-retry').addEventListener('click',()=>load({includeIndicators:true,conceal:true}));
  $('refresh-list').addEventListener('click',()=>load({includeIndicators:true}));
  $('admin-search').addEventListener('submit',event=>{
    event.preventDefault();filters = {...filters,search:$('property-search').value,status:$('property-status').value,type:$('property-type').value,page:0};
    load({focus:true});
  });
  $('reset-search').addEventListener('click',()=>{
    $('admin-search').reset();filters = {...filters,search:'',status:'',type:'',page:0};load({focus:true});
  });
  $('previous-page').addEventListener('click',()=>{if(filters.page>0){filters.page--;load({focus:true});}});
  $('next-page').addEventListener('click',()=>{if((filters.page+1)*filters.pageSize<total){filters.page++;load({focus:true});}});
  client.auth.onAuthStateChange(event=>{
    if (event === 'SIGNED_OUT') {
      ++sequence;request?.abort();showAccess('Sesión finalizada','Iniciá sesión nuevamente para acceder al panel.');
    } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      // Keep SDK auth callbacks synchronous; do not take its auth lock recursively.
      setTimeout(()=>load({conceal:true}),0);
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){++sequence;request?.abort();clearPrivateData();}
    else load({includeIndicators:true,conceal:true});
  });
  window.addEventListener('pagehide',()=>{++sequence;request?.abort();clearPrivateData();});
  window.addEventListener('pageshow',event=>{if(event.persisted)load({includeIndicators:true,conceal:true});});
  setInterval(()=>{if(!document.hidden && authorized)load({conceal:true});},60000);
  await load({includeIndicators:true});
}
init();
