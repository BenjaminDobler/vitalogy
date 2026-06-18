import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';

type Leaflet = typeof import('leaflet');

/**
 * OSM-tiled Leaflet map used by the map widget. Differs from the
 * activity-detail route-map in two ways:
 *
 *   1. Auto-follows the latest sample. Every new coord recenters the
 *      view on the rider's current position, so on mobile the map
 *      tracks you while you ride. To get a panned-ahead view, drag —
 *      the auto-follow re-asserts on the next sample (a snap-back
 *      button + drag-pause grace period is a v2 nice-to-have).
 *
 *   2. Renders a current-position circle in addition to the polyline
 *      trail, since there's no "end" yet when the ride is live.
 *
 * Empty coord arrays render a "Waiting for GPS…" placeholder so the
 * widget never blanks out on the canvas — important for the editor
 * preview which ships a sample loop, but also for the first second
 * of recording before GPS warms up.
 *
 * Leaflet is dynamically imported so any view that doesn't render a
 * map doesn't pull ~150 kB of JS into its initial chunk. The map
 * itself is created once and re-used across coord-change cycles —
 * we update the polyline + current-position marker in place rather
 * than tearing the map down every GPS tick.
 */
@Component({
  selector: 'lib-live-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full h-full' },
  template: `
    <div
      #mapEl
      class="w-full h-full rounded-xl overflow-hidden velo-glass relative"
    >
      @if (latlng().length === 0) {
        <div
          class="absolute inset-0 flex flex-col items-center justify-center text-on-surface-variant font-grotesk uppercase tracking-wider pointer-events-none z-[1000]"
          style="font-size: clamp(0.55rem, 3cqi, 0.85rem);"
        >
          Waiting for GPS…
        </div>
      }
    </div>
  `,
})
export class LiveMapComponent {
  /**
   * Ordered list of [lat, lng] tuples. Append-only — the latest entry
   * is treated as the rider's current position.
   */
  readonly latlng = input.required<ReadonlyArray<[number, number]>>();

  private readonly mapEl =
    viewChild<ElementRef<HTMLDivElement>>('mapEl');

  /** Cached leaflet module after first dynamic-import resolves. */
  private leafletPromise: Promise<Leaflet> | null = null;
  /** Per-instance map state, populated on first effect run that has both an element and coords. */
  private map: import('leaflet').Map | null = null;
  private polyline: import('leaflet').Polyline | null = null;
  private hereMarker: import('leaflet').CircleMarker | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** True until the first fitBounds — after that we honor auto-follow recentering. */
  private didInitialFit = false;

  constructor() {
    effect((onCleanup) => {
      const ref = this.mapEl();
      const coords = this.latlng();
      if (!ref) return;

      // Lazy-load leaflet exactly once. The module is reused for every
      // effect re-run; the .then runs synchronously on subsequent calls
      // since the promise is already settled.
      if (!this.leafletPromise) {
        this.leafletPromise = import('leaflet').then(
          (mod) =>
            ((mod as unknown as { default?: Leaflet }).default ??
              mod) as Leaflet,
        );
      }

      let cancelled = false;
      void this.leafletPromise.then((L) => {
        if (cancelled) return;
        this.ensureMap(L, ref.nativeElement);
        this.applyCoords(L, coords);
      });

      onCleanup(() => {
        cancelled = true;
      });
    });
  }

  /** Idempotent: creates the map + tile layer on first call only. */
  private ensureMap(L: Leaflet, el: HTMLElement): void {
    if (this.map) return;
    this.map = L.map(el, {
      // No attribution control on a widget — eats screen on small
      // cells. OSM attribution is surfaced in app credits.
      attributionControl: false,
      zoomControl: false,
      // Disable interactive scroll-zoom so a scrollable parent
      // (e.g. the carousel) doesn't fight with the rider's pan.
      scrollWheelZoom: false,
    }).setView([0, 0], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(this.map);
    // First paint + container-resize re-invalidations. Without these
    // gridstack/carousel layout changes leave tiles computed against
    // a 0×0 box and the map renders empty.
    requestAnimationFrame(() => this.map?.invalidateSize());
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(el);
  }

  /**
   * Push the latest coords through to the polyline + here-marker, and
   * keep the map centered on the rider. On the first non-empty render
   * we fit the whole route once so the rider sees the historical loop;
   * after that we just recenter on each new sample (auto-follow).
   */
  private applyCoords(
    L: Leaflet,
    coords: ReadonlyArray<[number, number]>,
  ): void {
    if (!this.map) return;
    if (coords.length === 0) {
      this.polyline?.remove();
      this.hereMarker?.remove();
      this.polyline = null;
      this.hereMarker = null;
      return;
    }

    const latLngs = coords as [number, number][];
    if (!this.polyline) {
      this.polyline = L.polyline(latLngs, {
        color: '#c3f400',
        weight: 4,
        opacity: 0.95,
      }).addTo(this.map);
    } else {
      this.polyline.setLatLngs(latLngs);
    }

    const last = latLngs[latLngs.length - 1];
    if (!this.hereMarker) {
      this.hereMarker = L.circleMarker(last, {
        color: '#0f0f0f',
        weight: 2,
        fillColor: '#c3f400',
        fillOpacity: 1,
        radius: 6,
      }).addTo(this.map);
    } else {
      this.hereMarker.setLatLng(last);
    }

    if (!this.didInitialFit && coords.length > 1) {
      // First non-trivial render: fit the existing route. After this
      // the rider sees a moving view that follows them.
      this.map.fitBounds(this.polyline.getBounds(), { padding: [16, 16] });
      this.didInitialFit = true;
    } else {
      // Auto-follow: pan to the latest sample without changing zoom.
      this.map.panTo(last, { animate: true, duration: 0.4 });
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.map?.remove();
    this.map = null;
    this.polyline = null;
    this.hereMarker = null;
  }
}
