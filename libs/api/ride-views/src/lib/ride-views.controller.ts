import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { UserId } from 'auth';
import type {
  CreateRideViewPayload,
  ReorderRideViewsPayload,
  RideView,
  UpdateRideViewPayload,
} from 'data-models';
import { RideViewsService } from './ride-views.service.js';

@Controller('ride-views')
export class RideViewsController {
  constructor(private readonly views: RideViewsService) {}

  /**
   * Returns the user's full carousel — defaults + customs, in sortOrder.
   * Lazily seeds the three defaults the first time it's called for a
   * user, so existing accounts pick them up without a migration.
   */
  @Get()
  list(@UserId() userId: string | undefined): Promise<RideView[]> {
    return this.views.listForUser(requireUser(userId));
  }

  @Post()
  create(
    @UserId() userId: string | undefined,
    @Body() body: CreateRideViewPayload,
  ): Promise<RideView> {
    return this.views.create(requireUser(userId), body);
  }

  @Put(':id')
  update(
    @UserId() userId: string | undefined,
    @Param('id') id: string,
    @Body() body: UpdateRideViewPayload,
  ): Promise<RideView> {
    return this.views.update(requireUser(userId), id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @UserId() userId: string | undefined,
    @Param('id') id: string,
  ): Promise<void> {
    await this.views.remove(requireUser(userId), id);
  }

  /**
   * Bulk reorder. Body `{ order: string[] }` lists view ids in the
   * order the user wants them to appear; the server assigns each
   * `sortOrder = index`. Useful for drag-to-reorder on the web list.
   */
  @Post('reorder')
  reorder(
    @UserId() userId: string | undefined,
    @Body() body: ReorderRideViewsPayload,
  ): Promise<RideView[]> {
    return this.views.reorder(requireUser(userId), body);
  }
}

function requireUser(userId: string | undefined): string {
  // UserIdMiddleware resolves cookies / Bearer / X-User-Id; this only
  // trips when AUTH_REQUIRED is on AND the request is unauthenticated.
  if (!userId) throw new UnauthorizedException('Sign in to manage ride views.');
  return userId;
}
