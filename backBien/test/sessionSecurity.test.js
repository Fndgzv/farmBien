const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const Usuario = require("../models/Usuario");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  getJwtExpiresIn,
  renewAccessToken,
} = require("../utils/sessionSecurity");

const TEST_SECRET = "session-security-test-secret";
const USER_ID = "64b000000000000000000004";
const FARMACIA_ID = "64b000000000000000000001";

function createResponse() {
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

function createRequest(token) {
  return {
    headers: { "x-auth-token": token },
    header(name) {
      return this.headers[String(name).toLowerCase()];
    },
  };
}

test("la duracion JWT predeterminada esta centralizada en 12 horas", () => {
  const previous = process.env.JWT_EXPIRES_IN;
  delete process.env.JWT_EXPIRES_IN;
  assert.equal(getJwtExpiresIn(), "12h");
  if (previous === undefined) delete process.env.JWT_EXPIRES_IN;
  else process.env.JWT_EXPIRES_IN = previous;
});

test("la renovacion conserva claims vigentes y genera otras 12 horas", async () => {
  const previousSecret = process.env.JWT_SECRET;
  const previousDuration = process.env.JWT_EXPIRES_IN;
  const previousFeature = process.env.SESSION_SECURITY_ENABLED;
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRES_IN = "12h";
  process.env.SESSION_SECURITY_ENABLED = "false";

  try {
    const current = jwt.sign(
      { id: USER_ID, rol: "empleado", fid: FARMACIA_ID },
      TEST_SECRET,
      { expiresIn: "5m" }
    );
    const decoded = jwt.verify(current, TEST_SECRET);
    const usuario = {
      _id: USER_ID,
      rol: "medico",
      farmacia: { _id: FARMACIA_ID },
    };

    const before = Date.now();
    const renewed = await renewAccessToken({ usuario, decoded });
    const payload = jwt.verify(renewed.token, TEST_SECRET);

    assert.notEqual(renewed.token, current);
    assert.equal(payload.id, USER_ID);
    assert.equal(payload.rol, "medico");
    assert.equal(payload.fid, FARMACIA_ID);
    assert.ok(renewed.expiresAt.getTime() - before >= 12 * 60 * 60 * 1000 - 2000);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    if (previousDuration === undefined) delete process.env.JWT_EXPIRES_IN;
    else process.env.JWT_EXPIRES_IN = previousDuration;
    if (previousFeature === undefined) delete process.env.SESSION_SECURITY_ENABLED;
    else process.env.SESSION_SECURITY_ENABLED = previousFeature;
  }
});

test("nunca renueva un token que ya expiro", async () => {
  await assert.rejects(
    renewAccessToken({
      usuario: { _id: USER_ID, rol: "empleado" },
      decoded: { id: USER_ID, rol: "empleado", exp: Math.floor(Date.now() / 1000) - 1 },
    }),
    (error) => error?.code === "TOKEN_EXPIRED" && error?.status === 401
  );
});

test("el middleware rechaza tokens alterados antes de consultar al usuario", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  const findUser = t.mock.method(Usuario, "findById", () => {
    throw new Error("No debe consultar al usuario");
  });

  try {
    const token = jwt.sign({ id: USER_ID, rol: "empleado" }, TEST_SECRET, { expiresIn: "5m" });
    const altered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const req = createRequest(altered);
    const res = createResponse();
    let nextCalled = false;

    await authMiddleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
    assert.equal(findUser.mock.callCount(), 0);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("el middleware rechaza tokens expirados", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  const findUser = t.mock.method(Usuario, "findById", () => {
    throw new Error("No debe consultar al usuario");
  });

  try {
    const expired = jwt.sign({ id: USER_ID, rol: "empleado" }, TEST_SECRET, { expiresIn: -1 });
    const req = createRequest(expired);
    const res = createResponse();

    await authMiddleware(req, res, () => undefined);

    assert.equal(res.statusCode, 401);
    assert.equal(findUser.mock.callCount(), 0);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("el middleware rechaza un token de usuario inexistente", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  t.mock.method(Usuario, "findById", () => ({ select: async () => null }));

  try {
    const token = jwt.sign({ id: USER_ID, rol: "empleado" }, TEST_SECRET, { expiresIn: "5m" });
    const req = createRequest(token);
    const res = createResponse();
    let nextCalled = false;

    await authMiddleware.forRenewal(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.mensaje, "Usuario no valido.");
    assert.equal(nextCalled, false);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("el middleware rechaza un token de usuario deshabilitado", async (t) => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = TEST_SECRET;
  t.mock.method(Usuario, "findById", () => ({
    select: async () => ({ _id: USER_ID, rol: "empleado", activo: false }),
  }));

  try {
    const token = jwt.sign({ id: USER_ID, rol: "empleado" }, TEST_SECRET, { expiresIn: "5m" });
    const req = createRequest(token);
    const res = createResponse();
    let nextCalled = false;

    await authMiddleware.forRenewal(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.mensaje, "Usuario desactivado.");
    assert.equal(nextCalled, false);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
