import {publicData} from './data/public-provider.js';
import { renderPropertyCards } from './property-cards.js';

const featuredList = document.querySelector('#featured-properties');
const featuredStatus = document.querySelector('#featured-status');

async function loadFeaturedProperties() {
  featuredStatus.hidden = false;
  featuredStatus.textContent = 'Cargando propiedades de demostración…';
  try {
    const featured = await publicData.featured();
    if (!featured.length) {featuredStatus.textContent='Todavía no hay propiedades destacadas disponibles.';return;}
    renderPropertyCards(featuredList, featured);
    featuredStatus.textContent = '';
    featuredStatus.hidden = true;
  } catch {
    featuredStatus.textContent = 'No pudimos cargar las propiedades de demostración. Podés volver a cargar la página o continuar con los enlaces por categoría.';
  }
}

if (featuredList && featuredStatus) loadFeaturedProperties();
