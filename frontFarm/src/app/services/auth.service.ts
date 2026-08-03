import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  catchError,
  firstValueFrom,
  from,
  map,
  of,
  tap,
  throwError,
  timeout,
} from 'rxjs';
import Swal from 'sweetalert2';

import { environment } from '../../environments/environment';
import { TurnoCajaService } from './turno-caja.service';
import {
  getTokenExpirationMs,
  getTokenSessionState,
  SESSION_WARNING_MS,
} from './session-token.utils';

const TOKEN_KEY = 'token';
const LEGACY_TOKEN_KEY = 'auth_token';
const USER_KEY = 'usuario';
const FARMACIA_KEY = 'user_farmacia';
const AUTH_EVENT_KEY = 'farmbien_auth_event';
const RENEW_LOCK_KEY = 'farmbien_auth_renew_lock';
const RENEW_LOCK_TTL_MS = 20_000;
const RENEW_REQUEST_TIMEOUT_MS = 15_000;

type SessionEndReason = 'manual' | 'expired' | 'invalid';

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

interface RenewResponse {
  token: string;
  expiresAt: string;
  expiresAtMs: number;
  user?: any;
}

interface AuthEvent {
  id: string;
  reason: SessionEndReason;
  at: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {
  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly tabId = this.createTabId();

  isLoginVisible = new BehaviorSubject<boolean>(false);
  isEditProfileVisible = new BehaviorSubject<boolean>(false);
  isChangePasswordVisible = new BehaviorSubject<boolean>(false);

  private userNombreSubject = new BehaviorSubject<string | null>(localStorage.getItem('user_nombre'));
  private userRolSubject = new BehaviorSubject<string | null>(localStorage.getItem('user_rol'));
  private usuarioSubject = new BehaviorSubject<any>(this.getUserData());
  private farmaciaSubject = new BehaviorSubject<any>(this.getFarmaciaData());

  public usuario$ = this.usuarioSubject.asObservable();
  public farmacia$ = this.farmaciaSubject.asObservable();
  userNombre$ = this.userNombreSubject.asObservable();
  userRol$ = this.userRolSubject.asObservable();

  private usuario: any = null;
  private warningTimer: ReturnType<typeof setTimeout> | null = null;
  private expirationTimer: ReturnType<typeof setTimeout> | null = null;
  private scheduledToken: string | null = null;
  private warningOpen = false;
  private renewalPromise: Promise<boolean> | null = null;
  private terminalFlowActive = false;

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      this.checkSessionState(true);
    }
  };

  private readonly onWindowFocus = () => this.checkSessionState(true);
  private readonly onStorage = (event: StorageEvent) => this.handleStorageEvent(event);

  constructor(
    private router: Router,
    private http: HttpClient,
    private turnoCajaService: TurnoCajaService
  ) {
    this.cargarStorage();
    this.synchronizeLegacyTokenKeys();

    window.addEventListener('focus', this.onWindowFocus);
    window.addEventListener('storage', this.onStorage);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    queueMicrotask(() => this.checkSessionState(true));
  }

  ngOnDestroy(): void {
    this.clearSessionTimers();
    this.releaseRenewLock();
    this.closeWarningModal();
    window.removeEventListener('focus', this.onWindowFocus);
    window.removeEventListener('storage', this.onStorage);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  login(usuario: string, password: string, firma?: string): Observable<any> {
    const body: any = { usuario, password };
    if (firma) body.firma = firma;

    return this.http.post(`${this.apiUrl}/login`, body).pipe(
      tap((response: any) => {
        if (response?.token && response?.user) {
          this.applyAuthenticatedSession(response.token, response.user, false);
        }
      })
    );
  }

  register(
    nombre: string,
    password: string,
    email: string,
    telefono: string,
    domicilio: string
  ): Observable<RegisterResponse> {
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
    rol: string,
    email = '',
    farmacia: any = null,
    telefono = '',
    domicilio = ''
  ): void {
    const current = this.getUserData() || {};
    const user = {
      ...current,
      nombre,
      rol,
      email,
      farmacia,
      telefono,
      domicilio,
    };
    this.applyAuthenticatedSession(token, user, rol === 'admin' && !farmacia);
  }

  logout(): void {
    if (this.terminalFlowActive) return;

    const token = this.getToken();
    if (token) {
      const headers = new HttpHeaders({
        'x-auth-token': token,
        'Content-Type': 'application/json',
      });
      this.http
        .post(`${this.apiUrl}/logout`, {}, { headers })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }

    void this.endSession('manual', true);
  }

  guardarToken(token: string): void {
    this.storeToken(token, true);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
  }

  cargarStorage(): void {
    this.usuario = this.getUserData();
  }

  getUsuario(): any {
    return this.usuario;
  }

  getUserData(): any {
    return this.parseJson(localStorage.getItem(USER_KEY));
  }

  showLogin(): void {
    this.isLoginVisible.next(true);
  }

  hideLogin(): void {
    this.isLoginVisible.next(false);
  }

  changePassword(passwordActual?: string, nuevaPassword?: string, confirmarPassword?: string) {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('No hay token disponible'));
    }

    const headers = new HttpHeaders({
      'x-auth-token': token,
      'Content-Type': 'application/json',
    });

    return this.http.put(
      `${this.apiUrl}/change-password`,
      { passwordActual, nuevaPassword, confirmarPassword },
      { headers }
    );
  }

  showChangePassword(): void {
    this.isChangePasswordVisible.next(true);
    this.isEditProfileVisible.next(false);
  }

  hideChangePassword(): void {
    this.isChangePasswordVisible.next(false);
  }

  showEditProfile(): void {
    this.isEditProfileVisible.next(true);
  }

  hideEditProfile(): void {
    this.isEditProfileVisible.next(false);
  }

  updateUser(nombre: string, password: string, email: string, telefono: string, domicilio: string) {
    const token = this.getToken();
    if (!token) {
      return throwError(() => new Error('No hay token de autenticacion.'));
    }

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'x-auth-token': token,
    });

    return this.http.put(
      `${this.apiUrl}/update`,
      { nombre, password, email, telefono, domicilio },
      { headers }
    );
  }

  isAuthenticated(): boolean {
    const state = getTokenSessionState(this.getToken());
    return state === 'valid' || state === 'warning';
  }

  get isLoggedIn(): boolean {
    return this.isAuthenticated();
  }

  tieneRol(rolesPermitidos: string[]): boolean {
    const user = this.getUserData();
    return Boolean(user && rolesPermitidos.includes(user.rol));
  }

  verificaToken(): Observable<boolean> {
    return from(this.renewSession()).pipe(
      map((renewed) => renewed),
      catchError(() => of(false))
    );
  }

  notifyUserChange(): void {
    const user = this.getUserData();
    const token = this.getToken();

    if (user && token && this.isAuthenticated()) {
      this.usuario = user;
      this.usuarioSubject.next(user);
      this.userNombreSubject.next(user.nombre || null);
      this.userRolSubject.next(user.rol || null);
      this.farmaciaSubject.next(this.getFarmaciaData());
      this.checkSessionState(false);
      return;
    }

    this.clearAuthMemory();
  }

  getUserId(): string | null {
    return localStorage.getItem('user_id');
  }

  setFarmacia(farmacia: any): void {
    if (farmacia) {
      localStorage.setItem(FARMACIA_KEY, JSON.stringify(farmacia));
    } else {
      localStorage.removeItem(FARMACIA_KEY);
    }
    this.farmaciaSubject.next(farmacia);
  }

  obtenerFirma(farmaciaId: string) {
    return this.http.get<any>(`${environment.apiUrl}/farmacias/firma/${farmaciaId}`);
  }

  checkSessionBeforeRequest(): boolean {
    const token = this.getToken();
    if (!token) return true;

    const state = getTokenSessionState(token);
    if (state === 'invalid' || state === 'expired') {
      void this.endSession(state === 'expired' ? 'expired' : 'invalid', true);
      return false;
    }

    if (state === 'warning') {
      this.ensureExpirationTimer(token);
      void this.showSessionWarning(token);
    } else if (this.scheduledToken !== token) {
      this.scheduleSessionTimers(token);
    }

    return true;
  }

  handleUnauthorized(): void {
    if (this.terminalFlowActive) return;
    const token = this.getToken();
    const reason: SessionEndReason = getTokenSessionState(token) === 'expired' ? 'expired' : 'invalid';
    void this.endSession(reason, true);
  }

  private applyAuthenticatedSession(token: string, user: any, preserveActivePharmacy: boolean): void {
    this.terminalFlowActive = false;
    this.updateStoredUser(user, preserveActivePharmacy);
    this.storeToken(token, true);
  }

  private applyRenewedSession(response: RenewResponse): void {
    const user = response.user;
    if (user) {
      const preserveActivePharmacy = user.rol === 'admin' && !user.farmacia;
      this.updateStoredUser(user, preserveActivePharmacy);
    }
    this.storeToken(response.token, false);
  }

  private updateStoredUser(user: any, preserveActivePharmacy: boolean): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.usuario = user;
    this.usuarioSubject.next(user);

    this.setLegacyValue('user_nombre', user?.nombre);
    this.setLegacyValue('user_rol', user?.rol);
    this.setLegacyValue('user_email', user?.email);
    this.setLegacyValue('user_telefono', user?.telefono);
    this.setLegacyValue('user_domicilio', user?.domicilio);

    this.userNombreSubject.next(user?.nombre || null);
    this.userRolSubject.next(user?.rol || null);

    if (user?.farmacia) {
      this.setFarmacia(user.farmacia);
    } else if (!preserveActivePharmacy) {
      this.setFarmacia(null);
    }
  }

  private setLegacyValue(key: string, value: unknown): void {
    if (value !== undefined && value !== null && String(value) !== '') {
      localStorage.setItem(key, String(value));
    } else {
      localStorage.removeItem(key);
    }
  }

  private storeToken(token: string, closeWarning: boolean): void {
    if (!getTokenExpirationMs(token)) {
      void this.endSession('invalid', true);
      return;
    }

    if (this.terminalFlowActive && Swal.isVisible()) Swal.close();
    this.terminalFlowActive = false;
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    localStorage.setItem(TOKEN_KEY, token);

    if (closeWarning) this.closeWarningModal();
    this.scheduleSessionTimers(token);
  }

  private synchronizeLegacyTokenKeys(): void {
    const token = this.getToken();
    if (!token) return;
    if (localStorage.getItem(LEGACY_TOKEN_KEY) !== token) {
      localStorage.setItem(LEGACY_TOKEN_KEY, token);
    }
    if (localStorage.getItem(TOKEN_KEY) !== token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  private checkSessionState(forceReschedule: boolean): void {
    if (this.terminalFlowActive) return;

    const token = this.getToken();
    if (!token) {
      const previousToken = this.scheduledToken;
      const hadActiveSession = Boolean(previousToken && this.usuario);
      this.clearSessionTimers();
      if (hadActiveSession) {
        const reason = getTokenSessionState(previousToken) === 'expired' ? 'expired' : 'invalid';
        void this.endSession(reason, false);
      }
      return;
    }

    const state = getTokenSessionState(token);
    if (state === 'invalid' || state === 'expired') {
      void this.endSession(state === 'expired' ? 'expired' : 'invalid', true);
      return;
    }

    if (this.warningOpen && this.scheduledToken && this.scheduledToken !== token) {
      this.closeWarningModal();
    }

    if (forceReschedule || this.scheduledToken !== token) {
      this.scheduleSessionTimers(token);
    }

    if (state === 'warning') {
      void this.showSessionWarning(token);
    }
  }

  private scheduleSessionTimers(token: string): void {
    this.clearSessionTimers();

    const expiresAtMs = getTokenExpirationMs(token);
    if (!expiresAtMs) {
      void this.endSession('invalid', true);
      return;
    }

    const now = Date.now();
    if (expiresAtMs <= now) {
      void this.endSession('expired', true);
      return;
    }

    this.scheduledToken = token;
    const warningDelay = expiresAtMs - now - SESSION_WARNING_MS;

    if (warningDelay <= 0) {
      queueMicrotask(() => void this.showSessionWarning(token));
    } else {
      this.warningTimer = setTimeout(() => {
        if (this.getToken() === token) void this.showSessionWarning(token);
      }, warningDelay);
    }

    this.expirationTimer = setTimeout(() => {
      if (this.getToken() === token) void this.endSession('expired', true);
    }, Math.max(0, expiresAtMs - now));
  }

  private ensureExpirationTimer(token: string): void {
    if (this.scheduledToken !== token || !this.expirationTimer) {
      this.scheduleSessionTimers(token);
    }
  }

  private clearSessionTimers(): void {
    if (this.warningTimer) clearTimeout(this.warningTimer);
    if (this.expirationTimer) clearTimeout(this.expirationTimer);
    this.warningTimer = null;
    this.expirationTimer = null;
    this.scheduledToken = null;
  }

  private async showSessionWarning(token: string): Promise<void> {
    if (this.warningOpen || this.terminalFlowActive || this.getToken() !== token) return;

    const expiresAtMs = getTokenExpirationMs(token);
    if (!expiresAtMs || expiresAtMs <= Date.now()) {
      await this.endSession(expiresAtMs ? 'expired' : 'invalid', true);
      return;
    }

    this.warningOpen = true;
    let countdownInterval: ReturnType<typeof setInterval> | null = null;

    try {
      const result = await Swal.fire({
        icon: 'warning',
        title: 'Tu sesión está por concluir',
        html: `
          <p>Por seguridad, tu sesión finalizará en unos minutos. ¿Deseas continuar trabajando?</p>
          <p><strong>Tiempo restante: <span id="session-countdown"></span></strong></p>
        `,
        confirmButtonText: 'Continuar sesión',
        cancelButtonText: 'Cerrar sesión',
        showCancelButton: true,
        reverseButtons: true,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showLoaderOnConfirm: true,
        preConfirm: async () => {
          const renewed = await this.renewSession();
          return renewed || false;
        },
        didOpen: () => {
          const updateCountdown = () => {
            const remainingMs = Math.max(0, expiresAtMs - Date.now());
            const totalSeconds = Math.ceil(remainingMs / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            const element = document.getElementById('session-countdown');
            if (element) element.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
            if (remainingMs <= 0) void this.endSession('expired', true);
          };

          updateCountdown();
          countdownInterval = setInterval(updateCountdown, 500);
        },
        willClose: () => {
          if (countdownInterval) clearInterval(countdownInterval);
          countdownInterval = null;
        },
      });

      if (
        result.dismiss === Swal.DismissReason.cancel &&
        !this.terminalFlowActive &&
        this.getToken() === token
      ) {
        this.logout();
      }
    } finally {
      if (countdownInterval) clearInterval(countdownInterval);
      this.warningOpen = false;
    }
  }

  private renewSession(): Promise<boolean> {
    if (this.renewalPromise) return this.renewalPromise;

    this.renewalPromise = this.performRenewal().finally(() => {
      this.renewalPromise = null;
      this.releaseRenewLock();
    });
    return this.renewalPromise;
  }

  private async performRenewal(): Promise<boolean> {
    const currentToken = this.getToken();
    const currentExpiresAtMs = getTokenExpirationMs(currentToken);

    if (!currentToken || !currentExpiresAtMs || currentExpiresAtMs <= Date.now()) {
      void this.endSession(currentExpiresAtMs ? 'expired' : 'invalid', true);
      return false;
    }

    if (!this.acquireRenewLock()) {
      if (this.warningOpen && Swal.isVisible()) {
        Swal.showValidationMessage('Otra pestaña está renovando la sesión. Espera un momento.');
      }
      return false;
    }

    try {
      const response = await firstValueFrom(
        this.http
          .post<RenewResponse>(`${this.apiUrl}/renew`, {})
          .pipe(timeout(RENEW_REQUEST_TIMEOUT_MS))
      );

      if (this.terminalFlowActive || Date.now() >= currentExpiresAtMs) {
        void this.endSession('expired', true);
        return false;
      }

      const tokenNow = this.getToken();
      if (tokenNow !== currentToken) {
        return Boolean(tokenNow && this.isAuthenticated());
      }

      const renewedExpiresAtMs = getTokenExpirationMs(response?.token);
      if (!response?.token || !renewedExpiresAtMs || renewedExpiresAtMs <= Date.now()) {
        void this.endSession('invalid', true);
        return false;
      }

      this.applyRenewedSession(response);
      return true;
    } catch (error) {
      const tokenNow = this.getToken();
      if (tokenNow && tokenNow !== currentToken && this.isAuthenticated()) {
        return true;
      }

      if (Date.now() >= currentExpiresAtMs) {
        void this.endSession('expired', true);
        return false;
      }

      if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) {
        if (error.status === 401 && error.error?.codigo === 'SESSION_NOT_RENEWABLE') {
          await new Promise((resolve) => setTimeout(resolve, 250));
          const renewedInAnotherTab = this.getToken();
          if (renewedInAnotherTab && renewedInAnotherTab !== currentToken && this.isAuthenticated()) {
            return true;
          }
        }
        void this.endSession('invalid', true);
        return false;
      }

      if (this.warningOpen && Swal.isVisible()) {
        Swal.showValidationMessage(
          'No fue posible renovar por un problema de red. Puedes intentarlo nuevamente mientras el tiempo no expire.'
        );
      }
      return false;
    }
  }

  private acquireRenewLock(): boolean {
    const now = Date.now();
    const existing = this.parseJson(localStorage.getItem(RENEW_LOCK_KEY));
    if (existing?.owner && existing.owner !== this.tabId && Number(existing.expiresAt) > now) {
      return false;
    }

    const lock = { owner: this.tabId, expiresAt: now + RENEW_LOCK_TTL_MS };
    localStorage.setItem(RENEW_LOCK_KEY, JSON.stringify(lock));
    const stored = this.parseJson(localStorage.getItem(RENEW_LOCK_KEY));
    return stored?.owner === this.tabId;
  }

  private releaseRenewLock(): void {
    const existing = this.parseJson(localStorage.getItem(RENEW_LOCK_KEY));
    if (existing?.owner === this.tabId) {
      localStorage.removeItem(RENEW_LOCK_KEY);
    }
  }

  private async endSession(reason: SessionEndReason, publish: boolean): Promise<void> {
    if (this.terminalFlowActive) return;
    this.terminalFlowActive = true;
    this.clearSessionTimers();
    this.releaseRenewLock();
    this.closeWarningModal();

    if (publish) {
      this.publishSessionEnd(reason);
    }

    this.clearAuthMemory();
    this.turnoCajaService.limpiarTurnoActivo();

    const manual = reason === 'manual';
    await Swal.fire({
      icon: manual ? 'success' : 'info',
      title: manual ? 'Sesión cerrada' : 'Sesión finalizada',
      text: manual
        ? 'Tu sesión fue cerrada correctamente.'
        : reason === 'expired'
          ? 'Tu sesión ha expirado por seguridad. Inicia sesión nuevamente para continuar.'
          : 'Tu sesión ya no es válida. Inicia sesión nuevamente para continuar.',
      confirmButtonText: 'Aceptar',
      allowOutsideClick: false,
      allowEscapeKey: false,
    });

    if (!this.terminalFlowActive) return;
    if (this.router.url !== '/login') {
      await this.router.navigateByUrl('/login', { replaceUrl: true });
    }
  }

  private publishSessionEnd(reason: SessionEndReason): void {
    const event: AuthEvent = {
      id: `${this.tabId}-${Date.now()}`,
      reason,
      at: Date.now(),
    };

    localStorage.clear();
    localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify(event));
    setTimeout(() => {
      const stored = this.parseJson(localStorage.getItem(AUTH_EVENT_KEY));
      if (stored?.id === event.id) localStorage.removeItem(AUTH_EVENT_KEY);
    }, 5_000);
  }

  private handleStorageEvent(event: StorageEvent): void {
    if (event.key === USER_KEY) {
      const user = this.getUserData();
      this.usuario = user;
      this.usuarioSubject.next(user);
      this.userNombreSubject.next(user?.nombre || null);
      this.userRolSubject.next(user?.rol || null);
      return;
    }

    if (event.key === FARMACIA_KEY) {
      this.farmaciaSubject.next(this.getFarmaciaData());
      return;
    }

    if (event.key === TOKEN_KEY && event.newValue) {
      if (this.terminalFlowActive && Swal.isVisible()) Swal.close();
      this.terminalFlowActive = false;
      if (localStorage.getItem(LEGACY_TOKEN_KEY) !== event.newValue) {
        localStorage.setItem(LEGACY_TOKEN_KEY, event.newValue);
      }
      this.closeWarningModal();
      this.scheduleSessionTimers(event.newValue);
      return;
    }

    if (event.key === AUTH_EVENT_KEY && event.newValue) {
      const authEvent = this.parseJson(event.newValue) as AuthEvent | null;
      if (authEvent?.reason) void this.endSession(authEvent.reason, false);
      return;
    }

    if ((event.key === TOKEN_KEY && !event.newValue) || event.key === null) {
      queueMicrotask(() => {
        if (this.getToken() || this.terminalFlowActive) return;
        const authEvent = this.parseJson(localStorage.getItem(AUTH_EVENT_KEY)) as AuthEvent | null;
        void this.endSession(authEvent?.reason || 'manual', false);
      });
    }
  }

  private closeWarningModal(): void {
    if (this.warningOpen && Swal.isVisible()) {
      Swal.close();
    }
  }

  private clearAuthMemory(): void {
    this.usuario = null;
    this.usuarioSubject.next(null);
    this.farmaciaSubject.next(null);
    this.userNombreSubject.next(null);
    this.userRolSubject.next(null);
    this.isLoginVisible.next(false);
    this.isEditProfileVisible.next(false);
    this.isChangePasswordVisible.next(false);
  }

  private getFarmaciaData(): any {
    return this.parseJson(localStorage.getItem(FARMACIA_KEY));
  }

  private parseJson(value: string | null): any {
    if (!value || value === 'undefined') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private createTabId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
