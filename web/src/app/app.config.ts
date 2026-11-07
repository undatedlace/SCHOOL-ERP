import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
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
  ],
};
