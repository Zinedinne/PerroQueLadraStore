'use strict';
const { createCoreRouter } = require('@strapi/strapi').factories;
module.exports = createCoreRouter('api::pedido.pedido', { only: ['find', 'findOne'] });
