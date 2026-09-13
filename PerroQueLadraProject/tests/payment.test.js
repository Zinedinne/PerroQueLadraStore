'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifySignature, verifiedCart, paymentUpdate } = require('../src/api/payment/services/validation');
test('server price and integer quantities', () => {
 const row={Cantidad:2,Total:0.01,producto:{documentId:'p',Precio:'100.25',publishedAt:'2026-01-01'}};
 assert.equal(verifiedCart([row]).total,200.5);
 for(const Cantidad of [0,-1,1.2,'2',101]) assert.throws(()=>verifiedCart([{...row,Cantidad}]));
 assert.throws(()=>verifiedCart([{Cantidad:1,Total:0.01}]));
});
test('signature binds payment and request; malformed hashes rejected', () => {
 const hash=crypto.createHmac('sha256','test').update('id:123;request-id:req;ts:1704908010;').digest('hex');
 const signature=`ts=1704908010, v1=${hash}`;
 assert.equal(verifySignature(signature,'req','123','test'),true);
 assert.equal(verifySignature(signature,'req','124','test'),false);
 assert.equal(verifySignature(signature,'other','123','test'),false);
 assert.equal(verifySignature('ts=1,v1=abc','req','123','test'),false);
});
test('payment validation, idempotency, refunds and stale attempts', () => {
 const order={documentId:'order',total:200.5,Estado:'Pendiente'};
 const payment={id:42,external_reference:'order',transaction_amount:200.5,collector_id:7,live_mode:false,currency_id:'MXN',status:'approved',status_detail:'accredited'};
 const config={collectorId:'7',liveMode:false};
 const update=paymentUpdate(order,payment,config,'42'); assert.equal(update.Estado,'Pagado');
 for(const patch of [{transaction_amount:1},{collector_id:8},{live_mode:true},{currency_id:'USD'},{external_reference:'other'}]) assert.throws(()=>paymentUpdate(order,{...payment,...patch},config,'42'));
 const paid={...order,...update};
 assert.equal(paymentUpdate(paid,payment,config,'42'),null);
 assert.equal(paymentUpdate(paid,{...payment,status:'pending'},config,'42'),null);
 assert.equal(paymentUpdate(paid,{...payment,id:43,status:'rejected'},config,'43'),null);
 assert.equal(paymentUpdate(paid,{...payment,status:'refunded'},config,'42').Estado,'Reembolsado');
});
