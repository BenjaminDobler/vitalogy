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
      class="w-full h-80 rounded-xl overflow-hidden border border-white/10 z-0"
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
          // Electric lime to match the VeloPulse brand color.
          color: '#c3f400',
          weight: 4,
          opacity: 0.95,
        }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [20, 20] });

        // Start = lime (matches the polyline so it reads as "start of line").
        L.circleMarker(coords[0], {
          color: '#0f0f0f',
          weight: 2,
          fillColor: '#c3f400',
          fillOpacity: 1,
          radius: 7,
        }).addTo(map);
        // End = white ring with dark fill, like a HUD checkpoint.
        L.circleMarker(coords[coords.length - 1], {
          color: '#c3f400',
          weight: 2,
          fillColor: '#0f0f0f',
          fillOpacity: 1,
          radius: 7,
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
