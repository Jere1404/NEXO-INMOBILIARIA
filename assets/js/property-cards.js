export const propertyTypes = { casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno' };
export const operations = { venta: 'Venta', alquiler: 'Alquiler' };
export const zones = {
  centro: 'Centro',
  'camba-cua': 'Cambá Cuá',
  costanera: 'Costanera',
  'camba-punta': 'Camba Punta',
  'molina-punta': 'Molina Punta',
};

export async function loadProperties() {
  const response = await fetch('data/propiedades.json');
  if (!response.ok) throw new Error('No se pudieron cargar las propiedades.');
  const properties = await response.json();
  if (!Array.isArray(properties) || !properties.length) throw new Error('Catálogo vacío o inválido.');

  const ids = new Set();
  for (const property of properties) {
    if (!property || typeof property.id !== 'string' || !property.id.trim() || ids.has(property.id)
      || !Object.hasOwn(propertyTypes, property.tipo) || !Object.hasOwn(operations, property.operacion)
      || !Object.hasOwn(zones, property.zona) || !property.ficticia
      || !['ARS', 'USD'].includes(property.moneda)
      || !Number.isFinite(property.precio) || property.precio <= 0
      || !Number.isFinite(property.superficie) || property.superficie <= 0
      || !['titulo', 'ubicacion', 'ciudad', 'unidadSuperficie', 'descripcion', 'ubicacionAproximada'].every((key) => typeof property[key] === 'string' && property[key].trim())
      || !Array.isArray(property.comodidades) || !Array.isArray(property.fotografias)
      || !['habitaciones', 'banos'].every((key) => property[key] === null || (Number.isInteger(property[key]) && property[key] >= 0))) {
      throw new Error('Datos de propiedades inválidos.');
    }
    ids.add(property.id);
  }
  return properties;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Shared rendering keeps prices, labels and applicable features consistent.
// Cards are informational: no fake detail links or keyboard stops are added.
export function renderPropertyCards(list, properties, { showPlaceholder = false } = {}) {
  const number = new Intl.NumberFormat('es-AR');
  const fragment = document.createDocumentFragment();
  for (const property of properties) {
    const item = element('li');
    const card = element('article', 'property-card');
    if (showPlaceholder) {
      card.append(element('div', 'property-image-placeholder', 'Fotografía pendiente'));
    }
    const meta = element('div', 'property-meta');
    meta.append(element('span', 'property-type', propertyTypes[property.tipo]), element('span', 'operation-badge', operations[property.operacion]));
    card.append(meta,
      element('p', 'property-location', `${property.ubicacion} · ${property.ciudad}`),
      element('h3', 'property-title', property.titulo),
      element('p', 'property-price', `${property.moneda} ${number.format(property.precio)}${property.operacion === 'alquiler' ? ' / mes' : ''}`));

    const features = element('ul', 'property-features');
    features.setAttribute('aria-label', 'Características');
    const values = [`${number.format(property.superficie)} ${property.unidadSuperficie}`];
    if (property.habitaciones !== null) values.push(`${property.habitaciones} ${property.habitaciones === 1 ? 'habitación' : 'habitaciones'}`);
    if (property.banos !== null) values.push(`${property.banos} ${property.banos === 1 ? 'baño' : 'baños'}`);
    for (const value of values) features.append(element('li', '', value));
    card.append(features, element('p', 'property-disclaimer', 'Propiedad ficticia · Demostración'));
    item.append(card);
    fragment.append(item);
  }
  list.replaceChildren(fragment);
}
