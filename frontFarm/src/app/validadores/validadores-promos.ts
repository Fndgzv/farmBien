import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Validador para asegurar que el porcentaje sea un número entre 1 y 100.
 */
export const porcentajeValido: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const valor = control.value;
  if (valor == null || valor === '') return null;
  if (isNaN(valor)) return { porcentajeInvalido: true };
  if (valor <= 0) return { porcentajeMinimo: true };
  if (valor > 100) return { porcentajeMaximo: true };
  return null;
};

/**
 * Validador para validar el rango de fechas de una promoción.
 * Si se llena una fecha, deben estar ambas (inicio y fin), y la de inicio no debe ser posterior a la de fin.
 */
export const rangoFechasValido: ValidatorFn = (grupo: AbstractControl): ValidationErrors | null => {
  const inicio = grupo.get('inicio')?.value;
  const fin = grupo.get('fin')?.value;

  if (!inicio && !fin) return null;
  if (!inicio || !fin) return { fechasIncompletas: true };

  const inicioDate = new Date(inicio);
  const finDate = new Date(fin);

  if (inicioDate > finDate) return { fechaInvalida: true };

  return null;
};
