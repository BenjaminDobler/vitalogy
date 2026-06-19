import { Route } from '@angular/router';
import { MobileActivityDetailPage } from 'feature-record';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'record',
  },
  {
    path: 'record',
    loadChildren: () =>
      import('feature-record').then((m) => m.featureRecordRoutes),
  },
  {
    path: 'history',
    loadChildren: () =>
      import('feature-history').then((m) => m.featureHistoryRoutes),
  },
  // Activity detail: mobile-specific wrapper so the page gets the bottom
  // nav. Sits BEFORE the lazy /activities loader so this static route
  // wins the match for /activities/:id (otherwise router would defer
  // to the web feature's child :id route, which renders without nav).
  {
    path: 'activities/:id',
    component: MobileActivityDetailPage,
  },
  {
    // The bare /activities list reuses the web's component — the design
    // tokens are global so it renders dark+lime in the WebView too.
    path: 'activities',
    loadChildren: () =>
      import('feature-activities').then((m) => m.featureActivitiesRoutes),
  },
  {
    path: 'settings',
    loadChildren: () =>
      import('feature-settings').then((m) => m.featureSettingsRoutes),
  },
];
