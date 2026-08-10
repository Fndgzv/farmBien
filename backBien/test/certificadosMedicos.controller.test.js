const test = require("node:test");
const assert = require("node:assert/strict");

const CertificadosMedico = require("../models/CertificadosMedico");
const Farmacia = require("../models/Farmacia");
const Usuario = require("../models/Usuario");
const FichaConsultorio = require("../models/FichaConsultorio");
const controller = require("../controllers/certificadosMedicos.controller");

const FARMACIA_A = "64b000000000000000000001";
const FARMACIA_B = "64b000000000000000000002";
const MEDICO_A = "64b000000000000000000003";
const MEDICO_B = "64b000000000000000000004";
const ADMIN = "64b000000000000000000005";
const CERTIFICADO = "64b000000000000000000006";
const FICHA = "64b000000000000000000007";

function respuesta() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function reqMedico(body = {}, params = {}, query = {}) {
  return {
    body,
    params,
    query,
    usuario: { _id: MEDICO_A, rol: "medico", farmacia: FARMACIA_A },
  };
}

function reqAdmin(body = {}, params = {}, query = {}) {
  return {
    body,
    params,
    query,
    usuario: { _id: ADMIN, rol: "admin", farmacia: null },
  };
}

function querySelect(value) {
  return { select: async () => value };
}

function queryDetalle(value) {
  const query = {
    populate() { return query; },
    async lean() { return value; },
  };
  return query;
}

function mockRelacionesValidas(t, { medicoId = MEDICO_A, farmaciaMedico = FARMACIA_A } = {}) {
  t.mock.method(Farmacia, "findById", () => querySelect({ _id: FARMACIA_A, nombre: "Farmacia A", activo: true }));
  t.mock.method(Usuario, "findById", id => querySelect({
    _id: id || medicoId,
    nombre: id === MEDICO_B ? "Médico B" : "Médico A",
    rol: "medico",
    farmacia: farmaciaMedico,
    activo: true,
    cedulaProfesional: "12345",
    titulo: "Dra.",
  }));
}

function bodyMinimo(extra = {}) {
  return {
    farmaciaId: FARMACIA_A,
    medicoId: MEDICO_A,
    fechaRevision: "2026-08-08",
    tipo: "ESCOLAR",
    nombre: "Paciente Uno",
    ...extra,
  };
}

test("A) médico crea un certificado propio", { concurrency: false }, async t => {
  mockRelacionesValidas(t);
  t.mock.method(CertificadosMedico, "exists", async () => null);

  let creado;
  t.mock.method(CertificadosMedico, "create", async payload => {
    creado = payload;
    return { _id: CERTIFICADO };
  });
  t.mock.method(CertificadosMedico, "findById", () => queryDetalle({ _id: CERTIFICADO, ...creado }));

  const res = respuesta();
  await controller.agregarCertificadoMedico(reqMedico(bodyMinimo()), res);

  assert.equal(res.statusCode, 201);
  assert.equal(String(creado.medico), MEDICO_A);
  assert.equal(String(creado.farmacia), FARMACIA_A);
});

test("B) médico no puede suplantar médico o farmacia desde el body", { concurrency: false }, async t => {
  mockRelacionesValidas(t);
  let creado;
  t.mock.method(CertificadosMedico, "create", async payload => {
    creado = payload;
    return { _id: CERTIFICADO };
  });
  t.mock.method(CertificadosMedico, "findById", () => queryDetalle({ _id: CERTIFICADO, ...creado }));

  const res = respuesta();
  await controller.agregarCertificadoMedico(
    reqMedico(bodyMinimo({ farmaciaId: FARMACIA_B, medicoId: MEDICO_B })),
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(String(creado.medico), MEDICO_A);
  assert.equal(String(creado.farmacia), FARMACIA_A);
});

test("C) listado de médico impone su propio identificador", { concurrency: false }, async t => {
  let pipeline;
  t.mock.method(CertificadosMedico, "aggregate", received => {
    pipeline = received;
    const query = {
      collation() { return query; },
      async exec() { return [{ documentos: [], total: [] }]; },
    };
    return query;
  });

  const res = respuesta();
  await controller.obtenerCertificadosMedicos(reqMedico({}, {}, { medico: MEDICO_B }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(String(pipeline[0].$match.medico), MEDICO_A);
});

test("D) médico recibe 403 al editar certificado de otro médico", { concurrency: false }, async t => {
  t.mock.method(CertificadosMedico, "findById", async () => ({ _id: CERTIFICADO, medico: MEDICO_B }));

  const res = respuesta();
  await controller.editarCertificadoMedico(reqMedico({}, { id: CERTIFICADO }), res);

  assert.equal(res.statusCode, 403);
});

test("E) médico recibe 403 al eliminar certificado de otro médico", { concurrency: false }, async t => {
  t.mock.method(CertificadosMedico, "findById", () => querySelect({ _id: CERTIFICADO, medico: MEDICO_B }));

  const res = respuesta();
  await controller.eliminarCertificadoMedico(reqMedico({}, { id: CERTIFICADO }), res);

  assert.equal(res.statusCode, 403);
});

test("F) admin puede consultar todos los certificados", { concurrency: false }, async t => {
  let pipeline;
  t.mock.method(CertificadosMedico, "aggregate", received => {
    pipeline = received;
    const query = {
      collation() { return query; },
      async exec() { return [{ documentos: [{ _id: CERTIFICADO }], total: [{ cantidad: 1 }] }]; },
    };
    return query;
  });

  const res = respuesta();
  await controller.obtenerCertificadosMedicos(reqAdmin(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(pipeline[0].$match.medico, undefined);
  assert.equal(res.body.paginacion.total, 1);
});

test("G) admin crea para un médico asociado a la farmacia", { concurrency: false }, async t => {
  mockRelacionesValidas(t);
  let creado;
  t.mock.method(CertificadosMedico, "create", async payload => {
    creado = payload;
    return { _id: CERTIFICADO };
  });
  t.mock.method(CertificadosMedico, "findById", () => queryDetalle({ _id: CERTIFICADO, ...creado }));

  const res = respuesta();
  await controller.agregarCertificadoMedico(reqAdmin(bodyMinimo()), res);

  assert.equal(res.statusCode, 201);
  assert.equal(String(creado.medico), MEDICO_A);
});

test("H) admin no puede asignar un médico de otra farmacia", { concurrency: false }, async t => {
  mockRelacionesValidas(t, { farmaciaMedico: FARMACIA_B });
  const crear = t.mock.method(CertificadosMedico, "create", async () => ({ _id: CERTIFICADO }));

  const res = respuesta();
  await controller.agregarCertificadoMedico(reqAdmin(bodyMinimo()), res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.mensaje, /no está asociado/i);
  assert.equal(crear.mock.callCount(), 0);
});

test("I) una ficha no puede generar dos certificados", { concurrency: false }, async t => {
  mockRelacionesValidas(t);
  t.mock.method(FichaConsultorio, "findById", () => querySelect({
    _id: FICHA,
    farmaciaId: FARMACIA_A,
    medicoId: MEDICO_A,
  }));
  t.mock.method(CertificadosMedico, "exists", async () => ({ _id: CERTIFICADO }));
  const crear = t.mock.method(CertificadosMedico, "create", async () => ({ _id: CERTIFICADO }));

  const res = respuesta();
  await controller.agregarCertificadoMedico(
    reqMedico(bodyMinimo({ fichaConsultorioId: FICHA })),
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(crear.mock.callCount(), 0);
});

test("J) niegaAntecedentes se normaliza y persiste como boolean", { concurrency: false }, () => {
  const { extraerDatosEditables } = controller.__test__;

  assert.equal(extraerDatosEditables({
    antecedentesHereditarios: { niegaAntecedentes: [] },
  }).antecedentesHereditarios.niegaAntecedentes, false);
  assert.equal(extraerDatosEditables({
    antecedentesHereditarios: { niegaAntecedentes: ["Padre"] },
  }).antecedentesHereditarios.niegaAntecedentes, true);
  assert.equal(extraerDatosEditables({
    antecedentesHereditarios: { niegaAntecedentes: true },
  }).antecedentesHereditarios.niegaAntecedentes, true);
});

test("K) el schema hidrata sin CastError los arreglos heredados de niegaAntecedentes", { concurrency: false }, () => {
  const base = { _id: CERTIFICADO, nombre: "Paciente", fechaRevision: "2026-08-08" };
  const vacio = CertificadosMedico.hydrate({
    ...base,
    antecedentesHereditarios: { niegaAntecedentes: [] },
  });
  const marcado = CertificadosMedico.hydrate({
    ...base,
    antecedentesHereditarios: { niegaAntecedentes: ["Madre"] },
  });

  assert.equal(vacio.antecedentesHereditarios.niegaAntecedentes, false);
  assert.equal(marcado.antecedentesHereditarios.niegaAntecedentes, true);
  assert.equal(vacio.$errors?.["antecedentesHereditarios.niegaAntecedentes"], undefined);
  assert.equal(marcado.$errors?.["antecedentesHereditarios.niegaAntecedentes"], undefined);
});
