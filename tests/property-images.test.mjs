import test from 'node:test';
import assert from 'node:assert/strict';
import { getPropertyImage } from '../assets/js/property-cards.js';
const metadata = () => ({src:'assets/images/propiedades/nexo-001/principal.jpg',width:960,height:720,alt:'Imagen de referencia de prueba',webp:[],jpeg:[]});
test('legacy, absent or incomplete image metadata uses fallback',()=>{
 for(const value of [null,undefined,{},{src:null}, {...metadata(),width:0},{...metadata(),alt:''}]) assert.equal(getPropertyImage(value),null);
});
test('valid JPEG and optional responsive sources are accepted',()=>{
 const m=metadata();assert.deepEqual(getPropertyImage(m),m);
});
test('external and ascending paths are rejected',()=>{
 for(const src of ['https://example.invalid/photo.jpg','../photo.jpg','assets/images/propiedades/../photo.jpg','assets/images/propiedades/photo.svg']) assert.equal(getPropertyImage({...metadata(),src}),null);
});
test('variants are validated, sorted and deduplicated without mutating input',()=>{
 const m=metadata();m.webp=[{src:'assets/images/propiedades/nexo-001/principal-960.webp',width:960},{src:'assets/images/propiedades/nexo-001/principal-480.webp',width:480},{src:'assets/images/propiedades/nexo-001/duplicada.webp',width:480},{src:'https://example.invalid/photo.webp',width:1200}];
 assert.deepEqual(getPropertyImage(m).webp.map(v=>v.width),[480,960]);assert.equal(m.webp.length,4);
});
