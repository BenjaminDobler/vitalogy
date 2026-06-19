import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ActivityDetailComponent } from 'feature-activities';
import { BottomNavComponent } from '../bottom-nav/bottom-nav.component';

/**
 * Mobile-shaped wrapper around the web's ActivityDetailComponent —
 * gives the rider the bottom Ride/Activity/Settings nav while looking
 * at a ride. Used by both the native mobile app and the desktop
 * simulator so they show the same activity-detail chrome.
 *
 * `id` is bound by the router (withComponentInputBinding is wired in
 * both apps' app.config.ts) and passed straight through to the inner
 * web component, along with a backLink so the ← Back arrow returns
 * to the mobile activities list (with bottom nav) rather than the
 * web list reused at /activities.
 */
@Component({
  selector: 'mobile-activity-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActivityDetailComponent, BottomNavComponent],
  template: `
    <div class="min-h-screen velo-carbon text-on-surface font-inter pb-24">
      <div class="px-5 pt-safe-6 pb-6">
        <lib-activity-detail [id]="id()" backLink="/history" />
      </div>
      <mobile-bottom-nav />
    </div>
  `,
})
export class MobileActivityDetailPage {
  readonly id = input.required<string>();
}
