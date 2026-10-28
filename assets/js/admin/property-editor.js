import { createImagePanel } from './image-panel.js?v=legacy-replacement-1';
import { getAdminClient, authConfig } from './supabase-client.js';
import { createAdminAuth } from '../backend/auth.js';
import { AdminAccessDenied, propertyStatuses } from '../backend/admin-properties.js';
import { createPropertyManager, PropertyConflict } from '../backend/property-management.js?v=v5b3';
import { createLocationRepository } from '../backend/locations.js';
import { createLocationFields } from './location-fields.js';

const $ = id => document.getElementById(id);
const fields = ['public_code','title','description','property_type','operation','status','price','currency','zone_slug','city','area','bedrooms','bathrooms','approximate_location'];
let client, auth, manager, locationFields, imagePanel, context, locationsBusy = false, imagesBusy = false, dirty = false, saving = false, generation = 0, blocked = false;
let id = new URLSearchParams(location.search).get('id');
const newCode = `nexo-${crypto.randomUUID()}`;
function message(text) { $('editor-message').textContent = text; }
function conceal() { $('property-form').hidden = true; $('admin-session').hidden = true; imagePanel?.hide(); }
function denied(error) {
  generation++; context = null; dirty = false; imagePanel?.clear(); locationFields?.reset(); locationsBusy = false; conceal(); $('property-form').reset(); $('amenity-options').replaceChildren();
  $('editor-title').textContent = 'Acceso no disponible';
  message(error instanceof AdminAccessDenied ? 'Iniciá sesión con una cuenta administrativa habilitada.' : error.message || 'No pudimos comprobar el acceso.');
  $('editor-login').hidden = false; $('editor-retry').hidden = false;
}
function input() {
  const result = Object.fromEntries(fields.map(name=>[name,$(name).value]));
  result.featured = $('featured').checked; result.is_demo = $('is_demo').checked;
  result.amenities = [...document.querySelectorAll('[name="amenity"]:checked')].map(el=>el.value);
  // Disabled land fields are not silently converted: switching type requires confirmation first.
  return result;
}
function refreshControls() {
  $('editor-fields').disabled = saving || blocked || locationsBusy || imagesBusy;
  $('save-property').disabled = !context || !locationFields?.ready();
  $('status').disabled = !context?.property;
  const land = $('property_type').value === 'terreno';
  $('bedrooms').disabled = land; $('bathrooms').disabled = land;
  $('save-property').textContent = saving ? 'Guardando…' : context?.property ? 'Guardar cambios' : 'Guardar borrador';
  imagePanel?.sync();
}
function reveal(user) {
  $('admin-identity').textContent = user.email || 'Cuenta autorizada';
  $('admin-session').hidden = false; $('property-form').hidden = false; imagePanel?.show();
}
async function open() {
  if (saving || imagesBusy) return;
  if (dirty && !confirm('Hay cambios sin guardar. ¿Querés descartarlos y volver a cargar?')) return;
  const run = ++generation; conceal(); message('Cargando información…');
  try {
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('El identificador de propiedad no es válido.');
    const loaded = await manager.open(id);
    if (run !== generation) return;
    context = loaded; blocked = false; dirty = false;
    $('editor-title').textContent = id ? 'Editar propiedad' : 'Nueva propiedad';
    const row = context.property || {public_code:newCode,city:'Corrientes Capital',status:'draft',property_type:'casa',operation:'venta',currency:'USD',is_demo:true};
    for (const field of fields) $(field).value = row[field] ?? '';
    await locationFields.mount(context.zones[0]);
    if (run !== generation) return;
    $('featured').checked = !!row.featured; $('is_demo').checked = !!row.is_demo;
    $('amenity-options').replaceChildren();
    for (const amenity of context.amenities) {
      const label = document.createElement('label'); label.className = 'checkbox-label';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = 'amenity'; checkbox.value = amenity.slug; checkbox.checked = context.selected.includes(amenity.slug);
      label.append(checkbox,document.createTextNode(amenity.name)); $('amenity-options').append(label);
    }
    $('editor-login').hidden = true; $('editor-retry').hidden = true;
    refreshControls(); if (!document.hidden) reveal(context.user);
    message(id ? `Estado actual: ${propertyStatuses[row.status]}. Código: ${row.public_code}.` : 'Completá los datos para guardar una nueva propiedad como borrador.');
  } catch (error) { if (run === generation) denied(error); }
}
async function revalidate() {
  if (!context || document.hidden) return;
  const run = generation;
  try { const user = await auth.getCurrentAdmin(); if (run !== generation) return; if (!user) throw new AdminAccessDenied(); if (!document.hidden) reveal(user); }
  catch (error) { if (run === generation) denied(error); }
}
async function save(event) {
  event.preventDefault(); if (saving || imagesBusy || blocked || locationsBusy || !context || !locationFields.ready()) return;
  const data = input();
  const oldStatus = context.property?.status || 'draft';
  if (data.status !== oldStatus) {
    const warning = {published:'Publicar permitirá leer esta propiedad mediante la API pública de Supabase.',draft:'Despublicar ocultará la propiedad de la API pública.',archived:'Archivar retirará la propiedad de la API pública sin eliminarla.'}[data.status];
    if (!confirm(`${warning} ¿Confirmás guardar los cambios?`)) return;
  } else if (oldStatus === 'published' && !confirm('Los cambios se aplicarán a una propiedad publicada. ¿Confirmás guardarlos?')) return;
  const run = generation; saving = true; refreshControls(); $('editor-retry').hidden = true; message('Guardando propiedad…');
  try {
    const saved = await manager.save(data,context);
    if (run !== generation) return;
    context.property = saved; id = saved.id; dirty = false;
    history.replaceState(null,'',`propiedad.html?id=${encodeURIComponent(id)}`);
    $('editor-title').textContent = 'Editar propiedad';
    message(`Propiedad guardada correctamente como ${propertyStatuses[saved.status].toLowerCase()}.`);
    imagePanel?.show();
  } catch (error) {
    if (run !== generation) return;
    if (error instanceof AdminAccessDenied) denied(error);
    else {
      message(error.message); $('editor-retry').hidden = false;
      // A conflict requires an explicit reload, preserving entered values until then.
      blocked = error instanceof PropertyConflict;
    }
  } finally { saving = false; refreshControls(); }
}
async function logout() {
  if (saving || ((dirty || imagePanel?.hasPending()) && !confirm('Hay cambios sin guardar. ¿Querés descartarlos y cerrar sesión?'))) return;
  denied(new AdminAccessDenied());
  try { await auth.signOut(); message('Sesión cerrada.'); }
  catch { message('No pudimos confirmar el cierre de sesión. Volvé a intentarlo.'); $('admin-session').hidden = false; $('admin-identity').textContent = 'Cierre no confirmado'; }
}
function init() {
  try { client = getAdminClient(); auth = createAdminAuth(client); manager = createPropertyManager(client); }
  catch { denied(new Error('No pudimos iniciar la conexión.')); return; }
  locationFields = createLocationFields(createLocationRepository(client),{
    onChange:({zones,city})=>{if(context){context.zones=zones;$('city').value=city;}refreshControls();},
    onBusy:value=>{locationsBusy=value;refreshControls();},onDenied:denied,
  });
  imagePanel = createImagePanel(client,{supabaseUrl:authConfig.supabaseUrl,getProperty:()=>context?.property,canUpload:()=>!!context&&!dirty&&!saving&&!locationsBusy&&!blocked,onBusy:value=>{imagesBusy=value;refreshControls();},onDenied:denied});
  $('property-form').addEventListener('submit',save);
  $('property-form').addEventListener('input',()=>{dirty = true;refreshControls();});
  $('property_type').addEventListener('change',()=>{
    if ($('property_type').value === 'terreno' && ($('bedrooms').value !== '' || $('bathrooms').value !== '')) {
      if (confirm('Los terrenos no admiten habitaciones ni baños. ¿Querés vaciar esos campos?')) { $('bedrooms').value = ''; $('bathrooms').value = ''; }
      else $('property_type').value = context.property?.property_type === 'departamento' ? 'departamento' : 'casa';
    }
    refreshControls();
  });
  $('editor-retry').addEventListener('click',open); $('admin-logout').addEventListener('click',logout);
  for (const link of document.querySelectorAll('a')) link.addEventListener('click',event=>{if(saving || imagesBusy || ((dirty || imagePanel?.hasPending()) && !confirm('Hay cambios sin guardar. ¿Querés salir sin guardarlos?'))) event.preventDefault();});
  window.addEventListener('beforeunload',event=>{if(dirty || saving || imagesBusy || imagePanel?.hasPending()){event.preventDefault();event.returnValue = '';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)conceal();else revalidate();});
  window.addEventListener('pagehide',()=>{conceal();imagePanel?.clear();});
  window.addEventListener('pageshow',event=>{if(event.persisted)revalidate();});
  client.auth.onAuthStateChange(event=>{
    if(event === 'SIGNED_OUT') denied(new AdminAccessDenied());
    else if(event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(revalidate,0);
  });
  setInterval(()=>{if(!document.hidden)revalidate();},60000);
  open();
}
init();
