import { Module } from '@nestjs/common';
import { ActivitiesService } from './activities.service.js';
import { ActivitiesController } from './activities.controller.js';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
