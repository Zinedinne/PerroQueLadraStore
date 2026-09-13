'use strict';
const { createCoreRouter } = require('@strapi/strapi').factories;
module.exports = createCoreRouter('api::boleto.boleto', { only: ['find', 'findOne'] });
