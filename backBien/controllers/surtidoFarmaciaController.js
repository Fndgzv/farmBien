const mongoose = require('mongoose');
const SurtidoFarmacia = require('../models/SurtidoFarmacia');
const Producto = require('../models/Producto');
const InventarioFarmacia = require('../models/InventarioFarmacia');

class SurtidoSinMovimientosError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SurtidoSinMovimientosError';
  }
}

const norm = (value) => String(value ?? '').toLowerCase().trim();
const containsAll = (text, query) =>
  norm(query).split(/\s+/).filter(Boolean).every((word) => norm(text).includes(word));
const cmp = (a, b) => (a > b) - (a < b);

function crearFiltro({ categoria, ubicacion, ubicacionFarmacia }) {
  return (inventario) => {
    const producto = inventario?.producto;
    if (!producto) return false;

    if (categoria && !containsAll(producto.categoria ?? '', categoria)) return false;
    if (ubicacion && !containsAll(producto.ubicacion ?? '', ubicacion)) return false;
    if (
      ubicacionFarmacia &&
      !containsAll(inventario.ubicacionFarmacia ?? '', ubicacionFarmacia)
    ) return false;

    return true;
  };
}

function obtenerInventariosBajos(inventarios, pasaFiltros) {
  return inventarios.filter((inventario) => {
    if (!pasaFiltros(inventario)) return false;

    const existencia = inventario.existencia ?? 0;
    const stockMin = inventario.stockMin ?? 0;
    const stockMax = inventario.stockMax ?? 0;
    const falta = Math.max(0, stockMax - existencia);

    return existencia <= stockMin && falta > 0;
  });
}

function crearPendientes(inventarios, omitirMap) {
  return inventarios.map((inventario) => {
    const producto = inventario.producto;
    const productoId = String(producto?._id || '');
    const falta = Math.max(0, (inventario.stockMax ?? 0) - (inventario.existencia ?? 0));
    const disponibleEnAlmacen = Array.isArray(producto?.lotes)
      ? producto.lotes.reduce((total, lote) => total + (lote.cantidad ?? 0), 0)
      : 0;

    return {
      producto: producto?._id,
      nombre: producto?.nombre,
      codigoBarras: producto?.codigoBarras,
      categoria: producto?.categoria,
      ubicacion: producto?.ubicacion,
      ubicacionFarmacia: inventario.ubicacionFarmacia || '',
      existenciaActual: inventario.existencia ?? 0,
      stockMin: inventario.stockMin ?? 0,
      stockMax: inventario.stockMax ?? 0,
      falta,
      disponibleEnAlmacen,
      podranSurtirse: Math.min(falta, disponibleEnAlmacen),
      omitir: omitirMap.has(productoId) ? omitirMap.get(productoId) : false
    };
  });
}

function ordenarPendientes(pendientes) {
  pendientes.sort((a, b) =>
    cmp(norm(a.categoria), norm(b.categoria)) ||
    cmp(norm(a.ubicacionFarmacia), norm(b.ubicacionFarmacia)) ||
    cmp(norm(a.ubicacion), norm(b.ubicacion)) ||
    cmp(norm(a.nombre), norm(b.nombre))
  );
}

function cargarInventarios(farmaciaId, session) {
  let consulta = InventarioFarmacia.find({ farmacia: farmaciaId });
  if (session) consulta = consulta.session(session);

  const populate = { path: 'producto', model: Producto };
  if (session) populate.options = { session };

  return consulta.populate(populate);
}

function construirRespuestaSurtido(surtidoDoc, productos, ubicacionesFarmacia) {
  const surtido = surtidoDoc?.toObject ? surtidoDoc.toObject() : surtidoDoc;
  if (!surtido?.items?.length) return surtido;

  surtido.items = surtido.items.map((item) => {
    const productoId = String(item.producto?._id || item.producto || '');
    const producto = productos.get(productoId);

    return {
      ...item,
      producto: producto
        ? {
            _id: producto._id,
            nombre: producto.nombre,
            codigoBarras: producto.codigoBarras,
            categoria: producto.categoria,
            ubicacion: producto.ubicacion
          }
        : item.producto,
      ubicacionFarmacia: ubicacionesFarmacia.get(productoId) || ''
    };
  });

  surtido.items.sort((a, b) =>
    cmp(norm(a.producto?.categoria), norm(b.producto?.categoria)) ||
    cmp(norm(a.producto?.ubicacion), norm(b.producto?.ubicacion)) ||
    cmp(norm(a.producto?.nombre), norm(b.producto?.nombre))
  );

  return surtido;
}

exports.surtirFarmacia = async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({
        ok: false,
        mensaje: 'Solo administradores pueden surtir farmacias'
      });
    }

    const {
      farmaciaId,
      confirm = false,
      detalles = [],
      categoria,
      ubicacion,
      ubicacionFarmacia
    } = req.body;

    if (!farmaciaId) {
      return res.status(400).json({ ok: false, mensaje: 'La farmacia es obligatoria.' });
    }

    const filtros = { categoria, ubicacion, ubicacionFarmacia };
    const pasaFiltros = crearFiltro(filtros);
    const omitirMap = new Map();
    if (Array.isArray(detalles)) {
      for (const detalle of detalles) {
        if (detalle?.producto) {
          omitirMap.set(String(detalle.producto), Boolean(detalle.omitir));
        }
      }
    }

    const filtrosRespuesta = {
      categoria: categoria ?? null,
      ubicacion: ubicacion ?? null,
      ubicacionFarmacia: ubicacionFarmacia ?? null
    };

    if (!confirm) {
      const inventarios = await cargarInventarios(farmaciaId);
      const bajos = obtenerInventariosBajos(inventarios, pasaFiltros);
      const pendientes = crearPendientes(bajos, omitirMap);
      ordenarPendientes(pendientes);
      return res.json({ ok: true, filtros: filtrosRespuesta, pendientes });
    }

    const session = await mongoose.startSession();
    let surtidoRespuesta;
    let pendientes = [];

    try {
      // withTransaction es el unico responsable de iniciar, confirmar, abortar y
      // reintentar la transaccion. No se llama abortTransaction manualmente.
      await session.withTransaction(async () => {
        // Estas variables pertenecen a un intento. MongoDB puede volver a ejecutar
        // este callback ante un conflicto de escritura.
        const items = [];
        const productos = new Map();
        const ubicacionesFarmacia = new Map();

        const inventariosTx = await cargarInventarios(farmaciaId, session);
        const bajosTx = obtenerInventariosBajos(inventariosTx, pasaFiltros);
        pendientes = crearPendientes(bajosTx, omitirMap);
        ordenarPendientes(pendientes);

        for (const inventario of bajosTx) {
          const producto = inventario.producto;
          if (!producto) continue;

          const productoId = String(producto._id);
          if (omitirMap.get(productoId) === true) continue;

          let restante = Math.max(
            0,
            (inventario.stockMax ?? 0) - (inventario.existencia ?? 0)
          );
          if (restante <= 0) continue;

          const disponible = Array.isArray(producto.lotes)
            ? producto.lotes.reduce((total, lote) => total + (lote.cantidad ?? 0), 0)
            : 0;
          if (disponible <= 0) continue;

          producto.lotes.sort(
            (a, b) => new Date(a.fechaCaducidad) - new Date(b.fechaCaducidad)
          );

          let transferido = 0;
          for (const lote of producto.lotes) {
            if (restante <= 0) break;

            const existenciaLote = Math.max(0, lote.cantidad ?? 0);
            if (existenciaLote <= 0) continue;

            const cantidad = Math.min(existenciaLote, restante);
            lote.cantidad = existenciaLote - cantidad;
            restante -= cantidad;
            transferido += cantidad;

            items.push({
              producto: producto._id,
              lote: lote.lote || 'SIN-LOTE',
              cantidad,
              precioUnitario: inventario.precioVenta ?? producto.precio ?? 0
            });
          }

          if (transferido > 0) {
            await producto.save({ session });
            inventario.existencia = Math.min(
              (inventario.existencia ?? 0) + transferido,
              inventario.stockMax ?? Infinity
            );
            await inventario.save({ session });

            productos.set(productoId, producto);
            ubicacionesFarmacia.set(productoId, inventario.ubicacionFarmacia || '');
          }
        }

        if (items.length === 0) {
          throw new SurtidoSinMovimientosError(
            'No hubo movimientos: sin existencia en almacén o todos marcados como "omitir".'
          );
        }

        const [surtidoDoc] = await SurtidoFarmacia.create([{
          farmacia: farmaciaId,
          usuarioSurtio: req.usuario.id,
          tipoMovimiento: 'surtido',
          items
        }], { session });

        // Se prepara la respuesta antes del commit. De este modo, una excepcion al
        // enriquecer u ordenar tambien revierte todos los cambios.
        surtidoRespuesta = construirRespuestaSurtido(
          surtidoDoc,
          productos,
          ubicacionesFarmacia
        );
      });

      return res.json({
        ok: true,
        mensaje: 'Farmacia surtida correctamente (solo con cantidades disponibles y sin omitir).',
        filtros: filtrosRespuesta,
        pendientes,
        surtido: surtidoRespuesta
      });
    } catch (errorTransaccion) {
      if (errorTransaccion instanceof SurtidoSinMovimientosError) {
        return res.status(400).json({
          ok: false,
          mensaje: 'No se realizó el surtido.',
          detalle: errorTransaccion.message,
          pendientes
        });
      }

      console.error('Error en transaccion de surtido de farmacia:', {
        farmaciaId,
        usuarioId: req.usuario.id,
        error: errorTransaccion
      });

      return res.status(500).json({
        ok: false,
        mensaje: 'Error interno al surtir farmacia',
        error: 'No fue posible completar la transaccion de surtido.'
      });
    } finally {
      try {
        await session.endSession();
      } catch (errorFinSesion) {
        console.error('Error al finalizar la sesion de surtido de farmacia:', {
          farmaciaId,
          usuarioId: req.usuario.id,
          error: errorFinSesion
        });
      }
    }
  } catch (error) {
    console.error('Error en surtirFarmacia:', error);
    return res.status(500).json({
      ok: false,
      mensaje: 'Error interno al surtir farmacia',
      error: 'No fue posible procesar la solicitud de surtido.'
    });
  }
};
