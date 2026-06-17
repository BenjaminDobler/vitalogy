import { Module } from '@nestjs/common';
import { AuthModule } from 'auth';
import { StravaService } from './strava.service.js';
import { StravaController, StravaImportController } from './strava.controller.js';

@Module({
  // AuthModule supplies TokenService — the strava callback identifies the
  // logged-in user by verifying the session JWT inline (no UserIdMiddleware
  // for /api/auth/* paths).
  imports: [AuthModule],
  controllers: [StravaController, StravaImportController],
  providers: [StravaService],
  exports: [StravaService],
})
export class StravaModule {}
