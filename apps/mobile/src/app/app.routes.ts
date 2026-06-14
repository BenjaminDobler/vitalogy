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
    path: 'settings',
    loadChildren: () =>
      import('feature-settings').then((m) => m.featureSettingsRoutes),
  },
];
