import { Controller, Get, Param, Query } from '@nestjs/common';
import { UserId } from 'auth';
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
}
