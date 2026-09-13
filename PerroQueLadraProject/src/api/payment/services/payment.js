'use strict';
const { fail, shippingFields, verifiedCart, paymentUpdate } = require('./validation');
const PEDIDO = 'api::pedido.pedido';

function configuration() {
  const token = process.env.MP_ACCESS_TOKEN;
  const secret = process.env.MP_WEBHOOK_SECRET;
  const collectorId = process.env.MP_COLLECTOR_ID;
  const mode = process.env.MP_LIVE_MODE;
  if (!token || !secret || !/^\d+$/.test(collectorId || '') || !['true', 'false'].includes(mode)) {
    fail('Falta configurar Mercado Pago en el servidor', 503);
  }
  const frontend = new URL(process.env.FRONTEND_URL);
  const webhook = new URL(process.env.MP_WEBHOOK_URL);
  if (webhook.protocol !== 'https:' || !['https:', 'http:'].includes(frontend.protocol)) {
    fail('URLs de pago inválidas', 503);
  }
  return { token, secret, collectorId, liveMode: mode === 'true', frontend: frontend.origin, webhook: webhook.href };
}

async function mpRequest(path, config, body) {
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) fail('Mercado Pago no pudo completar la operación', 502);
  return response.json();
}

module.exports = ({ strapi }) => ({
  async create(user, body) {
    const config = configuration();
    let shipping, rows;
    const registration = body?.registration;
    if (registration) {
      const participant = registration.participant;
      if (!participant || typeof participant !== 'object') fail('Faltan datos del participante');
      for (const key of ['Nombre_Participante', 'correo', 'FechaNacimiento', 'Domicilio', 'Numero_Telefono']) {
        if (typeof participant[key] !== 'string' || !participant[key].trim() || participant[key].length > 500) fail('Datos del participante inválidos');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(participant.FechaNacimiento) ||
          !['Varonil', 'Femenil'].includes(participant.Rama) || !['CH', 'M', 'G', 'XG'].includes(participant.Talla)) fail('Datos del participante inválidos');
      shipping = { Nombre_Completo: participant.Nombre_Participante, Telefono: participant.Numero_Telefono, Calle: participant.Domicilio };
      rows = [{ Cantidad: 1, evento: { documentId: registration.eventoId }, evento_precio: { documentId: registration.precioId } }];
    } else {
      shipping = shippingFields(body?.shippingData);
      rows = await strapi.documents('api::carrito.carrito').findMany({
        status: 'published', filters: { cliente: { id: user.id } },
        populate: ['producto', 'evento', 'evento_precio'], limit: 101,
      });
    }
    const tickets = [];
    for (const row of rows) {
      if (!row.producto) {
        const eventId = row.evento?.documentId;
        const priceId = row.evento_precio?.documentId;
        if (!eventId || !priceId) fail('Este boleto del carrito no tiene evento/categoría: elimínalo y vuelve a añadirlo');
        const event = await strapi.documents('api::evento.evento').findOne({
          documentId: eventId, status: 'published', populate: ['evento_precios'],
        });
        const price = event?.evento_precios?.find(p => p.documentId === priceId && p.publishedAt);
        if (!price) fail('Categoría no disponible para este evento');
        row.producto = { documentId: priceId, Nombre: `Inscripción: ${event.Nombre} - ${price.KM}`, Precio: price.Precio, publishedAt: event.publishedAt };
        tickets.push({ eventId, quantity: row.Cantidad, category: price.KM });
      }
    }
    const { items, total } = verifiedCart(rows);
    if (tickets.reduce((sum, ticket) => sum + ticket.quantity, 0) > 100) fail('Máximo 100 boletos por pedido');
    const order = await strapi.documents(PEDIDO).create({
      status: 'published',
      data: {
        ...shipping, Estado: 'Pendiente', users_permissions_user: user.id,
        total, Metodo_Pago: 'Mercado Pago', MP_Checkout_Version: 1,
        Lista_Productos: items.map((item, index) => ({
          Producto_Nombre: item.title, cantidad: item.quantity, Precio_Unitario: item.unit_price,
          Subtotal: Math.round(item.unit_price * 100) * item.quantity / 100,
          Variante: String(rows[index].Detalle || 'N/A').slice(0, 500),
        })),
      },
    });
    // Reserve ticket folios before offering a checkout; all copies share the order reference.
    await strapi.db.transaction(async ({ trx }) => {
      for (const ticket of tickets.sort((a, b) => a.eventId.localeCompare(b.eventId))) {
        const meta = strapi.db.metadata.get('api::evento.evento');
        await trx(meta.tableName).where(meta.attributes.documentId.columnName, ticket.eventId).forUpdate().select('id');
        for (let i = 0; i < ticket.quantity; i++) {
          const participant = registration?.participant || {
            Nombre_Participante: shipping.Nombre_Completo, correo: user.email,
            Domicilio: shipping.Calle, Numero_Telefono: shipping.Telefono,
          };
          const data = {};
          for (const field of ['Nombre_Participante', 'correo', 'FechaNacimiento', 'Domicilio', 'Numero_Telefono', 'Rama', 'Talla']) {
            if (participant[field] !== undefined) data[field] = participant[field];
          }
          await strapi.documents('api::boleto.boleto').create({ status: 'published', data: {
            ...data, evento: ticket.eventId, pedido: order.documentId,
            Categoria: ticket.category, MP_Status_Detail: 'Pendiente',
          } });
        }
      }
    });
    // A failed upstream request leaves an unpaid order for reconciliation, never a paid one.
    const preference = await mpRequest('/checkout/preferences', config, {
      items, payer: { email: user.email }, external_reference: order.documentId,
      notification_url: config.webhook,
      back_urls: {
        success: `${config.frontend}/gracias`, failure: `${config.frontend}/carrito`,
        pending: `${config.frontend}/pendiente`,
      },
    });
    if (!preference.id || !preference.init_point) fail('Respuesta de pago incompleta', 502);
    await strapi.documents(PEDIDO).update({
      documentId: order.documentId, status: 'published',
      data: { MP_Preference_ID: String(preference.id) },
    });
    return { preferenceId: preference.id, init_point: preference.init_point, pedidoId: order.documentId, total };
  },

  async webhook(paymentId) {
    const config = configuration();
    if (!/^\d+$/.test(paymentId)) fail('ID de pago inválido');
    const payment = await mpRequest(`/v1/payments/${paymentId}`, config);
    if (!payment.external_reference) return;
    // Lock both document versions; fetch the payment after acquiring the lock so concurrent
    // deliveries cannot overwrite a newer status with a stale read.
    await strapi.db.transaction(async ({ trx }) => {
      const metadata = strapi.db.metadata.get(PEDIDO);
      const documentColumn = metadata.attributes.documentId.columnName;
      await trx(metadata.tableName).where(documentColumn, payment.external_reference).forUpdate().select('id');
      const order = await strapi.documents(PEDIDO).findOne({
        documentId: payment.external_reference, status: 'published', populate: ['boletos'],
      });
      // Old preferences did not have a server-verified total; do not confirm them automatically.
      if (!order || order.MP_Checkout_Version !== 1) return;
      if (!order.MP_Preference_ID) fail('Preferencia aún no persistida', 503);
      const current = await mpRequest(`/v1/payments/${paymentId}`, config);
      const update = paymentUpdate(order, current, config, paymentId);
      if (update) {
        await strapi.documents(PEDIDO).update({ documentId: order.documentId, status: 'published', data: update });
        for (const ticket of order.boletos || []) {
          await strapi.documents('api::boleto.boleto').update({
            documentId: ticket.documentId, status: 'published',
            data: { MP_Payment_ID: paymentId, MP_Status_Detail: update.Estado },
          });
        }
      }
    });
  },
});
