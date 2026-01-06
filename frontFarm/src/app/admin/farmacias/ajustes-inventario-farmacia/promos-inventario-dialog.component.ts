import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import Swal from 'sweetalert2';
import { InventarioFarmaciaService } from '../../../services/inventario-farmacia.service';

type PromoFG = FormGroup;

@Component({
  selector: 'app-promos-inventario-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatTooltipModule],
  templateUrl: './promos-inventario-dialog.component.html',
  styleUrls: ['./promos-inventario-dialog.component.css']
})

export class PromosInventarioDialogComponent {
  saving = false;

  // ⚠️ NO inicializamos con this.fb AQUÍ; lo haremos en el constructor
  form!: FormGroup;

  dias = [
    { key: 'promoLunes', label: 'Lunes' },
    { key: 'promoMartes', label: 'Martes' },
    { key: 'promoMiercoles', label: 'Miércoles' },
    { key: 'promoJueves', label: 'Jueves' },
    { key: 'promoViernes', label: 'Viernes' },
    { key: 'promoSabado', label: 'Sábado' },
    { key: 'promoDomingo', label: 'Domingo' },
  ];

  constructor(
    private fb: FormBuilder,
    private invSrv: InventarioFarmaciaService,
    private ref: MatDialogRef<PromosInventarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { item: any }
  ) {
    this.form = this.buildForm();
    this.patchFromItem();
  }

  /* ---------- helpers de Form ---------- */
  private buildForm(): FormGroup {
    return this.fb.group({
      // INAPAM
      descuentoINAPAM: new FormControl<boolean>(false),

      // Por día
      promoLunes: this.buildPromoGroup(),
      promoMartes: this.buildPromoGroup(),
      promoMiercoles: this.buildPromoGroup(),
      promoJueves: this.buildPromoGroup(),
      promoViernes: this.buildPromoGroup(),
      promoSabado: this.buildPromoGroup(),
      promoDomingo: this.buildPromoGroup(),

      // Cantidad
      promoCantidadRequerida: new FormControl<2 | 3 | 4 | null>(null),
      inicioPromoCantidad: new FormControl<string | null>(null),
      finPromoCantidad: new FormControl<string | null>(null),

      // Temporada
      temp_porcentaje: new FormControl<number | null>(null),
      temp_inicio: new FormControl<string | null>(null),
      temp_fin: new FormControl<string | null>(null),
      temp_monedero: new FormControl<boolean>(false),
    });
  }

  private buildPromoGroup(): PromoFG {
    return this.fb.group({
      porcentaje: new FormControl<number | null>(null),
      inicio: new FormControl<string | null>(null),
      fin: new FormControl<string | null>(null),
      monedero: new FormControl<boolean>(false),
    });
  }

  /** Devuelve un FormControl tipado para el template (evita AbstractControl|null). */
  fc(path: string): FormControl {
    return this.form.get(path) as FormControl;
  }

  /* ---------- patch inicial ---------- */
  private patchPromo(key: string, src: any) {
    const fg = this.form.get(key) as PromoFG | null;
    if (!fg) return;
    if (src && typeof src === 'object') {
      fg.patchValue({
        porcentaje: src.porcentaje ?? null,
        inicio: this.toDateInput(src.inicio ?? null),
        fin: this.toDateInput(src.fin ?? null),
        monedero: !!src.monedero
      }, { emitEvent: false });
    }
  }

  private patchFromItem() {
    const i = this.data?.item;
    if (!i) return;

    // INAPAM (si lo traes en producto, lo tomamos de ahí; si lo cambiaste a inventario, también)
    const inapamActual = !!(i?.descuentoINAPAM ?? i?.producto?.descuentoINAPAM);
    this.form.patchValue({ descuentoINAPAM: inapamActual }, { emitEvent: false });

    for (const d of this.dias) this.patchPromo(d.key, i[d.key]);

    this.form.patchValue({
      promoCantidadRequerida: i?.promoCantidadRequerida ?? null,
      inicioPromoCantidad: this.toDateInput(i?.inicioPromoCantidad ?? null),
      finPromoCantidad: this.toDateInput(i?.finPromoCantidad ?? null),
    }, { emitEvent: false });

    if (i?.promoDeTemporada) {
      this.form.patchValue({
        temp_porcentaje: i.promoDeTemporada.porcentaje ?? null,
        temp_inicio: this.toDateInput(i.promoDeTemporada.inicio ?? null),
        temp_fin: this.toDateInput(i.promoDeTemporada.fin ?? null),
        temp_monedero: !!i.promoDeTemporada.monedero,
      }, { emitEvent: false });
    }
  }

  /* ---------- fechas ---------- */
  private toDateInput(v: any): string | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  private fromDateInput(v: string | null | undefined): Date | null {
    if (!v) return null;
    const d = new Date(v + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d;
  }

  /* ---------- payload ---------- */
  private buildPromoPayload(fg: PromoFG) {
    const p = fg.value as any;
    const pct = Number(p.porcentaje);
    const ini = this.fromDateInput(p.inicio);
    const fin = this.fromDateInput(p.fin);
    if (Number.isFinite(pct) && pct >= 0 && pct <= 100 && ini && fin) {
      return { porcentaje: pct, inicio: ini, fin: fin, monedero: !!p.monedero };
    }
    return undefined; // no tocar ese campo en backend
  }

  private buildPayload() {
    const v = this.form.value;
    const payload: any = {};

    payload.descuentoINAPAM = !!v.descuentoINAPAM;

    for (const d of this.dias) {
      const fg = this.form.get(d.key) as PromoFG;
      const obj = this.buildPromoPayload(fg);
      if (obj) payload[d.key] = obj;
    }

    if (v.promoCantidadRequerida) {
      const ini = this.fromDateInput(v.inicioPromoCantidad);
      const fin = this.fromDateInput(v.finPromoCantidad);
      if (ini && fin) {
        payload.promoCantidadRequerida = v.promoCantidadRequerida;
        payload.inicioPromoCantidad = ini;
        payload.finPromoCantidad = fin;
      }
    }

    const tpct = Number(v.temp_porcentaje);
    const tini = this.fromDateInput(v.temp_inicio);
    const tfin = this.fromDateInput(v.temp_fin);
    if (Number.isFinite(tpct) && tpct >= 0 && tpct <= 100 && tini && tfin) {
      payload.promoDeTemporada = {
        porcentaje: tpct,
        inicio: tini,
        fin: tfin,
        monedero: !!v.temp_monedero
      };
    }

    return payload;
  }

  /* ---------- acciones ---------- */
  onCancel() {
    this.ref.close();
  }

  onSave() {
    const payload = this.buildPayload();
    if (Object.keys(payload).length === 0) {
      this.ref.close();
      return;
    }
    this.saving = true;
    const id = this.data?.item?._id;

    this.invSrv.actualizarUno(id, payload).subscribe({
      next: (resp: any) => {
        this.saving = false;
        const updated = resp?.inventario ?? resp;
        this.ref.close({ updated });
      },
      error: (err) => {
        this.saving = false;
        console.error('[promos][save][err]', err);
        Swal.fire('Error', 'No se pudo guardar las promociones.', 'error');
      }
    });
  }
}
