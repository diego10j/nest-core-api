import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';
import { NotificacionesService } from 'src/core/modules/sistema/notificaciones/notificaciones.service';
import { getCurrentDate } from 'src/util/helpers/date-util';
import { roundTo, roundPrecio, getPrecioDecimals } from 'src/util/helpers/number-util';

import { DatosSesion, ProductoSesion } from './interfaces/bot-session.interface';

// ─── Constantes WhatsApp proforma ─────────────────────────────────────────────
const IDE_CCTPR_WHATSAPP = 3;           // Tipo de proforma: WhatsApp
const IDE_CCVAP_WHATSAPP = 6;           // Canal de venta WhatsApp
const IDE_CCTEN_WHATSAPP = 0;           // Tiene (campo requerido)
const REFERENCIA_WHATSAPP = 'WhatsApp';  // Referencia en cabecera

/** Convierte número internacional Ecuador a formato local: +593983113543 → 0983113543 */
export function toLocalPhone(phone: string): string {
  const digits = phone.replace(/^\+/, '');
  if (digits.startsWith('593') && digits.length > 3) {
    return '0' + digits.substring(3);
  }
  return digits;
}

const DECIMALES_TOTALES = 2;

// La dirección se guarda "tal como la escribió el cliente" (ver bot.service.ts), pero
// suele venir con una muletilla de introducción que no es parte de la dirección — ej.
// "Desde Quito. Sector granados y 6 de diciembre", "Estoy en Cuenca", "Soy de Ambato".
// Se quita solo ese prefijo (y se capitaliza la primera letra); el resto queda intacto
// (caso real detectado 2026-09-19). "de"/"en" sueltos al inicio NO se tocan sin un verbo
// delante, porque pueden ser parte real de la dirección ("De los Shyris y Naciones Unidas").
const PREFIJO_DIRECCION_CON_VERBO =
  /^\s*(?:(?:le\s+)?escribo|estoy|soy|somos|me\s+encuentro|nos\s+encontramos|vivo|resido)\s+(?:desde|en|de)\s+/i;
const PREFIJO_DIRECCION_DESDE = /^\s*desde\s+/i;

export function limpiarDireccion(direccion: string): string {
  const limpia = direccion
    .replace(PREFIJO_DIRECCION_CON_VERBO, '')
    .replace(PREFIJO_DIRECCION_DESDE, '')
    .trim();
  return limpia ? limpia.charAt(0).toUpperCase() + limpia.slice(1) : limpia;
}

export interface ResultadoProforma {
  ide_cccpr: number;
  secuencial: string;
  automatica: boolean;
  conPrecio: boolean;
  productosConPrecio: ProductoSesion[];
  productosSinPrecio: ProductoSesion[];
  pdfBuffer?: Buffer;
  // Totales financieros (solo cuando automatica=true)
  baseGrabada?: number;
  baseTarifa0?: number;
  valorIva?: number;
  tarifaIva?: number;
  total?: number;
  // Nombre de la provincia detectada (gen_provincia) a partir de la ciudad/provincia que dio
  // el cliente — null si no se pudo resolver. Lo usa el bot para avisar del envío nacional
  // cuando NO es Pichincha.
  provinciaNombre?: string | null;
}

@Injectable()
export class BotProformaService {
  private readonly logger = new Logger(BotProformaService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proformasService: ProformasService,
    private readonly notificaciones: NotificacionesService,
  ) { }

  async procesarProforma(
    datos: DatosSesion,
    telefonoWa: string,
    ideEmpr: number,
    ideSucu: number,
    nombreBot: string,
  ): Promise<ResultadoProforma> {
    const productosConPrecio: (ProductoSesion & { tiene_stock?: boolean })[] = [];
    const productosSinPrecio: ProductoSesion[] = [];

    let tarifaIva = 15; // fallback

    for (const prod of datos.productos) {
      // cantidad=0 es nuestro sentinel de "cantidad mínima" — f_calcula_precio_venta
      // rechaza cantidad<=0 con excepción ("La cantidad debe ser mayor a cero"), lo que
      // abortaba toda la proforma. Se trata directo como "sin precio configurado" (pasa
      // a revisión manual) sin llamar a la función.
      const precioConf = prod.cantidad === 0
        ? null
        : await this.proformasService.buscarPrecioProducto(prod.ide_inarti, prod.cantidad, ideEmpr, ideSucu);
      this.logger.log(`[Precio] ide_inarti=${prod.ide_inarti} "${prod.nombre}" cant=${prod.cantidad} → ${precioConf ? `sin_iva=${precioConf.precio_venta_sin_iva} con_iva=${precioConf.precio_venta_con_iva} iva=${precioConf.porcentaje_iva}% tipo=${precioConf.tipo_configuracion}` : 'SIN PRECIO CONFIGURADO'}`);
      if (precioConf) {
        tarifaIva = precioConf.porcentaje_iva;
        const precioSinIva = roundPrecio(precioConf.precio_venta_sin_iva);
        const totalConIva = roundTo(precioConf.precio_venta_con_iva * prod.cantidad, DECIMALES_TOTALES);
        const tieneStock = await this.tieneStockSuficiente(prod.ide_inarti, prod.cantidad);
        this.logger.log(`[Stock] ide_inarti=${prod.ide_inarti} "${prod.nombre}" cant_solicitada=${prod.cantidad} → ${tieneStock ? 'SUFICIENTE' : 'INSUFICIENTE'}`);
        productosConPrecio.push({
          ...prod,
          precio_unitario: precioSinIva,
          precio_total: totalConIva,
          costo_promedio: precioConf.costo_promedio,
          utilidad_ccdpr: precioConf.utilidad_neta ?? null,
          porcentaje_util_ccdpr: precioConf.porcentaje_utilidad ?? null,
          tiene_precio: true,
          tiene_stock: tieneStock,
        });
      } else {
        productosSinPrecio.push({ ...prod, tiene_precio: false });
      }
    }

    const todosTienePrecio = productosSinPrecio.length === 0;
    // Automática: todos tienen precio configurado para la cantidad pedida Y todos tienen
    // stock suficiente en bodega principal — ya NO se exige que el producto esté en un
    // catálogo público (antes bloqueaba productos vendibles con precio y stock reales
    // solo por no estar publicados en un catálogo de WhatsApp/web).
    const automatica = todosTienePrecio &&
      productosConPrecio.every((p) => p.tiene_stock === true);
    // Con precio pero sin stock suficiente en algún ítem: se carga precio pero no es automática
    const conPrecio = todosTienePrecio && !automatica;

    // Construir detalles con precio cuando está disponible.
    // La observación (`producto`) se guarda tal como lo escribió el cliente en el chat
    // (más el uso, si se preguntó por ser un ítem genérico) — el ide_inarti se envía
    // explícito (`ideInarti`) para no depender de un match por nombre en el backend.
    const precioMap = new Map(productosConPrecio.map((p) => [p.ide_inarti, p.precio_unitario]));
    const detalles = datos.productos.map((p) => {
      let observacionProducto = p.nombre;
      if (p.uso_generico) observacionProducto += ` — Uso: ${p.uso_generico}`;
      if (p.cantidad === 0) observacionProducto += ' - CANTIDAD MINIMA';
      return {
        // Siempre en MAYÚSCULAS — el nombre llega como lo escribió el cliente
        // ("percarbonato de sodio"), pero el detalle de una proforma del ERP va en
        // mayúsculas como el resto de los artículos.
        producto: observacionProducto.toUpperCase(),
        cantidad: p.cantidad,
        unidad: p.siglas_unidad || p.unidad,
        ideInarti: p.ide_inarti,
        precio: precioMap.get(p.ide_inarti) ?? null,
      };
    });

    const direccionLimpia = limpiarDireccion(datos.envio?.direccion || '');

    const observacion = automatica
      ? `Cotización automática generada por ${nombreBot} vía WhatsApp`
      : conPrecio
        ? `Cotización ${nombreBot} vía WhatsApp — precios cargados, pendiente revisión de stock`
        : `Cotización ${nombreBot} vía WhatsApp — revisar productos sin precio`;

    const resultado = await this.proformasService.createProformaWeb({
      ideEmpr,
      ideSucu,
      login: nombreBot,
      solicitante: {
        fecha: getCurrentDate(),
        nombres: datos.cliente.nombres,
        correo: datos.cliente.correo,
        telefono: toLocalPhone(telefonoWa),
        provincia: datos.envio?.provincia || '',
        direccion: direccionLimpia,
        formaPago: datos.forma_pago === 'credit' ? 'credit' : 'cash',
        formaEntrega: 'Por definir',
        observacion,
        ideEmpr,
      },
      detalles,
    } as any);

    const ide_cccpr: number = resultado.data.ide_cccpr;
    const secuencial: string = resultado.data.secuencial_cccpr;
    let provinciaNombre: string | null = null;

    // Actualizar cabecera con datos específicos de WhatsApp y del cliente
    try {
      const cliente = datos.cliente;
      let ideGeper = 7712;  // Consumidor final por defecto
      let identificac = '9999999999999';
      let ideGetid = 3;
      let correo = cliente?.correo || 'info@diquimec.com.ec';

      if (cliente?.es_cliente_registrado && cliente.ide_geper) {
        ideGeper = cliente.ide_geper;
        identificac = cliente.identificacion || identificac;
        correo = cliente.correo || correo;

        // Obtener ide_getid real del cliente desde gen_persona
        const pQ = new SelectQuery(`SELECT ide_getid, correo_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`);
        pQ.addIntParam(1, ideGeper);
        const personaRow = await this.dataSource.createSingleQuery(pQ);
        if (personaRow) {
          ideGetid = personaRow.ide_getid ?? 3;
          correo = personaRow.correo_geper || correo;
        }
      }

      // Buscar ide_geprov por lo que el cliente escribió como ciudad/provincia. La
      // mayoría de las veces el cliente responde un cantón (ej. "Guayaquil"), no el
      // nombre de la provincia (ej. "Guayas") — matchear directo contra gen_provincia
      // fallaba en ese caso porque los nombres no se parecen entre sí. Se prueba primero
      // gen_canton (cantón → su provincia) y, si no hay coincidencia, gen_provincia
      // directo (por si el cliente sí escribió la provincia). Sin match en ninguna,
      // queda en null — no bloquea la cotización.
      let ideGeprov: number | null = null;
      const provinciaInput = datos.envio?.provincia?.trim();
      if (provinciaInput) {
        const cantonQ = new SelectQuery(`
          SELECT ide_geprov FROM gen_canton
          WHERE (activo_gecant IS NULL OR activo_gecant = TRUE)
            AND (unaccent(UPPER(nombre_gecant)) ILIKE '%' || unaccent(UPPER($1)) || '%'
                 OR unaccent(UPPER($1)) ILIKE '%' || unaccent(UPPER(nombre_gecant)) || '%')
          ORDER BY LENGTH(nombre_gecant) ASC
          LIMIT 1
        `);
        cantonQ.addParam(1, provinciaInput);
        const cantonRow = await this.dataSource.createSingleQuery(cantonQ);
        ideGeprov = cantonRow?.ide_geprov ?? null;

        if (ideGeprov == null) {
          const provQ = new SelectQuery(`
            SELECT ide_geprov FROM gen_provincia
            WHERE unaccent(UPPER(nombre_geprov)) ILIKE '%' || unaccent(UPPER($1)) || '%'
               OR unaccent(UPPER($1)) ILIKE '%' || unaccent(UPPER(nombre_geprov)) || '%'
            ORDER BY LENGTH(nombre_geprov) ASC
            LIMIT 1
          `);
          provQ.addParam(1, provinciaInput);
          const provRow = await this.dataSource.createSingleQuery(provQ);
          ideGeprov = provRow?.ide_geprov ?? null;
        }
        this.logger.log(`[Proforma] Ciudad/provincia "${provinciaInput}" → ide_geprov=${ideGeprov}`);
        if (ideGeprov != null) {
          const nomProvQ = new SelectQuery(`SELECT nombre_geprov FROM gen_provincia WHERE ide_geprov = $1 LIMIT 1`);
          nomProvQ.addIntParam(1, ideGeprov);
          const nomProvRow = await this.dataSource.createSingleQuery(nomProvQ);
          provinciaNombre = nomProvRow?.nombre_geprov ?? null;
        }
      }

      // notas_cccpr: coordenadas GPS en JSON si el cliente compartió ubicación
      const latitud = datos.envio?.latitud;
      const longitud = datos.envio?.longitud;
      const notasGps = (latitud && longitud)
        ? JSON.stringify({ lat: latitud, lng: longitud })
        : null;

      await this.dataSource.pool.query(`
        UPDATE cxc_cabece_proforma
        SET
          ide_cctpr         = $2,
          referencia_cccpr  = $3,
          ide_ccvap         = $4,
          ide_ccten         = $5,
          ide_geper         = $6,
          identificac_cccpr = $7,
          ide_getid         = $8,
          correo_cccpr      = $9,
          telefono_cccpr    = $10,
          direccion_cccpr   = $11,
          notas_cccpr       = COALESCE($12, notas_cccpr),
          ide_vgven         = COALESCE($13, ide_vgven),
          observacion_cccpr = $14,
          ide_geprov        = COALESCE($15, ide_geprov)
        WHERE ide_cccpr = $1
      `, [
        ide_cccpr,
        IDE_CCTPR_WHATSAPP,
        REFERENCIA_WHATSAPP,
        IDE_CCVAP_WHATSAPP,
        IDE_CCTEN_WHATSAPP,
        ideGeper,
        identificac,
        ideGetid,
        correo,
        toLocalPhone(telefonoWa),
        direccionLimpia,
        notasGps,
        datos.cliente?.ide_vgven || null,
        '',
        ideGeprov,
      ]);
      this.logger.log(`[Proforma] Cabecera WhatsApp actualizada ide_cccpr=${ide_cccpr} ide_geper=${ideGeper}`);
    } catch (err) {
      this.logger.warn(`[Proforma] No se actualizaron campos WhatsApp: ${err.message}`);
    }

    // Actualizar precios en los detalles (precio SIN IVA, total SIN IVA).
    // Se escribe el precio de cada producto que SÍ tiene configuración, aunque otros
    // productos de la misma cotización no la tengan (CASO 2: "con precio" mixto) —
    // antes este bloque solo corría si TODOS tenían precio, dejando en NULL hasta los
    // que sí lo tenían configurado cuando la cotización era parcial.
    if (productosConPrecio.length > 0) {
      for (const p of productosConPrecio) {
        try {
          // total_ccdpr = roundTo(cantidad × precio, 2) — modelo frontend
          const totalSinIva = roundTo(p.cantidad * p.precio_unitario, DECIMALES_TOTALES);
          await this.dataSource.pool.query(
            `UPDATE cxc_deta_proforma
             SET precio_ccdpr = $1, total_ccdpr = $2, iva_inarti_ccdpr = 1,
                 precio_compra_ccdpr = $5, utilidad_ccdpr = $6, porcentaje_util_ccdpr = $7
             WHERE ide_cccpr = $3 AND ide_inarti = $4`,
            [
              p.precio_unitario, totalSinIva, ide_cccpr, p.ide_inarti, p.costo_promedio,
              p.utilidad_ccdpr ?? null, p.porcentaje_util_ccdpr ?? null,
            ],
          );
          this.logger.log(`[Proforma] Detalle ide_inarti=${p.ide_inarti} precio=${p.precio_unitario} (${getPrecioDecimals(p.precio_unitario)} dec) total=${totalSinIva} costo_promedio=${p.costo_promedio}`);
        } catch (err) {
          this.logger.warn(`[Proforma] No se actualizó detalle ide_inarti=${p.ide_inarti}: ${err.message}`);
        }
      }

      // Recalcular totales cabecera usando el método compartido de ProformasService
      try {
        const itemsTotales = productosConPrecio.map((p) => ({
          cantidad: p.cantidad,
          precio: p.precio_unitario,
          porcentaje_iva: tarifaIva,
          utilidad: p.utilidad_ccdpr ?? null,
        }));
        await this.proformasService.actualizarTotalesCabecera(ide_cccpr, itemsTotales);
        this.logger.log(`[Proforma] Totales actualizados ide_cccpr=${ide_cccpr} items=${itemsTotales.length}`);
      } catch (err) {
        this.logger.warn(`[Proforma] No se actualizaron totales de cabecera: ${err.message}`);
      }
    }

    let pdfBuffer: Buffer | undefined;
    let proformaCompletada = false;
    if (automatica) {
      const checkQ = new SelectQuery(`SELECT COALESCE(total_cccpr, 0) AS total FROM cxc_cabece_proforma WHERE ide_cccpr = $1`);
      checkQ.addIntParam(1, ide_cccpr);
      const checkRow = await this.dataSource.createSingleQuery(checkQ);
      const totalProforma = Number(checkRow?.total ?? 0);

      if (totalProforma <= 0) {
        this.logger.warn(`[Proforma] Total = ${totalProforma} — PDF no generado. Verificar precios.`);
      } else {
        try {
          // Usuario "sistema" y vendedor por defecto (si el cliente no tiene uno propio
          // asignado en el ERP) vienen de variables del sistema por empresa — ver
          // ProformasService.obtenerUsuarioYVendedorAutomatico.
          const { ideUsuaAutomatico, ideVgvenDefecto } = await this.proformasService.obtenerUsuarioYVendedorAutomatico(ideEmpr);
          const ideVgven = datos.cliente?.ide_vgven ?? ideVgvenDefecto;
          await this.proformasService.asignarVendedorProforma(ide_cccpr, ideUsuaAutomatico, ideVgven);
          pdfBuffer = await this.proformasService.getPdfBuffer(ide_cccpr, ideEmpr);
          await this.dataSource.pool.query(
            `UPDATE cxc_cabece_proforma SET enviado_cccpr = TRUE WHERE ide_cccpr = $1`,
            [ide_cccpr],
          );
          this.logger.log(`[Proforma] enviado_cccpr=true ide_cccpr=${ide_cccpr}`);
          proformaCompletada = true;
        } catch (err) {
          this.logger.error(`Error generando PDF proforma ${ide_cccpr}: ${err.message}`);
        }
      }
    }

    // ─── Notificaciones según resultado ──────────────────────────────
    try {
      const clienteNombre = datos.cliente?.nombres || telefonoWa;
      if (proformaCompletada) {
        await this.notificaciones.enviarSistema(
          'PROFORMA_BOT_COMPLETADA',
          `✅ Cotización #${secuencial} generada para ${clienteNombre}`,
          `Se generó exitosamente la cotización N° ${secuencial} al solicitante ${clienteNombre}.\n` +
          `Productos: ${datos.productos.length} ítem(s).`,
          {
            tipo: 'text',
            botones: [
              { texto: 'Ver Detalle', accion: 'navigate', estilo: 'primary', url: `/dashboard/proformas/${ide_cccpr}/details` },
            ],
          },
          ideEmpr,
          'bot',
        );
      } else {
        await this.notificaciones.enviarSistema(
          'PROFORMA_BOT_INCOMPLETA',
          `⚠️ Cotización #${secuencial} requiere revisión`,
          `Se generó la cotización N° ${secuencial} al solicitante ${clienteNombre}, pero debe ser completada por un asesor comercial.\n` +
          `Productos sin precio: ${productosSinPrecio.length} de ${datos.productos.length}.`,
          {
            tipo: 'text',
            botones: [
              { texto: 'Completar', accion: 'navigate', estilo: 'primary', url: `/dashboard/proformas/${ide_cccpr}/details` },
            ],
          },
          ideEmpr,
          'bot',
        );
      }
    } catch (err) {
      this.logger.error(`[Notif] Error al notificar proforma bot: ${err.message}`);
    }

    // Totales para el return (mismo cálculo que el UPDATE de cabecera)
    const baseGrabadaRet = todosTienePrecio
      ? productosConPrecio.reduce((s, p) => s + roundTo(p.cantidad * p.precio_unitario, DECIMALES_TOTALES), 0)
      : undefined;
    const valorIva = baseGrabadaRet != null ? roundTo(baseGrabadaRet * (tarifaIva / 100), DECIMALES_TOTALES) : undefined;
    const total = baseGrabadaRet != null ? baseGrabadaRet + 0 + valorIva : undefined;

    return {
      ide_cccpr, secuencial, automatica, conPrecio,
      productosConPrecio, productosSinPrecio, pdfBuffer,
      baseGrabada: baseGrabadaRet, baseTarifa0: 0, valorIva, tarifaIva, total,
      provinciaNombre,
    };
  }

  /**
   * Delega en ProformasService.tieneStockSuficiente — mismo criterio de stock general
   * (todas las bodegas) compartido con createProformaWeb, para no duplicar la consulta.
   */
  private tieneStockSuficiente(ideInarti: number, cantidad: number): Promise<boolean> {
    return this.proformasService.tieneStockSuficiente(ideInarti, cantidad);
  }

  /**
   * Catálogos públicos activos con productos EN STOCK (modo mensajes reducidos) — le da a
   * `BotGptService.matchCatalogoProducto` contexto real de productos (no solo el nombre de
   * la categoría) para decidir si dirigir al cliente al catálogo con precios en vez de
   * levantar una solicitud de cotización manual. Relación producto↔catálogo vía
   * `inv_det_catalogo`, mismo criterio de stock que `ProductosService.getCatalogoProductos`
   * (suma de `inv_det_comp_inve` en la bodega principal, ide_inepi=1).
   * Cacheado en Redis 20 min (clave `catalogo:bot:productos:<ideEmpr>`) — cubre el caso de
   * stock, que cambia más seguido que el catálogo. Cuando SÍ cambia el catálogo (producto
   * agregado/quitado, activar/desactivar, etc.) no hace falta invalidar acá: la clave usa
   * el mismo prefijo `catalogo:` que ya barre `CatalogosSaveService.invalidateCatalogCache()`
   * con `KEYS catalogo:*` en cada save/delete/toggle de catálogo — se limpia sola. Si se
   * cambia este prefijo, hay que revisar esa función para no perder la invalidación cruzada.
   */
  async obtenerCatalogosDisponibles(ideEmpr: number): Promise<{
    ide_cata: number;
    nombre_cata: string;
    path_cata: string | null;
    // Solo para dar contexto a BotGptService.matchCatalogoProducto (título/descripción/
    // productos, ver ahí) — NUNCA se le muestra al cliente, la respuesta del bot se queda
    // corta y precisa (confirmación + link), sin texto de marketing (caso real detectado
    // 2026-09-16: se probó mostrarla y sobraba, el cliente pidió respuestas más directas).
    descripcion_cata: string | null;
    productos: { ide_inarti: number; nombre: string; precio_desde: number | null }[];
  }[]> {
    const cacheKey = `catalogo:bot:productos:${ideEmpr}`;
    try {
      const cached = await this.dataSource.redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      this.logger.warn(`[Catalogos] Redis get falló para ${cacheKey}: ${err.message}`);
    }

    const query = new SelectQuery(`
      SELECT
        c.ide_inccat        AS ide_cata,
        c.nombre_inccat     AS nombre_cata,
        c.path_inccat       AS path_cata,
        c.desc_corta_inccat AS desc_corta_cata,
        c.descripcion_inccat AS descripcion_larga_cata,
        a.ide_inarti,
        a.nombre_inarti  AS nombre_producto
      FROM inv_cab_catalogo c
      INNER JOIN inv_det_catalogo d ON d.ide_inccat = c.ide_inccat AND d.activo_indcat = TRUE
      INNER JOIN inv_articulo a ON a.ide_inarti = d.ide_inarti
        AND a.activo_inarti = TRUE AND a.hace_kardex_inarti = TRUE
      WHERE c.estado_inccat = TRUE
        AND (c.ide_empr = $1 OR c.ide_empr = 0)
        AND COALESCE(
          (SELECT f_redondeo(SUM(dci.cantidad_indci * tci.signo_intci), a.decim_stock_inarti)
           FROM inv_det_comp_inve dci
           INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
           INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
           INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
           WHERE dci.ide_inarti = a.ide_inarti AND cci.ide_inepi = 1
          ), 0
        ) > 0
      ORDER BY c.orden_inccat, c.nombre_inccat, a.nombre_inarti
    `);
    query.addIntParam(1, ideEmpr);
    const rows = await this.dataSource.createSelectQuery(query);

    const porCatalogo = new Map<number, {
      ide_cata: number; nombre_cata: string; path_cata: string | null; descripcion_cata: string | null;
      productos: { ide_inarti: number; nombre: string; precio_desde: number | null }[];
    }>();
    for (const row of rows) {
      if (!porCatalogo.has(row.ide_cata)) {
        const descripcion: string | null =
          (row.desc_corta_cata && String(row.desc_corta_cata).trim())
            || (row.descripcion_larga_cata && String(row.descripcion_larga_cata).trim())
            || null;
        porCatalogo.set(row.ide_cata, {
          ide_cata: row.ide_cata, nombre_cata: row.nombre_cata, path_cata: row.path_cata ?? null,
          descripcion_cata: descripcion, productos: [],
        });
      }
      porCatalogo.get(row.ide_cata)!.productos.push({
        ide_inarti: row.ide_inarti, nombre: row.nombre_producto, precio_desde: null,
      });
    }
    const resultado = Array.from(porCatalogo.values());

    // Precio de referencia (cantidad=1) por producto — best-effort, no bloquea el catálogo
    // si falla para alguno en particular.
    for (const cat of resultado) {
      for (const prod of cat.productos) {
        try {
          const precio = await this.proformasService.buscarPrecioProducto(prod.ide_inarti, 1, ideEmpr, 0);
          prod.precio_desde = precio ? roundPrecio(precio.precio_venta_con_iva) : null;
        } catch {
          prod.precio_desde = null;
        }
      }
    }

    try {
      await this.dataSource.redisClient.setex(cacheKey, 1200, JSON.stringify(resultado));
    } catch (err) {
      this.logger.warn(`[Catalogos] Redis set falló para ${cacheKey}: ${err.message}`);
    }

    return resultado;
  }
}
