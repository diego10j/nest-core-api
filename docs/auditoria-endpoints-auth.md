# Auditoría de endpoints y autenticación

Generado cruzando los controllers de este repo con las URLs que consumen `react-front-erp` y `page-diquimec` (búsqueda estática de literales `api/...`; no detecta URLs armadas dinámicamente).

## Resumen

- Rutas HTTP en el backend: **1285**
- Con `@Auth()` (antes del guard global): 554
- `@Public()` (ahora): **26**
- Sin decorador alguno antes del cambio: **718** (ahora cubiertas por el guard global)
- Rutas que ningún front consume (ver final): 301

## Guard global + validación de headers

`JwtAuthGuard` (APP_GUARD) exige access token en todo endpoint salvo `@Public()` y valida que `X-Ide-Usua`, `X-Login`, `X-Ide-Empr`, `X-Ide-Sucu` y `X-Ide-Perf` coincidan con el contenido del token (usuario, login, empresas, sucursales y perfiles autorizados). Un header ausente no se valida (lo exige `@AppHeaders()` donde hace falta); uno presente que no corresponde devuelve 403. Los endpoints con `@Auth()` siguen exigiéndose aunque el modo sea `warn`.

`AUTH_GUARD_MODE=warn` (env) solo registra en el log lo que rechazaría, para el primer despliegue; `enforce` (por defecto) rechaza.

## Endpoints `@Public()` y por qué

| Ruta | Motivo | Consumidor |
|---|---|---|
| `POST /api/auth/login` | login | react-front-erp |
| `POST /api/auth/refresh` | renovar token (protegido por JwtRefreshGuard) | react-front-erp |
| `POST /api/auth/validarHorarioLogin` | se consulta antes de tener token | react-front-erp |
| `GET /api/inventario/catalogos/getListaCatalogos` | catálogo público del portal | page-diquimec, react-front-erp |
| `GET /api/inventario/catalogos/buscarCatalogos` | catálogo público del portal | page-diquimec |
| `GET /api/inventario/catalogos/getCatalogoByPath` | catálogo público del portal | page-diquimec, react-front-erp |
| `GET /api/inventario/catalogos/getTagsCatalogo/:ideInccat` | catálogo público del portal | page-diquimec, react-front-erp |
| `GET /api/inventario/catalogos/downloadImagenCatalogo/:fileName` | catálogo público del portal | page-diquimec, react-front-erp |
| `GET /api/inventario/html-product/downloadImagen/:fileName` | imagen por <img> | — |
| `POST /api/inventario/productos/consulta-ia` | chat público del portal | page-diquimec |
| `POST /api/proformas/createProformaWeb` | ¿lo usa algún front? ninguno de los 2 repos auditados | — |
| `POST /api/quimia/telegram/webhook/:ide_tlcue` | lo invoca Telegram (valida secret token) | — |
| `GET /api/sistema/base-conocimiento/downloadArchivo/:uuid` | descarga por enlace directo | react-front-erp |
| `GET /api/sistema/files/image/tesoreria/:imageName` | imagen/archivo cargado por <img> o fetch sin header | — |
| `GET /api/sistema/files/image/:imageName` | imagen/archivo cargado por <img> o fetch sin header | page-diquimec, react-front-erp |
| `GET /api/sistema/files/downloadFile/:uuid` | imagen/archivo cargado por <img> o fetch sin header | — |
| `GET /api/sistema/files/imageTmp/:imageName` | imagen/archivo cargado por <img> o fetch sin header | react-front-erp |
| `GET /api/sistema/usuarios/getAvatar/:fileName` | avatar por <img> | react-front-erp |
| `GET /api/tesoreria/comprobante-banco/downloadComprobante/:fileName` | imagen por <img> | react-front-erp |
| `GET /api/ventas/transportes/downloadImagenEnvio/:fileName` | imagen por <img> | react-front-erp |
| `GET /api/ventas/transportes/downloadLogoTransporte/:fileName` | imagen por <img> | react-front-erp |
| `GET /api/whatsapp/media/:filename` | adjunto cargado por <img>/<audio> | — |
| `GET /api/whatsapp/download/:id` | adjunto cargado por <img>/<audio> | react-front-erp |
| `GET /api/whatsapp/getServeFile/:filename` | adjunto cargado por <img>/<audio> | react-front-erp |
| `GET /api/webhook/ycloud` | lo invoca YCloud | — |
| `POST /api/webhook/ycloud` | lo invoca YCloud | — |

Para revisar más adelante: `downloadFile/:uuid`, `downloadArchivo/:uuid`, `whatsapp/media|download|getServeFile` quedan públicos porque el front los carga sin `Authorization`. Lo correcto a mediano plazo es servirlos con URL firmada de corta vida, o pedirlos con `fetch` + token y usar un blob URL.

## Lo que consume `page-diquimec` (todo debe seguir público)

- `/api/inventario/catalogos/buscarCatalogos`
- `/api/inventario/catalogos/downloadImagenCatalogo/:fileName`
- `/api/inventario/catalogos/getCatalogoByPath`
- `/api/inventario/catalogos/getListaCatalogos`
- `/api/inventario/catalogos/getTagsCatalogo/:ideInccat`
- `/api/inventario/productos/consulta-ia`
- `/api/sistema/files/image/:imageName`

`/api/sistema/files/image/:imageName` **no era** `@Public()` antes: sin este cambio el portal habría recibido 401 en las imágenes de producto.

## Llamadas del front sin ruta en el backend

`react-front-erp` llama a estas URLs y no se encontró un controller que las declare (algunas son mocks de la plantilla: `chat`, `kanban`, `calendar`, `mail/list`, `post/*`, `product/*`, `auth/sign-up`). Verificar antes de asumir que están rotas: `inventario/productos/{getComprasMensuales, getTopProveedores, getVariacionPreciosCompras, getTopClientes, getProveedores, getProformasMensuales, chartVentasPeriodo, getProductoByUuId}`, `ventas/transportes/setActivoTarifaTransporte`, `whatsapp/{getProfilePicture,getQr,getStatus}`, `ycloud/{send-template,check-window,assign-agent}`, `mail/sendMail`, `compras/proveedores/deleteCtaBancoProveedor`, `contabilidad/plan-cuentas/delete`, `importaciones/deleteDocumento`, `inventario/alibaba/processUrlAlibaba`.

## Rutas que ningún front consume

Candidatas a eliminar, o a restringir con `@Auth(roles)`. Pueden ser usadas por integraciones externas (rpa, proialab, n8n…) que no están en los repos auditados: confirmar antes de borrar.

- `core/auth/auth.controller.ts`: `GET auth/check-status`
- `core/charts/charts.controller.ts`: `POST charts/radialBar`, `POST charts/pie`, `POST charts/donut`
- `core/core.controller.ts`: `GET core/search`, `GET core/getTableColumns`, `POST core/refreshTableColumns`, `POST core/clearCacheRedis`
- `core/email/controllers/adjunto.controller.ts`: `POST adjuntos-correo/upload`, `GET adjuntos-correo/:ide_adco/download`, `GET adjuntos-correo/por-referencia`, `DELETE adjuntos-correo/:ide_adco`
- `core/email/controllers/campaign.controller.ts`: `GET campaigns`, `GET campaigns/:id`, `POST campaigns`, `POST campaigns/:id/process`, `POST campaigns/schedule`
- `core/email/controllers/mail.controller.ts`: `POST mail/send`, `POST mail/process-queue`, `GET mail/getCuentasCorreo`, `GET mail/getCuentaCorreoPorDefecto`, `POST mail/sendTest`
- `core/email/controllers/template.controller.ts`: `GET templates`, `GET templates/:id`, `POST templates`, `PUT templates/:id`, `DELETE templates/:id`
- `core/integration/gpt/gpt.controller.ts`: `POST gpt/orthography-check`, `POST gpt/pros-cons-discusser`, `POST gpt/pros-cons-discusser-stream`, `POST gpt/translate`, `GET gpt/text-to-audio/:fileId`, `POST gpt/text-to-audio`, `POST gpt/audio-to-text`, `POST gpt/image-generation`, `GET gpt/image-generation/:filename`, `POST gpt/image-variation`
- `core/modules/compras/proveedor/proveedor.controller.ts`: `GET compras/proveedores/getCuentaContableProveedor`, `GET compras/proveedores/getMovimientosCuentaProveedor`, `GET compras/proveedores/getComprasMensualesProveedor`, `GET compras/proveedores/getDetalleComprasProveedor`, `GET compras/proveedores/getArbolProveedores`, `GET compras/proveedores/getListDataAniosCompras`, `GET compras/proveedores/getListDataCuentasPorPagarProveedor`, `POST compras/proveedores/saveProveedor`, `POST compras/proveedores/setCuentaContableProveedor`, `POST compras/proveedores/saveTrnProveedor`, `GET compras/proveedores/searchCabeceraTrnProveedor`
- `core/modules/contabilidad/comprobante-contabilidad/comprobante-contabilidad.controller.ts`: `POST contabilidad/comprobante/reversar`
- `core/modules/contabilidad/plan-cuentas/plan-cuentas.controller.ts`: `GET contabilidad/plan-cuentas/getCabPlanCuentaActivo`, `GET contabilidad/plan-cuentas/findCabById`, `DELETE contabilidad/plan-cuentas/deleteCabPlanCuentas`, `GET contabilidad/plan-cuentas/getArbolPlanCuentas`, `GET contabilidad/plan-cuentas/getCuentasHijas`, `GET contabilidad/plan-cuentas/getCuentasPorTipo`, `GET contabilidad/plan-cuentas/searchCuentaContable`, `GET contabilidad/plan-cuentas/getTiposCuenta`, `GET contabilidad/plan-cuentas/getUltimoNivelCuentas`, `GET contabilidad/plan-cuentas/isCuentaHija`, `GET contabilidad/plan-cuentas/findDetById`, `DELETE contabilidad/plan-cuentas/deleteDetPlanCuentas`
- `core/modules/cuentas-por-pagar/documentos-cxp.controller.ts`: `GET cuentas-por-pagar/documentos/getTipoDocumentoLiquidacionCompra`, `GET cuentas-por-pagar/documentos/getDocumentosAnulados`, `GET cuentas-por-pagar/documentos/getDocumentosNoRetencion`, `GET cuentas-por-pagar/documentos/getComprasMensuales`, `GET cuentas-por-pagar/documentos/getNotasCreditoMensuales`, `GET cuentas-por-pagar/documentos/getComprasDetalladasMensuales`, `GET cuentas-por-pagar/documentos/getTotalComprasMensuales`, `GET cuentas-por-pagar/documentos/getSaldosProveedores`, `GET cuentas-por-pagar/documentos/getListDataTipoIva`, `GET cuentas-por-pagar/documentos/getListDataMeses`, `GET cuentas-por-pagar/documentos/getListDataAniosFacturacion`, `GET cuentas-por-pagar/documentos/getPorcentajeIva`
- `core/modules/cuentas-por-pagar/retenciones-cxp.controller.ts`: `POST cuentas-por-pagar/retenciones/enviarSRI`
- `core/modules/importaciones/importaciones.controller.ts`: `GET importaciones/getTableQueryIncoterm`, `GET importaciones/getTableQueryEstadoOrden`, `GET importaciones/getTableQueryTipoCosto`, `GET importaciones/getTableQueryTipoDocumento`, `GET importaciones/getTableQueryTipoTransporte`, `GET importaciones/getTableQueryEstadoEnvio`, `GET importaciones/getTableQueryTipoAforo`
- `core/modules/inventario/bodegas/bodegas.controller.ts`: `GET inventario/bodegas/getMovimientosBodega`, `POST inventario/bodegas/updateEstadoConteo`, `POST inventario/bodegas/updateEstadoDetalleConteo`, `GET inventario/bodegas/getListDataEstadosDetalleConteo`, `GET inventario/bodegas/getUltimaFechaConteoProducto`
- `core/modules/inventario/categorias/categorias.controller.ts`: `GET inventario/categorias/getEtiquetasByCategoria`, `POST inventario/categorias/saveEtiquetasCategoria`, `POST inventario/categorias/deleteEtiquetaCategoria`
- `core/modules/inventario/comprobantes/comprobantes.controller.ts`: `POST inventario/comprobantes/saveDetInvEgreso`, `POST inventario/comprobantes/anularComprobante`
- `core/modules/inventario/data-bi/inventario-bi.controller.ts`: `GET inventario/data-bi/getTopProductosVendidos`, `GET inventario/data-bi/getTopProductosMayorRotacion`, `GET inventario/data-bi/getTotalVentasProductoPorFormaPago`, `GET inventario/data-bi/getTopVendedoresProducto`, `GET inventario/data-bi/getTotalVentasProductoPorIdCliente`, `GET inventario/data-bi/getProformasMensualesProducto`, `GET inventario/data-bi/getTotalVentasMensualesProducto`, `GET inventario/data-bi/getComprasMensuales`, `GET inventario/data-bi/getTopProveedoresProducto`, `GET inventario/data-bi/getTendenciaVentasDiaProducto`, `GET inventario/data-bi/getResumenVentasPeriodosProducto`, `GET inventario/data-bi/getAnalisisBodegasMensual` … (+4)
- `core/modules/inventario/etiquetas/etiquetas.controller.ts`: `GET inventario/etiquetas/getEtiquetas`, `GET inventario/etiquetas/getEtiquetasByProducto`, `GET inventario/etiquetas/getEtiquetaProducto`, `GET inventario/etiquetas/getEtiquetasByTipo`, `GET inventario/etiquetas/getTiposEtiqueta`, `POST inventario/etiquetas/saveEtiqueta`, `POST inventario/etiquetas/deleteEtiqueta`, `POST inventario/etiquetas/confirmarImpresion`, `GET inventario/etiquetas/getMetricasEtiquetas`, `GET inventario/etiquetas/getEtiquetasPorExpiracionMeses`
- `core/modules/inventario/html-product/html-product.controller.ts`: `GET inventario/html-product/downloadImagen/:fileName`
- `core/modules/inventario/menudeo/menudeo.controller.ts`: `GET inventario/menudeo/getTipoCompMenudeo`, `GET inventario/menudeo/getTipoTranMenudeo`, `GET inventario/menudeo/getTipoTranByTipoComp`, `GET inventario/menudeo/getFormas`, `GET inventario/menudeo/getInsumosForma`, `GET inventario/menudeo/getPresentacionesProducto`, `GET inventario/menudeo/getFormasDisponiblesProducto`, `GET inventario/menudeo/getProductosConMenudeo`, `GET inventario/menudeo/getProductosEstadoMenudeo`, `GET inventario/menudeo/getProductosSinComprobantesMenudeo`, `GET inventario/menudeo/getAlertasStockMenudeo`, `GET inventario/menudeo/getStockMenudeo` … (+32)
- `core/modules/inventario/productos/productos.controller.ts`: `GET inventario/productos/getProductoByUuid`, `GET inventario/productos/getVentasProductoUtilidad`, `GET inventario/productos/getStockMenudeoProducto`, `GET inventario/productos/getProveedoresProducto`, `GET inventario/productos/getTopClientesProducto`, `GET inventario/productos/getCostoProducto`, `GET inventario/productos/getLotesProducto`
- `core/modules/proformas/proformas.controller.ts`: `POST proformas/createProformaWeb`, `POST proformas/updateOpenSolicitud`
- `core/modules/quimia/quimia.controller.ts`: `POST quimia/preguntar`
- `core/modules/quimia/telegram/telegram.controller.ts`: `POST quimia/telegram/webhook/:ide_tlcue`
- `core/modules/sistema/files/files.controller.ts`: `GET sistema/files/image/tesoreria/:imageName`, `POST sistema/files/deleteFile/:fileName`, `POST sistema/files/uploadOriginalFile`, `GET sistema/files/downloadFile/:uuid`, `POST sistema/files/checkExistFile`, `PUT sistema/files/move`, `GET sistema/files/downloadTmpFile/:fileName`
- `core/modules/sistema/general/general.controller.ts`: `GET sistema/general/getListDataTiposDireccion`, `GET sistema/general/getListDataTiposIdentificacion`, `GET sistema/general/validateCedula`, `GET sistema/general/validateRuc`
- `core/modules/sri/cel/emisor.controller.ts`: `GET sri/cel/emisor/getEmisor`, `POST sri/cel/emisor/clearCacheEmisor`
- `core/modules/sri/cel/firma.controller.ts`: `GET sri/cel/firma/getFirma`, `GET sri/cel/firma/getFirmas`, `POST sri/cel/firma/clearCacheFirma`
- `core/modules/talento-humano/mensualizacion/mensualizacion.controller.ts`: `GET talento-humano/mensualizacion/getSolicitudesByEmpleado`, `POST talento-humano/mensualizacion/save`
- `core/modules/tesoreria/bancos/bancos.controller.ts`: `GET tesoreria/bancos/getBancoById/:ideTeban`, `GET tesoreria/bancos/downloadFotoBanco/:fileName`, `GET tesoreria/bancos/getCuentaBancoById/:ideTecba`
- `core/modules/tesoreria/cajas/cajas.controller.ts`: `GET tesoreria/cajas/getCajaById/:ideTeban`, `GET tesoreria/cajas/downloadFotoCaja/:fileName`
- `core/modules/tesoreria/cheques/cheques.controller.ts`: `GET tesoreria/cheques/getChequesPosfechadosCxCPendientes`, `GET tesoreria/cheques/getChequesPosfechadosCxPPendientes`, `GET tesoreria/cheques/getChequesNoConciliados`
- `core/modules/tesoreria/conciliacion-bancaria/conciliacion-bancaria.controller.ts`: `GET tesoreria/conciliacion-bancaria/getResumenMensual`, `GET tesoreria/conciliacion-bancaria/getConciliaciones`, `GET tesoreria/conciliacion-bancaria/getArchivosCargados`, `GET tesoreria/conciliacion-bancaria/getConciliacion`, `GET tesoreria/conciliacion-bancaria/getMovimientosBanco`, `GET tesoreria/conciliacion-bancaria/getMovimientosErp`, `GET tesoreria/conciliacion-bancaria/getCruces`, `GET tesoreria/conciliacion-bancaria/getResumenDiferencias`, `GET tesoreria/conciliacion-bancaria/getDiferencias`, `GET tesoreria/conciliacion-bancaria/getComparacion`, `GET tesoreria/conciliacion-bancaria/descargarArchivo/:ideTecar`, `POST tesoreria/conciliacion-bancaria/crearConciliacion` … (+15)
- `core/modules/tesoreria/cxc-transacciones/cxc-transacciones.controller.ts`: `GET tesoreria/cxc-transacciones/getFacturasPendientesCliente`
- `core/modules/tesoreria/pre-libro-bancos/pre-libro-bancos.controller.ts`: `GET tesoreria/pre-libro-bancos/existeNumTransaccion`, `GET tesoreria/pre-libro-bancos/getComboTipoIdentificacion`, `GET tesoreria/pre-libro-bancos/getComboBeneficiario`, `POST tesoreria/pre-libro-bancos/reversarTransaccion`, `POST tesoreria/pre-libro-bancos/reversarChequeDevuelto`, `POST tesoreria/pre-libro-bancos/generarLibroBanco`, `POST tesoreria/pre-libro-bancos/generarLibroBancoOtros`, `POST tesoreria/pre-libro-bancos/generarDepositoCaja`, `POST tesoreria/pre-libro-bancos/generarTransaccion`, `POST tesoreria/pre-libro-bancos/crearBeneficiario`, `GET tesoreria/pre-libro-bancos/getTransaccionesConciliarCuenta`, `POST tesoreria/pre-libro-bancos/conciliarMovimientos` … (+2)
- `core/modules/tesoreria/reportes/reportes-tesoreria.controller.ts`: `GET tesoreria/reportes/getReporteCobros`, `GET tesoreria/reportes/getReportePagos`, `GET tesoreria/reportes/getDepositosCajaPendientes`
- `core/modules/ventas/clientes/clientes.controller.ts`: `GET ventas/clientes/existCliente`, `GET ventas/clientes/validarWhatsAppCliente`, `POST ventas/clientes/actualizarVendedorClientesInactivos`, `GET ventas/clientes/getSegumientoClientes`, `GET ventas/clientes/getClientesAContactar`, `GET ventas/clientes/getHistoricoVendedoresCliente`
- `core/modules/ventas/data-bi/ventas-bi.controller.ts`: `GET ventas/data-bi/getTotalVentasPorFormaPago`, `GET ventas/data-bi/getFacturasMayorValor`, `GET ventas/data-bi/getTopClientesFacturas`, `GET ventas/data-bi/getTotalClientesPorPeriodo`, `GET ventas/data-bi/getTotalClientesPorPeriodoVendedor`, `GET ventas/data-bi/getResumenClientesPorVendedor`
- `core/modules/ventas/facturas/facturas.controller.ts`: `GET ventas/facturas/getTableQueryPuntosEmisionFacturas`, `GET ventas/facturas/getFacturasAnuladas`, `GET ventas/facturas/getFacturasConNotasCredito`, `GET ventas/facturas/getFacturasPorCobrar`, `GET ventas/facturas/getSecuencialFactura`, `DELETE ventas/facturas/delete`, `GET ventas/facturas/getProductoParaDetalle`
- `core/modules/ventas/notas-credito/notas-credito.controller.ts`: `POST ventas/notas-credito/enviarSRI`
- `core/modules/ventas/punto-venta/punto-venta.controller.ts`: `GET ventas/punto-venta/getTableQueryEstadosOrden`
- `core/modules/ventas/transportes/transportes.controller.ts`: `POST ventas/transportes/setActivoEnvio`, `GET ventas/transportes/getListDataCamiones`, `GET ventas/transportes/getListDataProvincias`
- `core/variables/variables.controller.ts`: `POST sistema/variables/saveModulo`
- `core/whatsapp/bot/bot.controller.ts`: `GET whatsapp/bot/environment`, `GET whatsapp/bot/logs`
- `core/whatsapp/mensaje-rapido/mensaje-rapido.controller.ts`: `POST whatsapp/mensajes-rapidos/adjunto`, `POST whatsapp/mensajes-rapidos/enviar-ubicacion`
- `core/whatsapp/whatsapp.controller.ts`: `POST whatsapp/activarNumero`, `GET whatsapp/validateWhatsAppNumber`, `GET whatsapp/getDetalleCampania`, `DELETE whatsapp/deleteDetailCampaniaById`, `POST whatsapp/updateEstadoCampania`
- `core/whatsapp/ycloud/ycloud-webhook.controller.ts`: `GET webhook/ycloud`, `POST webhook/ycloud`
- `core/whatsapp/ycloud/ycloud.controller.ts`: `POST whatsapp/ycloud/send-text`, `POST whatsapp/ycloud/send-template`, `POST whatsapp/ycloud/send-template-document`, `POST whatsapp/ycloud/send-media`, `POST whatsapp/ycloud/send-document`, `GET whatsapp/ycloud/check-window`, `POST whatsapp/ycloud/assign-agent`, `POST whatsapp/ycloud/upload-media`, `GET whatsapp/ycloud/metrics/response-time`, `GET whatsapp/ycloud/sync/pending`, `GET whatsapp/ycloud/config`, `GET whatsapp/ycloud/validate-number` … (+5)
- `errors/errors.controller.ts`: `GET errors/getAllErrorLog`, `POST errors/clearAllErrorLog`
- `reports/modules/contabilidad/contabilidad-rep.controller.ts`: `GET reports/contabilidad/reportFlujoEfectivo`, `GET reports/contabilidad/reportComprobanteRetencion`
