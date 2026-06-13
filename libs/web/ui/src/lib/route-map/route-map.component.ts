import {
  Component,
  ElementRef,
  effect,
  input,
  viewChild,
} from '@angular/core';

/**
 * Renders a GPS route on an OpenStreetMap tile background using Leaflet.
 *
 * Input `latlng` is a list of `[lat, lng]` tuples — exactly what Strava's
 * `latlng` stream returns.
 *
 * Notes:
 *  - We use `circleMarker` for start/end so we don't hit the well-known
 *    Leaflet image-asset bundling issue with default markers.
 *  - The polyline is downsampled to ~1000 points for render perf — visually
 *    indistinguishable from the full path on a map this size.
 */
@Component({
  selector: 'ui-route-map',
  template: `
    <div
      #mapEl
      class="w-full h-80 rounded-lg overflow-hidden border border-slate-200 z-0"
    ></div>
  `,
})
export class RouteMapComponent {
  readonly latlng = input.required<[number, number][]>();
  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');

  constructor() {
    effect((onCleanup) => {
      const ref = this.mapEl();
      const coords = this.latlng();
      if (!ref || coords.length === 0) return;

      let cancelled = false;
      let map: import('leaflet').Map | null = null;

      // Dynamic import keeps Leaflet out of any bundle that doesn't render
      // a map (e.g. the eager shell chunk).
      import('leaflet').then((L) => {
        if (cancelled) return;
        map = L.map(ref.nativeElement);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const sampled = downsample(coords, 1000);
        const polyline = L.polyline(sampled, {
          color: '#fc5200',
          weight: 4,
          opacity: 0.9,
        }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

        L.circleMarker(coords[0], {
          color: '#fff',
          weight: 2,
          fillColor: '#16a34a',
          fillOpacity: 1,
          radius: 6,
        }).addTo(map);
        L.circleMarker(coords[coords.length - 1], {
          color: '#fff',
          weight: 2,
          fillColor: '#dc2626',
          fillOpacity: 1,
          radius: 6,
        }).addTo(map);
      });

      onCleanup(() => {
        cancelled = true;
        map?.remove();
      });
    });
  }
}

function downsample(
  coords: [number, number][],
  target: number,
): [number, number][] {
  if (coords.length <= target) return coords;
  const step = coords.length / target;
  const out: [number, number][] = [];
  for (let i = 0; i < target; i++) {
    out.push(coords[Math.floor(i * step)]);
  }
  // Always keep the true endpoint so start/end markers line up with the line.
  out.push(coords[coords.length - 1]);
  return out;
}
