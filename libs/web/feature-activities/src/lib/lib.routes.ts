import { Route } from '@angular/router';
import { FeatureActivities } from './feature-activities/feature-activities';
import { ActivityDetailComponent } from './activity-detail/activity-detail';

export const featureActivitiesRoutes: Route[] = [
  { path: '', component: FeatureActivities },
  { path: ':id', component: ActivityDetailComponent },
];
