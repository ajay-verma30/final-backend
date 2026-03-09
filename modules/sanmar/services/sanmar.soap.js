// ═══════════════════════════════════════════════════════
//  SanMar SOAP Client
//  Har service ke liye SOAP connection handle karta hai
// ═══════════════════════════════════════════════════════

const soap = require('soap');
const config = require('../config/sanmar.config');

// Active environment ke liye sahi WSDL URL lo
function getWsdlUrl(service) {
  const env = config.env; // 'uat' or 'prod'
  return config.endpoints[service][env];
}

// SOAP client cache — baar baar naya client banana slow hai
const clientCache = {};

/**
 * SOAP client lo (cached)
 * @param {'product'|'pricing'|'inventory'} service
 */
async function getClient(service) {
  if (clientCache[service]) return clientCache[service];

  const wsdlUrl = getWsdlUrl(service);
  const client = await soap.createClientAsync(wsdlUrl, { timeout: 30000 });  
  clientCache[service] = client;
  return client;
}

/**
 * SanMar auth object — har call mein yeh bhejna hota hai
 */
function getAuth() {
  return {
    SanMarCustomerNumber: config.credentials.customerNumber,
    SanMarUserName:       config.credentials.username,
    SanMarUserPassword:   config.credentials.password,
  };
}

/**
 * Generic SOAP call wrapper — error handling + logging ke saath
 * @param {'product'|'pricing'|'inventory'} service
 * @param {string} method  - SOAP method name
 * @param {object} params  - Method params (auth automatic add hoga)
 */
async function soapCall(service, method, params) {
  const client = await getClient(service);
  const auth   = getAuth();

  const requestPayload = { ...params, ...auth };

  try {
    const [result] = await client[`${method}Async`](requestPayload);

    // SanMar apna error errorOccurred flag mein bhejta hai
    if (result?.errorOccurred === true || result?.errorOccurred === 'true') {
      throw new Error(`SanMar API Error [${method}]: ${result?.message || 'Unknown error'}`);
    }

    return result;
  } catch (err) {
    console.error(`[SanMar SOAP] ${service}.${method} failed:`, err.message);
    throw err;
  }
}

module.exports = { soapCall, getAuth };