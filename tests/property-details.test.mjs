import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readPropertyId, findProperty, getSimilarProperties, getGalleryImages, buildInquiryMessage, getPropertyUrl, getWhatsAppUrl } from '../assets/js/property-details.js';
import { getPropertyImage } from '../assets/js/property-cards.js';
import { whatsappNumber } from '../assets/js/site-config.js';
const properties = JSON.parse(await readFile(new URL('../data/propiedades.json', import.meta.url)));
test('valid, absent, malformed and repeated property IDs', () => {
  assert.equal(readPropertyId('?id=nexo-001'), 'nexo-001');
  for (const value of ['', '?id=', '?id=%3Cscript%3E', '?id=../file', '?id=nexo-001&id=nexo-002']) assert.equal(readPropertyId(value), null);
});
test('all twelve records resolve without duplicating their data', () => {
  for (const property of properties) assert.equal(findProperty(properties, property.id), property);
  assert.equal(findProperty(properties, 'unknown'), null);
});
test('recommendations exclude self and prioritize type/operation before zone', () => {
  const current = properties[0];
  const result = getSimilarProperties(properties, current);
  assert.equal(result.length, 3); assert(result.every(property => property.id !== current.id));
  assert.deepEqual(new Set(result.map(p => p.id)), new Set(['nexo-004','nexo-007','nexo-008']));
  assert.equal(getSimilarProperties([current], current).length, 0);
  assert.equal(getSimilarProperties(properties, current, 1).length, 1);
});
test('gallery uses current image only; future photos are normalized and deduplicated', () => {
  for (const p of properties) assert.equal(getGalleryImages(p, getPropertyImage).length, 1);
  const p = properties[0];
  const extra = {...p.imagen, src:'assets/images/propiedades/nexo-001/otra.jpg'};
  assert.equal(getGalleryImages({...p, fotografias:[p.imagen, null, {}, extra]}, getPropertyImage).length, 2);
  assert.deepEqual(getGalleryImages({imagen:null}, getPropertyImage), []);
});
test('query URLs remain compatible with GitHub Pages subdirectories', () => {
  assert.equal(getPropertyUrl('nexo-001', 'https://example.test/NEXO-INMOBILIARIA/index.html'), 'https://example.test/NEXO-INMOBILIARIA/propiedad.html?id=nexo-001');
});
test('personalized inquiry contains the title, ID, canonical URL and demonstration notice', () => {
  const message = buildInquiryMessage(properties[0], 'https://example.test/site/propiedad.html?id=old#section');
  assert(message.includes(properties[0].titulo));assert(message.includes('ID: nexo-001'));
  assert(message.includes('https://example.test/site/propiedad.html?id=nexo-001'));
  assert(!message.includes('#section'));assert(message.includes('ficticia'));
});
test('WhatsApp remains unconfigured; no real or invented number is set', () => {
  assert.equal(whatsappNumber, null);
  for (const phone of [null, '', '+123', 'not-a-number', '012345678']) assert.equal(getWhatsAppUrl(phone, 'Hola'), null);
});
test('WhatsApp encodes a message without sending it', () => {
  // Numeric string is solely a unit-test fixture, never site configuration.
  const message = 'Hola & consulta\nhttps://example.test/?id=nexo-001';
  const url = new URL(getWhatsAppUrl('123456789', message));
  assert.equal(url.searchParams.get('text'), message);
});
