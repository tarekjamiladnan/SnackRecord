import express from 'express';
import { createRequire } from 'node:module';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.routes.js';

const require = createRequire(import.meta.url);
const cors = require('cors') as (options?: Record<string, unknown>) => express.RequestHandler;
const helmet = require('helmet') as (options?: Record<string, unknown>) => express.RequestHandler;
const rateLimit = require('express-rate-limit') as (options?: Record<string, unknown>) => express.RequestHandler;
import { memberRoutes, teamRoutes } from './routes/team.routes.js';
import { superAdminRoutes } from './routes/super-admin.routes.js';
import { snackRoutes } from './routes/snack.routes.js';
import { snackRecordRoutes } from './routes/snack-record.routes.js';
import { reportRoutes } from './routes/report.routes.js';
import { collectionRoutes, monthRoutes } from './routes/finance.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { settingsRoutes } from './routes/settings.routes.js';
import { orderRoutes, orderRequestRoutes } from './routes/order.routes.js';
import { dailyEntryRoutes } from './routes/daily-entry.routes.js';

export const app = express();

if (env.isProduction) {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({
  origin: env.corsOrigins.length === 1 ? env.corsOrigins[0] : env.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' }
});
app.use('/api/auth', authLimiter);

app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'API healthy' });
});

app.use('/api/auth', authRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/snacks', snackRoutes);
app.use('/api/snack-records', snackRecordRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/months', monthRoutes);
app.use('/api/collections', collectionRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/order-requests', orderRequestRoutes);
app.use('/api/daily-entries', dailyEntryRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Internal server error';
  const status = (err as { statusCode?: number })?.statusCode ?? 500;

  if (status >= 500) {
    console.error('Unhandled error:', message);
  }

  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : message
  });
});
