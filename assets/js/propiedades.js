import {publicData} from './data/public-provider.js';
import {publicDataConfig} from './public-data-config.js';
import { renderPropertyCards } from './property-cards.js';
import { parseFilters, validateFilters, serializeFilters } from './catalog-filters.js';

const form = document.querySelector('#catalog-filters');
const controls = document.querySelector('#filter-controls');
const list = document.querySelector('#catalog-properties');
const status = document.querySelector('#catalog-status');
const count = document.querySelector('#catalog-count');
const error = document.querySelector('#filter-error');
const empty = document.querySelector('#empty-results');
const notice = document.querySelector('#url-notice');
const sort = document.querySelector('#catalog-sort');
const panel = document.querySelector('#filter-panel');
const resultsTitle = document.querySelector('#results-title');
const desktop = window.matchMedia('(min-width: 64rem)');
let requestNumber=0,controller;
const paging=document.createElement('nav');paging.setAttribute('aria-label','Páginas del catálogo');paging.hidden=true;list.after(paging);
let choices;

const amenityLabels = { patio: 'Patio', jardin: 'Jardín', cochera: 'Cochera', parrilla: 'Parrilla', balcon: 'Balcón', ascensor: 'Ascensor', 'acceso-vehicular': 'Acceso vehicular' };
function addOption(select, value, text) {
  const option = document.createElement('option');
  option.value = value; option.textContent = text; select.append(option);
}
async function configureOptions() {
  const [zoneOptions,amenityOptions]=await Promise.all([publicData.allOptions({scope:'zones',localidad:publicDataConfig.localityId}),publicData.allOptions({scope:'amenities'})]);
  const zones = new Map(zoneOptions.map(p => [p.value,p.label]));
  for (const [value,label] of [...zones].sort((a,b) => a[1].localeCompare(b[1], 'es'))) addOption(form.elements.zona, value, label);
  const amenities=amenityOptions.map(p=>p.value).sort();
  for (const value of amenities) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'comodidad'; input.value = value;
    label.append(input, document.createTextNode(amenityLabels[value] || amenityOptions.find(v=>v.value===value)?.label || value.replaceAll('-', ' ')));
    document.querySelector('#amenity-options').append(label);
  }
  choices = {
    operacion: ['venta', 'alquiler'], tipo: ['casa', 'departamento', 'terreno'],
    zona: [...zones.keys()], moneda: ['ARS','USD'], habitaciones: ['1','2','3','4'], banos: ['1','2','3'], comodidades: amenities,
  };
}
function fillForm(filters) {
  for (const [key,value] of Object.entries(filters)) {
    if (key === 'comodidades') {
      for (const input of form.querySelectorAll('[name="comodidad"]')) input.checked = value.includes(input.value);
    } else if (key === 'orden') sort.value = value;
    else if (form.elements.namedItem(key)) form.elements.namedItem(key).value = value ?? '';
  }
}
async function showResults(filters,page=1) {
  const current=++requestNumber;controller?.abort();controller=new AbortController();
  count.textContent='Cargando catálogo…';status.hidden=true;empty.hidden=true;paging.hidden=true;list.setAttribute('aria-busy','true');
  try{
    const result=await publicData.list({filters,page,signal:controller.signal});
    if(current!==requestNumber)return false;
    renderPropertyCards(list,result.properties,{showPlaceholder:true,priorityImages:1});
    count.textContent=`${result.total} ${result.total===1?'propiedad encontrada':'propiedades encontradas'}${result.availableTotal!==null?` de ${result.availableTotal}`:''}`;
    const hasFilters=Object.entries(filters).some(([key,value])=>key!=='orden'&&(Array.isArray(value)?value.length:value!==''&&value!==null&&value!==undefined));
    empty.hidden=result.total!==0||!hasFilters;
    if(!result.total&&!hasFilters){status.hidden=false;status.textContent='Todavía no hay propiedades disponibles en el catálogo.';}
    else if(result.total&&result.properties.length===0){status.hidden=false;status.textContent='Esta página no contiene propiedades. Volvé a la página anterior o restablecé la búsqueda.';}
    error.hidden=true;error.textContent='';
    document.querySelector('#sort-help').textContent=filters.orden.startsWith('precio')?'Precios agrupados por moneda: primero ARS y luego USD, ordenados dentro de cada grupo. No hay conversión ni comparación entre monedas. Alquileres por mes.':publicData.kind==='json'?'Imágenes ilustrativas generadas con IA. Los cambios del formulario se aplican al buscar u ordenar.':'Los cambios del formulario se aplican al buscar u ordenar.';
    paging.replaceChildren();paging.hidden=result.totalPages<=1&&page===1;
    for(const [label,target,disabled] of [['Anterior',Math.max(1,Math.min(page-1,result.totalPages||1)),page<=1],['Siguiente',page+1,!result.hasNext||page>=1000]]){
      const button=document.createElement('button');button.type='button';button.className='clear-button';button.textContent=label;button.disabled=disabled;
      button.addEventListener('click',async()=>{if(await showResults(filters,target)){updateUrl(filters,target);resultsTitle.focus();}});paging.append(button);
      if(label==='Anterior'){const label=document.createElement('span');label.textContent=result.totalPages?` Página ${page} de ${result.totalPages} `:` Página ${page} `;paging.append(label);}
    }
    return true;
  }catch(problem){
    if(current!==requestNumber)return false;
    list.replaceChildren();count.textContent='Catálogo no disponible';empty.hidden=true;status.hidden=false;
    status.textContent=problem.code==='INVALID_REQUEST'?'Revisá los valores de la búsqueda. No pudimos aplicar esos filtros.':'No pudimos cargar las propiedades. Volvé a cargar la página para intentarlo de nuevo.';
    return false;
  }finally{if(current===requestNumber)list.removeAttribute('aria-busy');}
}
function updateUrl(filters,page=1) {
  const params=new URLSearchParams(serializeFilters(filters));if(page>1)params.set('page',page);
  const query=params.toString();
  const target = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== target) history.pushState(null, '', target);
}
async function restoreFromUrl() {
  const { filters, warnings } = parseFilters(new URLSearchParams(location.search), choices);
  fillForm(filters);
  notice.hidden = !warnings.length;
  notice.textContent = warnings.length ? 'Se ignoraron parámetros no válidos de la URL. Revisá los filtros antes de continuar.' : '';
  const message = validateFilters(filters);
  if (message) {
    ++requestNumber;controller?.abort();paging.hidden=true;status.hidden=true;list.removeAttribute('aria-busy');
    list.replaceChildren(); empty.hidden = true;
    count.textContent = 'Búsqueda pendiente de corrección';
    error.hidden = false; error.textContent = message;
    panel.open = true;
  } else {const raw=new URLSearchParams(location.search).get('page');const page=raw&&/^[1-9]\d*$/.test(raw)&&Number(raw)<=1000?Number(raw):1;await showResults(filters,page);}
}
async function resetSearch() {
  const { filters } = parseFilters(new URLSearchParams(), choices);
  fillForm(filters); notice.hidden = true;
  if(await showResults(filters))updateUrl(filters);
  resultsTitle.focus();
  if (!desktop.matches) panel.open = false;
}
async function loadCatalog() {
  count.textContent = 'Cargando catálogo…';
  try {
    await configureOptions();
    controls.disabled = false; sort.disabled = false;
    panel.open = desktop.matches;
    form.addEventListener('invalid', () => { panel.open = true; }, true);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const { filters } = parseFilters(new URLSearchParams(new FormData(form)), choices);
      const message = validateFilters(filters);
      if (message) {
        error.hidden = false; error.textContent = `${message} Los resultados anteriores no se modificaron.`;
        panel.open = true;
        form.elements.namedItem(message.startsWith('Elegí') ? 'moneda' : message.startsWith('El precio') ? 'precioMin' : 'superficieMin').focus();
        return;
      }
      notice.hidden = true;
      if(await showResults(filters))updateUrl(filters);
      if (event.submitter) {
        resultsTitle.focus();
        if (!desktop.matches) panel.open = false;
      }
    });
    sort.addEventListener('change', () => form.requestSubmit());
    document.querySelector('#clear-filters').addEventListener('click', resetSearch);
    document.querySelector('#clear-empty').addEventListener('click', resetSearch);
    window.addEventListener('popstate', restoreFromUrl);
    desktop.addEventListener('change', () => {
      if (!desktop.matches && panel.contains(document.activeElement)) panel.querySelector('summary').focus();
      panel.open = desktop.matches;
    });
    await restoreFromUrl();
  } catch {
    list.replaceChildren(); count.textContent = 'Catálogo no disponible';
    status.hidden = false;
    status.textContent = 'No pudimos cargar las propiedades. Volvé a cargar la página para intentarlo de nuevo. Mientras tanto, podés volver al inicio desde la navegación.';
  }
}
if (form && list && count) loadCatalog();
