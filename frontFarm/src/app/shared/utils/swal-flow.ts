// src/app/shared/utils/swal-flow.ts
import Swal, { SweetAlertOptions, SweetAlertResult } from 'sweetalert2';
import { firstValueFrom, Observable } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';


type RunFn<T> = () => Promise<T> | Observable<T>;
type SuccessModal<T> = SweetAlertOptions | ((result: T) => SweetAlertOptions);

export interface ConfirmRunWithLoaderOpts<T> {
    confirm: SweetAlertOptions;                         // modal de confirmación
    loading?: { title?: string; html?: string };        // textos del loader
    run: RunFn<T>;                                      // acción a ejecutar
    successModal?: SuccessModal<T>;                     // modal posterior (opcional)
    onSuccess?: (result: T, successSwal?: SweetAlertResult) => void | Promise<void>;
    errorModal?: (err: any) => SweetAlertOptions;       // modal de error (opcional)
    onError?: (err: any) => void | Promise<void>;       // callback de error (opcional)
    finally?: () => void | Promise<void>;               // limpieza final (opcional)
}

function isObservable<T>(x: any): x is Observable<T> {
    return x && typeof x.subscribe === 'function';
}

export async function confirmRunWithLoader<T>(opts: ConfirmRunWithLoaderOpts<T>): Promise<T | undefined> {
    const {
        confirm,
        loading = { title: 'Procesando...', html: 'Por favor espera un momento.' },
        run,
        successModal,
        onSuccess,
        errorModal,
        onError,
        finally: onFinally
    } = opts;

    // 1) Confirmación
    const conf = await Swal.fire({
        showCancelButton: true,
        confirmButtonText: 'Aceptar',
        cancelButtonText: 'Cancelar',
        allowOutsideClick: false,
        allowEscapeKey: false,
        ...confirm
    });

    if (!conf.isConfirmed) return undefined;

    // 2) Loader
    await Swal.fire({
        title: loading.title ?? 'Procesando...',
        html: loading.html ?? 'Por favor espera un momento.',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        // 3) Ejecutar acción (Obs/Promise)
        const maybe = run();
        const result = isObservable<T>(maybe) ? await firstValueFrom(maybe) : await maybe;

        // Cerrar SOLO el loader antes del siguiente modal
        Swal.close();

        // 4) Modal de éxito (opcional)
        let successSwal: SweetAlertResult | undefined;
        if (successModal) {
            const sm = typeof successModal === 'function' ? successModal(result) : successModal;
            successSwal = await Swal.fire({
                allowOutsideClick: false,
                allowEscapeKey: false,
                ...sm
            });
        }

        // 5) Callback de éxito (opcional)
        if (onSuccess) await onSuccess(result, successSwal);

        return result;
    } catch (err) {
        // Cerrar SOLO el loader
        Swal.close();

        // Modal de error (opcional → default)

        const msg = getSafeErrorMessage(err);

        if (errorModal) {
            await Swal.fire(errorModal(err));
        } else {
            await Swal.fire('Aviso', msg, 'warning');
        }

        // Callback de error (opcional)
        if (onError) await onError(err);
        return undefined;
    } finally {
        // Limpieza final (sin tocar modales)
        if (onFinally) await onFinally();
    }

    function getSafeErrorMessage(err: any): string {
        // Angular HttpClient
        if (err instanceof HttpErrorResponse) {
            const e = err.error as any;
            return e?.detalle || e?.mensaje || e?.message || err.message || 'Ocurrió un error inesperado.';
        }
        // Axios-like { response: { data: ... } }
        if (err?.response?.data) {
            const d = err.response.data;
            return d?.detalle || d?.mensaje || d?.message || err?.message || 'Ocurrió un error inesperado.';
        }
        // Fetch-like { message } o custom { error: {...} }
        if (err?.error) {
            const e = err.error;
            return e?.detalle || e?.mensaje || e?.message || err?.message || 'Ocurrió un error inesperado.';
        }
        // Error nativo o cualquier cosa
        return err?.message || err?.toString?.() || 'Ocurrió un error inesperado.';
    }

}
