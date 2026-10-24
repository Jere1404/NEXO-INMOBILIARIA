// Pure search logic: shared by URL parsing, form submission and tests.
export const numericKeys = ['precioMin', 'precioMax', 'superficieMin', 'superficieMax'];
export const sortValues = ['precio-asc', 'precio-desc', 'superficie-asc', 'superficie-desc'];
export function parseFilters(params, choices) {
  const filters = { comodidades: [] };
  const warnings = [];
  for (const [key, values] of Object.entries(choices)) {
    if (key === 'comodidades') continue;
    const value = params.get(key) || '';
    filters[key] = values.includes(value) ? value : '';
    if (value && !values.includes(value)) warnings.push(key);
  }
  for (const key of numericKeys) {
    const raw = params.get(key);
    const value = raw === null || raw.trim() === '' ? null : Number(raw);
    filters[key] = value !== null && Number.isFinite(value) && value >= 0 ? value : null;
    if (raw && filters[key] === null) warnings.push(key);
  }
  filters.comodidades = [...new Set(params.getAll('comodidad'))].filter(value => {
    if (choices.comodidades.includes(value)) return true;
    warnings.push('comodidad'); return false;
  });
  delete filters.comodidad;
  const order = params.get('orden') || '';
  filters.orden = sortValues.includes(order) ? order : '';
  if (order && !filters.orden) warnings.push('orden');
  return { filters, warnings };
}
export function validateFilters(filters) {
  if ((filters.precioMin !== null || filters.precioMax !== null) && !filters.moneda) return 'Elegí una moneda para aplicar el rango de precio.';
  if (filters.precioMin !== null && filters.precioMax !== null && filters.precioMin > filters.precioMax) return 'El precio mínimo no puede superar al máximo.';
  if (filters.superficieMin !== null && filters.superficieMax !== null && filters.superficieMin > filters.superficieMax) return 'La superficie mínima no puede superar a la máxima.';
  return '';
}
export function filterProperties(properties, filters) {
  return properties.filter(p => {
    for (const key of ['operacion', 'tipo', 'zona', 'moneda']) if (filters[key] && p[key] !== filters[key]) return false;
    for (const [key, min, max] of [['precio', filters.precioMin, filters.precioMax], ['superficie', filters.superficieMin, filters.superficieMax]]) {
      if ((min !== null || max !== null) && (!Number.isFinite(p[key]) || (min !== null && p[key] < min) || (max !== null && p[key] > max))) return false;
    }
    for (const key of ['habitaciones', 'banos']) if (filters[key] && (p.tipo === 'terreno' || !Number.isFinite(p[key]) || p[key] < Number(filters[key]))) return false;
    return filters.comodidades.every(value => Array.isArray(p.comodidades) && p.comodidades.includes(value));
  });
}
export function sortProperties(properties, order) {
  const sorted = [...properties];
  if (!sortValues.includes(order)) return sorted;
  const [key, direction] = order.split('-');
  return sorted.sort((a,b) => {
    // A fixed currency grouping is independent of the ascending/descending direction.
    if (key === 'precio' && a.moneda !== b.moneda) return a.moneda.localeCompare(b.moneda);
    if (!Number.isFinite(a[key])) return Number.isFinite(b[key]) ? 1 : 0;
    if (!Number.isFinite(b[key])) return -1;
    return (a[key] - b[key]) * (direction === 'asc' ? 1 : -1);
  });
}
export function serializeFilters(filters) {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries(filters)) {
    if (key === 'comodidades') value.forEach(item => params.append('comodidad', item));
    else if (value !== '' && value !== null) params.set(key, value);
  }
  return params.toString();
}
