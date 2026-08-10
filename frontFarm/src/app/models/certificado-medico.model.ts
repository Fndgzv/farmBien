export const FAMILIARES_CERTIFICADO = [
  'Padre',
  'Madre',
  'Abuelo paterno',
  'Abuela paterna',
  'Abuelo materno',
  'Abuela materna',
] as const;

export const VALORES_DIENTE = [
  { valor: 'S', etiqueta: 'DIENTE SANO' },
  { valor: 'C', etiqueta: 'DIENTE CAREADO' },
  { valor: 'O', etiqueta: 'D. OBTURADO' },
  { valor: 'A', etiqueta: 'D. AUSENTE' },
  { valor: 'P', etiqueta: 'PARAODONTOP.' },
  { valor: 'M', etiqueta: 'MALOCLUSION' },
  { valor: 'B', etiqueta: 'ABSESO' },
] as const;

export const FILAS_DIENTES = [
  ['D18', 'D17', 'D16', 'D15', 'D14', 'D13', 'D12', 'D11', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28'],
  ['D55', 'D54', 'D53', 'D52', 'D51', 'D61', 'D62', 'D63', 'D64', 'D65'],
  ['D85', 'D84', 'D83', 'D82', 'D81', 'D71', 'D72', 'D73', 'D74', 'D75'],
  ['D48', 'D47', 'D46', 'D45', 'D44', 'D43', 'D42', 'D41', 'D31', 'D32', 'D33', 'D34', 'D35', 'D36', 'D37', 'D38'],
] as const;

export const DIENTES_CERTIFICADO = FILAS_DIENTES.flat();

export type ValorDiente = typeof VALORES_DIENTE[number]['valor'];

export interface CertificadoMedico {
  _id?: string;
  farmacia?: any;
  medico?: any;
  farmaciaId?: string;
  medicoId?: string;
  fichaConsultorio?: any;
  fichaConsultorioId?: string;
  fechaRevision: string;
  tipo: 'ESCOLAR' | 'LABORAL';
  nombreInstituto: string;
  turno: string;
  grado: string;
  nivelEscolar: string;
  nombre: string;
  genero: string;
  fechaNacimiento: string;
  curp: string;
  edad: number | null;
  responsable: string;
  domicilio: string;
  telefono: string;
  antecedentesHereditarios: any;
  antecedentesPersonales: any;
  examenFisico: any;
  saludBucal: {
    dientes: Record<string, ValorDiente>;
    observaciones: string;
  };
  aptoLaboresEscolares: boolean | null;
  aptoLaboresFisicas: boolean | null;
  vigenciaDesde: string;
  vigenciaHasta: string;
  diagnosticoObservaciones: string;
  medicoSnapshot?: any;
}

export function fechaHoyCiudadMexico(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === 'year')?.value || '';
  const month = parts.find(p => p.type === 'month')?.value || '';
  const day = parts.find(p => p.type === 'day')?.value || '';
  return `${year}-${month}-${day}`;
}

export function crearCertificadoMedicoVacio(): CertificadoMedico {
  const familiaresVacios = () => [] as string[];
  const dientes = Object.fromEntries(
    DIENTES_CERTIFICADO.map(diente => [diente, 'S'])
  ) as Record<string, ValorDiente>;

  return {
    fechaRevision: fechaHoyCiudadMexico(),
    tipo: 'ESCOLAR',
    nombreInstituto: '',
    turno: '',
    grado: '',
    nivelEscolar: '',
    nombre: '',
    genero: '',
    fechaNacimiento: '',
    curp: '',
    edad: null,
    responsable: '',
    domicilio: '',
    telefono: '',
    antecedentesHereditarios: {
      diabetes: familiaresVacios(),
      hipertension: familiaresVacios(),
      obesidad: familiaresVacios(),
      convulsiones: familiaresVacios(),
      hemofilicos: familiaresVacios(),
      respiratorios: familiaresVacios(),
      hepatitis: familiaresVacios(),
      oncologicos: familiaresVacios(),
      otras: { familiares: familiaresVacios(), texto: '' },
      niegaAntecedentes: false,
    },
    antecedentesPersonales: {
      alergias: '',
      obesidad: false,
      diabetes: false,
      hipertension: false,
      hepatitis: false,
      convulsiones: false,
      alcoholismo: false,
      tabaquismo: false,
      otros: { activo: false, texto: '' },
      niegaAntecedentes: false,
    },
    examenFisico: {
      talla: '',
      fr: '',
      temperatura: '',
      tensionArterial: '',
      peso: '',
      fc: '',
      imc: '',
      grupoSanguineo: '',
      esquemaInmunizaciones: null,
      limitantesFisicasIntelectuales: '',
      estadoNutricional: {
        normal: false,
        malnutricion: false,
        sobrepeso: false,
        obesidad: false,
        otra: { activo: false, texto: '' },
      },
      agudezaVisual: {
        graduacion: '',
        normal: false,
        lentes: false,
        disminuida: false,
        otra: { activo: false, texto: '' },
      },
      problemasDesarrollo: {
        maltrato: false,
        problemasConducta: false,
        problemasAprendizaje: false,
        problemasLenguaje: false,
        ninguno: false,
      },
      cardiovascular: {
        normal: false,
        sFisiologico: false,
        sOrganico: false,
        arritmias: false,
        bradicardias: false,
      },
      piel: {
        normal: false,
        piodermias: false,
        pAlba: false,
        micosis: false,
        escabiasis: false,
      },
      muscular: {
        normal: false,
        dColumna: false,
        piePlano: false,
        gValgo: false,
        tratamiento: '',
      },
      respiratorio: {
        normal: false,
        resfriadoC: false,
        otitis: false,
        bronquitis: false,
        asma: false,
      },
    },
    saludBucal: { dientes, observaciones: '' },
    aptoLaboresEscolares: null,
    aptoLaboresFisicas: null,
    vigenciaDesde: '',
    vigenciaHasta: '',
    diagnosticoObservaciones: '',
  };
}

export function mezclarCertificadoMedico(valor: any): CertificadoMedico {
  const base = crearCertificadoMedicoVacio();
  const fuente = valor || {};

  return {
    ...base,
    ...fuente,
    farmaciaId: idRelacionado(fuente.farmaciaId ?? fuente.farmacia),
    medicoId: idRelacionado(fuente.medicoId ?? fuente.medico),
    fichaConsultorioId: idRelacionado(fuente.fichaConsultorioId ?? fuente.fichaConsultorio),
    fechaRevision: soloFecha(fuente.fechaRevision) || base.fechaRevision,
    fechaNacimiento: soloFecha(fuente.fechaNacimiento),
    vigenciaDesde: soloFecha(fuente.vigenciaDesde),
    vigenciaHasta: soloFecha(fuente.vigenciaHasta),
    antecedentesHereditarios: {
      ...base.antecedentesHereditarios,
      ...(fuente.antecedentesHereditarios || {}),
      niegaAntecedentes: normalizarNiegaAntecedentes(
        fuente.antecedentesHereditarios?.niegaAntecedentes
      ),
      otras: {
        ...base.antecedentesHereditarios.otras,
        ...(fuente.antecedentesHereditarios?.otras || {}),
      },
    },
    antecedentesPersonales: {
      ...base.antecedentesPersonales,
      ...(fuente.antecedentesPersonales || {}),
      otros: {
        ...base.antecedentesPersonales.otros,
        ...(fuente.antecedentesPersonales?.otros || {}),
      },
    },
    examenFisico: {
      ...base.examenFisico,
      ...(fuente.examenFisico || {}),
      estadoNutricional: {
        ...base.examenFisico.estadoNutricional,
        ...(fuente.examenFisico?.estadoNutricional || {}),
        otra: {
          ...base.examenFisico.estadoNutricional.otra,
          ...(fuente.examenFisico?.estadoNutricional?.otra || {}),
        },
      },
      agudezaVisual: {
        ...base.examenFisico.agudezaVisual,
        ...(fuente.examenFisico?.agudezaVisual || {}),
        otra: {
          ...base.examenFisico.agudezaVisual.otra,
          ...(fuente.examenFisico?.agudezaVisual?.otra || {}),
        },
      },
      problemasDesarrollo: {
        ...base.examenFisico.problemasDesarrollo,
        ...(fuente.examenFisico?.problemasDesarrollo || {}),
      },
      cardiovascular: {
        ...base.examenFisico.cardiovascular,
        ...(fuente.examenFisico?.cardiovascular || {}),
      },
      piel: { ...base.examenFisico.piel, ...(fuente.examenFisico?.piel || {}) },
      muscular: { ...base.examenFisico.muscular, ...(fuente.examenFisico?.muscular || {}) },
      respiratorio: { ...base.examenFisico.respiratorio, ...(fuente.examenFisico?.respiratorio || {}) },
    },
    saludBucal: {
      ...base.saludBucal,
      ...(fuente.saludBucal || {}),
      dientes: {
        ...base.saludBucal.dientes,
        ...(fuente.saludBucal?.dientes || {}),
      },
    },
  };
}

export function normalizarNiegaAntecedentes(valor: any): boolean {
  if (Array.isArray(valor)) return valor.length > 0;
  return valor === true || valor === 'true' || valor === 1 || valor === '1';
}

export function idRelacionado(valor: any): string {
  if (valor && typeof valor === 'object') return String(valor._id || valor.id || '').trim();
  return String(valor || '').trim();
}

export function soloFecha(valor: any): string {
  if (!valor) return '';
  const texto = String(valor).trim();
  const match = texto.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || '';
}
