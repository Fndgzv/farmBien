const ORIGENES_CATALOGO_PERMITIDOS = new Set([
  'http://localhost:3000',
  'http://localhost:4200',
  'https://www.farmaciasantoremedio.com',
  'https://farmbien.onrender.com',
]);

const HEADERS_CATALOGO_PERMITIDOS = 'Content-Type, Authorization';
const METODOS_CATALOGO_PERMITIDOS = 'GET, OPTIONS';

const HOSTS_CATALOGO_PERMITIDOS = new Set([
  'localhost:3000',
  'localhost:4200',
  'farmbien.onrender.com',
  'www.farmaciasantoremedio.com',
]);

const normalizarHost = (host = '') => String(host).split(',')[0].trim().toLowerCase();

const confiarEnProxy = (req) => Boolean(req.app?.enabled?.('trust proxy'));

const obtenerHostSolicitud = (req) => {
  const forwardedHost = req.get('X-Forwarded-Host');

  if (forwardedHost && confiarEnProxy(req)) {
    return normalizarHost(forwardedHost);
  }

  return normalizarHost(req.get('Host'));
};

const logDiagnosticoCatalogo = (req, origin) => {
  if (process.env.DEBUG_CATALOGO_ORIGIN !== 'true') return;

  console.log('[catalogo-naucalpan]', {
    method: req.method,
    origin: origin || null,
    host: req.get('Host') || null,
    hostSolicitud: obtenerHostSolicitud(req) || null,
    forwardedHost: req.get('X-Forwarded-Host'),
    hostname: req.hostname,
    protocol: req.protocol,
    secure: req.secure,
    originalUrl: req.originalUrl,
    nodeEnv: process.env.NODE_ENV,
  });
};

const limpiarHeadersCorsCatalogo = (res) => {
  res.removeHeader('Access-Control-Allow-Origin');
  res.removeHeader('Access-Control-Allow-Methods');
  res.removeHeader('Access-Control-Allow-Headers');
};

const responderOrigenNoAutorizado = (res) => {
  limpiarHeadersCorsCatalogo(res);

  return res.status(403).json({
    ok: false,
    mensaje: 'Origen no autorizado',
  });
};

const aplicarHeadersCorsCatalogo = (req, res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', METODOS_CATALOGO_PERMITIDOS);
  res.setHeader(
    'Access-Control-Allow-Headers',
    req.get('Access-Control-Request-Headers') || HEADERS_CATALOGO_PERMITIDOS
  );
  res.vary('Origin');
};

const validarOrigenCatalogo = (req, res, next) => {
  const origin = req.get('Origin');

  logDiagnosticoCatalogo(req, origin);

  if (req.method === 'OPTIONS') {
    if (!origin || !ORIGENES_CATALOGO_PERMITIDOS.has(origin)) {
      return responderOrigenNoAutorizado(res);
    }

    aplicarHeadersCorsCatalogo(req, res, origin);
    return res.status(204).end();
  }

  if (origin && !ORIGENES_CATALOGO_PERMITIDOS.has(origin)) {
    return responderOrigenNoAutorizado(res);
  }

  if (origin) {
    aplicarHeadersCorsCatalogo(req, res, origin);
    return next();
  }

  const hostSolicitud = obtenerHostSolicitud(req);

  if (!HOSTS_CATALOGO_PERMITIDOS.has(hostSolicitud)) {
    return responderOrigenNoAutorizado(res);
  }

  limpiarHeadersCorsCatalogo(res);
  return next();
};

module.exports = {
  HOSTS_CATALOGO_PERMITIDOS,
  ORIGENES_CATALOGO_PERMITIDOS,
  obtenerHostSolicitud,
  validarOrigenCatalogo,
};
