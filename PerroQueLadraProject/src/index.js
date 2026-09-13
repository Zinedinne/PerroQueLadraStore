'use strict';

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register({ strapi }) {
    const extension = strapi.plugin('graphql')?.service('extension');
    // Orders and tickets are managed through the authenticated payment endpoints.
    extension?.shadowCRUD('api::pedido.pedido').disable();
    extension?.shadowCRUD('api::boleto.boleto').disable();
  },

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  bootstrap(/*{ strapi }*/) {},
};
