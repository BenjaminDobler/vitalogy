import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from '@nestjs/common';
import { UserId } from 'auth';
import type { AIProvider } from 'data-models';
import { KeyService } from './key.service.js';

interface UpsertKeyBody {
  apiKey: string;
  label?: string;
}

@Controller('keys')
export class KeyController {
  constructor(private readonly keys: KeyService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.keys.list(userId);
  }

  @Put(':provider')
  upsert(
    @UserId() userId: string,
    @Param('provider') provider: AIProvider,
    @Body() body: UpsertKeyBody,
  ) {
    return this.keys.upsert(userId, provider, body.apiKey, body.label);
  }

  @Delete(':provider')
  @HttpCode(204)
  async delete(
    @UserId() userId: string,
    @Param('provider') provider: AIProvider,
  ): Promise<void> {
    await this.keys.delete(userId, provider);
  }
}
