import { Module } from '@nestjs/common';
import { StravaService } from './strava.service.js';
import { StravaController, StravaImportController } from './strava.controller.js';

@Module({
  controllers: [StravaController, StravaImportController],
  providers: [StravaService],
  exports: [StravaService],
})
export class StravaModule {}
