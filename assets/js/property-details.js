// Pure helpers keep URL handling and recommendations separate from the page.
export const amenityLabels = { patio: 'Patio', jardin: 'Jardín', cochera: 'Cochera', parrilla: 'Parrilla', balcon: 'Balcón', ascensor: 'Ascensor', 'acceso-vehicular': 'Acceso vehicular' };

export function readPropertyId(search) {
  const values = new URLSearchParams(search).getAll('id');
  if (values.length !== 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(values[0])) return null;
  return values[0];
}
export function findProperty(properties, id) {
  return new Map(properties.map(property => [property.id, property])).get(id) ?? null;
}
export function getSimilarProperties(properties, current, limit = 3) {
  return properties.filter(property => property.id !== current.id)
    .map(property => ({ property, score: (property.tipo === current.tipo ? 4 : 0) + (property.operacion === current.operacion ? 2 : 0) + (property.zona === current.zona ? 1 : 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.property.id.localeCompare(b.property.id))
    .slice(0, Math.max(0, limit)).map(item => item.property);
}
export function getGalleryImages(property, normalize) {
  const images = [property.imagen, ...(Array.isArray(property.fotografias) ? property.fotografias : [])];
  const seen = new Set();
  return images.map(normalize).filter(image => {
    if (!image || seen.has(image.src)) return false;
    seen.add(image.src); return true;
  });
}
export function getPropertyUrl(id, base) {
  const url = new URL('propiedad.html', base);
  url.searchParams.set('id', id);
  return url.href;
}
export function buildInquiryMessage(property, base) {
  return `Hola NEXO, quisiera consultar por “${property.titulo}” (ID: ${property.id}).\n${getPropertyUrl(property.id, base)}\nConsulta sobre una propiedad ficticia de demostración.`;
}
export function getWhatsAppUrl(phone, message) {
  if (typeof phone !== 'string' || !/^[1-9]\d{7,14}$/.test(phone)) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
