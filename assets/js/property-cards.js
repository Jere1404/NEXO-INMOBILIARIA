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

// Legacy null, incomplete metadata or unsafe paths use the visual fallback.
export function getPropertyImage(image) {
  const localPath = (path, extension) => typeof path === 'string'
    && new RegExp(`^assets/images/propiedades/[a-zA-Z0-9/_-]+\\.${extension}$`).test(path);
  const positive = value => Number.isInteger(value) && value > 0;
  if (!image || !localPath(image.src, 'jpe?g') || !positive(image.width) || !positive(image.height)
    || typeof image.alt !== 'string' || !image.alt.trim()) return null;
  const variants = (items, extension) => (Array.isArray(items) ? items : [])
    .filter(item => item && localPath(item.src, extension) && positive(item.width))
    .sort((a, b) => a.width - b.width)
    .filter((item, index, items) => index === 0 || item.width !== items[index - 1].width);
  return { ...image, webp: variants(image.webp, 'webp'), jpeg: variants(image.jpeg, 'jpe?g') };
}

function createPropertyMedia(image, { priority, sizes }) {
  const media = element('div', 'property-media');
  const fallback = element('div', 'property-image-placeholder', 'Fotografía no disponible');
  media.append(fallback);
  const photo = getPropertyImage(image);
  if (!photo) return media;

  const picture = element('picture');
  if (photo.webp.length) {
    const source = element('source');
    source.type = 'image/webp';
    source.srcset = photo.webp.map(item => `${item.src} ${item.width}w`).join(', ');
    source.sizes = sizes;
    picture.append(source);
  }
  const img = element('img');
  img.alt = photo.alt;
  img.width = photo.width;
  img.height = photo.height;
  img.loading = priority ? 'eager' : 'lazy';
  img.decoding = 'async';
  img.sizes = sizes;
  if (photo.jpeg.length) img.srcset = photo.jpeg.map(item => `${item.src} ${item.width}w`).join(', ');
  img.addEventListener('error', () => {
    picture.remove();
    fallback.hidden = false;
  }, { once: true });
  img.addEventListener('load', () => { fallback.hidden = true; }, { once: true });
  img.src = photo.src;
  picture.append(img);
  media.append(picture);
  return media;
}

// Shared rendering keeps prices, labels and applicable features consistent.
// Cards are informational: no fake detail links or keyboard stops are added.
export function renderPropertyCards(list, properties, { showPlaceholder = true, priorityImages = 0 } = {}) {
  const number = new Intl.NumberFormat('es-AR');
  const fragment = document.createDocumentFragment();
  const sizes = list.id === 'catalog-properties'
    ? '(min-width: 1280px) 432px, (min-width: 1024px) calc((100vw - 416px) / 2), (min-width: 768px) calc((100vw - 100px) / 2), (min-width: 640px) calc((100vw - 60px) / 2), calc(100vw - 40px)'
    : '(min-width: 1280px) 384px, (min-width: 1024px) calc((100vw - 128px) / 3), (min-width: 768px) calc((100vw - 100px) / 2), (min-width: 640px) calc((100vw - 60px) / 2), calc(100vw - 40px)';
  let index = 0;
  for (const property of properties) {
    const item = element('li');
    const card = element('article', 'property-card');
    if (showPlaceholder || getPropertyImage(property.imagen)) card.append(createPropertyMedia(property.imagen, { priority: index < priorityImages, sizes }));
    index += 1;
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
    card.append(features, element('p', 'property-disclaimer', 'Propiedad ficticia · Imagen ilustrativa generada con IA'));
    item.append(card);
    fragment.append(item);
  }
  list.replaceChildren(fragment);
}
