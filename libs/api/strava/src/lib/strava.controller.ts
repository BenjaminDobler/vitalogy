import {
  Controller,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import { DEFAULT_USER_ID, UserId } from 'auth';
import { StravaService } from './strava.service.js';

@Controller('auth/strava')
export class StravaController {
  private readonly logger = new Logger(StravaController.name);

  constructor(private readonly strava: StravaService) {}

  /** Kicks off the OAuth flow by redirecting to Strava. */
  @Get('start')
  start(@Res() res: Response) {
    const state = randomBytes(16).toString('hex');
    // TODO: persist `state` against the session to prevent CSRF and to carry
    // the userId through the redirect for cross-domain auth flows.
    res.redirect(this.strava.authorizeUrl(state));
  }

  /**
   * Strava redirects here with ?code=... after the user approves. The user's
   * browser carries our session cookie because the redirect target is the
   * same domain, so UserIdMiddleware resolves it as usual — meaning we get
   * the actual logged-in user via @UserId().
   *
   * Falls back to DEFAULT_USER_ID only when the dev-user identity is in
   * effect (no AUTH_REQUIRED).
   */
  @Get('callback')
  async callback(
    @UserId() userId: string | undefined,
    @Query('code') code: string,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    if (error || !code) {
      res.status(400).send(`Strava auth failed: ${error ?? 'no code'}`);
      return;
    }
    try {
      await this.strava.handleCallback(userId ?? DEFAULT_USER_ID, code);
      res.redirect('/');
    } catch (err) {
      this.logger.error('Strava callback failed', err);
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).send(`Strava callback failed: ${message}`);
    }
  }
}

@Controller('strava')
export class StravaImportController {
  constructor(private readonly strava: StravaService) {}

  @Post('import-recent')
  async importRecent(@UserId() userId: string) {
    const count = await this.strava.importRecent(userId);
    return { imported: count };
  }

  /**
   * Pull full detail (laps + streams) for a single activity that's already in our DB.
   * No-op if we already have streams stored, unless `?force=true` is passed.
   */
  @Post('import/:activityId')
  async importDetail(
    @UserId() userId: string,
    @Param('activityId') activityId: string,
    @Query('force') force?: string,
  ) {
    return this.strava.importDetail(userId, activityId, {
      force: force === 'true' || force === '1',
    });
  }

  /**
   * Iterate over every locally-stored activity that doesn't yet have streams
   * and pull detail for each (sequential, ~200ms between calls). Capped at
   * `?max=N` (default 50) so a single click can't accidentally exhaust the
   * Strava rate limit.
   */
  @Post('import-missing-details')
  async importMissingDetails(
    @UserId() userId: string,
    @Query('max') max?: string,
  ) {
    return this.strava.importMissingDetails(userId, {
      max: max ? Number(max) : undefined,
    });
  }

  /**
   * Push a locally-stored activity (manual / FIT / TCX / GPX) up to Strava.
   * No-op if the activity has already been exported. Refuses STRAVA-source
   * activities (would create a duplicate of what we imported).
   */
  @Post('export/:activityId')
  async exportToStrava(
    @UserId() userId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.strava.exportToStrava(userId, activityId);
  }
}
