import { Injectable, Logger } from '@nestjs/common';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';
import { NotificacionesService } from 'src/core/modules/sistema/notificaciones/notificaciones.service';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { BotToolsService } from './bot-tools.service';
import { DatosSesion, ProductoSesion } from './interfaces/bot-session.interface';

export const IDE_USUA_BOT       = 32;  // Usuario bot para proformas automáticas
export const IDE_VGVEN_DEFAULT  = 16;  // Vendedor por defecto para cotizaciones automáticas

// ─── Constantes WhatsApp proforma ─────────────────────────────────────────────
const IDE_CCTPR_WHATSAPP    = 3;           // Tipo de proforma: WhatsApp
const IDE_CCVAP_WHATSAPP    = 6;           // Canal de venta WhatsApp
const IDE_CCTEN_WHATSAPP    = 0;           // Tiene (campo requerido)
const REFERENCIA_WHATSAPP   = 'WhatsApp';  // Referencia en cabecera

/** Convierte número internacional Ecuador a formato local: +593983113543 → 0983113543 */
function toLocalPhone(phone: string): string {
  const digits = phone.replace(/^\+/, '');
  if (digits.startsWith('593') && digits.length > 3) {
    return '0' + digits.substring(3);
  }
  return digits;
}

// ─── Modelo de cálculo de proformas (idéntico al frontend) ────────────────────
const MAX_DECIMALES_PRECIO = 4;
const DECIMALES_TOTALES    = 2;

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

/** Determina 2 o 4 decimales para precio_ccdpr según regla del frontend */
function getPrecioDecimals(precio: number): number {
  const str4 = Math.abs(precio).toFixed(MAX_DECIMALES_PRECIO);
  const dec   = str4.split('.')[1] ?? '0000';
  return (dec[2] === '0' && dec[3] === '0') ? DECIMALES_TOTALES : MAX_DECIMALES_PRECIO;
}

function roundPrecio(precio: number): number {
  return roundTo(precio, getPrecioDecimals(precio));
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
}

@Injectable()
export class BotProformaService {
  private readonly logger = new Logger(BotProformaService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proformasService: ProformasService,
    private readonly botTools: BotToolsService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async procesarProforma(
    datos: DatosSesion,
    telefonoWa: string,
    ideEmpr: number,
    nombreBot: string,
  ): Promise<ResultadoProforma> {
    const productosConPrecio: ProductoSesion[] = [];
    const productosSinPrecio: ProductoSesion[] = [];

    // Obtener tasa de IVA actual de con_porcen_impues (decimal: 0.15 para 15%)
    const ivaQ = new SelectQuery(`
      SELECT COALESCE(porcentaje_cnpim, 0.15) AS iva
      FROM con_porcen_impues
      WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
        AND activo_cnpim = TRUE
      ORDER BY fecha_desde_cnpim DESC
      LIMIT 1
    `);
    const ivaRow = await this.dataSource.createSingleQuery(ivaQ);
    const ivaDecimal: number = Number(ivaRow?.iva ?? 0.15);
    const tarifaIva: number  = Math.round(ivaDecimal * 100);
    this.logger.log(`[Proforma] IVA actual: ${tarifaIva}% (${ivaDecimal})`);

    for (const prod of datos.productos) {
      const precioConf = await this.botTools.buscarPrecioConfigurado(prod.ide_inarti, prod.cantidad, ideEmpr);
      this.logger.log(`[Precio] ide_inarti=${prod.ide_inarti} "${prod.nombre}" cantidad=${prod.cantidad} → ${precioConf ? `precio_unit=${precioConf.precio_unitario} incluye_iva=${precioConf.incluye_iva} cant_min=${precioConf.cantidad_minima}` : 'SIN PRECIO CONFIGURADO'}`);
      if (precioConf) {
        // precio SIN IVA usando la regla de decimales del frontend
        const precioSinIvaRaw = precioConf.incluye_iva
          ? precioConf.precio_unitario / (1 + ivaDecimal)
          : precioConf.precio_unitario;
        const precioSinIva = roundPrecio(precioSinIvaRaw);               // 2 o 4 dec
        const totalSinIva  = roundTo(precioSinIva * prod.cantidad, DECIMALES_TOTALES);  // 2 dec
        const totalConIva  = roundTo(totalSinIva  * (1 + ivaDecimal), DECIMALES_TOTALES);
        productosConPrecio.push({
          ...prod,
          precio_unitario: precioSinIva,   // SIN IVA para proforma (2 o 4 dec)
          precio_total:    totalConIva,    // CON IVA para mostrar al cliente (2 dec)
          tiene_precio:    true,
        });
      } else {
        productosSinPrecio.push({ ...prod, tiene_precio: false });
      }
    }

    const todosTienePrecio = productosSinPrecio.length === 0;
    // Automática: todos tienen precio Y todos están en catálogo
    const automatica = todosTienePrecio &&
      datos.productos.every((p) => p.en_catalogo === true);
    // Con precio pero alguno fuera de catálogo: se carga precio pero no es automática
    const conPrecio = todosTienePrecio && !automatica;

    // Construir detalles con precio cuando está disponible
    const precioMap = new Map(productosConPrecio.map((p) => [p.ide_inarti, p.precio_unitario]));
    const detalles = datos.productos.map((p) => ({
      producto: p.nombre,
      cantidad: p.cantidad,
      unidad: p.siglas_unidad || p.unidad,
      precio: precioMap.get(p.ide_inarti) ?? null,
    }));

    const observacion = automatica
      ? `Cotización automática generada por ${nombreBot} vía WhatsApp`
      : conPrecio
        ? `Cotización ${nombreBot} vía WhatsApp — precios cargados, pendiente revisión de catálogo`
        : `Cotización ${nombreBot} vía WhatsApp — revisar productos sin precio`;

    const resultado = await this.proformasService.createProformaWeb({
      ideEmpr,
      ideSucu: 0,
      login: nombreBot,
      solicitante: {
        fecha: getCurrentDate(),
        nombres: datos.cliente.nombres,
        correo: datos.cliente.correo,
        telefono: toLocalPhone(telefonoWa),
        provincia: datos.envio?.provincia || '',
        direccion: datos.envio?.direccion || '',
        formaPago: datos.forma_pago === 'credit' ? 'credit' : 'cash',
        formaEntrega: 'Por definir',
        observacion,
        ideEmpr,
      },
      detalles,
    } as any);

    const ide_cccpr: number = resultado.data.ide_cccpr;
    const secuencial: string = resultado.data.secuencial_cccpr;

    // Actualizar cabecera con datos específicos de WhatsApp y del cliente
    try {
      const cliente = datos.cliente;
      let ideGeper   = 7712;  // Consumidor final por defecto
      let identificac = '9999999999999';
      let ideGetid   = 3;
      let correo     = cliente?.correo || 'info@diquimec.com.ec';

      if (cliente?.es_cliente_registrado && cliente.ide_geper) {
        ideGeper   = cliente.ide_geper;
        identificac = cliente.identificacion || identificac;
        correo      = cliente.correo || correo;

        // Obtener ide_getid real del cliente desde gen_persona
        const pQ = new SelectQuery(`SELECT ide_getid, correo_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`);
        pQ.addIntParam(1, ideGeper);
        const personaRow = await this.dataSource.createSingleQuery(pQ);
        if (personaRow) {
          ideGetid = personaRow.ide_getid ?? 3;
          correo   = personaRow.correo_geper || correo;
        }
      }

      // Buscar ide_geprov por nombre de provincia (coincidencia flexible)
      let ideGeprov: number | null = null;
      const provinciaInput = datos.envio?.provincia?.trim();
      if (provinciaInput) {
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
        this.logger.log(`[Proforma] Provincia "${provinciaInput}" → ide_geprov=${ideGeprov}`);
      }

      // notas_cccpr: coordenadas GPS en JSON si el cliente compartió ubicación
      const latitud  = datos.envio?.latitud;
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
        datos.envio?.direccion || '',
        notasGps,
        datos.cliente?.ide_vgven || null,
        'LA COTIZACIÓN NO INCLUYE COSTO DE ENVÍO.',
        ideGeprov,
      ]);
      this.logger.log(`[Proforma] Cabecera WhatsApp actualizada ide_cccpr=${ide_cccpr} ide_geper=${ideGeper}`);
    } catch (err) {
      this.logger.warn(`[Proforma] No se actualizaron campos WhatsApp: ${err.message}`);
    }

    // Actualizar precios en los detalles (precio SIN IVA, total SIN IVA)
    if (todosTienePrecio) {
      for (const p of productosConPrecio) {
        try {
          // total_ccdpr = roundTo(cantidad × precio, 2) — modelo frontend
          const totalSinIva = roundTo(p.cantidad * p.precio_unitario, DECIMALES_TOTALES);
          await this.dataSource.pool.query(
            `UPDATE cxc_deta_proforma
             SET precio_ccdpr = $1, total_ccdpr = $2, iva_inarti_ccdpr = 1
             WHERE ide_cccpr = $3 AND ide_inarti = $4`,
            [p.precio_unitario, totalSinIva, ide_cccpr, p.ide_inarti],
          );
          this.logger.log(`[Proforma] Detalle ide_inarti=${p.ide_inarti} precio=${p.precio_unitario} (${getPrecioDecimals(p.precio_unitario)} dec) total=${totalSinIva}`);
        } catch (err) {
          this.logger.warn(`[Proforma] No se actualizó detalle ide_inarti=${p.ide_inarti}: ${err.message}`);
        }
      }

      // Recalcular totales cabecera — modelo idéntico al frontend
      try {
        // 1. Acumular totales de línea (ya redondeados a 2 dec en el UPDATE anterior)
        //    iva_inarti_ccdpr = 1 → baseGrabada | iva_inarti_ccdpr != 1 → baseTarifa0
        const baseGrabada = productosConPrecio.reduce(
          (s, p) => s + roundTo(p.cantidad * p.precio_unitario, DECIMALES_TOTALES), 0,
        );
        const baseTarifa0 = 0;  // bot solo maneja productos gravados (iva=1)

        // 2. IVA = roundTo(baseGrabada × %IVA/100, 2)
        const valorIva = roundTo(baseGrabada * (tarifaIva / 100), DECIMALES_TOTALES);

        // 3. Total = suma simple (sin redondeo adicional)
        const total = baseGrabada + baseTarifa0 + valorIva;

        // Sumar utilidad desde los detalles (si tienen precio_compra configurado)
        const utilQ = new SelectQuery(`
          SELECT COALESCE(SUM(COALESCE(utilidad_ccdpr, 0)), 0) AS utilidad
          FROM cxc_deta_proforma WHERE ide_cccpr = $1
        `);
        utilQ.addIntParam(1, ide_cccpr);
        const utilRow = await this.dataSource.createSingleQuery(utilQ);
        const utilidad = Number(utilRow?.utilidad ?? 0);

        await this.dataSource.pool.query(
          `UPDATE cxc_cabece_proforma
           SET base_grabada_cccpr = $2,
               base_tarifa0_cccpr = 0,
               tarifa_iva_cccpr   = $3,
               valor_iva_cccpr    = $4,
               total_cccpr        = $5,
               utilidad_cccpr     = $6
           WHERE ide_cccpr = $1`,
          [ide_cccpr, baseGrabada, tarifaIva, valorIva, total, utilidad],
        );
        this.logger.log(`[Proforma] Totales → base_grabada=${baseGrabada} tarifa=${tarifaIva}% iva=${valorIva} total=${total} utilidad=${utilidad}`);
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
          const ideVgven = datos.cliente?.ide_vgven || IDE_VGVEN_DEFAULT;
          await this.proformasService.asignarVendedorProforma(ide_cccpr, IDE_USUA_BOT, ideVgven);
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
    const valorIva  = baseGrabadaRet != null ? roundTo(baseGrabadaRet * (tarifaIva / 100), DECIMALES_TOTALES) : undefined;
    const total     = baseGrabadaRet != null ? baseGrabadaRet + 0 + valorIva : undefined;

    return {
      ide_cccpr, secuencial, automatica, conPrecio,
      productosConPrecio, productosSinPrecio, pdfBuffer,
      baseGrabada: baseGrabadaRet, baseTarifa0: 0, valorIva, tarifaIva, total,
    };
  }
}
