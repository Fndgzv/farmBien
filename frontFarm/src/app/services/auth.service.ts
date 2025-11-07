import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, throwError, map, catchError, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';

const baseUrl = environment.apiUrl;

interface RegisterResponse {
  mensaje: string;
  token: string;
  usuario: {
    nombre: string;
    rol: string;
    email: string;
    telefono: string;
    domicilio: string;
  };
}

@Injectable({
  providedIn: 'root'
})


export class AuthService {
  private apiUrl = `${environment.apiUrl}/auth`
  isLoginVisible = new BehaviorSubject<boolean>(false);
  isEditProfileVisible = new BehaviorSubject<boolean>(false);
  isChangePasswordVisible = new BehaviorSubject<boolean>(false);

  // 🔹 Definir los BehaviorSubjects
  private userNombreSubject = new BehaviorSubject<string | null>(localStorage.getItem('user_nombre'));
  private userRolSubject = new BehaviorSubject<string | null>(localStorage.getItem('user_rol'));

  private usuarioSubject = new BehaviorSubject<any>(this.getUserData());
  public usuario$ = this.usuarioSubject.asObservable();

  private farmaciaSubject = new BehaviorSubject<any>(this.getFarmaciaData());
  public farmacia$ = this.farmaciaSubject.asObservable();

  private usuario: any = null;

  userNombre$ = this.userNombreSubject.asObservable();
  userRol$ = this.userRolSubject.asObservable();


  constructor(private router: Router, private http: HttpClient) {
    this.cargarStorage();
  }

  /*   login(usuario: string, password: string, firma?: string): Observable<any> {
      const url = `${baseUrl}/auth/login`;
  
      const body: any = { usuario, password };
      if (firma) body.firma = firma;
  
      return this.http.post(url, body).pipe(
        tap((res: any) => {
          if (res?.token && res?.user) {
            this.setUserData(
              res.token,
              res.user.nombre,
              res.user.rol,
              res.user.email,
              res.user.farmacia,
              res.user.telefono,
              res.user.domicilio
            );
          }
        }),
        map(res => res),
        catchError((error) => {
          console.error('❌ Error en login observable:', error);
          return throwError(() => error);
        })
  
      );
    } */

  login(usuario: string, password: string, firma?: string): Observable<any> {
    const url = `${baseUrl}/auth/login`;

    const body: any = { usuario, password };
    if (firma) body.firma = firma;

    return this.http.post(url, body).pipe(
      // 2) Validar respuesta antes de guardar
      tap((res: any) => {
        if (res?.token && res?.user) {
          this.guardarToken(res.token);
          localStorage.setItem('usuario', JSON.stringify(res.user));
          this.usuario = res.user;
          this.usuarioSubject.next(res.user);
        }
      })
    );
  }

  // 🔹 Método para auto registrar un nuevo usuario
  register(nombre: string, password: string, email: string, telefono: string, domicilio: string): Observable<RegisterResponse> {
    const headers = new HttpHeaders({ 'Content-Type': 'application/json' });
    return this.http.post<RegisterResponse>(
      `${this.apiUrl}/auto-register`,
      { nombre, password, email, telefono, domicilio },
      { headers }
    );
  }


  setUserData(
    token: string,
    nombre: string,
    //password: string,
    rol: string,
    email: string = '',
    farmacia: any = null,
    telefono: string = '',
    domicilio: string = '') {
    localStorage.setItem('auth_token', token);
    localStorage.setItem('user_nombre', nombre);
    //localStorage.setItem('user_password', password);
    localStorage.setItem('user_rol', rol);
    localStorage.setItem('user_email', email);
    if (telefono) localStorage.setItem('user_telefono', telefono);
    if (domicilio) localStorage.setItem('user_domicilio', domicilio);

    const farmaciaObj = farmacia && typeof farmacia === 'object'
      ? {
        _id: farmacia._id,
        nombre: farmacia.nombre,
        direccion: farmacia.direccion,
        telefono: farmacia.telefono,
        titulo1: farmacia.titulo1,
        titulo2: farmacia.titulo2,
        imagen: farmacia.imagen,
        imagen2: farmacia.imagen2
      }
      : null;

    if (farmaciaObj) {
      localStorage.setItem('user_farmacia', JSON.stringify(farmaciaObj));
      this.setFarmacia(farmaciaObj);
    } else {
      // si no hay datos suficientes
      localStorage.removeItem('user_farmacia');
      this.setFarmacia(null);
    }

    //this.isLoggedIn = true;
    // 🔹 Emitimos los nuevos valores para actualizar en tiempo real
    this.userNombreSubject.next(nombre);
    this.userRolSubject.next(rol);
    this.setFarmacia(farmaciaObj);

  }

  logout() {
    this.usuario = null;
    localStorage.clear();
    this.farmaciaSubject.next(null);
    this.usuarioSubject.next(null);
    this.router.navigateByUrl('/');
  }

  guardarToken(token: string) {
    localStorage.setItem('token', token);
  }


  cargarStorage() {
    const user = localStorage.getItem('usuario');
    try {
      this.usuario = user && user !== 'undefined' ? JSON.parse(user) : null;
    } catch (e) {
      console.error('❌ Error al parsear usuario en cargarStorage:', e);
      this.usuario = null;
      localStorage.removeItem('usuario'); // Limpieza por seguridad
    }
  }


  getUsuario(): any {
    return this.usuario;
  }

  getUserData(): any {
    const user = localStorage.getItem('usuario');

    try {
      return user && user !== 'undefined' ? JSON.parse(user) : null;
    } catch (e) {
      console.error('Error al parsear usuario del localStorage:', e);
      return null;
    }
  }

  private getFarmaciaData(): any {
    const stored = localStorage.getItem('user_farmacia');
    try {
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      return null;
    }
  }

  showLogin() {
    this.isLoginVisible.next(true);
  }


  hideLogin() {
    this.isLoginVisible.next(false);
    /* setTimeout(() => this.router.navigate(['/home']), 0); */
  }


  changePassword(passwordActual?: string, nuevaPassword?: string, confirmarPassword?: string) {
    const token = localStorage.getItem('auth_token'); // Asegurar que el token está disponible
    if (!token) {
      console.error('No hay token en localStorage');
      return throwError(() => new Error('No hay token disponible'));
    }

    const headers = new HttpHeaders({
      'x-auth-token': token ? token : '',  // Asegurar que el header está bien
      'Content-Type': 'application/json'
    });

    return this.http.put(`${this.apiUrl}/change-password`,
      { passwordActual, nuevaPassword, confirmarPassword },
      { headers }
    );
  }


  showChangePassword() {
    this.isChangePasswordVisible.next(true);
    this.isEditProfileVisible.next(false);
  }

  hideChangePassword() {
    this.isChangePasswordVisible.next(false);
  }

  showEditProfile() {
    this.isEditProfileVisible.next(true);
  }


  hideEditProfile() {
    this.isEditProfileVisible.next(false);
  }


  updateUser(nombre: string, password: string, email: string, telefono: string, domicilio: string) {

    const token = localStorage.getItem('auth_token'); // Obtener el token almacenado

    // Verificar si el token existe antes de enviar la solicitud
    if (!token) {
      console.error("❌ No hay token disponible, la solicitud será rechazada.");
      return new Observable(observer => {
        observer.error({ mensaje: "No hay token de autenticación." });
      });
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-auth-token': token // 🔹 Incluir el token
    });

    return this.http.put(`${this.apiUrl}/update`, {
      nombre,
      password,  // Se usa solo para validación en el backend
      email,
      telefono,
      domicilio
    }, { headers });
  }


  isAuthenticated(): boolean {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp;
      const now = Math.floor(Date.now() / 1000);
      return exp > now;
    } catch (e) {
      return false;
    }
  }

  get isLoggedIn(): boolean {
    return this.isAuthenticated();
  }


  tieneRol(rolesPermitidos: string[]): boolean {
    const usuario = this.getUserData();
    return usuario && rolesPermitidos.includes(usuario.rol);
  }

  verificaToken(): Observable<boolean> {
    const url = `${baseUrl}/auth/renew`;
    return this.http.get(url).pipe(
      tap((res: any) => {
        this.guardarToken(res.token);
        localStorage.setItem('usuario', JSON.stringify(res.usuario));
        this.usuario = res.usuario;
        this.usuarioSubject.next(res.usuario);
      }),
      map(() => true),
      catchError(() => {
        this.logout();
        return of(false);
      })
    );
  }

  notifyUserChange(): void {
    const user = this.getUserData();
    const token = localStorage.getItem('token');

    if (user && token) {
      this.usuarioSubject.next(user);
      this.userNombreSubject.next(user.nombre);
      this.userRolSubject.next(user.rol);
    } else {
      // 🔒 Limpiar si no hay sesión válida
      this.usuarioSubject.next(null);
      this.userNombreSubject.next(null);
      this.userRolSubject.next(null);
    }
  }

  // Método para obtener el ID del usuario autenticado
  getUserId() {
    return localStorage.getItem('user_id');
  }

  setFarmacia(farmacia: any) {

    if (farmacia) {
      localStorage.setItem('user_farmacia', JSON.stringify(farmacia));
    } else {
      localStorage.removeItem('user_farmacia');
    }
    this.farmaciaSubject.next(farmacia);
  }


  obtenerFirma(farmaciaId: string) {
    return this.http.get<any>(`${environment.apiUrl}/farmacias/firma/${farmaciaId}`);
  }

}
