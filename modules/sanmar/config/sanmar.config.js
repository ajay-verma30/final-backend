// ═══════════════════════════════════════════════════════
//  SanMar Configuration
//  Credentials milne ke baad yahan fill karo
// ═══════════════════════════════════════════════════════

module.exports = {
  credentials: {
    username:       process.env.SANMAR_USERNAME        || 'YOUR_USERNAME',
    password:       process.env.SANMAR_PASSWORD        || 'YOUR_PASSWORD',
    customerNumber: process.env.SANMAR_CUSTOMER_NUMBER || 'YOUR_CUSTOMER_NUMBER',
  },

  // ── WSDL Endpoints ──────────────────────────────────
  // UAT = testing, PROD = live (credentials milne ke baad PROD use karna)
  endpoints: {
    product: {
      uat:  'https://uat-ws.sanmar.com:8080/SanMarWebService/SanMarProductInfoServicePort?wsdl',
      prod: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarProductInfoServicePort?wsdl',
    },
    pricing: {
      uat:  'https://uat-ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort?wsdl',
      prod: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarPricingServicePort?wsdl',
    },
    inventory: {
      uat:  'https://uat-ws.sanmar.com:8080/SanMarWebService/SanMarInventoryServicePort?wsdl',
      prod: 'https://ws.sanmar.com:8080/SanMarWebService/SanMarInventoryServicePort?wsdl',
    },
  },

  // ── Environment ──────────────────────────────────────
  // 'uat' for testing, 'prod' for live
  env: process.env.SANMAR_ENV || 'uat',

  // ── Sync Settings ────────────────────────────────────
  sync: {
    // Nightly delta sync — raat 2 baje
    cronSchedule: '0 2 * * *',

    // Ek baar mein kitne styles process karein (rate limiting)
    batchSize: 50,

    // Requests ke beech delay (ms) — SanMar rate limit avoid karne ke liye
    delayBetweenRequests: 500,
  },
};