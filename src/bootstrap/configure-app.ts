import {
  type INestApplication,
  ValidationPipe,
  type LogLevel,
} from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';

/** Mirrors production middleware so e2e tests exercise the same stack as `main.ts`. */
export function configureApp(app: INestApplication): void {
  const isProd = process.env.NODE_ENV === 'production';

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOrigins = process.env.CORS_ORIGINS?.trim();
  if (isProd) {
    if (!corsOrigins) {
      throw new Error(
        'CORS_ORIGINS must be set in production (comma-separated origins, e.g. https://app.example.com)',
      );
    }
    app.enableCors({
      origin: corsOrigins.split(',').map((o) => o.trim()),
      credentials: true,
    });
  } else {
    app.enableCors({
      origin: corsOrigins
        ? corsOrigins.split(',').map((o) => o.trim())
        : true,
      credentials: true,
    });
  }

  app.use(requestJsonLogger(isProd));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const levels: LogLevel[] = isProd
    ? ['error', 'warn', 'log']
    : ['error', 'warn', 'log', 'debug', 'verbose'];
  app.useLogger(levels);
}

function requestJsonLogger(isProd: boolean) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isProd) {
      return next();
    }
    const start = Date.now();
    res.on('finish', () => {
      const line = {
        level: 'http',
        time: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: res.statusCode,
        durationMs: Date.now() - start,
      };
      console.log(JSON.stringify(line));
    });
    next();
  };
}
