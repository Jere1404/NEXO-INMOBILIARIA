const featuredList = document.querySelector('#featured-properties');
const featuredStatus = document.querySelector('#featured-status');
const cardTemplate = document.querySelector('#property-card-template');

async function loadFeaturedProperties() {
  featuredStatus.hidden = false;
  featuredStatus.textContent = 'Cargando propiedades de demostración…';

  try {
    const response = await fetch('data/propiedades.json');
    if (!response.ok) throw new Error('No se pudieron cargar las propiedades.');
    const properties = await response.json();
    const featured = properties.filter((property) => property.destacada && property.ficticia).slice(0, 6);
    if (!featured.length) throw new Error('No hay propiedades destacadas.');

    const types = { casa: 'Casa', departamento: 'Departamento', terreno: 'Terreno' };
    const operations = { venta: 'Venta', alquiler: 'Alquiler' };
    const number = new Intl.NumberFormat('es-AR');
    const fragment = document.createDocumentFragment();

    for (const property of featured) {
      const card = cardTemplate.content.cloneNode(true);
      card.querySelector('.property-type').textContent = types[property.tipo];
      card.querySelector('.operation-badge').textContent = operations[property.operacion];
      card.querySelector('.property-location').textContent = `${property.ubicacion} · ${property.ciudad}`;
      card.querySelector('.property-title').textContent = property.titulo;
      card.querySelector('.property-price').textContent = `${property.moneda} ${number.format(property.precio)}${property.operacion === 'alquiler' ? ' / mes' : ''}`;

      const features = [`${number.format(property.superficie)} ${property.unidadSuperficie}`];
      if (property.habitaciones !== null) features.push(`${property.habitaciones} ${property.habitaciones === 1 ? 'habitación' : 'habitaciones'}`);
      if (property.banos !== null) features.push(`${property.banos} ${property.banos === 1 ? 'baño' : 'baños'}`);
      for (const feature of features) {
        const item = document.createElement('li');
        item.textContent = feature;
        card.querySelector('.property-features').append(item);
      }
      fragment.append(card);
    }

    featuredList.replaceChildren(fragment);
    featuredStatus.textContent = '';
    featuredStatus.hidden = true;
  } catch {
    featuredStatus.textContent = 'No pudimos cargar las propiedades de demostración. Podés volver a cargar la página o continuar con los enlaces por categoría.';
  }
}

if (featuredList && featuredStatus && cardTemplate) loadFeaturedProperties();
