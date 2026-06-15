import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'activities',
  },
  {
    path: 'activities',
    loadChildren: () =>
      import('feature-activities').then((m) => m.featureActivitiesRoutes),
  },
  {
    path: 'import',
    loadChildren: () => import('feature-import').then((m) => m.featureImportRoutes),
  },
  {
    path: 'analysis',
    loadChildren: () =>
      import('feature-analysis').then((m) => m.featureAnalysisRoutes),
  },
  {
    path: 'profile',
    loadChildren: () =>
      import('feature-profile').then((m) => m.featureProfileRoutes),
  },
];
