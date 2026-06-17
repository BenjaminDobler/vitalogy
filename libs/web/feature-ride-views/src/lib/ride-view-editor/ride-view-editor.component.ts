import {
  AfterViewInit,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  EnvironmentInjector,
  Input,
  OnDestroy,
  createComponent,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GridStack, type GridStackWidget } from 'gridstack';
import type { RideView, WidgetPlacement, WidgetType } from 'data-models';
import { RideViewsService } from '../ride-views.service';
import { WidgetPreviewComponent } from '../widget-preview/widget-preview.component';

/**
 * Palette of widgets the user can drag into the canvas. The `defaultW/H`
 * controls the initial drop size; once on the canvas the user can drag
 * to resize. `icon` is a Material Symbols name — kept readable in the
 * editor since the actual data isn't available here.
 */
interface PaletteItem {
  type: WidgetType;
  label: string;
  icon: string;
  defaultW: number;
  defaultH: number;
}

const PALETTE: PaletteItem[] = [
  { type: 'hr', label: 'Heart rate', icon: 'favorite', defaultW: 1, defaultH: 1 },
  { type: 'cadence', label: 'Cadence', icon: 'autorenew', defaultW: 1, defaultH: 1 },
  { type: 'speed', label: 'Speed', icon: 'speed', defaultW: 1, defaultH: 1 },
  { type: 'power', label: 'Power', icon: 'bolt', defaultW: 1, defaultH: 1 },
  { type: 'distance', label: 'Distance', icon: 'straighten', defaultW: 1, defaultH: 1 },
  { type: 'avg-hr', label: 'Avg HR', icon: 'monitor_heart', defaultW: 1, defaultH: 1 },
  { type: 'avg-speed', label: 'Avg speed', icon: 'trending_up', defaultW: 1, defaultH: 1 },
  { type: 'lap-time', label: 'Lap time', icon: 'timer', defaultW: 1, defaultH: 1 },
  { type: 'total-time', label: 'Total time', icon: 'schedule', defaultW: 1, defaultH: 1 },
  { type: 'speed-gauge', label: 'Speed gauge', icon: 'donut_small', defaultW: 2, defaultH: 2 },
  { type: 'speed-ring', label: 'Speed ring', icon: 'data_usage', defaultW: 2, defaultH: 2 },
  { type: 'map', label: 'Map', icon: 'map', defaultW: 2, defaultH: 2 },
  { type: 'weather', label: 'Weather', icon: 'wb_sunny', defaultW: 1, defaultH: 1 },
  { type: 'workout-coach', label: 'Workout coach', icon: 'flag', defaultW: 2, defaultH: 1 },
];

const ROW_OPTIONS = [2, 3, 4, 5, 6, 7, 8];
const COL_OPTIONS = [2, 3, 4, 5, 6];

/**
 * Visual page builder for a single CUSTOM RideView. Uses gridstack to
 * handle the drag/drop + resize gestures; we keep a TypeScript
 * `widgetTypes` map keyed by gridstack id so we can round-trip back to
 * `WidgetPlacement[]` on save (gridstack itself doesn't store custom
 * fields per widget).
 *
 * Flow:
 *   1. Resolve the view from RideViewsService on mount (refresh if not
 *      already in the cache).
 *   2. After view init, `GridStack.init()` on the canvas + `load()` the
 *      existing placements.
 *   3. `GridStack.setupDragIn` makes each palette item draggable into
 *      the canvas. On drop we extract `data-widget-type` from the
 *      cloned content div, assign a fresh id, and track the type.
 *   4. Save → walk `grid.save(false)`, map each item to a
 *      WidgetPlacement via the type map, PUT to the API, navigate back.
 */
@Component({
  selector: 'lib-ride-view-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="flex items-center gap-3 mb-6 flex-wrap">
      <a
        routerLink="/ride-views"
        class="w-10 h-10 rounded-full velo-glass hover:bg-white/10 flex items-center justify-center text-on-surface-variant"
        aria-label="Back to layouts"
      >
        <span class="material-symbols-outlined">arrow_back</span>
      </a>
      <input
        type="text"
        [(ngModel)]="name"
        placeholder="Layout name"
        class="flex-1 min-w-[12rem] bg-transparent border-b border-white/15 focus:border-velo-lime outline-none font-sora text-xl text-on-surface py-2"
      />
      <label class="font-grotesk text-label-caps text-on-surface-variant uppercase text-xs flex items-center gap-2">
        Cols
        <select
          [(ngModel)]="cols"
          (change)="onColsChange()"
          class="bg-white/5 border border-white/15 rounded px-2 py-1 text-on-surface font-grotesk"
        >
          @for (n of colOptions; track n) {
            <option [ngValue]="n">{{ n }}</option>
          }
        </select>
      </label>
      <label class="font-grotesk text-label-caps text-on-surface-variant uppercase text-xs flex items-center gap-2">
        Rows
        <select
          [(ngModel)]="rows"
          class="bg-white/5 border border-white/15 rounded px-2 py-1 text-on-surface font-grotesk"
        >
          @for (n of rowOptions; track n) {
            <option [ngValue]="n">{{ n }}</option>
          }
        </select>
      </label>
      <button
        type="button"
        (click)="onCancel()"
        class="px-4 py-2 rounded-full velo-glass text-on-surface hover:bg-white/10 font-grotesk text-label-caps uppercase"
      >
        Cancel
      </button>
      <button
        type="button"
        (click)="onSave()"
        [disabled]="saving()"
        class="px-4 py-2 rounded-full bg-velo-lime text-velo-on-lime font-grotesk text-label-caps uppercase velo-shadow-lime hover:brightness-110 disabled:opacity-50"
      >
        {{ saving() ? 'Saving…' : 'Save' }}
      </button>
    </div>

    @if (lastError(); as e) {
      <p class="mb-3 text-sm text-rose-300 font-grotesk">{{ e }}</p>
    }

    <div class="grid grid-cols-[16rem_1fr] gap-6">
      <!-- Palette -->
      <aside class="velo-glass rounded-xl p-3 self-start sticky top-24">
        <div class="font-grotesk text-label-caps text-on-surface-variant uppercase text-xs px-2 pb-2">
          Widgets
        </div>
        <div class="space-y-2">
          @for (p of palette; track p.type) {
            <div
              class="grid-stack-item palette-item"
              [attr.gs-w]="p.defaultW"
              [attr.gs-h]="p.defaultH"
            >
              <div
                class="grid-stack-item-content velo-glass rounded-lg px-3 py-2 flex items-center gap-2 cursor-grab active:cursor-grabbing hover:bg-white/10"
                [attr.data-widget-type]="p.type"
              >
                <span class="material-symbols-outlined text-velo-lime text-[20px]">
                  {{ p.icon }}
                </span>
                <span class="font-grotesk text-sm text-on-surface">
                  {{ p.label }}
                </span>
              </div>
            </div>
          }
        </div>
        <p class="text-xs text-on-surface-variant px-2 pt-3 mt-3 border-t border-white/5">
          Drag any widget into the canvas. Drag corners to resize. Click
          the × on a widget to remove it.
        </p>
      </aside>

      <!-- Canvas -->
      <div>
        <div #canvas class="grid-stack velo-glass rounded-xl"></div>
        <p class="text-xs text-on-surface-variant mt-2 font-grotesk uppercase tracking-wider">
          Mobile preview · {{ cols }} × {{ rows }} grid
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      /* Editor-only theming on top of gridstack's stock CSS.
         The actual widget *appearance* is owned by WidgetPreviewComponent
         (matches the mobile look). These rules only handle the editor
         chrome: container height, delete-button overlay, palette item
         layout, and resize-handle visibility. */
      :host ::ng-deep .grid-stack {
        min-height: 28rem;
        padding: 0.5rem;
      }
      :host ::ng-deep .grid-stack > .grid-stack-item > .grid-stack-item-content {
        /* No background / borders — the inner WidgetPreviewComponent
           paints its own (velo-glass). We just keep overflow tidy and
           position the delete button against this box. */
        background: transparent;
        border: none;
        padding: 0;
        overflow: hidden;
        position: relative;
      }
      :host ::ng-deep .grid-stack > .grid-stack-item .widget-delete {
        position: absolute;
        top: 6px;
        right: 6px;
        z-index: 5;
        width: 22px;
        height: 22px;
        border-radius: 9999px;
        background: rgba(0, 0, 0, 0.6);
        color: #fda4af;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.15s;
        font-size: 14px;
        line-height: 1;
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 0;
      }
      :host ::ng-deep .grid-stack > .grid-stack-item:hover .widget-delete {
        opacity: 1;
      }
      /* Palette items live OUTSIDE any GridStack instance, so the stock
         gridstack CSS that absolutely positions .grid-stack-item would
         collapse them. Force them to flow as normal block elements. */
      :host ::ng-deep .palette-item {
        position: relative !important;
        width: 100% !important;
        height: auto !important;
        transform: none !important;
        top: auto !important;
        left: auto !important;
      }
      :host ::ng-deep .palette-item .grid-stack-item-content {
        position: relative;
        inset: auto;
      }
    `,
  ],
})
export class RideViewEditorComponent implements AfterViewInit, OnDestroy {
  /** Route-bound RideView id (withComponentInputBinding on the router). */
  @Input() id!: string;

  private readonly svc = inject(RideViewsService);
  private readonly router = inject(Router);
  private readonly appRef = inject(ApplicationRef);
  private readonly envInjector = inject(EnvironmentInjector);
  private readonly canvasEl =
    viewChild.required<ElementRef<HTMLDivElement>>('canvas');

  protected readonly palette = PALETTE;
  protected readonly rowOptions = ROW_OPTIONS;
  protected readonly colOptions = COL_OPTIONS;

  /** Mutable form state. Initialized from the loaded RideView. */
  protected name = '';
  protected rows = 4;
  protected cols = 4;

  protected readonly saving = signal(false);
  protected readonly lastError = signal<string | null>(null);

  private grid: GridStack | null = null;
  private view: RideView | null = null;
  /**
   * gridstack-id → WidgetType. Gridstack stores positions but not our
   * widget-type metadata, so we keep a parallel map populated on add
   * (palette drop) and on initial load, then read back during save.
   */
  private readonly widgetTypes = new Map<string, WidgetType>();

  /**
   * gridstack-id → WidgetPreview component ref. We use createComponent
   * to instantiate the real Angular widget into each cell so the
   * editor's preview is pixel-identical to what mobile renders. The
   * map tracks lifetime so we can destroy() each one when its widget
   * is removed (or the editor itself goes away).
   */
  private readonly widgetComponents = new Map<
    string,
    ComponentRef<WidgetPreviewComponent>
  >();

  async ngAfterViewInit(): Promise<void> {
    // The list endpoint is the only one mobile + web both hit, so we
    // route through the same cache. Refresh once to be sure the row
    // we're editing is present, then look it up.
    if (this.svc.views().length === 0) {
      await this.svc.refresh();
    }
    this.view = this.svc.views().find((v) => v.id === this.id) ?? null;
    if (!this.view) {
      this.lastError.set('Layout not found.');
      return;
    }
    this.name = this.view.name;
    this.rows = this.view.rows;
    this.cols = this.view.cols;

    this.initGrid();
  }

  ngOnDestroy(): void {
    // Destroy every preview component instance we created so their
    // change-detection registrations don't leak.
    for (const ref of this.widgetComponents.values()) {
      this.appRef.detachView(ref.hostView);
      ref.destroy();
    }
    this.widgetComponents.clear();
    this.grid?.destroy(false);
    this.grid = null;
  }

  private initGrid(): void {
    const el = this.canvasEl().nativeElement;

    this.grid = GridStack.init(
      {
        column: this.cols,
        cellHeight: 88,
        margin: 6,
        float: true,
        // Allow dropping items from the palette.
        acceptWidgets: true,
      },
      el,
    );

    this.grid.on('added', (_event, items) => {
      // Fires for both initial load (the items already carry their id
      // and type from `widgetTypes`) AND palette drops (where we read
      // the type from the cloned `data-widget-type` attribute).
      for (const item of items) {
        const itemEl = item.el as HTMLElement | undefined;
        if (!itemEl) continue;

        let id = item.id ?? itemEl.getAttribute('gs-id') ?? undefined;
        // Type might already be tracked (initial load) or need to be
        // extracted from the cloned palette content (drag-in).
        const knownType: WidgetType | undefined =
          id != null ? this.widgetTypes.get(id) : undefined;
        let type: WidgetType | undefined = knownType;
        if (!type) {
          const contentEl = itemEl.querySelector('.grid-stack-item-content') as
            | HTMLElement
            | null;
          type = contentEl?.dataset['widgetType'] as WidgetType | undefined;
        }
        if (!type) continue;

        const isNewDrop = !knownType;

        if (!id) {
          id = generateWidgetId();
          this.grid?.update(itemEl, { id });
        }
        this.widgetTypes.set(id, type);

        // Force the palette's default size on fresh drops. Gridstack's
        // pixel-size fallback measures the dragged element against the
        // canvas's column width and routinely picks the wrong w/h
        // (with our 100%-width sidebar palette items, a drop on a 4-col
        // grid was coming out 4-wide). The `widgets` array on
        // setupDragIn is meant to override this but is unreliable, so
        // we just snap to the intended size here. On initial load
        // (knownType already in the map) we trust the persisted values.
        if (isNewDrop) {
          const palette = PALETTE.find((p) => p.type === type);
          if (palette) {
            this.grid?.update(itemEl, {
              w: palette.defaultW,
              h: palette.defaultH,
            });
          }
        }

        this.mountWidgetComponent(itemEl, type, id);
      }
    });

    this.grid.on('removed', (_event, items) => {
      for (const item of items) {
        if (item.id) this.unmountWidgetComponent(item.id);
      }
    });

    // Load existing widgets.
    if (this.view?.gridConfig && this.view.gridConfig.length > 0) {
      const widgets: GridStackWidget[] = this.view.gridConfig.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        // Content stays empty — the `added` handler instantiates the
        // real WidgetPreviewComponent into the cell after gridstack
        // creates the .grid-stack-item-content div.
      }));
      this.view.gridConfig.forEach((p) =>
        this.widgetTypes.set(p.id, p.widget),
      );
      this.grid.load(widgets);
    }

    // Wire palette items as drag sources. setupDragIn is static because
    // it attaches a global listener — only call once per page load.
    //
    // The explicit `widgets` array keyed to PALETTE order is required:
    // without it gridstack reads `gs-w/gs-h` off each palette item's
    // rendered DOM, which (because palette items aren't inside any
    // GridStack instance) defaults to the full column count. The array
    // pins each item to its proper 1×1 / 2×2 size.
    //
    // We don't set `content` here — the `added` handler swaps in the
    // real Angular component once gridstack has created the cell DOM.
    // We do need a `data-widget-type` on the *palette item* so `added`
    // can recover the type from the cloned DOM.
    GridStack.setupDragIn(
      '.palette-item',
      { appendTo: 'body', helper: 'clone' },
      PALETTE.map((p) => ({
        w: p.defaultW,
        h: p.defaultH,
      })),
    );
  }

  /** Apply a 4-col redraw when the user changes cols. */
  protected onColsChange(): void {
    this.grid?.column(this.cols, 'compact');
  }

  protected async onSave(): Promise<void> {
    if (!this.grid || !this.view) return;
    this.saving.set(true);
    this.lastError.set(null);
    try {
      const placements = this.collectPlacements();
      await this.svc.update(this.view.id, {
        name: this.name.trim() || 'Untitled layout',
        rows: this.rows,
        cols: this.cols,
        gridConfig: placements,
      });
      await this.router.navigate(['/ride-views']);
    } catch (err) {
      this.lastError.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected onCancel(): void {
    void this.router.navigate(['/ride-views']);
  }

  private collectPlacements(): WidgetPlacement[] {
    if (!this.grid) return [];
    const raw = this.grid.save(false) as GridStackWidget[];
    const out: WidgetPlacement[] = [];
    for (const w of raw) {
      const id = w.id;
      if (!id) continue;
      const type = this.widgetTypes.get(id);
      if (!type) continue;
      out.push({
        id,
        widget: type,
        x: w.x ?? 0,
        y: w.y ?? 0,
        w: w.w ?? 1,
        h: w.h ?? 1,
      });
    }
    return out;
  }

  /**
   * Instantiate a `WidgetPreviewComponent` for this cell and attach its
   * DOM into the gridstack-managed content div. We use Angular's
   * `createComponent()` so it's a real component instance — change
   * detection runs, signals work, and the output looks pixel-identical
   * to what the mobile app will render at ride time.
   *
   * Idempotent per id: re-mounting destroys the prior instance first.
   */
  private mountWidgetComponent(
    itemEl: HTMLElement,
    type: WidgetType,
    id: string,
  ): void {
    const content = itemEl.querySelector('.grid-stack-item-content') as
      | HTMLElement
      | null;
    if (!content) return;

    // Clear anything gridstack put there (e.g. cloned palette HTML) so
    // we own the cell exclusively.
    while (content.firstChild) content.removeChild(content.firstChild);

    // Destroy any previous instance (re-mounts can happen if gridstack
    // re-emits `added` for a load or move that touches the cell).
    this.unmountWidgetComponent(id);

    const ref = createComponent(WidgetPreviewComponent, {
      environmentInjector: this.envInjector,
    });
    ref.setInput('widget', type);
    this.appRef.attachView(ref.hostView);
    content.appendChild(ref.location.nativeElement);
    this.widgetComponents.set(id, ref);

    // Hover-revealed delete button. Lives outside the Angular component
    // tree so removing a widget doesn't need a CD round-trip — it's
    // immediate DOM + gridstack API.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'widget-delete';
    btn.setAttribute('aria-label', 'Remove widget');
    btn.innerHTML = '✕';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.grid?.removeWidget(itemEl);
    });
    content.appendChild(btn);
  }

  private unmountWidgetComponent(id: string): void {
    const ref = this.widgetComponents.get(id);
    if (!ref) return;
    this.appRef.detachView(ref.hostView);
    ref.destroy();
    this.widgetComponents.delete(id);
    this.widgetTypes.delete(id);
  }
}

function generateWidgetId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `w_${crypto.randomUUID()}`;
  }
  return `w_${Math.random().toString(36).slice(2, 10)}`;
}
