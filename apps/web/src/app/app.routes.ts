import { Route } from '@angular/router';
import { authGuard } from 'feature-auth';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'activities',
  },
  // /login + /signup are owned by feature-auth and have their own
  // guestGuard so signed-in users get bounced back to /.
  {
    path: '',
    loadChildren: () => import('feature-auth').then((m) => m.featureAuthRoutes),
  },
  // Everything below requires an authenticated session.
  {
    path: 'activities',
    canActivate: [authGuard],
    loadChildren: () =>
      import('feature-activities').then((m) => m.featureActivitiesRoutes),
  },
  {
    path: 'import',
    canActivate: [authGuard],
    loadChildren: () => import('feature-import').then((m) => m.featureImportRoutes),
  },
  {
    path: 'analysis',
    canActivate: [authGuard],
    loadChildren: () =>
      import('feature-analysis').then((m) => m.featureAnalysisRoutes),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadChildren: () =>
      import('feature-profile').then((m) => m.featureProfileRoutes),
  },
  {
    path: 'workouts',
    canActivate: [authGuard],
    loadChildren: () =>
      import('feature-workouts').then((m) => m.featureWorkoutsRoutes),
  },
];
