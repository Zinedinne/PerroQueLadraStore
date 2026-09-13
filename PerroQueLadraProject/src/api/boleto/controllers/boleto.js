'use strict';
const { createCoreController } = require('@strapi/strapi').factories;
module.exports = createCoreController('api::boleto.boleto', ({ strapi }) => ({
  async find(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    ctx.query = { ...ctx.query, filters: { $and: [ctx.query.filters || {}, { pedido: { users_permissions_user: { id: ctx.state.user.id } } }] } };
    return super.find(ctx);
  },
  async findOne(ctx) {
    if (!ctx.state.user) return ctx.unauthorized();
    const records = await strapi.documents('api::boleto.boleto').findMany({
      status: 'published', filters: { $and: [{ documentId: ctx.params.id }, { pedido: { users_permissions_user: { id: ctx.state.user.id } } }] }, limit: 1,
    });
    if (!records.length) return ctx.notFound();
    return super.findOne(ctx);
  },
}));
