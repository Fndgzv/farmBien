const ORIGENES_CATALOGO_PERMITIDOS = new Set([
  'http://localhost:3000',
  'https://www.farmaciasantoremedio.com',
  'https://farmbien.onrender.com',
  'http://localhost:4200',
]);

const HEADERS_CATALOGO_PERMITIDOS = 'Content-Type, Authorization';
const METODOS_CATALOGO_PERMITIDOS = 'GET, OPTIONS';

const HOSTS_LOCALES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
]);

const DIRECCIONES_LOCALES = new Set([
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
]);

const normalizarHostname = (hostname = '') => String(hostname).toLowerCase().replace(/^\[|\]$/g, '');

const esDesarrollo = () => process.env.NODE_ENV !== 'production';

const esDireccionLocal = (req) => {
  const direccion = req.socket?.remoteAddress || req.ip || '';
  return DIRECCIONES_LOCALES.has(direccion);
};

const esSolicitudLocalSinOrigin = (req, origin) => {
  if (origin || !esDesarrollo()) return false;

  return HOSTS_LOCALES.has(normalizarHostname(req.hostname)) && esDireccionLocal(req);
};

const logDiagnosticoCatalogo = (req, origin) => {
  if (!esDesarrollo()) return;

  console.log('[catalogo-naucalpan][origin-check]', {
    metodo: req.method,
    origin: origin || '(sin Origin)',
    host: req.get('Host'),
    hostname: req.hostname,
    referer: req.get('Referer'),
    forwardedHost: req.get('X-Forwarded-Host'),
    remoteAddress: req.socket?.remoteAddress,
    url: req.originalUrl,
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

const aplicarHeadersCorsCatalogo = (res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', METODOS_CATALOGO_PERMITIDOS);
  res.setHeader('Access-Control-Allow-Headers', HEADERS_CATALOGO_PERMITIDOS);
  res.vary('Origin');
};

const validarOrigenCatalogo = (req, res, next) => {
  const origin = req.get('Origin');

  logDiagnosticoCatalogo(req, origin);

  if (esSolicitudLocalSinOrigin(req, origin)) {
    limpiarHeadersCorsCatalogo(res);

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  }

  if (!origin || !ORIGENES_CATALOGO_PERMITIDOS.has(origin)) {
    return responderOrigenNoAutorizado(res);
  }

  aplicarHeadersCorsCatalogo(res, origin);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return next();
};

module.exports = {
  ORIGENES_CATALOGO_PERMITIDOS,
  validarOrigenCatalogo,
};
