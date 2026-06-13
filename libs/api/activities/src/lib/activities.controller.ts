import { Controller, Get, Param, Query } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';

const DEV_USER_ID = 'dev-user';

@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.activities.list(DEV_USER_ID, {
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.activities.get(DEV_USER_ID, id);
  }
}
