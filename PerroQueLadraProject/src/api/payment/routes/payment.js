'use strict';
module.exports = {
  routes: [
    {
      method: 'POST', path: '/payments/create-preference', handler: 'payment.create',
      config: { policies: [], middlewares: [] },
    },
    {
      method: 'POST', path: '/payments/webhook', handler: 'payment.webhook',
      config: { auth: false, policies: [], middlewares: [] },
    },
  ],
};
