import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'auth';
import type { UploadActivityRequest } from 'data-models';
import { ActivitiesService } from './activities.service.js';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(
    @UserId() userId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.activities.list(userId, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  /**
   * Lifetime PRs across the user's activities. Listed BEFORE `:id` so the
   * static path wins the route match (Nest matches in declaration order
   * for the same HTTP verb when the dynamic segment would otherwise gobble it).
   */
  @Get('achievements')
  achievements(@UserId() userId: string) {
    return this.activities.achievements(userId);
  }

  /**
   * Banister CTL/ATL/TSB across the last N days. FTP / max HR / rest HR
   * come from the client (localStorage AthleteSettings) so server doesn't
   * need to persist them.
   */
  @Get('training-load')
  trainingLoad(
    @UserId() userId: string,
    @Query('days') days?: string,
    @Query('ftp') ftp?: string,
    @Query('maxHr') maxHr?: string,
    @Query('restHr') restHr?: string,
  ) {
    return this.activities.trainingLoad(userId, {
      days: days ? Number(days) : undefined,
      ftp: ftp ? Number(ftp) : undefined,
      maxHr: maxHr ? Number(maxHr) : undefined,
      restHr: restHr ? Number(restHr) : undefined,
    });
  }

  @Get(':id')
  get(@UserId() userId: string, @Param('id') id: string) {
    return this.activities.get(userId, id);
  }

  /**
   * Upload a session recorded on the mobile app. Idempotent on `sessionId`.
   * Returns the activity id (new or existing) so the client can drop the
   * upload from its retry queue once it gets a 2xx.
   */
  @Post()
  upload(@UserId() userId: string, @Body() req: UploadActivityRequest) {
    return this.activities.uploadRecording(userId, req);
  }

  /**
   * Hard-delete a ride. Streams + laps + analyses cascade via FK so a
   * single row removal cleans up everything attached. Does NOT touch
   * Strava — the activity stays on the rider's Strava feed; we only
   * forget about it locally.
   */
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @UserId() userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.activities.remove(userId, id);
  }
}
