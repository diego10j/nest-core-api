import { Injectable, Logger } from '@nestjs/common';
import { getCurrentDate } from 'src/util/helpers/date-util';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';

import { DatosSesion, ProductoSesion } from './interfaces/bot-session.interface';
import { BotToolsService } from './bot-tools.service';

export const IDE_USUA_BOT     = 32;  // Usuario bot asignado a proformas automáticas
export const IDE_VGVEN_DEFAULT = 3;  // Vendedor por defecto para cotizaciones automáticas

export interface ResultadoProforma {
  ide_cccpr: number;
  secuencial: string;
  automatica: boolean;
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

    const automatica = productosSinPrecio.length === 0 &&
      datos.productos.every((p) => p.en_catalogo !== false);

    const detalles = datos.productos.map((p) => ({
      producto: p.nombre,
      cantidad: p.cantidad,
      unidad: p.siglas_unidad || p.unidad,
    }));

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
        formaEntrega: datos.envio?.transporte || 'Por definir',
        observacion: automatica
          ? `Cotización automática generada por ${nombreBot} vía WhatsApp`
          : `Cotización generada por ${nombreBot} vía WhatsApp — revisar productos sin precio`,
        ideEmpr,
      },
      detalles,
    } as any);

    const ide_cccpr: number = resultado.data.ide_cccpr;
    const secuencial: string = resultado.data.secuencial_cccpr;

    let pdfBuffer: Buffer | undefined;

    if (automatica) {
      try {
        await this.proformasService.asignarVendedorProforma(ide_cccpr, IDE_USUA_BOT, IDE_VGVEN_DEFAULT);
        pdfBuffer = await this.proformasService.getPdfBuffer(ide_cccpr, ideEmpr);
      } catch (err) {
        this.logger.error(`Error generando PDF proforma ${ide_cccpr}: ${err.message}`);
      }
    }

    return { ide_cccpr, secuencial, automatica, productosConPrecio, productosSinPrecio, pdfBuffer };
  }
}
