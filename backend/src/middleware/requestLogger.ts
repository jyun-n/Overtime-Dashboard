import type { Request, Response, NextFunction } from 'express';
import { logger, logToDb } from '../lib/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const ip = req.ip ?? '';
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    const dbLevel = level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : 'INFO';

    const meta = {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      ip,
    };

    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`, meta);

    // 헬스체크는 DB 로그에서 제외 (시끄러움)
    if (req.originalUrl !== '/health') {
      logToDb({
        level: dbLevel,
        message: `${req.method} ${req.originalUrl}`,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        ip,
      });
    }
  });

  next();
}
