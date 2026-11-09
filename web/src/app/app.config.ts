import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { ConfirmationService, MessageService } from '@openng/optimus-ui/api';
import { provideOptimus } from '@openng/optimus-ui/config';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AppPreset } from './theme/optimus-preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Dark is on when <html> has the app-dark class (the default; see index.html and ThemeService).
    provideOptimus({ theme: { preset: AppPreset, options: { darkModeSelector: '.app-dark' } } }),
    MessageService,
    ConfirmationService,
    // Keeps the app's own files (not any data) so it opens fast and can be installed.
    // Nothing from /api is ever cached; see ngsw-config.json.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
