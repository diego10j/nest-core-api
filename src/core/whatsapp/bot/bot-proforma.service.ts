import { Injectable, Logger } from '@nestjs/common';
import { getCurrentDate } from 'src/util/helpers/date-util';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';

import { DatosSesion, ProductoSesion } from './interfaces/bot-session.interface';
import { BotToolsService } from './bot-tools.service';

export const IDE_USUA_BOT      = 32;  // Usuario bot para proformas automáticas
export const IDE_VGVEN_DEFAULT  = 3;  // Vendedor por defecto para cotizaciones automáticas

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
    private readonly proformasService: ProformasService,
    private readonly botTools: BotToolsService,
  ) {}

  async procesarProforma(
    datos: DatosSesion,
    telefonoWa: string,
    ideEmpr: number,
    nombreBot: string,
  ): Promise<ResultadoProforma> {
    const productosConPrecio: ProductoSesion[] = [];
    const productosSinPrecio: ProductoSesion[] = [];

    for (const prod of datos.productos) {
      const precioConf = await this.botTools.buscarPrecioConfigurado(prod.ide_inarti, prod.cantidad, ideEmpr);
      this.logger.log(`[Precio] ide_inarti=${prod.ide_inarti} "${prod.nombre}" cantidad=${prod.cantidad} → ${precioConf ? `precio_unit=${precioConf.precio_unitario} incluye_iva=${precioConf.incluye_iva} cant_min=${precioConf.cantidad_minima}` : 'SIN PRECIO CONFIGURADO'}`);
      if (precioConf) {
        const iva = precioConf.incluye_iva ? 1 : 1.12;
        const precioUnitario = Math.round(precioConf.precio_unitario * iva * 100) / 100;
        productosConPrecio.push({
          ...prod,
          precio_unitario: precioUnitario,
          precio_total: Math.round(precioUnitario * prod.cantidad * 100) / 100,
          tiene_precio: true,
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
        telefono: telefonoWa.replace(/^\+/, ''),
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

    const db = this.proformasService['dataSource'].pool;

    // Actualizar precios en los detalles cuando están disponibles
    if (todosTienePrecio) {
      for (const p of productosConPrecio) {
        try {
          // precio_ccdpr = precio sin IVA (si el configurado ya incluía IVA, extraemos la base)
          const precioSinIva = p.tiene_precio
            ? Math.round((p.precio_unitario / 1) * 100) / 100  // ya calculamos con IVA incluido en procesarProforma
            : p.precio_unitario;
          await db.query(
            `UPDATE cxc_deta_proforma
             SET precio_ccdpr = $1, total_ccdpr = $2, iva_inarti_ccdpr = 1
             WHERE ide_cccpr = $3 AND ide_inarti = $4`,
            [precioSinIva, p.precio_total, ide_cccpr, p.ide_inarti],
          );
          this.logger.log(`[Proforma] Detalle actualizado ide_inarti=${p.ide_inarti} precio=${precioSinIva} total=${p.precio_total}`);
        } catch (err) {
          this.logger.warn(`[Proforma] No se actualizó detalle ide_inarti=${p.ide_inarti}: ${err.message}`);
        }
      }

      // Recalcular totales en la cabecera desde los detalles
      try {
        await db.query(`
          UPDATE cxc_cabece_proforma c
          SET
            base_grabada_cccpr = sums.base_grabada,
            base_tarifa0_cccpr = sums.base_tarifa0,
            tarifa_iva_cccpr   = COALESCE(iva.porcentaje_cnpim, 15),
            valor_iva_cccpr    = ROUND(sums.base_grabada * COALESCE(iva.porcentaje_cnpim, 15) / 100, 2),
            total_cccpr        = sums.base_tarifa0 + sums.base_grabada
                                 + ROUND(sums.base_grabada * COALESCE(iva.porcentaje_cnpim, 15) / 100, 2)
          FROM (
            SELECT
              COALESCE(SUM(CASE WHEN d.iva_inarti_ccdpr = 1 THEN d.total_ccdpr ELSE 0 END), 0) AS base_grabada,
              COALESCE(SUM(CASE WHEN d.iva_inarti_ccdpr != 1 OR d.iva_inarti_ccdpr IS NULL THEN d.total_ccdpr ELSE 0 END), 0) AS base_tarifa0
            FROM cxc_deta_proforma d
            WHERE d.ide_cccpr = $1
          ) sums,
          LATERAL (
            SELECT porcentaje_cnpim
            FROM con_porcen_impues
            WHERE CURRENT_DATE BETWEEN fecha_desde_cnpim AND fecha_fin_cnpim
              AND activo_cnpim = TRUE
            ORDER BY fecha_desde_cnpim DESC
            LIMIT 1
          ) iva
          WHERE c.ide_cccpr = $1
        `, [ide_cccpr]);
        this.logger.log(`[Proforma] Cabecera actualizada con totales para ide_cccpr=${ide_cccpr}`);
      } catch (err) {
        this.logger.warn(`[Proforma] No se actualizaron totales de cabecera: ${err.message}`);
      }
    }

    let pdfBuffer: Buffer | undefined;
    if (automatica) {
      // Verificar que el total sea mayor a 0 antes de generar PDF
      const check = await db.query<{ total: number }>(
        `SELECT COALESCE(total_cccpr, 0) AS total FROM cxc_cabece_proforma WHERE ide_cccpr = $1`,
        [ide_cccpr],
      );
      const totalProforma = Number(check.rows[0]?.total ?? 0);

      if (totalProforma <= 0) {
        this.logger.warn(`[Proforma] Total = ${totalProforma} — PDF no generado. Verificar precios.`);
      } else {
        try {
          await this.proformasService.asignarVendedorProforma(ide_cccpr, IDE_USUA_BOT, IDE_VGVEN_DEFAULT);
          pdfBuffer = await this.proformasService.getPdfBuffer(ide_cccpr, ideEmpr);
        } catch (err) {
          this.logger.error(`Error generando PDF proforma ${ide_cccpr}: ${err.message}`);
        }
      }
    }

    return { ide_cccpr, secuencial, automatica, conPrecio, productosConPrecio, productosSinPrecio, pdfBuffer };
  }
}
