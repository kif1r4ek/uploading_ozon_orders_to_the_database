import pg from 'pg';
import { config } from './config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: 10,
  idleTimeoutMillis: 30000
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

export async function initDatabase() {
  const sqlPath = join(__dirname, '..', 'sql', 'init.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Database initialized');
}

export async function upsertOrder(order) {
  const sql = `
    INSERT INTO ozon_orders (
      posting_number, order_id, order_number, posting_type, status, substatus,
      cancel_reason_id, created_at, in_process_at, shipment_date, delivering_date,
      warehouse_id, warehouse_name, tracking_number, tpl_integration_type,
      delivery_method_id, delivery_method_name, customer_city, customer_region,
      financial_data, analytics_data, raw_data, synced_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
    ON CONFLICT (posting_number) DO UPDATE SET
      status = EXCLUDED.status,
      substatus = EXCLUDED.substatus,
      created_at = COALESCE(ozon_orders.created_at, EXCLUDED.created_at),
      in_process_at = EXCLUDED.in_process_at,
      shipment_date = EXCLUDED.shipment_date,
      delivering_date = EXCLUDED.delivering_date,
      tracking_number = EXCLUDED.tracking_number,
      customer_city = COALESCE(ozon_orders.customer_city, EXCLUDED.customer_city),
      customer_region = COALESCE(ozon_orders.customer_region, EXCLUDED.customer_region),
      financial_data = EXCLUDED.financial_data,
      analytics_data = EXCLUDED.analytics_data,
      raw_data = EXCLUDED.raw_data,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted
  `;
  
  const result = await query(sql, [
    order.postingNumber,
    order.orderId,
    order.orderNumber,
    order.postingType,
    order.status,
    order.substatus,
    order.cancelReasonId,
    order.createdAt,
    order.inProcessAt,
    order.shipmentDate,
    order.deliveringDate,
    order.warehouseId,
    order.warehouseName,
    order.trackingNumber,
    order.tplIntegrationType,
    order.deliveryMethodId,
    order.deliveryMethodName,
    order.customerCity,
    order.customerRegion,
    order.financialData ? JSON.stringify(order.financialData) : null,
    order.analyticsData ? JSON.stringify(order.analyticsData) : null,
    order.rawData ? JSON.stringify(order.rawData) : null
  ]);
  
  return result.rows[0]?.inserted;
}

export async function upsertOrderProducts(postingNumber, products) {
  if (!products?.length) return;
  
  for (const p of products) {
    const sql = `
      INSERT INTO ozon_order_products (
        posting_number, sku, name, offer_id, quantity, price, currency_code,
        commission_amount, commission_percent, payout, product_id, mandatory_mark,
        dimensions_height, dimensions_length, dimensions_width, dimensions_weight
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (posting_number, sku) DO UPDATE SET
        quantity = EXCLUDED.quantity,
        price = EXCLUDED.price,
        commission_amount = EXCLUDED.commission_amount,
        payout = EXCLUDED.payout
    `;
    
    await query(sql, [
      postingNumber,
      p.sku,
      p.name,
      p.offerId,
      p.quantity,
      p.price,
      p.currencyCode,
      p.commissionAmount,
      p.commissionPercent,
      p.payout,
      p.productId,
      p.mandatoryMark,
      p.height,
      p.length,
      p.width,
      p.weight
    ]);
  }
}

export async function createSyncLog(jobStart, postingType, dateFrom, dateTo) {
  const result = await query(
    `INSERT INTO ozon_sync_log (job_start, posting_type, date_from, date_to, status)
     VALUES ($1, $2, $3, $4, 'running') RETURNING id`,
    [jobStart, postingType, dateFrom, dateTo]
  );
  return result.rows[0].id;
}

export async function updateSyncLog(logId, data) {
  const fields = [];
  const params = [logId];
  let idx = 2;
  
  const fieldMap = {
    jobEnd: 'job_end',
    status: 'status',
    ordersFetched: 'orders_fetched',
    ordersInserted: 'orders_inserted',
    ordersUpdated: 'orders_updated',
    productsCount: 'products_count',
    httpRequests: 'http_requests',
    retries: 'retries',
    errorMessage: 'error_message'
  };
  
  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      fields.push(`${dbField} = $${idx++}`);
      params.push(data[key]);
    }
  }
  
  if (fields.length) {
    await query(`UPDATE ozon_sync_log SET ${fields.join(', ')} WHERE id = $1`, params);
  }
}

export async function closePool() {
  await pool.end();
}
