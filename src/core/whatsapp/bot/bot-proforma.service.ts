import { Injectable, Logger } from '@nestjs/common';
import { getCurrentDate } from 'src/util/helpers/date-util';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';

import { DatosSesion, ProductoSesion } from './interfaces/bot-session.interface';
import { BotToolsService } from './bot-tools.service';

export const IDE_USUA_BOT       = 32;  // Usuario bot para proformas automáticas
export const IDE_VGVEN_DEFAULT  =  3;  // Vendedor por defecto para cotizaciones automáticas

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

export interface ResultadoProforma {
  ide_cccpr: number;
  secuencial: string;
  automatica: boolean;          // todos los productos tienen precio Y están en catálogo
  conPrecio: boolean;           // todos tienen precio pero alguno no está en catálogo
  productosConPrecio: ProductoSesion[];
  productosSinPrecio: ProductoSesion[];
  pdfBuffer?: Buffer;
}

@Injectable()
export class BotProformaService {
  private readonly logger = new Logger(BotProformaService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proformasService: ProformasService,
    private readonly botTools: BotToolsService,
  ) {}

  async procesarProforma(
    datos: DatosSesion,
    telefonoWa: string,
    ideEmpr: number,
    nombreBot: string,
  ): Promise<ResultadoProforma> {
    const db = this.dataSource.pool;
    const productosConPrecio: ProductoSesion[] = [];
    const productosSinPrecio: ProductoSesion[] = [];

    // Obtener tasa de IVA actual (decimal: 0.15 para 15%)
    const ivaRow = await db.query<{ iva: number }>(
      `SELECT COALESCE(porcentaje_iva_cncii, 0.15) AS iva
       FROM con_config_iva
       WHERE fecha_inicio_cncii <= CURRENT_DATE
         AND (fecha_fin_cncii IS NULL OR fecha_fin_cncii >= CURRENT_DATE)
       ORDER BY fecha_inicio_cncii DESC
       LIMIT 1`,
    );
    const ivaDecimal: number = Number(ivaRow.rows[0]?.iva ?? 0.15);  // e.g. 0.15
    const tarifaIva: number  = Math.round(ivaDecimal * 100);          // e.g. 15 (%)
    this.logger.log(`[Proforma] IVA actual: ${tarifaIva}% (${ivaDecimal})`);

    for (const prod of datos.productos) {
      const precioConf = await this.botTools.buscarPrecioConfigurado(prod.ide_inarti, prod.cantidad, ideEmpr);
      this.logger.log(`[Precio] ide_inarti=${prod.ide_inarti} "${prod.nombre}" cantidad=${prod.cantidad} → ${precioConf ? `precio_unit=${precioConf.precio_unitario} incluye_iva=${precioConf.incluye_iva} cant_min=${precioConf.cantidad_minima}` : 'SIN PRECIO CONFIGURADO'}`);
      if (precioConf) {
        // precio_sin_iva: si el configurado ya incluye IVA, extraemos la base
        const precioSinIva = precioConf.incluye_iva
          ? Math.round((precioConf.precio_unitario / (1 + ivaDecimal)) * 100) / 100
          : precioConf.precio_unitario;
        const totalSinIva   = Math.round(precioSinIva * prod.cantidad * 100) / 100;
        const totalConIva   = Math.round(totalSinIva * (1 + ivaDecimal) * 100) / 100;
        productosConPrecio.push({
          ...prod,
          precio_unitario: precioSinIva,          // SIN IVA (para proforma)
          precio_total:    totalConIva,            // CON IVA (para mostrar al cliente)
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
        const personaRow = await db.query(
          `SELECT ide_getid, correo_geper FROM gen_persona WHERE ide_geper = $1 LIMIT 1`,
          [ideGeper],
        );
        if (personaRow.rowCount > 0) {
          ideGetid = personaRow.rows[0].ide_getid ?? 3;
          correo   = personaRow.rows[0].correo_geper || correo;
        }
      }

      // notas_cccpr: coordenadas GPS en JSON si el cliente compartió ubicación
      const latitud  = datos.envio?.latitud;
      const longitud = datos.envio?.longitud;
      const notasGps = (latitud && longitud)
        ? JSON.stringify({ lat: latitud, lng: longitud })
        : null;

      await db.query(`
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
          ide_vgven         = COALESCE($13, ide_vgven)
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
      ]);
      this.logger.log(`[Proforma] Cabecera WhatsApp actualizada ide_cccpr=${ide_cccpr} ide_geper=${ideGeper}`);
    } catch (err) {
      this.logger.warn(`[Proforma] No se actualizaron campos WhatsApp: ${err.message}`);
    }

    // Actualizar precios en los detalles (precio SIN IVA, total SIN IVA)
    if (todosTienePrecio) {
      for (const p of productosConPrecio) {
        try {
          const totalSinIva = Math.round(p.precio_unitario * p.cantidad * 100) / 100;
          await db.query(
            `UPDATE cxc_deta_proforma
             SET precio_ccdpr = $1, total_ccdpr = $2, iva_inarti_ccdpr = 1
             WHERE ide_cccpr = $3 AND ide_inarti = $4`,
            [p.precio_unitario, totalSinIva, ide_cccpr, p.ide_inarti],
          );
          this.logger.log(`[Proforma] Detalle ide_inarti=${p.ide_inarti} precio_sin_iva=${p.precio_unitario} total_sin_iva=${totalSinIva}`);
        } catch (err) {
          this.logger.warn(`[Proforma] No se actualizó detalle ide_inarti=${p.ide_inarti}: ${err.message}`);
        }
      }

      // Recalcular totales cabecera con IVA correcto
      try {
        const baseGrabada = productosConPrecio.reduce((s, p) => s + Math.round(p.precio_unitario * p.cantidad * 100) / 100, 0);
        const valorIva    = Math.round(baseGrabada * ivaDecimal * 100) / 100;
        const total       = Math.round((baseGrabada + valorIva) * 100) / 100;

        await db.query(
          `UPDATE cxc_cabece_proforma
           SET base_grabada_cccpr = $2,
               base_tarifa0_cccpr = 0,
               tarifa_iva_cccpr   = $3,
               valor_iva_cccpr    = $4,
               total_cccpr        = $5
           WHERE ide_cccpr = $1`,
          [ide_cccpr, baseGrabada, tarifaIva, valorIva, total],
        );
        this.logger.log(`[Proforma] Cabecera: base=${baseGrabada} tarifa=${tarifaIva}% iva=${valorIva} total=${total}`);
      } catch (err) {
        this.logger.warn(`[Proforma] No se actualizaron totales de cabecera: ${err.message}`);
      }
    }

    let pdfBuffer: Buffer | undefined;
    if (automatica) {
      const check = await db.query<{ total: number }>(
        `SELECT COALESCE(total_cccpr, 0) AS total FROM cxc_cabece_proforma WHERE ide_cccpr = $1`,
        [ide_cccpr],
      );
      const totalProforma = Number(check.rows[0]?.total ?? 0);

      if (totalProforma <= 0) {
        this.logger.warn(`[Proforma] Total = ${totalProforma} — PDF no generado. Verificar precios.`);
      } else {
        try {
          // Usar vendedor del cliente si existe, caso contrario el vendedor por defecto
          const ideVgven = datos.cliente?.ide_vgven || IDE_VGVEN_DEFAULT;
          await this.proformasService.asignarVendedorProforma(ide_cccpr, IDE_USUA_BOT, ideVgven);
          pdfBuffer = await this.proformasService.getPdfBuffer(ide_cccpr, ideEmpr);
        } catch (err) {
          this.logger.error(`Error generando PDF proforma ${ide_cccpr}: ${err.message}`);
        }
      }
    }

    return { ide_cccpr, secuencial, automatica, conPrecio, productosConPrecio, productosSinPrecio, pdfBuffer };
  }
}
