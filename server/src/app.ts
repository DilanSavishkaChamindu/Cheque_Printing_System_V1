import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { getEnv } from './config/env.js';
import { errorHandlerMiddleware } from './middleware/errorHandler.js';
import { notFoundMiddleware } from './middleware/notFound.js';
import { createGlobalRateLimiter } from './middleware/rateLimiter.js';
import { requestContextMiddleware } from './middleware/requestContext.js';
import { auditRouter } from './modules/audit-logs/audit.routes.js';
import { authRouter } from './modules/authentication/auth.routes.js';
import { backupRouter } from './modules/backups/backup.routes.js';
import { bankAccountRouter } from './modules/bank-accounts/bankAccount.routes.js';
import { bankTransactionRouter } from './modules/bank-transactions/ledger.routes.js';
import { bankBranchRouter, bankRouter } from './modules/banks/bank.routes.js';
import { chequeBookRouter } from './modules/cheque-books/chequeBook.routes.js';
import { chequeRouter } from './modules/cheques/cheque.routes.js';
import { companyRouter } from './modules/companies/company.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { featureRouter } from './modules/features/feature.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { platformRouter } from './modules/platform/platform.routes.js';
import { receivedChequeRouter } from './modules/received-cheques/receivedCheque.routes.js';
import { reportRouter } from './modules/reports/report.routes.js';
import { syncRouter } from './modules/synchronization/sync.routes.js';
import {
  calibrationRouter,
  templateRouter,
} from './modules/templates/template.routes.js';
import { tenantRouter } from './modules/tenants/tenant.routes.js';
import {
  permissionRouter,
  roleRouter,
  userRouter,
} from './modules/users/user.routes.js';

export function createApp(): Express {
  const env = getEnv();
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Device-Id', 'Idempotency-Key'],
    })
  );

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(requestContextMiddleware);

  if (env.NODE_ENV !== 'test') {
    app.use('/api', createGlobalRateLimiter());
  }

  app.use('/api/v1/health', healthRouter);
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/platform', platformRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/tenants', tenantRouter);
  app.use('/api/v1/features', featureRouter);
  app.use('/api/v1/companies', companyRouter);
  app.use('/api/v1/banks', bankRouter);
  app.use('/api/v1/bank-branches', bankBranchRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/roles', roleRouter);
  app.use('/api/v1/permissions', permissionRouter);
  app.use('/api/v1/bank-accounts', bankAccountRouter);
  app.use('/api/v1/bank-transactions', bankTransactionRouter);
  app.use('/api/v1/cheque-books', chequeBookRouter);
  app.use('/api/v1/cheques', chequeRouter);
  app.use('/api/v1/received-cheques', receivedChequeRouter);
  app.use('/api/v1/cheque-templates', templateRouter);
  app.use('/api/v1/calibration', calibrationRouter);
  app.use('/api/v1/reports', reportRouter);
  app.use('/api/v1/backups', backupRouter);
  app.use('/api/v1/sync', syncRouter);
  app.use('/api/v1/audit-logs', auditRouter);

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware);

  return app;
}
