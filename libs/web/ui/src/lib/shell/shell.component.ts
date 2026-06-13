import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'ui-shell',
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header class="border-b border-slate-200 bg-white">
        <div class="mx-auto max-w-6xl px-6 py-4 flex items-center gap-8">
          <a routerLink="/" class="font-semibold tracking-tight text-lg">
            🚴 Vitalogy
          </a>
          <nav class="flex gap-1 text-sm">
            @for (item of nav; track item.path) {
              <a
                [routerLink]="item.path"
                routerLinkActive="bg-slate-900 text-white"
                class="px-3 py-1.5 rounded-md hover:bg-slate-100"
              >
                {{ item.label }}
              </a>
            }
          </nav>
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
  protected readonly nav = [
    { path: '/activities', label: 'Activities' },
    { path: '/import', label: 'Import' },
    { path: '/analysis', label: 'Analysis' },
  ];
}
