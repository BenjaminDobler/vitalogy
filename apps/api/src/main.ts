import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`🚴 vitalogy API listening on http://localhost:${port}/api`);
}

bootstrap();
