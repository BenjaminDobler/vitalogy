import { Route } from '@angular/router';
import { RideViewsPageComponent } from './ride-views-page/ride-views-page.component';
import { RideViewEditorComponent } from './ride-view-editor/ride-view-editor.component';

export const featureRideViewsRoutes: Route[] = [
  { path: '', component: RideViewsPageComponent },
  { path: ':id/edit', component: RideViewEditorComponent },
];
