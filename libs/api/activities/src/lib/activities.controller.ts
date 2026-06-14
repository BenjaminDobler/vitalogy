import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
}
