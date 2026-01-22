import { bootstrapApplication } from '@angular/platform-browser';
import { LOCALE_ID, DEFAULT_CURRENCY_CODE } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEsMx from '@angular/common/locales/es-MX';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';

registerLocaleData(localeEsMx);

bootstrapApplication(AppComponent, {
  providers: [
    { provide: LOCALE_ID, useValue: 'es-MX' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'MXN' },
    provideRouter(routes),
    provideAnimations(),
    provideHttpClient(withInterceptors([
      (req, next) => {
        const token = localStorage.getItem('token');
    
        if (token) {
          const authReq = req.clone({
            setHeaders: {
              'x-auth-token': token
            }
          });

          return next(authReq);
        }

        return next(req);
      }
    ]))
    
  ]
}).catch(err => console.error(err));
