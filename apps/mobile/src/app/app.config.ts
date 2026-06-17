import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { apiBaseUrlInterceptor } from 'api-client';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding so the web's feature-activities lib
    // (lazy-loaded for /activities/:id on mobile too) can use
    // `input.required<string>('id')` to grab the route param.
    provideRouter(appRoutes, withComponentInputBinding()),
    // The interceptor prefixes /api/* requests with the configured
    // apiBaseUrl and attaches the session Bearer / X-User-Id header,
    // so components reused from the web lib (which use Angular's
    // HttpClient directly) reach the right backend.
    provideHttpClient(
      withFetch(),
      withInterceptors([apiBaseUrlInterceptor]),
    ),
  ],
};
