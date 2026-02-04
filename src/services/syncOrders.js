import * as api from '../api/ozon.js';
import * as db from '../database.js';
import { config } from '../config.js';

function getDateRange() {
  const now = new Date();
  
  const to = new Date(now);
  to.setDate(to.getDate() - 1);
  to.setHours(23, 59, 59, 999);
  
  const since = new Date(to);
  since.setDate(since.getDate() - config.daysToFetch + 1);
  since.setHours(0, 0, 0, 0);
  
  return { since, to };
}

async function syncPostings(postingType, fetchFunction, since, to) {
  const logId = await db.createSyncLog(new Date(), postingType, since, to);
  
  api.resetStats();
  
  let ordersFetched = 0;
  let ordersInserted = 0;
  let ordersUpdated = 0;
  let productsCount = 0;
  
  try {
    console.log(`Fetching ${postingType} postings...`);
    
    for await (const { order, products } of fetchFunction(since, to)) {
      ordersFetched++;
      
      const isNew = await db.upsertOrder(order);
      if (isNew) {
        ordersInserted++;
      } else {
        ordersUpdated++;
      }
      
      await db.upsertOrderProducts(order.postingNumber, products);
      productsCount += products.length;
      
      if (ordersFetched % 100 === 0) {
        console.log(`${postingType}: processed ${ordersFetched} orders...`);
      }
    }
    
    const stats = api.getStats();
    
    await db.updateSyncLog(logId, {
      jobEnd: new Date(),
      status: 'success',
      ordersFetched,
      ordersInserted,
      ordersUpdated,
      productsCount,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount
    });
    
    console.log(`${postingType} completed: ${ordersFetched} fetched, ${ordersInserted} new, ${ordersUpdated} updated`);
    
    return { ordersFetched, ordersInserted, ordersUpdated, productsCount };
    
  } catch (error) {
    console.error(`${postingType} sync failed:`, error.message);
    
    const stats = api.getStats();
    await db.updateSyncLog(logId, {
      jobEnd: new Date(),
      status: 'failed',
      ordersFetched,
      ordersInserted,
      ordersUpdated,
      productsCount,
      httpRequests: stats.httpRequestCount,
      retries: stats.retryCount,
      errorMessage: error.message
    });
    
    throw error;
  }
}

export async function syncAllOrders() {
  const { since, to } = getDateRange();
  
  console.log(`Date range: ${since.toISOString().split('T')[0]} to ${to.toISOString().split('T')[0]}`);
  
  const results = {
    fbo: { ordersFetched: 0, ordersInserted: 0, ordersUpdated: 0, productsCount: 0 },
    fbs: { ordersFetched: 0, ordersInserted: 0, ordersUpdated: 0, productsCount: 0 }
  };
  
  try {
    results.fbo = await syncPostings('FBO', api.fetchFboPostings, since, to);
  } catch (error) {
    console.error('FBO sync error:', error.message);
  }
  
  try {
    results.fbs = await syncPostings('FBS', api.fetchFbsPostings, since, to);
  } catch (error) {
    console.error('FBS sync error:', error.message);
  }
  
  const total = {
    ordersFetched: results.fbo.ordersFetched + results.fbs.ordersFetched,
    ordersInserted: results.fbo.ordersInserted + results.fbs.ordersInserted,
    ordersUpdated: results.fbo.ordersUpdated + results.fbs.ordersUpdated,
    productsCount: results.fbo.productsCount + results.fbs.productsCount
  };
  
  return { ...total, fbo: results.fbo, fbs: results.fbs, dateFrom: since, dateTo: to };
}
