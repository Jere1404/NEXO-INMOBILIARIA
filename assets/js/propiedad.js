import {publicData} from './data/public-provider.js';
import {imageCaption} from './data/public-images.js';
import { createPropertyMedia, getPropertyImage, renderPropertyCards, propertyTypes, operations } from './property-cards.js';
import { readPropertyId, getGalleryImages, buildInquiryMessage, getWhatsAppUrl, amenityLabels } from './property-details.js';
import { whatsappNumber } from './site-config.js';

const $ = id => document.getElementById(id);
function showError(title, message) {
  $('detail-status').hidden = true;
  $('property-detail').hidden = true;
  $('similar-section').hidden = true;
  $('detail-error').hidden = false;
  $('error-title').textContent = title;
  $('error-description').textContent = message;
  document.title = `${title} | NEXO Inmobiliaria`;
}
function renderGallery(property) {
  const images = getGalleryImages(property, getPropertyImage);
  function selectImage(index, announce = false) {
    $('gallery-image').replaceChildren(createPropertyMedia(images[index] ?? null, { priority: true, sizes: '(min-width: 1280px) 776px, (min-width: 1024px) calc(100vw - 464px), (min-width: 768px) calc(100vw - 80px), calc(100vw - 40px)' }));
    $('gallery-caption').textContent = images.length ? `Imagen ${index + 1} de ${images.length} · ${imageCaption(images[index])}` : 'Imagen de referencia no disponible';
    for (const [i, button] of [...$('gallery-controls').children].entries()) button.setAttribute('aria-pressed', String(i === index));
    if (announce) $('gallery-status').textContent = `Imagen ${index + 1} de ${images.length}`;
  }
  if (images.length > 1) {
    $('gallery-controls').hidden = false;
    images.forEach((image, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = `Foto ${index + 1}`;
      button.setAttribute('aria-label', `Mostrar imagen ${index + 1}: ${image.alt}`);
      button.addEventListener('click', () => selectImage(index, true));
      $('gallery-controls').append(button);
    });
  }
  selectImage(0);
}
function renderDetail(property, similar) {
  const number = new Intl.NumberFormat('es-AR');
  $('detail-title').textContent = property.titulo;
  document.title = `${property.titulo} | NEXO Inmobiliaria`;
  $('detail-operation').textContent = `${propertyTypes[property.tipo]} · ${operations[property.operacion]}`;
  $('detail-location').textContent = `${property.ubicacion} · ${property.ciudad}`;
  $('detail-description').textContent = property.descripcion;
  $('detail-approximate').textContent = property.ubicacionAproximada;
  $('detail-price').textContent = `${property.moneda} ${number.format(property.precio)}${property.operacion === 'alquiler' ? ' / mes' : ''}`;
  $('detail-id').textContent = `Referencia: ${property.id}`;
  const features = [['Tipo', propertyTypes[property.tipo]], ['Operación', operations[property.operacion]], ['Superficie total', `${number.format(property.superficie)} ${property.unidadSuperficie}`]];
  if (property.habitaciones !== null) features.push(['Habitaciones', number.format(property.habitaciones)]);
  if (property.banos !== null) features.push(['Baños', number.format(property.banos)]);
  for (const [label, value] of features) {
    const row = document.createElement('div'), term = document.createElement('dt'), description = document.createElement('dd');
    term.textContent = label; description.textContent = value; row.append(term, description); $('detail-features').append(row);
  }
  for (const value of property.comodidades) {
    const item = document.createElement('li'); item.textContent = amenityLabels[value] || value.replaceAll('-', ' '); $('detail-amenities').append(item);
  }
  $('no-amenities').hidden = property.comodidades.length > 0;
  renderGallery(property);
  const message = buildInquiryMessage(property, location.href);
  $('inquiry-message').value = message;
  const whatsapp = getWhatsAppUrl(whatsappNumber, message);
  if (whatsapp) {
    $('whatsapp-link').href = whatsapp; $('whatsapp-link').hidden = false;
    $('whatsapp-disabled').hidden = true;
    $('whatsapp-help').textContent = 'Abrí WhatsApp y revisá el mensaje antes de enviarlo.';
  }
  if (similar.length) {
    renderPropertyCards($('similar-properties'), similar);
    $('similar-section').hidden = false;
  }
  $('detail-status').hidden = true;
  $('property-detail').hidden = false;
}
async function init() {
  const id = readPropertyId(location.search);
  if (!id) {
    showError('Indicá una propiedad válida', 'Falta un identificador válido y único en el enlace. Elegí una propiedad desde el catálogo.');
    return;
  }
  try {
    const property = await publicData.detail(id);
    if (!property) { showError('Propiedad no encontrada', 'No encontramos una propiedad con ese identificador. Podés seguir explorando el catálogo.'); return; }
    renderDetail(property, []);
    // Render the valid detail before waiting for recommendations.
    try{
      const similar=await publicData.similar(id);
      if(similar.length){renderPropertyCards($('similar-properties'),similar);$('similar-section').hidden=false;}
    }catch{ /* Recommendations must not hide a valid detail. */ }
  } catch {
    showError('No pudimos cargar la propiedad', 'Ocurrió un problema al cargar los datos. Intentá recargar la página o volvé al catálogo.');
  }
}
init();
