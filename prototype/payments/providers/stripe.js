/**
 * Stripe client adapter — dormant. SDK loads only if future config enables it.
 * Never collects PAN/CVV.
 */
(function (global) {
  'use strict';
  function createStripePaymentProvider(config) {
    config = config || {};
    return {
      id: 'stripe',
      enabled: Boolean(config.publishableKey),
      loadSdk: async function () {
        if (!config.publishableKey) {
          var e = new Error('PAYMENT_NOT_CONFIGURED');
          e.code = 'PAYMENT_NOT_CONFIGURED';
          throw e;
        }
        var blocked = new Error('Stripe SDK load blocked until PAYMENTS_ENABLED');
        blocked.code = 'PAYMENTS_DISABLED';
        throw blocked;
      },
      startCheckout: async function () {
        var e = new Error('Stripe checkout not activated');
        e.code = 'PAYMENTS_DISABLED';
        throw e;
      },
      openPortal: async function () {
        var e = new Error('Stripe portal not activated');
        e.code = 'PAYMENTS_DISABLED';
        throw e;
      },
    };
  }
  global.WingmanPayments = global.WingmanPayments || {};
  global.WingmanPayments.createStripePaymentProvider = createStripePaymentProvider;
})(typeof window !== 'undefined' ? window : globalThis);
