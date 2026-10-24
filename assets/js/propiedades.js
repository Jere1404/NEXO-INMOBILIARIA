import { loadProperties, renderPropertyCards, propertyTypes, operations, zones } from './property-cards.js';

// Read the existing URL contract without applying filters in Etapa 3A.
export function readSearchParameters(search) {
  const params = new URLSearchParams(search);
  const fields = [
    ['operacion', 'Operación', operations],
    ['tipo', 'Tipo de propiedad', propertyTypes],
    ['zona', 'Ubicación', { ...zones, '': 'Todas las zonas' }],
  ];
  return fields.filter(([key]) => params.has(key)).map(([key, label, options]) => {
    const value = params.get(key);
    return { key, value, label, text: Object.hasOwn(options, value) ? options[value] : 'Valor no reconocido' };
  });
}

const notice = document.querySelector('#search-notice');
const received = document.querySelector('#received-parameters');
const list = document.querySelector('#catalog-properties');
const status = document.querySelector('#catalog-status');
const count = document.querySelector('#catalog-count');

if (notice && received && window.location.search) {
  notice.hidden = false;
  for (const parameter of readSearchParameters(window.location.search)) {
    const item = document.createElement('li');
    item.textContent = `${parameter.label}: ${parameter.text}`;
    received.append(item);
  }
}

async function loadCatalog() {
  count.textContent = 'Cargando catálogo…';
  try {
    const properties = await loadProperties();
    renderPropertyCards(list, properties, { showPlaceholder: true });
    count.textContent = `${properties.length} propiedades de demostración`;
  } catch {
    list.replaceChildren();
    count.textContent = 'Catálogo no disponible';
    status.hidden = false;
    status.textContent = 'No pudimos cargar las propiedades. Volvé a cargar la página para intentarlo de nuevo. Mientras tanto, podés volver al inicio desde la navegación.';
  }
}

if (list && status && count) loadCatalog();
