import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import type { RideView } from 'data-models';
import { RideViewsService } from '../ride-views.service';

/**
 * Manage the user's mobile ride-screen carousel.
 *
 *   - The list is ordered: rows can be dragged to reorder, and the
 *     phone picks up the new sortOrder on next sync (or immediately
 *     on a refresh-while-recording — RideViewsService.views is reactive
 *     on mobile too).
 *   - Defaults (Combined / Workout / Sensors) live alongside customs
 *     in the same list. They show a "Built-in" badge and have no
 *     Edit / Delete buttons; only the isActive toggle works.
 *   - "+ New layout" creates a CUSTOM with a sensible empty 4×4 grid
 *     and navigates to the editor (Phase 4).
 */
@Component({
  selector: 'lib-ride-views-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    <div class="flex items-baseline justify-between mb-6">
      <div>
        <h1 class="font-sora italic uppercase tracking-tighter text-3xl text-velo-lime">
          Ride layouts
        </h1>
        <p class="text-sm text-on-surface-variant mt-1">
          Drag to reorder. Toggle to show or hide on your phone's swipe
          carousel. Built-in views can be hidden but not edited or deleted.
        </p>
      </div>
      <button
        type="button"
        (click)="onCreate()"
        [disabled]="creating()"
        class="px-4 py-2 rounded-full bg-velo-lime text-velo-on-lime font-grotesk text-label-caps uppercase velo-shadow-lime hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
      >
        <span class="material-symbols-outlined text-[18px]">add</span>
        New layout
      </button>
    </div>

    @if (lastError(); as e) {
      <p class="mb-4 text-sm text-rose-300 font-grotesk">{{ e }}</p>
    }

    @if (loading() && views().length === 0) {
      <p class="text-on-surface-variant">Loading…</p>
    } @else if (views().length === 0) {
      <div class="velo-glass rounded-xl p-10 text-center text-on-surface-variant">
        No layouts yet. Sign in is required.
      </div>
    } @else {
      <ul
        cdkDropList
        (cdkDropListDropped)="onDrop($event)"
        class="space-y-3"
      >
        @for (v of views(); track v.id) {
          <li
            cdkDrag
            class="velo-glass rounded-xl px-4 py-3 flex items-center gap-4"
            [class.opacity-40]="!v.isActive"
          >
            <button
              type="button"
              cdkDragHandle
              class="cursor-grab active:cursor-grabbing text-on-surface-variant hover:text-on-surface w-8 h-8 flex items-center justify-center"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <span class="material-symbols-outlined">drag_indicator</span>
            </button>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-sora text-on-surface text-lg truncate">
                  {{ v.name }}
                </span>
                <span
                  class="text-[10px] font-grotesk uppercase tracking-wider px-2 py-0.5 rounded-full border"
                  [class]="
                    v.kind === 'CUSTOM'
                      ? 'border-velo-lime/40 text-velo-lime'
                      : 'border-white/15 text-on-surface-variant'
                  "
                >
                  {{ v.kind === 'CUSTOM' ? 'Custom' : 'Built-in' }}
                </span>
              </div>
              <div class="text-xs text-on-surface-variant font-grotesk uppercase tracking-wider mt-0.5">
                {{ kindDescription(v) }}
              </div>
            </div>

            <!-- Toggle: pill switch -->
            <button
              type="button"
              role="switch"
              [attr.aria-checked]="v.isActive"
              [attr.aria-label]="
                v.isActive ? 'Hide on phone' : 'Show on phone'
              "
              (click)="onToggle(v)"
              [disabled]="busyId() === v.id"
              class="relative w-12 h-7 rounded-full transition-colors disabled:opacity-50"
              [class.bg-velo-lime]="v.isActive"
              [class.bg-white\\/15]="!v.isActive"
            >
              <span
                class="absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform"
                [class.translate-x-5]="v.isActive"
              ></span>
            </button>

            @if (v.kind === 'CUSTOM') {
              <a
                [routerLink]="['/ride-views', v.id, 'edit']"
                class="w-9 h-9 rounded-full velo-glass hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
                aria-label="Edit layout"
                title="Edit layout"
              >
                <span class="material-symbols-outlined text-[18px]">edit</span>
              </a>
              <button
                type="button"
                (click)="onDelete(v)"
                [disabled]="busyId() === v.id"
                class="w-9 h-9 rounded-full velo-glass hover:bg-rose-500/20 flex items-center justify-center text-on-surface-variant disabled:opacity-50"
                aria-label="Delete layout"
                title="Delete layout"
              >
                <span class="material-symbols-outlined text-[18px]">delete</span>
              </button>
            }
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      /* CDK drag preview/placeholder styling — match the resting row
         so the user sees a clean lift, not a flash of stripped DOM. */
      :host ::ng-deep .cdk-drag-preview {
        background: rgba(255, 255, 255, 0.06);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0.75rem;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      }
      :host ::ng-deep .cdk-drag-placeholder {
        opacity: 0.2;
        background: rgba(195, 244, 0, 0.08);
        border-radius: 0.75rem;
      }
      :host ::ng-deep .cdk-drag-animating {
        transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
      }
    `,
  ],
})
export class RideViewsPageComponent {
  private readonly svc = inject(RideViewsService);
  private readonly router = inject(Router);

  protected readonly views = this.svc.views;
  protected readonly loading = this.svc.loading;
  protected readonly lastError = this.svc.lastError;
  protected readonly busyId = signal<string | null>(null);
  protected readonly creating = signal(false);

  constructor() {
    void this.svc.refresh();
  }

  protected async onToggle(v: RideView): Promise<void> {
    this.busyId.set(v.id);
    try {
      await this.svc.update(v.id, { isActive: !v.isActive });
    } finally {
      this.busyId.set(null);
    }
  }

  protected async onDelete(v: RideView): Promise<void> {
    if (v.kind !== 'CUSTOM') return;
    if (!confirm(`Delete "${v.name}"? This can't be undone.`)) return;
    this.busyId.set(v.id);
    try {
      await this.svc.remove(v.id);
    } finally {
      this.busyId.set(null);
    }
  }

  protected async onCreate(): Promise<void> {
    this.creating.set(true);
    try {
      const created = await this.svc.create({
        name: 'Untitled layout',
        rows: 4,
        cols: 4,
        gridConfig: [],
      });
      await this.router.navigate(['/ride-views', created.id, 'edit']);
    } finally {
      this.creating.set(false);
    }
  }

  protected onDrop(event: CdkDragDrop<RideView[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const list = [...this.views()];
    const [moved] = list.splice(event.previousIndex, 1);
    list.splice(event.currentIndex, 0, moved);
    void this.svc.reorder(list.map((v) => v.id));
  }

  protected kindDescription(v: RideView): string {
    switch (v.kind) {
      case 'DEFAULT_COMBINED':
        return 'Coach + sensor tiles';
      case 'DEFAULT_WORKOUT':
        return 'Full workout coach';
      case 'DEFAULT_SENSORS':
        return 'Sensor tiles only';
      case 'CUSTOM': {
        const widgets = v.gridConfig?.length ?? 0;
        return `${v.rows}×${v.cols} grid · ${widgets} widget${widgets === 1 ? '' : 's'}`;
      }
    }
  }
}
