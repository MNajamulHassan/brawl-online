/** Runtime configuration, read once from environment variables. See .env.example. */
const int = (v, d) => (Number.isFinite(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : d);

export const config = Object.freeze({
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  maxRooms: int(process.env.MAX_ROOMS, 200),
  maxConnections: int(process.env.MAX_CONNECTIONS, 1000),
  // Comma-separated list of origins allowed to connect from another domain (e.g. the Netlify client).
  corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean) : false,
});
