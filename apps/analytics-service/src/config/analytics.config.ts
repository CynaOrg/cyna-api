import { registerAs } from '@nestjs/config';

export default registerAs('analytics', () => ({
  cache: {
    dashboardTtlSeconds: parseInt(process.env.ANALYTICS_DASHBOARD_CACHE_TTL || '300', 10),
    salesTtlSeconds: parseInt(process.env.ANALYTICS_SALES_CACHE_TTL || '300', 10),
    mrrTtlSeconds: parseInt(process.env.ANALYTICS_MRR_CACHE_TTL || '600', 10),
    stockTtlSeconds: parseInt(process.env.ANALYTICS_STOCK_CACHE_TTL || '120', 10),
  },
}));
