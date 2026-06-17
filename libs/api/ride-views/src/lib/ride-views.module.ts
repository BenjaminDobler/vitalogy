import { Module } from '@nestjs/common';
import { RideViewsController } from './ride-views.controller.js';
import { RideViewsService } from './ride-views.service.js';

@Module({
  controllers: [RideViewsController],
  providers: [RideViewsService],
  exports: [RideViewsService],
})
export class RideViewsModule {}
