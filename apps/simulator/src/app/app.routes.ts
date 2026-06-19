import { Route } from '@angular/router';
import { MobileActivityDetailPage } from 'feature-record';
import { SimulatorShell } from './simulator-shell';

export const appRoutes: Route[] = [
  {
    // SimulatorShell renders the sidebar + the phone frame; the phone frame
    // contains a <router-outlet> so the same /record + /settings routes the
    // mobile app uses work here too.
    path: '',
    component: SimulatorShell,
    children: [
      { path: '', redirectTo: 'record', pathMatch: 'full' },
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
      // Activity detail must sit BEFORE the lazy /activities loader so
      // this static route wins the match for /activities/:id. Mirrors
      // apps/mobile/src/app/app.routes.ts.
      {
        path: 'activities/:id',
        component: MobileActivityDetailPage,
      },
      {
        path: 'activities',
        loadChildren: () =>
          import('feature-activities').then((m) => m.featureActivitiesRoutes),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('feature-settings').then((m) => m.featureSettingsRoutes),
      },
    ],
  },
];
