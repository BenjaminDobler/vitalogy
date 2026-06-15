import { Module } from '@nestjs/common';
import { DbModule } from 'db';
import { MemoryController } from './memory.controller.js';
import { MemoryService } from './memory.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';

/**
 * Coach surface area — profile, memories, and (Phase 2) the conversational
 * chat + tool-use loop. Grouped here because the chat tools reach into
 * profile + memories so heavily that splitting them feels artificial.
 */
@Module({
  imports: [DbModule],
  controllers: [ProfileController, MemoryController],
  providers: [ProfileService, MemoryService],
  exports: [ProfileService, MemoryService],
})
export class CoachModule {}
