import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';
import { apiVersionAlias } from './common/middleware/api-version.js';
import { originCheck } from './common/middleware/origin-check.js';

/** Everything the real app and the e2e tests must share. Swagger stays in main.ts. */
export function configureApp(app: INestApplication) {
  const config = app.get(ConfigService);

  // Behind nginx in production, so req.ip (used for audit and sessions) is the client's.
  if (config.get('TRUST_PROXY') === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  const origins = (config.get<string>('APP_ORIGINS') ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(apiVersionAlias);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(originCheck(origins));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());
}
