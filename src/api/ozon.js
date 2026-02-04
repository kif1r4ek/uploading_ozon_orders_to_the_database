import { config } from '../config.js';

const { clientId, apiKey, apiUrl } = config.ozon;
const { limit, delayMs, maxRetries, retryBackoffMs } = config.request;

let httpRequestCount = 0;
let retryCount = 0;

export function getStats() {
  return { httpRequestCount, retryCount };
}

export function resetStats() {
  httpRequestCount = 0;
  retryCount = 0;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function apiRequest(endpoint, body, attempt = 1) {
  httpRequestCount++;
  
  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Client-Id': clientId,
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (response.status === 429 || response.status >= 500) {
      if (attempt <= maxRetries) {
        retryCount++;
        const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
        console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (HTTP ${response.status})`);
        await sleep(waitTime);
        return apiRequest(endpoint, body, attempt + 1);
      }
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return response.json();
  } catch (error) {
    if (attempt <= maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT')) {
      retryCount++;
      const waitTime = retryBackoffMs * Math.pow(2, attempt - 1);
      console.log(`Retry ${attempt}/${maxRetries} after ${waitTime}ms (${error.code})`);
      await sleep(waitTime);
      return apiRequest(endpoint, body, attempt + 1);
    }
    throw error;
  }
}

function parseOrder(raw, postingType) {
  const analytics = raw.analytics_data || {};
  const delivery = raw.delivery_method || {};
  const financial = raw.financial_data || {};
  
  return {
    postingNumber: raw.posting_number,
    orderId: raw.order_id,
    orderNumber: raw.order_number,
    postingType,
    status: raw.status,
    substatus: raw.substatus,
    cancelReasonId: raw.cancel_reason_id,
    createdAt: raw.created_at,
    inProcessAt: raw.in_process_at,
    shipmentDate: raw.shipment_date,
    deliveringDate: raw.delivering_date,
    warehouseId: delivery.warehouse_id || analytics.warehouse_id,
    warehouseName: delivery.warehouse_name || analytics.warehouse_name,
    trackingNumber: raw.tracking_number,
    tplIntegrationType: delivery.tpl_provider_id ? 'tpl' : 'ozon',
    deliveryMethodId: delivery.id,
    deliveryMethodName: delivery.name,
    customerCity: analytics.city,
    customerRegion: analytics.region,
    financialData: financial,
    analyticsData: analytics,
    rawData: raw
  };
}

function parseProduct(raw, financial) {
  const finProduct = financial?.products?.find(p => p.product_id === raw.sku) || {};
  
  return {
    sku: raw.sku,
    name: raw.name,
    offerId: raw.offer_id,
    quantity: raw.quantity,
    price: parseFloat(raw.price) || 0,
    currencyCode: raw.currency_code,
    commissionAmount: finProduct.commission_amount,
    commissionPercent: finProduct.commission_percent,
    payout: finProduct.payout,
    productId: finProduct.product_id,
    mandatoryMark: raw.mandatory_mark,
    height: raw.dimensions?.height,
    length: raw.dimensions?.length,
    width: raw.dimensions?.width,
    weight: raw.dimensions?.weight
  };
}

export async function* fetchFboPostings(since, to) {
  let offset = 0;
  
  while (true) {
    const body = {
      dir: 'ASC',
      filter: {
        since: since.toISOString(),
        to: to.toISOString()
      },
      limit,
      offset,
      with: {
        analytics_data: true,
        financial_data: true
      }
    };
    
    const data = await apiRequest('/v2/posting/fbo/list', body);
    
    if (!data.result?.length) break;
    
    for (const raw of data.result) {
      const order = parseOrder(raw, 'FBO');
      const products = (raw.products || []).map(p => parseProduct(p, raw.financial_data));
      yield { order, products };
    }
    
    offset += data.result.length;
    if (data.result.length < limit) break;
    
    await sleep(delayMs);
  }
}

export async function* fetchFbsPostings(since, to) {
  let offset = 0;
  
  while (true) {
    const body = {
      dir: 'ASC',
      filter: {
        since: since.toISOString(),
        to: to.toISOString()
      },
      limit,
      offset,
      with: {
        analytics_data: true,
        financial_data: true,
        barcodes: true,
        translit: true
      }
    };
    
    const data = await apiRequest('/v3/posting/fbs/list', body);
    const postings = data.result?.postings || data.result || [];
    
    if (!postings.length) break;
    
    for (const raw of postings) {
      const order = parseOrder(raw, 'FBS');
      const products = (raw.products || []).map(p => parseProduct(p, raw.financial_data));
      yield { order, products };
    }
    
    offset += postings.length;
    if (postings.length < limit) break;
    
    await sleep(delayMs);
  }
}
