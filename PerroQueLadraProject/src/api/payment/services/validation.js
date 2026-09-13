'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function cents(value) {
  if (typeof value !== 'number' && typeof value !== 'string') fail('Importe inválido');
  const number = Number(value);
  const result = Math.round(number * 100);
  if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(result) || result <= 0) {
    fail('Importe inválido');
  }
  return result;
}

function verifySignature(signature, requestId, dataId, secret) {
  if (!secret || typeof signature !== 'string' || typeof requestId !== 'string' ||
      !requestId || typeof dataId !== 'string' || !/^[a-z0-9]+$/i.test(dataId)) return false;
  const parts = signature.split(',').map(part => part.trim().split('='));
  const ts = parts.filter(([key]) => key === 'ts');
  const hashes = parts.filter(([key]) => key === 'v1');
  if (ts.length !== 1 || !/^\d+$/.test(ts[0][1]) || hashes.length !== 1 ||
      !/^[a-f0-9]{64}$/i.test(hashes[0][1])) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts[0][1]};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(hashes[0][1], 'hex'));
}

function shippingFields(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Faltan datos de envío');
  const fields = ['Nombre_Completo', 'Telefono', 'Calle', 'Numero_Casa', 'Estado_Pais', 'Codigo_Postal', 'Referencias'];
  const result = {};
  for (const field of fields) {
    if (input[field] !== undefined && typeof input[field] !== 'string') fail('Datos de envío inválidos');
    result[field] = (input[field] || '').trim();
    if (result[field].length > 500) fail('Datos de envío demasiado largos');
  }
  for (const field of ['Nombre_Completo', 'Telefono', 'Calle', 'Codigo_Postal']) {
    if (!result[field]) fail('Faltan datos de envío obligatorios');
  }
  return result;
}

function verifiedCart(rows) {
  if (!rows.length || rows.length > 100) fail('El carrito está vacío o excede 100 productos');
  let totalCents = 0;
  const items = rows.map(row => {
    const product = row.producto;
    if (!product || !product.publishedAt || product.Activo === false) fail('Producto no disponible');
    const quantity = row.Cantidad;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) fail('Cantidad inválida');
    const price = cents(product.Precio);
    totalCents += price * quantity;
    if (!Number.isSafeInteger(totalCents)) fail('Total inválido');
    return {
      id: product.documentId,
      title: product.Nombre || 'Producto',
      currency_id: 'MXN', unit_price: price / 100, quantity,
    };
  });
  return { items, total: totalCents / 100 };
}

function paymentUpdate(order, payment, config, paymentId) {
  if (String(payment.id) !== paymentId || payment.external_reference !== order.documentId ||
      String(payment.collector_id) !== config.collectorId || payment.live_mode !== config.liveMode ||
      payment.currency_id !== 'MXN' || cents(payment.transaction_amount) !== cents(order.total)) {
    fail('El pago no coincide con el pedido', 409);
  }
  const settled = ['approved', 'refunded', 'charged_back'];
  if (order.MP_Payment_ID && order.MP_Payment_ID !== paymentId && settled.includes(order.MP_Status)) return null;
  if (settled.includes(order.MP_Status) && !settled.includes(payment.status)) return null;
  if (['refunded', 'charged_back'].includes(order.MP_Status) && payment.status === 'approved') return null;
  const states = {
    approved: 'Pagado', pending: 'Pendiente', in_process: 'Pendiente', authorized: 'Pendiente',
    rejected: 'Pago Rechazado', cancelled: 'Cancelado', refunded: 'Reembolsado', charged_back: 'Contracargo',
  };
  if (!states[payment.status]) return null;
  let state = states[payment.status];
  if (payment.status === 'approved' && ['Enviado ', 'Entregado'].includes(order.Estado)) state = order.Estado;
  const update = {
    Estado: state, MP_Payment_ID: paymentId,
    MP_Status: payment.status, MP_Status_Detail: payment.status_detail || '',
  };
  if (Object.entries(update).every(([key, value]) => order[key] === value)) return null;
  return update;
}

module.exports = { fail, cents, verifySignature, shippingFields, verifiedCart, paymentUpdate };
