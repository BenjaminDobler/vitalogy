import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Parse cookies so the auth middleware + controllers can read the JWT session.
  app.use(cookieParser());

  // Permissive CORS for dev: the mobile WebView origin is `capacitor://localhost`
  // (iOS) or `http://localhost` (Android), and during dev you may also test
  // from a LAN IP. credentials:true so the browser actually sends the JWT
  // cookie cross-origin (web dev server at :4200 → api at :3000).
  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id'],
  });

  // Increase JSON payload limit to accept long recorded sessions (a 3h ride at
  // 1Hz with ~10 numeric fields is well under 1MB, but headroom is cheap).
  app.useBodyParser('json', { limit: '10mb' });

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
  // listen on 0.0.0.0 so the iPhone on the same LAN can reach this server,
  // not just the loopback interface.
  await app.listen(port, '0.0.0.0');
  Logger.log(`🚴 vitalogy API listening on http://localhost:${port}/api (and LAN)`);
}

bootstrap();
