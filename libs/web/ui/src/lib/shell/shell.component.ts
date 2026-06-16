import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CoachPanelService } from 'feature-coach';

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
          <button
            type="button"
            (click)="coachPanel.toggle()"
            class="ml-auto flex items-center gap-2 px-4 py-2 rounded-full font-grotesk text-label-caps uppercase transition-colors"
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

  protected readonly nav = [
    { path: '/activities', label: 'Activities' },
    { path: '/workouts', label: 'Workouts' },
    { path: '/import', label: 'Import' },
    { path: '/analysis', label: 'Analysis' },
    { path: '/profile', label: 'Profile' },
  ];
}
