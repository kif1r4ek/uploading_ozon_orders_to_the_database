import 'dotenv/config';

export const config = {
  ozon: {
    clientId: process.env.OZON_CLIENT_ID,
    apiKey: process.env.OZON_API_KEY,
    apiUrl: process.env.OZON_API_URL || 'https://api-seller.ozon.ru'
  },
  postgres: {
    host: process.env.PG_HOST,
    port: parseInt(process.env.PG_PORT || '5432'),
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE
  },
  request: {
    limit: parseInt(process.env.REQUEST_LIMIT || '1000'),
    delayMs: parseInt(process.env.REQUEST_DELAY_MS || '300'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    retryBackoffMs: parseInt(process.env.RETRY_BACKOFF_MS || '2000')
  },
  daysToFetch: parseInt(process.env.DAYS_TO_FETCH || '30')
};
