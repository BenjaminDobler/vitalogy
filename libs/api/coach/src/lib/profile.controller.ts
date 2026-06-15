import { Body, Controller, Get, Put } from '@nestjs/common';
import { UserId } from 'auth';
import type { UserProfileUpdate } from 'data-models';
import { ProfileService } from './profile.service.js';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  get(@UserId() userId: string) {
    return this.profile.get(userId);
  }

  @Put()
  update(@UserId() userId: string, @Body() patch: UserProfileUpdate) {
    return this.profile.update(userId, patch);
  }
}
