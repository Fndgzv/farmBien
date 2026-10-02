# Revisión de categorías de medico-consultorio

Fecha: 1 de octubre de 2026.

Se adaptó la selección de medicamentos a los nombres actuales: `M - Antibiótico`, `M - IV`, `M - VI`, las categorías que empiezan con `M - VI ` y `M - Suplementos`. Para Suplementos se conserva la búsqueda por prefijo que ya existía, ahora con `m - suplementos`. El cambio ejecutable se limita a los nombres y prefijos en los filtros de frontend y backend. No se ejecutaron migraciones ni escrituras en una base de datos.

La ampliación a VI y Suplementos mantiene el ajuste anterior de Antibiótico e IV. La coincidencia de VI sigue exigiendo fin de nombre o espacio antes del texto adicional: admite `M - VI pediátrico` y `M - VI / Pastillas refrescantes`, pero no `M - VII`, `M - VIExtra` ni `M - VI/Pastillas`.

## Archivos modificados o añadidos

| Archivo | Cambio |
| --- | --- |
| [medico-consultorio.component.ts](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2661) | El filtro del selector admite las cuatro categorías con `M - ` y los prefijos correspondientes, aplicando la normalización existente. |
| [productoController.js](D:/farmBien/backBien/controllers/productoController.js:1738) | Actualiza las categorías normalizadas, regex y comentarios declarados en `buscarMedicamentosReceta`. Conserva composición de consulta, búsqueda, orden, límite y respuesta. Véase el hallazgo previo sobre esta consulta más abajo. |
| [medico-consultorio.component.spec.ts](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.spec.ts) | Amplía las pruebas del selector, guardado, reanudación, edición, finalización, históricos e impresión a VI, Suplementos y sus prefijos. |
| [medicoConsultorio.categorias.test.js](D:/farmBien/backBien/test/medicoConsultorio.categorias.test.js) | Amplía las pruebas de normalización, búsqueda, persistencia de recetas, lectura, reanudación, finalización y paciente de paso a todas las categorías renombradas. |
| [run.js](D:/farmBien/backBien/test/run.js) | Incorporó las pruebas al comando habitual `npm test` en el ajuste anterior; esta ampliación no modifica el runner. |
| [Este informe](D:/farmBien/output/revision-categorias-medico-consultorio.md) | Documenta dependencias, históricos, referencias conservadas, pruebas y limitaciones. |

No se creó un módulo de constantes: la función `categoriaMedicamentoPermitida` ya concentra la decisión del frontend y `filtroCategoria` agrupa las categorías declaradas en backend. Compartir valores entre proyectos independientes requeriría una refactorización innecesaria para este ajuste.

## Referencias del flujo y decisiones

| Referencia original | Ubicación | Decisión |
| --- | --- | --- |
| `categoria === 'antibiotico'` | [Filtro del selector, línea 2664](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2664) | Cambiada a `m - antibiotico`. |
| `categoria === 'iv'` | [Filtro del selector, línea 2665](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2665) | Cambiada a `m - iv`. |
| `{ categoriaNorm: "antibiotico" }` | [Buscador backend, línea 1746](D:/farmBien/backBien/controllers/productoController.js:1746) | Cambiada a `m - antibiotico`. |
| `{ categoriaNorm: "iv" }` | [Buscador backend, línea 1747](D:/farmBien/backBien/controllers/productoController.js:1747) | Cambiada a `m - iv`. |
| `categoria === 'vi'` | [Filtro del selector, línea 2666](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2666) | Cambiada a `m - vi`. |
| `categoria.startsWith('vi ')` | [Filtro del selector, línea 2667](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2667) | Cambiada a `m - vi `, conservando el espacio antes del sufijo. |
| Igualdad y `startsWith('suplementos')` | [Filtro del selector, línea 2668](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2668) | Cambiadas a `m - suplementos`, manteniendo la regla anterior de prefijo. |
| `{ categoriaNorm: "vi" }` y regex `^vi\s+` | [Buscador backend, línea 1748](D:/farmBien/backBien/controllers/productoController.js:1748) | Cambiadas a `m - vi` y `^m - vi\s+`. |
| Regex de suplementos | [Buscador backend, línea 1750](D:/farmBien/backBien/controllers/productoController.js:1750) | Se añadió `m - ` conservando la condición anterior de espacio o fin después del nombre. |
| Comentarios de las categorías admitidas | [Buscador backend, línea 1739](D:/farmBien/backBien/controllers/productoController.js:1739) | Actualizados para describir los nombres nuevos. |
| `.includes('antibiotico')` | [recetaTieneAntibiotico, línea 2675](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:2675) | Conservada: reconoce tanto el nombre anterior como el nuevo y mantiene la regla de impresión. No exige igualdad con la categoría antigua. |
| Llamadas a `recetaTieneAntibiotico` | [Línea 1776](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:1776), [línea 3699](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:3699), [línea 3741](D:/farmBien/frontFarm/src/app/pages/medico-consultorio/medico-consultorio.component.ts:3741) | Sin cambios: conservan el cálculo de una/dos copias y la opción de forzar una copia. |

No se encontraron más comparaciones con las categorías antiguas en el código de ejecución de este flujo. Se buscaron también minúsculas, variantes sin acento, coincidencias parciales, expresiones regulares y usos de `categoria`/`categoriaNorm`.

## Dependencias revisadas

- El componente y su HTML/CSS: buscador con debounce, sugerencias, selección, captura libre, validación, armado del payload, vista de receta e impresión. El HTML usa el nombre o ingrediente del producto; no filtra categorías. El CSS no contiene lógica de categorías. El modal de receta pertenece al mismo componente.
- [ProductoService](D:/farmBien/frontFarm/src/app/services/producto.service.ts:237) → [ruta buscar-medicamentos](D:/farmBien/backBien/routes/productoRoutes.js:62) → `buscarMedicamentosReceta`. El servicio transmite texto y límite; recibe `categoriaNorm` para el filtro del selector.
- [RecetasService](D:/farmBien/frontFarm/src/app/services/recetas.service.ts) → [rutas de recetas](D:/farmBien/backBien/routes/recetas.routes.js) → [controlador de recetas](D:/farmBien/backBien/controllers/recetas.controller.js) → [Receta](D:/farmBien/backBien/models/Receta.js). Guardado, actualización y consulta usan IDs y campos de tratamiento; no comparan las categorías antiguas.
- [FichasConsultorioService](D:/farmBien/frontFarm/src/app/services/fichas-consultorio.service.ts) → [rutas de fichas](D:/farmBien/backBien/routes/fichasConsultorio.routes.js) → [controlador de fichas](D:/farmBien/backBien/controllers/fichasConsultorio.controller.js) → [FichaConsultorio](D:/farmBien/backBien/models/FichaConsultorio.js). Reanudar, llamar, guardar servicios/conceptos y finalizar distinguen servicios médicos de otros conceptos; no necesitan reconocer ninguna de las categorías renombradas por igualdad.
- Recarga de receta: `reanudar`/`llamar` → reinicio del formulario → carga de expediente → `cargarRecetaGuardadaAlReanudar` → `aplicarRecetaGuardadaEnFormulario`. La precarga no aplica el filtro del catálogo, por lo que no elimina medicamentos históricos.
- Servicios médicos, certificado y pacientes: servicios Angular, modelos, rutas/controladores asociados y [CertificadoMedicoComponent](D:/farmBien/frontFarm/src/app/components/certificado-medico/certificado-medico.component.ts). No se encontraron dependencias de las categorías renombradas. Se conserva la distinción de `Servicio Médico` y la farmacia activa.
- Continuación en caja: [ventas.component.ts](D:/farmBien/frontFarm/src/app/pages/ventas/ventas.component.ts), [ventaController.js](D:/farmBien/backBien/controllers/ventaController.js), [Venta](D:/farmBien/backBien/models/Venta.js), [InventarioFarmacia](D:/farmBien/backBien/models/InventarioFarmacia.js) y búsquedas de productos/inventario. Las reglas pertinentes distinguen `Servicio Médico` y `Recargas` o usan IDs; no dependen de igualdad con las categorías antiguas.
- [Producto](D:/farmBien/backBien/models/Producto.js) genera `categoriaNorm` desde `categoria` en guardado y actualizaciones. La normalización existente conserva el prefijo `m - `. No se modificó el modelo ni se recalcularon datos almacenados.

## Compatibilidad histórica

La conclusión siguiente procede de los esquemas y rutas de escritura/lectura, no de una inspección de la base de datos real:

| Documento | Información almacenada | Compatibilidad |
| --- | --- | --- |
| `Receta.medicamentos` | ID de producto, nombre libre y tratamiento. El esquema no define `categoria`. | La lectura hace `populate` del producto, incluyendo su categoría actual. Reabrir no descarta medicamentos por categoría. |
| `FichaConsultorio.servicios` | ID y copia de nombre, código, categoría, precio y cantidad. | Puede conservar `Antibiótico`, `IV`, `VI`, `VI ...` y `Suplementos`. La conservación de conceptos no médicos y la reanudación ya funcionan con esas copias. |
| `Venta.productos` | ID y copia de categoría, cantidades y precios. | Puede conservar categorías antiguas. No fue necesario reescribirlas para el flujo del consultorio. |
| Receta temporal de paciente de paso | La respuesta de finalización incorpora la categoría actual del producto para impresión. | No se guarda en historial clínico. Se comprobó con las cuatro categorías nuevas y ejemplos con sufijos. |

Aunque `finalizarConsulta` incluye `categoria` en su objeto intermedio de medicamentos, el esquema estricto de `Receta` la omite al persistir. Las pruebas utilizan el esquema real para verificarlo. Si una respuesta histórica contiene una copia de categoría, la construcción de impresión ya la admite y la detección de antibiótico sigue funcionando. No se añadió conversión ni migración porque la lectura actual es compatible.

No se afirma que existan documentos concretos con estas categorías en producción: no se consultó esa base de datos.

## Coincidencias antiguas conservadas fuera del flujo

Se revisaron individualmente los resultados de las búsquedas globales en `frontFarm/src` y el código fuente de `backBien`, incluidos los nombres antiguos entre comillas simples/dobles, sus variantes normalizadas y prefijos. Se excluyeron dependencias, lockfiles y compilados.

| Archivo o grupo | Motivo de conservación |
| --- | --- |
| [ajuste-masivo-precios-farma.js](D:/farmBien/backBien/scripts/ajuste-masivo-precios-farma.js:50) | Script manual que ajusta precios de una farmacia. No es invocado por las rutas del consultorio; cambiarlo ampliaría el alcance a precios. |
| [ajuste-precios-VI-exacto.js](D:/farmBien/backBien/scripts/ajuste-precios-VI-exacto.js:48) | Igualdad `VI` y mensaje de un script manual de precios. Fuera del flujo; no se modificó ni ejecutó. |
| [poblar_ingreActivo.js](D:/farmBien/backBien/scripts/poblar_ingreActivo.js:28) | Script manual de población de datos, con igualdad `Antibiótico` y regex `^IV( \|$)`. No es una dependencia de ejecución del consultorio. No se ejecutó ni modificó. |
| [borrar-lotes-categorias.js](D:/farmBien/backBien/scripts/borrar-lotes-categorias.js:28) | Categorías dentro de un bloque comentado de un script de eliminación de lotes. |
| [poner-en-cero-farmacia-categoria.js](D:/farmBien/backBien/scripts/poner-en-cero-farmacia-categoria.js:79) | Mensaje antiguo `IV/iv` y nombres auxiliares en un script manual de existencias; no determina el filtro actual ni interviene en el consultorio. |
| [zero-existencia-categoria.js](D:/farmBien/backBien/scripts/zero-existencia-categoria.js:42) | Regex parcial `^Antibió`, mensajes y comentarios de un script manual que pone existencias en cero. Fuera del alcance. |
| [exportar-viabilidad.js](D:/farmBien/backBien/scripts/exportar-viabilidad.js:78) y [sus pruebas](D:/farmBien/backBien/test/exportarViabilidad.test.js) | Exportación independiente; la clasificación usa la subcadena `antibiot`, que ya reconoce el nombre nuevo. Las pruebas conservan ejemplos anteriores. |
| [Clasificación VI en exportar-viabilidad.js](D:/farmBien/backBien/scripts/exportar-viabilidad.js:106) | La regex `^vi` pertenece a una exportación independiente, no invocada por el consultorio. Se conserva por alcance. La subcadena `suplement` de ese mismo exportador ya admite `M - Suplementos`. |
| [catalogo.component.ts](D:/farmBien/frontFarm/src/app/pages/catalogo/catalogo.component.ts:13) | `Vitaminas y suplementos` es texto de presentación de otro componente; no es una comparación de categoría del consultorio. |
| [ajusteInventario.ubicacionFarmacia.test.js](D:/farmBien/backBien/test/ajusteInventario.ubicacionFarmacia.test.js:56) | Prueba texto de ubicación física, acentos y búsqueda parcial; no clasificación de medicamentos del consultorio. |
| [ajusteInventario.stockAuto.test.js](D:/farmBien/backBien/test/ajusteInventario.stockAuto.test.js:54) | Datos de prueba para distinguir nombres exactos, prefijos y campos normalizados desactualizados. |
| [producto.actualizacionMasiva.test.js](D:/farmBien/backBien/test/producto.actualizacionMasiva.test.js:14) y [ajustes-inventario.component.spec.ts](D:/farmBien/frontFarm/src/app/pages/ajustes-inventario/ajustes-inventario.component.spec.ts:14) | `IV` es el dato inicial de pruebas que precisamente verifican el cambio a `M - IV`. |
| Nuevas pruebas de consultorio | Usan nombres antiguos para verificar compatibilidad histórica y que el selector no sigue esperando el catálogo anterior. |

## Pruebas y resultados

- Frontend: `npm test -- --watch=false --browsers=ChromeHeadless --include=src/app/pages/medico-consultorio/medico-consultorio.component.spec.ts`: **19/19 aprobadas** (antes 8; se amplió la cobertura a VI y Suplementos).
- Backend: `npm test`: **79/79 aprobadas**, incluidas **14 de categorías del consultorio** (antes 9).
- Compilación: `npm run build -- --configuration development --output-path ../tmp/medico-consultorio-build`: **correcta**. No sobrescribe `backBien/public`.
- `git diff --check`: **sin errores**.
- Búsqueda final: literales `Antibiótico`, `IV`, `VI`, `Suplementos`, prefijos y regex, complementados por búsquedas sin distinguir mayúsculas, sin acentos y parciales. Las coincidencias relevantes se explican arriba. En el código de ejecución del consultorio no quedan filtros esperando los nombres anteriores.

En el ajuste anterior se comprobó que ChromeHeadless y el compilador no podían iniciar subprocesos bajo el sandbox (`spawn EPERM`); esta validación utilizó el permiso correspondiente y ambos terminaron correctamente. Para las pruebas Node se utilizó el runner habitual del repositorio, que no requiere iniciar otro proceso de prueba.

| Caso solicitado | Cobertura realizada |
| --- | --- |
| 1. M - Antibiótico | Normalización real del modelo; búsqueda backend por nombre/código; resultado y selección frontend. |
| 2. M - IV | Normalización real del modelo; búsqueda backend por nombre/ingrediente; resultado y selección frontend. |
| 3. Buscar y seleccionar | Ejecución del debounce, filtro de resultados y selección del componente con las cuatro categorías y ejemplos con sufijos. |
| 4. Agregar a receta | Captura de cada producto y de un medicamento externo, conservando tratamiento y cantidades. |
| 5. Guardar | Payload frontend y controlador backend con validación del esquema real de receta; edición sobre el mismo ID. |
| 6. Reabrir/precargar | Lectura con producto poblado, precarga con ID/nombre, copias de categorías históricas y reanudación de EN_ATENCION. |
| 7. Reanudar LISTA_PARA_COBRO | Flujo frontend y controlador backend, sin pérdida de medicamentos ni conceptos históricos de ficha. |
| 8. Finalizar otra vez | Actualización de la misma receta y retorno a LISTA_PARA_COBRO conservando conceptos; paciente de paso sin servicios termina ATENDIDA. |
| 9. Otras categorías | `M - VI`, `M - VI ...` y `M - Suplementos` funcionan en selector y receta. `M - Antibiótico` y `M - IV` conservan su coincidencia exacta; categorías ajenas siguen excluidas por el frontend. Se prueban los límites `M - VII`, `M - VIExtra` y `M - VI/Pastillas`. |
| 10. Literales antiguos | Búsqueda global y revisión manual: no quedan igualdades antiguas en el filtro del flujo; se conserva la detección parcial para impresión. |

Las pruebas ejecutan métodos reales del componente en ChromeHeadless y controladores/esquemas reales del backend. Los servicios HTTP, consultas y escrituras de base de datos, confirmaciones e impresión se simulan. No constituyen una sesión de extremo a extremo contra una farmacia real ni una comprobación de impresión física.

## Hallazgo previo conservado por alcance

En [productoController.js, línea 1764](D:/farmBien/backBien/controllers/productoController.js:1764), `Producto.find({ ...filtroCategoria, ...filtroTexto })` combina dos objetos que tienen la misma propiedad `$or`: el filtro de texto sobrescribe al de categoría. Por ello, las categorías declaradas en el backend no restringen actualmente la consulta efectiva; la restricción del consultorio la aplica el frontend después de recibir los resultados.

Se actualizaron los nombres declarados, pero no se cambió esta composición. Corregirla afectaría qué candidatos entran al límite de 100 resultados y podría cambiar otras categorías que hoy filtra el frontend con reglas distintas de las declaradas en backend. Por ejemplo, el frontend usa `startsWith('m - suplementos')`, mientras el filtro declarado en backend exige espacio o fin después de `m - suplementos`. Esta diferencia ya existía antes de añadir el prefijo. Se documenta para una corrección separada, respetando la instrucción de mantener el comportamiento ajeno al renombrado. Las pruebas de búsqueda backend verifican inclusión, búsqueda y orden; no afirman que ese endpoint excluya por sí mismo todas las categorías ajenas.

Si un producto fue renombrado directamente en MongoDB saltándose los hooks del modelo y conserva un `categoriaNorm` antiguo, el selector seguirá recibiendo ese valor desactualizado. No se constató ese caso en datos reales ni se aplicó una reparación masiva; la prueba de actualización del modelo confirma que la vía normal mantiene ambos campos sincronizados.

## Alcance preservado

No se modificaron transiciones de fichas, lógica de recetas, cantidades, inventarios, precios, ventas, vínculos con ventas, permisos, farmacia activa, servicios médicos ni certificado médico. Tampoco se cambiaron diseño, arquitectura o esquemas. Los cambios de inventario y el directorio `panel-carga` que ya estaban presentes al iniciar se dejaron intactos.
