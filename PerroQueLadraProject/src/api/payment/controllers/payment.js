'use strict';
const { verifySignature } = require('../services/validation');

module.exports = {
  async create(ctx) {
    if (!ctx.state.user) return ctx.unauthorized('Inicia sesión para pagar');
    try {
      ctx.body = await strapi.service('api::payment.payment').create(ctx.state.user, ctx.request.body);
    } catch (error) {
      strapi.log.error(`Checkout falló (${error.status || 500})`);
      ctx.status = error.status || 500;
      ctx.body = { error: { message: error.status ? error.message : 'No se pudo iniciar el pago' } };
    }
  },

  async webhook(ctx) {
    if (!process.env.MP_WEBHOOK_SECRET) return ctx.serviceUnavailable('Webhook sin configurar');
    const id = ctx.query['data.id'];
    if (!verifySignature(ctx.get('x-signature'), ctx.get('x-request-id'), id, process.env.MP_WEBHOOK_SECRET)) {
      return ctx.unauthorized('Firma inválida');
    }
    const type = ctx.query.type || ctx.request.body?.type;
    if (type !== 'payment') { ctx.body = { received: true }; return; }
    if (ctx.request.body?.data?.id != null && String(ctx.request.body.data.id) !== id) {
      return ctx.badRequest('ID inconsistente');
    }
    try {
      await strapi.service('api::payment.payment').webhook(id);
      ctx.body = { received: true };
    } catch (error) {
      strapi.log.error(`Webhook falló (${error.status || 500})`);
      ctx.status = error.status || 500;
      ctx.body = { error: 'No se pudo confirmar el pago' };
    }
  },
};
