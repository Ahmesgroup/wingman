/**
 * Paddle client adapter — dormant. SDK loads only if future config enables it.
 */
(function (global) {
  'use strict';
  function createPaddlePaymentProvider(config) {
    config = config || {};
    return {
      id: 'paddle',
      enabled: Boolean(config.clientToken),
      loadSdk: async function () {
        if (!config.clientToken) {
          var e = new Error('PAYMENT_NOT_CONFIGURED');
          e.code = 'PAYMENT_NOT_CONFIGURED';
          throw e;
        }
        var blocked = new Error('Paddle SDK load blocked until PAYMENTS_ENABLED');
        blocked.code = 'PAYMENTS_DISABLED';
        throw blocked;
      },
      startCheckout: async function () {
        var e = new Error('Paddle checkout not activated');
        e.code = 'PAYMENTS_DISABLED';
        throw e;
      },
      openPortal: async function () {
        var e = new Error('Paddle portal not activated');
        e.code = 'PAYMENTS_DISABLED';
        throw e;
      },
    };
  }
  global.WingmanPayments = global.WingmanPayments || {};
  global.WingmanPayments.createPaddlePaymentProvider = createPaddlePaymentProvider;
})(typeof window !== 'undefined' ? window : globalThis);
