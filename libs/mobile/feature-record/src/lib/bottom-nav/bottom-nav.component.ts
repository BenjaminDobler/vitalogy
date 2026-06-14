import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Pill-shaped bottom navigation matching the VeloDash mock. Lives at the
 * bottom of the screen, respects safe-area insets, and uses Material Symbols
 * for the iconography.
 *
 * Currently exported from feature-record because that's where it was first
 * needed. If a fourth screen wants it, extract to libs/mobile/ui.
 */
@Component({
  selector: 'mobile-bottom-nav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav
      class="fixed bottom-0 left-0 right-0 z-40 velo-glass border-t border-white/5 rounded-t-2xl pt-3 pb-safe-8 px-4 flex items-center justify-around"
    >
      <a
        routerLink="/record"
        routerLinkActive="velo-bottom-tab-active"
        [routerLinkActiveOptions]="{ exact: false }"
        class="velo-bottom-tab"
      >
        <span class="material-symbols-outlined text-[24px]">directions_bike</span>
        <span class="font-grotesk text-label-caps uppercase mt-0.5">Ride</span>
      </a>
      <a
        routerLink="/history"
        routerLinkActive="velo-bottom-tab-active"
        class="velo-bottom-tab"
      >
        <span class="material-symbols-outlined text-[24px]">insights</span>
        <span class="font-grotesk text-label-caps uppercase mt-0.5">Activity</span>
      </a>
      <a
        routerLink="/settings"
        routerLinkActive="velo-bottom-tab-active"
        class="velo-bottom-tab"
      >
        <span class="material-symbols-outlined text-[24px]">settings</span>
        <span class="font-grotesk text-label-caps uppercase mt-0.5">Settings</span>
      </a>
    </nav>
  `,
})
export class BottomNavComponent {}
