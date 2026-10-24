import { loadProperties, renderPropertyCards } from './property-cards.js';

const featuredList = document.querySelector('#featured-properties');
const featuredStatus = document.querySelector('#featured-status');

async function loadFeaturedProperties() {
  featuredStatus.hidden = false;
  featuredStatus.textContent = 'Cargando propiedades de demostración…';
  try {
    const properties = await loadProperties();
    const featured = properties.filter((property) => property.destacada && property.ficticia).slice(0, 6);
    if (!featured.length) throw new Error('No hay propiedades destacadas.');
    renderPropertyCards(featuredList, featured);
    featuredStatus.textContent = '';
    featuredStatus.hidden = true;
  } catch {
    featuredStatus.textContent = 'No pudimos cargar las propiedades de demostración. Podés volver a cargar la página o continuar con los enlaces por categoría.';
  }
}

if (featuredList && featuredStatus) loadFeaturedProperties();
