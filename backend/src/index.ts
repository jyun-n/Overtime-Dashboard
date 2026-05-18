import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './lib/env.js';
import { logger, logToDb } from './lib/logger.js';
import { requestLogger } from './middleware/requestLogger.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import uploadLogsRouter from './routes/uploadLogs.js';
import uploadStatusRouter from './routes/uploadStatus.js';
import loginLogsRouter from './routes/loginLogs.js';
import uploadRouter from './routes/upload.js';
import overtimeRouter from './routes/overtime.js';

const app = express();

app.set('trust proxy', env.trustProxy);
app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(requestLogger);

// 글로벌 API rate limit — IP당 분당 120회. login/reset-password 등은 추가로 더 엄격한 limiter 적용됨.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('api rate-limited', { ip: req.ip, path: req.originalUrl });
    logToDb({
      level: 'WARN',
      message: 'api rate-limited',
      ip: req.ip ?? '',
      path: req.originalUrl,
      method: req.method,
    });
    res.status(429).json({ error: 'too_many_requests' });
  },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.use('/api', apiLimiter);
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/upload-logs', uploadLogsRouter);
app.use('/api/upload-status', uploadStatusRouter);
app.use('/api/login-logs', loginLogsRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/overtime', overtimeRouter);

app.listen(env.port, env.host, () => {
  logger.info(`API listening on http://${env.host}:${env.port} (${env.nodeEnv})`);
});