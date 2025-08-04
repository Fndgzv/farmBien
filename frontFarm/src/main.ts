import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideAnimations } from '@angular/platform-browser/animations';


bootstrapApplication(AppComponent, {
  providers: [
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
