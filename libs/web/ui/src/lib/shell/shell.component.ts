import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CoachPanelService } from 'feature-coach';
import { AuthService } from 'feature-auth';

@Component({
  selector: 'ui-shell',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen flex flex-col velo-carbon text-on-surface font-inter">
      <header class="border-b border-white/5 velo-glass sticky top-0 z-30">
        <div class="mx-auto max-w-6xl px-6 py-4 flex items-center gap-8">
          <a
            routerLink="/"
            class="font-sora italic uppercase tracking-tighter text-xl text-velo-lime"
          >VITALOGY</a>
          <nav class="flex gap-1 font-grotesk text-label-caps uppercase">
            @for (item of nav; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive="bg-velo-lime text-velo-on-lime"
                class="px-4 py-2 rounded-full hover:bg-white/10 transition-colors"
              >
                {{ item.label }}
              </a>
            }
          </nav>
          <div class="ml-auto flex items-center gap-2">
            <button
              type="button"
              (click)="coachPanel.toggle()"
              class="flex items-center gap-2 px-4 py-2 rounded-full font-grotesk text-label-caps uppercase transition-colors"
              [class.bg-velo-lime]="coachPanel.isOpen()"
              [class.text-velo-on-lime]="coachPanel.isOpen()"
              [class.velo-shadow-lime]="coachPanel.isOpen()"
              [class.velo-glass]="!coachPanel.isOpen()"
              [class.text-on-surface]="!coachPanel.isOpen()"
              [class.hover:bg-white\\/10]="!coachPanel.isOpen()"
              title="Open coach"
            >
              <span class="material-symbols-outlined text-[18px]">smart_toy</span>
              Coach
            </button>
            @if (auth.user(); as u) {
              <div class="hidden sm:flex flex-col items-end leading-tight ml-2 mr-1">
                <span class="text-[10px] font-grotesk uppercase tracking-wider text-on-surface-variant">Signed in</span>
                <span class="text-xs text-on-surface truncate max-w-[12rem]">{{ u.email }}</span>
              </div>
              <button
                type="button"
                (click)="logout()"
                class="w-9 h-9 rounded-full velo-glass hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
                title="Sign out"
              >
                <span class="material-symbols-outlined text-[18px]">logout</span>
              </button>
            }
          </div>
        </div>
      </header>
      <main class="flex-1">
        <div class="mx-auto max-w-6xl px-6 py-8">
          <ng-content></ng-content>
        </div>
      </main>
    </div>
  `,
})
export class ShellComponent {
  protected readonly coachPanel = inject(CoachPanelService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly nav = [
    { path: '/activities', label: 'Activities' },
    { path: '/workouts', label: 'Workouts' },
    { path: '/import', label: 'Import' },
    { path: '/analysis', label: 'Analysis' },
    { path: '/profile', label: 'Profile' },
  ];

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}
