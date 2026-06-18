import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ActivityDetailComponent } from 'feature-activities';
import { BottomNavComponent } from 'feature-record';

/**
 * Mobile wrapper around the web's ActivityDetailComponent so the
 * rider gets the bottom Ride/Activity/Settings nav while viewing a
 * ride. The "← Back to activities" link inside ActivityDetail
 * already handles going up one level.
 *
 * The `id` input is bound by the router (withComponentInputBinding
 * is wired in apps/mobile/app.config.ts) and passed straight through.
 */
@Component({
  selector: 'mobile-activity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActivityDetailComponent, BottomNavComponent],
  template: `
    <div class="min-h-screen velo-carbon text-on-surface font-inter pb-24">
      <div class="px-5 pt-safe-6 pb-6">
        <!-- backLink="/history" so the back arrow returns to the
             mobile activities list (with bottom nav), not the web
             activities list reused via the /activities route. -->
        <lib-activity-detail [id]="id()" backLink="/history" />
      </div>
      <mobile-bottom-nav />
    </div>
  `,
})
export class MobileActivityDetailPage {
  readonly id = input.required<string>();
}
