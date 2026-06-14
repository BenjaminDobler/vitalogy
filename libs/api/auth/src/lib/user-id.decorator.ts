import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { DEFAULT_USER_ID } from './user-id.middleware.js';

/**
 * Controller-method param decorator that exposes the user id the middleware
 * attached to the request. Falls back to the default if the middleware didn't
 * run for some reason (defense in depth — should never happen in normal flow).
 *
 *   @Get()
 *   list(@UserId() userId: string) { ... }
 */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.userId ?? DEFAULT_USER_ID;
  },
);
