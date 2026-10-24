import { loadProperties, renderPropertyCards } from './property-cards.js';
import { parseFilters, validateFilters, filterProperties, sortProperties, serializeFilters } from './catalog-filters.js';

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
let properties = [];
let choices;

const amenityLabels = { patio: 'Patio', jardin: 'Jardín', cochera: 'Cochera', parrilla: 'Parrilla', balcon: 'Balcón', ascensor: 'Ascensor', 'acceso-vehicular': 'Acceso vehicular' };
function addOption(select, value, text) {
  const option = document.createElement('option');
  option.value = value; option.textContent = text; select.append(option);
}
function configureOptions() {
  const zones = new Map(properties.map(p => [p.zona, p.ubicacion]));
  for (const [value,label] of [...zones].sort((a,b) => a[1].localeCompare(b[1], 'es'))) addOption(form.elements.zona, value, label);
  const amenities = [...new Set(properties.flatMap(p => p.comodidades))].sort();
  for (const value of amenities) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.name = 'comodidad'; input.value = value;
    label.append(input, document.createTextNode(amenityLabels[value] || value.replaceAll('-', ' ')));
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
function showResults(filters) {
  const results = sortProperties(filterProperties(properties, filters), filters.orden);
  renderPropertyCards(list, results, { showPlaceholder: true, priorityImages: 1 });
  count.textContent = `${results.length} ${results.length === 1 ? 'propiedad encontrada' : 'propiedades encontradas'} de ${properties.length}`;
  empty.hidden = results.length !== 0;
  error.hidden = true; error.textContent = '';
  document.querySelector('#sort-help').textContent = filters.orden.startsWith('precio')
    ? 'Precios agrupados por moneda: primero ARS y luego USD, ordenados dentro de cada grupo. No hay conversión ni comparación entre monedas. Alquileres por mes.'
    : 'Las fotografías están pendientes de selección y autorización. Los cambios del formulario se aplican al buscar u ordenar.';
}
function updateUrl(filters) {
  const query = serializeFilters(filters);
  const target = `${location.pathname}${query ? `?${query}` : ''}${location.hash}`;
  if (`${location.pathname}${location.search}${location.hash}` !== target) history.pushState(null, '', target);
}
function restoreFromUrl() {
  const { filters, warnings } = parseFilters(new URLSearchParams(location.search), choices);
  fillForm(filters);
  notice.hidden = !warnings.length;
  notice.textContent = warnings.length ? 'Se ignoraron parámetros no válidos de la URL. Revisá los filtros antes de continuar.' : '';
  const message = validateFilters(filters);
  if (message) {
    list.replaceChildren(); empty.hidden = true;
    count.textContent = 'Búsqueda pendiente de corrección';
    error.hidden = false; error.textContent = message;
    panel.open = true;
  } else showResults(filters);
}
function resetSearch() {
  const { filters } = parseFilters(new URLSearchParams(), choices);
  fillForm(filters); notice.hidden = true;
  showResults(filters); updateUrl(filters);
  resultsTitle.focus();
  if (!desktop.matches) panel.open = false;
}
async function loadCatalog() {
  count.textContent = 'Cargando catálogo…';
  try {
    properties = await loadProperties();
    configureOptions();
    controls.disabled = false; sort.disabled = false;
    panel.open = desktop.matches;
    restoreFromUrl();
    form.addEventListener('invalid', () => { panel.open = true; }, true);
    form.addEventListener('submit', event => {
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
      showResults(filters); updateUrl(filters);
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
  } catch {
    list.replaceChildren(); count.textContent = 'Catálogo no disponible';
    status.hidden = false;
    status.textContent = 'No pudimos cargar las propiedades. Volvé a cargar la página para intentarlo de nuevo. Mientras tanto, podés volver al inicio desde la navegación.';
  }
}
if (form && list && count) loadCatalog();
