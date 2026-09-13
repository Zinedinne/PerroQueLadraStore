'use strict';
// Uses a fresh SQLite database and fake Mercado Pago responses; never sends payments or emails.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const temp = mkdtempSync(path.join(tmpdir(), 'pql-payment-'));
Object.assign(process.env, {
 NODE_ENV:'test', DATABASE_CLIENT:'sqlite', DATABASE_FILENAME:path.relative(process.cwd(),path.join(temp,'test.db')),
 APP_KEYS:'test-a,test-b', API_TOKEN_SALT:'test', ADMIN_JWT_SECRET:'test', JWT_SECRET:'test',
 TRANSFER_TOKEN_SALT:'test', ENCRYPTION_KEY:'test-only-32-characters-long-key!',
 MP_ACCESS_TOKEN:'test', MP_WEBHOOK_SECRET:'test', MP_COLLECTOR_ID:'7', MP_LIVE_MODE:'false',
 FRONTEND_URL:'http://localhost:3000', MP_WEBHOOK_URL:'https://example.com/api/payments/webhook',
 STRAPI_TELEMETRY_DISABLED:'true', STRAPI_DISABLE_UPDATE_NOTIFICATION:'true',
});
let app;
let httpServer;
const realFetch = global.fetch;
(async()=>{
 app = await require('@strapi/strapi').createStrapi().load();
 const user=await app.db.query('plugin::users-permissions.user').create({data:{username:'test',email:'test@example.com',provider:'local',confirmed:true}});
 const product=await app.documents('api::producto.producto').create({status:'published',data:{Nombre:'Playera',Precio:100.25,Activo:true}});
 await app.documents('api::carrito.carrito').create({status:'published',data:{producto:product.documentId,cliente:user.id,Cantidad:2,Total:0.01}});
 const service=app.service('api::payment.payment');
 let requestBody;
 let currentPayment;
 global.fetch=async(url,options)=>{
  if(url.endsWith('/checkout/preferences')) {requestBody=JSON.parse(options.body);return {ok:true,json:async()=>({id:'pref-test',init_point:'https://example.com/checkout'})};}
  if(url.includes('/v1/payments/'))return {ok:true,json:async()=>currentPayment};
  throw new Error('Unexpected outgoing request');
 };
 const shippingData={Nombre_Completo:'Test',Telefono:'123',Calle:'Test',Codigo_Postal:'91000'};
 const result=await service.create(user,{shippingData,total:0.01});
 assert.equal(result.total,200.5);assert.equal(requestBody.items[0].unit_price,100.25);
 currentPayment={id:42,external_reference:result.pedidoId,transaction_amount:200.5,collector_id:7,live_mode:false,currency_id:'MXN',status:'approved',status_detail:'accredited'};
 await service.webhook('42'); await service.webhook('42');
 let order=await app.documents('api::pedido.pedido').findOne({documentId:result.pedidoId,status:'published'});
 assert.equal(order.Estado,'Pagado');assert.equal(order.MP_Payment_ID,'42');
 const price=await app.documents('api::evento-precio.evento-precio').create({status:'published',data:{KM:'5K',Precio:300}});
 const event=await app.documents('api::evento.evento').create({status:'published',data:{Nombre:'Carrera',Descripcion:'Test',FolioMin:10,FolioMax:20,evento_precios:[price.documentId]}});
 const registration={eventoId:event.documentId,precioId:price.documentId,participant:{Nombre_Participante:'Test',correo:'test@example.com',FechaNacimiento:'2000-01-01',Domicilio:'Test',Numero_Telefono:'123',Rama:'Varonil',Talla:'M'}};
 const ticketResult=await service.create(user,{registration});
 currentPayment={...currentPayment,id:43,external_reference:ticketResult.pedidoId,transaction_amount:300};
 await service.webhook('43');await service.webhook('43');
 const tickets=await app.documents('api::boleto.boleto').findMany({status:'published',filters:{pedido:{documentId:ticketResult.pedidoId}}});
 assert.equal(tickets.length,1);assert.equal(tickets[0].folio,10);assert.equal(tickets[0].MP_Status_Detail,'Pagado');
 await app.documents('api::carrito.carrito').create({status:'published',data:{evento:event.documentId,evento_precio:price.documentId,cliente:user.id,Cantidad:2,Total:0.01}});
 const mixed=await service.create(user,{shippingData});
 assert.equal(mixed.total,800.5);
 const mixedTickets=await app.documents('api::boleto.boleto').findMany({status:'published',filters:{pedido:{documentId:mixed.pedidoId}},sort:'folio:asc'});
 assert.deepEqual(mixedTickets.map(t=>t.folio),[11,12]);
 const wrongEvent=await app.documents('api::evento.evento').create({status:'published',data:{Nombre:'Otro',Descripcion:'Test'}});
 await assert.rejects(()=>service.create(user,{registration:{...registration,eventoId:wrongEvent.documentId}}));
 app.server.mount();
 httpServer=require('node:http').createServer(app.server.app.callback());
 await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${httpServer.address().port}`;
 let response=await realFetch(`${url}/api/payments/create-preference`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({shippingData})});
 assert.equal(response.ok,false); // Existing mixed Strapi dependency copies may format RBAC denial as 500.
 response=await realFetch(`${url}/api/payments/webhook?type=payment&data.id=43`,{method:'POST'});
 assert.equal(response.status,401);
 const role=await app.db.query('plugin::users-permissions.role').findOne({where:{type:'authenticated'}});
 await app.db.query('plugin::users-permissions.user').update({where:{id:user.id},data:{role:role.id}});
 for(const action of ['api::payment.payment.create','api::pedido.pedido.findOne']) await app.db.query('plugin::users-permissions.permission').create({data:{action,role:role.id}});
 const jwt=app.plugin('users-permissions').service('jwt').issue({id:user.id});
 response=await realFetch(`${url}/api/payments/create-preference`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt}`},body:JSON.stringify({shippingData})});
 assert.equal(response.status,200,await response.text());
 response=await realFetch(`${url}/api/pedidos/${result.pedidoId}`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${jwt}`},body:JSON.stringify({data:{Estado:'Pagado'}})});
 assert.ok([404,405].includes(response.status));
 const hash=require('node:crypto').createHmac('sha256','test').update('id:43;request-id:req;ts:1704908010;').digest('hex');
 response=await realFetch(`${url}/api/payments/webhook?type=payment&data.id=43`,{method:'POST',headers:{'x-signature':`ts=1704908010,v1=${hash}`,'x-request-id':'req'}});
 assert.equal(response.status,200);
 console.log('PASS: products, tickets, mixed cart, folios, duplicates, authentication and webhook HTTP');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(httpServer)await new Promise(resolve=>httpServer.close(resolve));global.fetch=realFetch;if(app)await app.destroy();rmSync(temp,{recursive:true,force:true});});
