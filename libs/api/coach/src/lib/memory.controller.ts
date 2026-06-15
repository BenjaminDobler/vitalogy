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
import type { MemoryCategory, MemoryCreate, MemoryUpdate } from 'data-models';
import { MemoryService } from './memory.service.js';

@Controller('memories')
export class MemoryController {
  constructor(private readonly memories: MemoryService) {}

  @Get()
  list(@UserId() userId: string, @Query('category') category?: MemoryCategory) {
    return this.memories.list(userId, { category });
  }

  @Post()
  create(@UserId() userId: string, @Body() input: MemoryCreate) {
    return this.memories.create(userId, input);
  }

  @Patch(':id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() patch: MemoryUpdate,
  ) {
    return this.memories.update(userId, id, patch);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@UserId() userId: string, @Param('id') id: string) {
    return this.memories.delete(userId, id);
  }
}
