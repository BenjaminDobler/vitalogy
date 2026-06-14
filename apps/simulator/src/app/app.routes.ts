import { Route } from '@angular/router';
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
        path: 'settings',
        loadChildren: () =>
          import('feature-settings').then((m) => m.featureSettingsRoutes),
      },
    ],
  },
];
