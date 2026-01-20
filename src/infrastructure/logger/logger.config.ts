import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const customFormat = printf((info) => {
  const ctxValue = formatValue(info.context);
  const ctx = ctxValue ? `[${ctxValue}]` : '';
  const stackValue = formatValue(info.stack);
  const stackTrace = stackValue ? `\n${stackValue}` : '';
  const timestampValue = formatValue(info.timestamp);
  const messageValue = formatValue(info.message);
  return `${timestampValue} ${info.level} ${ctx} ${messageValue}${stackTrace}`.trim();
});

export const winstonConfig: WinstonModuleOptions = {
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        customFormat,
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        winston.format.json(),
      ),
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        winston.format.json(),
      ),
    }),
  ],
};
