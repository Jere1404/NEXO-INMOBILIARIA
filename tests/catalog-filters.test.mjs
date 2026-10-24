import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFilters, validateFilters, filterProperties, sortProperties, serializeFilters } from '../assets/js/catalog-filters.js';
const data = JSON.parse(await readFile(new URL('../data/propiedades.json', import.meta.url)));
const choices = { operacion:['venta','alquiler'], tipo:['casa','departamento','terreno'], zona:[...new Set(data.map(p=>p.zona))], moneda:['ARS','USD'], habitaciones:['1','2','3','4'], banos:['1','2','3'], comodidades:[...new Set(data.flatMap(p=>p.comodidades))] };
const parse = query => parseFilters(new URLSearchParams(query), choices);
const ids = query => filterProperties(data, parse(query).filters).map(p=>p.id);

test('default and exact dataset distribution',()=>{
 assert.equal(data.length,12);assert.equal(new Set(data.map(p=>p.id)).size,12);
 assert.deepEqual(['casa','departamento','terreno'].map(t=>data.filter(p=>p.tipo===t).length),[4,5,3]);assert.equal(ids('').length,12);
});
test('operation, type, zone and currency individually',()=>{
 assert.deepEqual(ids('operacion=alquiler'),['nexo-002','nexo-006','nexo-007','nexo-010']);
 assert.deepEqual(ids('tipo=terreno'),['nexo-005','nexo-011','nexo-012']);
 assert.deepEqual(ids('zona=centro'),['nexo-002','nexo-009']);assert.equal(ids('moneda=USD').length,8);
});
test('inclusive price and area bounds',()=>{
 assert.deepEqual(ids('moneda=USD&precioMin=42000&precioMax=89000'),['nexo-003','nexo-005','nexo-009','nexo-012']);
 assert.deepEqual(ids('superficieMin=180&superficieMax=300'),['nexo-001','nexo-008','nexo-011']);
});
test('minimum rooms, bathrooms and land exclusion',()=>{
 assert.deepEqual(ids('habitaciones=4'),['nexo-008']);assert.deepEqual(ids('banos=3'),['nexo-008']);
 assert.deepEqual(ids('tipo=terreno&habitaciones=1'),[]);assert.deepEqual(ids('tipo=terreno&banos=1'),[]);
});
test('all selected amenities are required',()=>{
 assert.deepEqual(ids('comodidad=cochera&comodidad=patio&comodidad=parrilla'),['nexo-001','nexo-008']);
});
test('combined search and empty results',()=>{
 assert.deepEqual(ids('operacion=venta&tipo=casa&zona=molina-punta&moneda=USD&precioMax=150000&habitaciones=3&banos=2&superficieMin=160&comodidad=cochera'),['nexo-001']);
 assert.deepEqual(ids('tipo=terreno&zona=centro'),[]);
});
test('invalid ranges and missing currency',()=>{
 assert.match(validateFilters(parse('precioMin=100').filters),/moneda/);
 assert.match(validateFilters(parse('moneda=USD&precioMin=100&precioMax=50').filters),/precio mínimo/);
 assert.match(validateFilters(parse('superficieMin=100&superficieMax=50').filters),/superficie mínima/);
 assert.equal(validateFilters(parse('moneda=USD&precioMin=0&precioMax=0').filters),'');
});
test('URL values are normalized; first repeated singleton wins',()=>{
 const {filters,warnings}=parse('tipo=terreno&tipo=casa&precioMin=-2&superficieMax=Infinity&zona=%3Cscript%3E&comodidad=desconocida');
 assert.equal(filters.tipo,'terreno');assert.equal(filters.precioMin,null);assert.equal(filters.superficieMax,null);assert.equal(filters.zona,'');assert.deepEqual(filters.comodidades,[]);assert.equal(warnings.length,4);
});
test('URL roundtrip preserves every filter and repeated amenities',()=>{
 const f=parse('operacion=venta&tipo=casa&zona=molina-punta&moneda=USD&precioMin=0&precioMax=200000&habitaciones=2&banos=1&superficieMin=100&superficieMax=300&comodidad=patio&comodidad=cochera&orden=precio-desc').filters;
 assert.deepEqual(parse(serializeFilters(f)).filters,f);
});
test('price sorting groups currencies and sorts within each group',()=>{
 for(const direction of ['asc','desc']){
  const sorted=sortProperties(data,`precio-${direction}`);assert.deepEqual(sorted.slice(0,4).map(p=>p.moneda),Array(4).fill('ARS'));
  for(const currency of ['ARS','USD']){const group=sorted.filter(p=>p.moneda===currency);for(let i=1;i<group.length;i++)assert(direction==='asc'?group[i-1].precio<=group[i].precio:group[i-1].precio>=group[i].precio);}
 }
 assert.equal(data[0].id,'nexo-001');
});
test('area sorting has the correct extremes',()=>{
 assert.equal(sortProperties(data,'superficie-asc')[0].id,'nexo-009');assert.equal(sortProperties(data,'superficie-desc')[0].id,'nexo-012');
});
test('incomplete fields do not falsely match numeric or amenity requirements',()=>{
 const partial={...data[0],precio:null,superficie:null,habitaciones:null,banos:null,comodidades:null};
 for(const q of ['moneda=USD&precioMin=1','superficieMin=1','habitaciones=1','banos=1','comodidad=patio'])assert.equal(filterProperties([partial],parse(q).filters).length,0);
 assert.equal(sortProperties([partial,data[1]],'superficie-asc')[1],partial);
});
