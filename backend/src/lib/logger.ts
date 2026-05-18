import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'node:path';
import { env } from './env.js';
import { prisma } from './prisma.js';

const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json(),
);

const consoleFormat = format.combine(
  format.colorize(),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${message}${metaStr}`;
  }),
);

export const logger = createLogger({
  level: env.logLevel,
  format: logFormat,
  transports: [
    new transports.Console({ format: consoleFormat }),
    new DailyRotateFile({
      dirname: path.resolve(env.logDir),
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      zippedArchive: true,
    }),
    new DailyRotateFile({
      dirname: path.resolve(env.logDir),
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '60d',
      zippedArchive: true,
    }),
  ],
});

// DB에도 함께 적재. 호출 측 예외로 서버가 죽지 않도록 fire-and-forget.
type DbLogInput = {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  context?: Record<string, unknown>;
  userId?: string;
  ip?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
};

export function logToDb(entry: DbLogInput): void {
  prisma.serverLog
    .create({
      data: {
        level: entry.level,
        message: entry.message,
        context: entry.context as object | undefined,
        userId: entry.userId,
        ip: entry.ip,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
      },
    })
    .catch((err) => {
      logger.error('failed to write ServerLog to DB', { err: String(err) });
    });
}
