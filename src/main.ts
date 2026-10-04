import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
bootstrapApplication(App, appConfig).catch(() => {
  document.querySelector('app-root')!.textContent =
    'No se ha podido abrir la aplicación. Recarga la página para volver a intentarlo.';
});
