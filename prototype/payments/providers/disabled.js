/**
 * DisabledPaymentProvider — DEFAULT. No SDK. No checkout.
 */
(function (global) {
  'use strict';
  function createDisabledPaymentProvider() {
    return {
      id: 'disabled',
      enabled: false,
      loadSdk: async function () {},
      startCheckout: async function () {
        var e = new Error('Payments are disabled');
        e.code = 'PAYMENTS_DISABLED';
        throw e;
      },
      openPortal: async function () {
        var e = new Error('Payments are disabled');
        e.code = 'PAYMENTS_DISABLED';
        throw e;
      },
    };
  }
  global.WingmanPayments = global.WingmanPayments || {};
  global.WingmanPayments.createDisabledPaymentProvider = createDisabledPaymentProvider;
})(typeof window !== 'undefined' ? window : globalThis);
