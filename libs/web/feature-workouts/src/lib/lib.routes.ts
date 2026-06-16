import { Route } from '@angular/router';
import { WorkoutListComponent } from './workout-list/workout-list.component';
import { WorkoutDetailComponent } from './workout-detail/workout-detail.component';

export const featureWorkoutsRoutes: Route[] = [
  { path: '', component: WorkoutListComponent },
  { path: ':id', component: WorkoutDetailComponent },
];
