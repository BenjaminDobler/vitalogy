import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from 'auth';
import type { WorkoutCreate, WorkoutStatus, WorkoutUpdate } from 'data-models';
import { WorkoutService } from './workout.service.js';

@Controller('workouts')
export class WorkoutController {
  constructor(private readonly workouts: WorkoutService) {}

  /**
   * List workouts. ?pending=true returns PLANNED + IN_PROGRESS;
   * ?status=COMPLETED filters explicitly. Default returns everything,
   * scheduled-soonest first.
   */
  @Get()
  list(
    @UserId() userId: string,
    @Query('status') status?: WorkoutStatus,
    @Query('pending') pending?: string,
  ) {
    return this.workouts.list(userId, {
      status,
      pendingOnly: pending === 'true' || pending === '1',
    });
  }

  @Get(':id')
  get(@UserId() userId: string, @Param('id') id: string) {
    return this.workouts.get(userId, id);
  }

  @Post()
  create(@UserId() userId: string, @Body() input: WorkoutCreate) {
    return this.workouts.create(userId, input);
  }

  @Patch(':id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() patch: WorkoutUpdate,
  ) {
    return this.workouts.update(userId, id, patch);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@UserId() userId: string, @Param('id') id: string): Promise<void> {
    await this.workouts.delete(userId, id);
  }
}
