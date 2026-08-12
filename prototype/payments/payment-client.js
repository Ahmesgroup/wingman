/**
 * Wingman payment client — DEFAULT DisabledPaymentProvider.
 * No paywall CTAs. No Stripe/Paddle SDK while disabled.
 */
(function (global) {
  'use strict';
  var P = global.WingmanPayments || {};

  function createPaymentClient(config) {
    config = config || { paymentsEnabled: false, provider: 'disabled' };
    var enabled = config.paymentsEnabled === true;
    var providerId = enabled ? (config.provider || 'disabled') : 'disabled';
    var provider;
    if (providerId === 'stripe' && enabled && P.createStripePaymentProvider) {
      provider = P.createStripePaymentProvider({ publishableKey: config.publishableKey });
    } else if (providerId === 'paddle' && enabled && P.createPaddlePaymentProvider) {
      provider = P.createPaddlePaymentProvider({
        clientToken: config.paddleClientToken,
        environment: config.paddleEnvironment,
      });
    } else {
      provider = P.createDisabledPaymentProvider();
    }
    return {
      provider: provider,
      showPaywallCtas: false,
      startCheckout: function () { return provider.startCheckout(); },
    };
  }

  P.createPaymentClient = createPaymentClient;
  P.paymentClient = createPaymentClient({ paymentsEnabled: false, provider: 'disabled' });
  global.WingmanPayments = P;
})(typeof window !== 'undefined' ? window : globalThis);
