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
];
