import test from 'node:test';
import assert from 'node:assert/strict';
import {loadResource,ResourceLoadError,startupNotice} from '../public/game/startup.js';

test('Startup notices distinguish internal errors, unavailable assets and graphics support',()=>{
 const internal=startupNotice(new TypeError("Cannot read properties of null (reading 'turn')"));assert.match(internal.title,/ERROR AL INICIAR/);assert.match(internal.message,/error interno/);assert.ok(!internal.message.includes('Revisa tu conexión'));assert.match(internal.detail,/turn/);
 const resource=startupNotice(new ResourceLoadError('el mapa',new Error('Mapa: HTTP 404')));assert.match(resource.title,/RECURSO/);assert.match(resource.message,/el mapa/);assert.equal(resource.detail,'Mapa: HTTP 404');assert.ok(!resource.message.includes('conexión'));
 const graphics=startupNotice(new Error('THREE.WebGLRenderer: Error creating WebGL context.'));assert.match(graphics.message,/gráficos 3D/);assert.ok(!graphics.message.includes('conexión'));
 const unrelated=startupNotice(new TypeError("Cannot read properties of null (reading 'context')"));assert.match(unrelated.message,/error interno/);
});

test('Resource loading preserves successful results and exposes the failing asset and cause',async()=>{
 const value={features:[]};assert.equal(await loadResource('el mapa',async()=>value),value);
 const cause=new TypeError('Failed to fetch');await assert.rejects(loadResource('el catálogo de unidades',async()=>{throw cause;}),error=>error instanceof ResourceLoadError&&error.cause===cause&&error.resource==='el catálogo de unidades');
});
