import { Module } from '@nestjs/common';
import { DbModule } from 'db';
import { AuthController } from './auth.controller.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import { UserIdMiddleware } from './user-id.middleware.js';

@Module({
  imports: [DbModule],
  controllers: [AuthController, GoogleAuthController],
  providers: [PasswordService, TokenService, UserIdMiddleware],
  exports: [PasswordService, TokenService, UserIdMiddleware],
})
export class AuthModule {}
