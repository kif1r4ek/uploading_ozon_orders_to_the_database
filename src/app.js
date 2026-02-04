import { syncAllOrders } from './services/syncOrders.js';
import { initDatabase, closePool } from './database.js';
import { config } from './config.js';

async function main() {
  console.log('='.repeat(60));
  console.log(`Ozon Orders Sync started at ${new Date().toISOString()}`);
  console.log(`Fetching orders for last ${config.daysToFetch} days (excluding today)`);
  console.log('='.repeat(60));
  
  try {
    await initDatabase();
    const result = await syncAllOrders();
    
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Period: ${result.dateFrom.toISOString().split('T')[0]} - ${result.dateTo.toISOString().split('T')[0]}`);
    console.log(`  FBO: ${result.fbo.ordersFetched} orders (${result.fbo.ordersInserted} new, ${result.fbo.ordersUpdated} updated)`);
    console.log(`  FBS: ${result.fbs.ordersFetched} orders (${result.fbs.ordersInserted} new, ${result.fbs.ordersUpdated} updated)`);
    console.log(`  Total orders: ${result.ordersFetched}`);
    console.log(`  Total products: ${result.productsCount}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
