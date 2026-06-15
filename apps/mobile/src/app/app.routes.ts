import { Route } from '@angular/router';

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
  {
    // Activity detail (reuses the web's component — the design tokens are
    // global so it renders dark+lime in the WebView too).
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
