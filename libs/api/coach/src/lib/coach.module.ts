import { Module } from '@nestjs/common';
import { DbModule } from 'db';
import { AiModule } from 'ai';
import { ActivitiesModule } from 'activities';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { CoachToolsService } from './coach-tools.js';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import { WorkoutController } from './workout.controller.js';
import { WorkoutService } from './workout.service.js';

/**
 * Coach surface area — profile, memories, and the conversational chat +
 * tool-use loop. The chat service depends on profile + memories +
 * activities + the Anthropic SDK, which is why we keep them all here.
 */
@Module({
  imports: [DbModule, AiModule, ActivitiesModule],
  controllers: [
    ProfileController,
    MemoryController,
    ChatController,
    WorkoutController,
  ],
  providers: [
    ProfileService,
    MemoryService,
    WorkoutService,
    CoachToolsService,
    ChatService,
  ],
  exports: [ProfileService, MemoryService, WorkoutService],
})
export class CoachModule {}
