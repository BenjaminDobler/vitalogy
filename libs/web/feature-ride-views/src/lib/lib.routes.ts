import { Route } from '@angular/router';
import { RideViewsPageComponent } from './ride-views-page/ride-views-page.component';

export const featureRideViewsRoutes: Route[] = [
  { path: '', component: RideViewsPageComponent },
  // Phase 4 will mount the grid editor at /ride-views/:id/edit.
];
