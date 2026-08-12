/**
 * Payment types — documentation only (no runtime).
 * Entitlements = S19 server truth. Client never grants Wingman+.
 * No card PAN/CVV fields ever.
 */
(function (global) {
  'use strict';
  global.WingmanPayments = global.WingmanPayments || {};
  global.WingmanPayments.TYPES = {
    providers: ['disabled', 'stripe', 'paddle'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
