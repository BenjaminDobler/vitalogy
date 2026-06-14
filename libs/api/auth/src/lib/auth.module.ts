import { Module } from '@nestjs/common';
import { UserIdMiddleware } from './user-id.middleware.js';

@Module({
  providers: [UserIdMiddleware],
  exports: [UserIdMiddleware],
})
export class AuthModule {}
