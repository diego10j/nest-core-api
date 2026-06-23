import { Injectable, Logger } from '@nestjs/common';
import { getCurrentDate } from 'src/util/helpers/date-util';
import { ProformasService } from 'src/core/modules/proformas/proformas.service';

import { DatosSesion } from './interfaces/bot-session.interface';

@Injectable()
export class BotProformaService {
  private readonly logger = new Logger(BotProformaService.name);

  constructor(private readonly proformasService: ProformasService) {}

  async crearProformaBorrador(
    datos: DatosSesion,
    telefonoWa: string,
    ideEmpr: number,
    nombreBot: string,
  ): Promise<{ ide_cccpr: number; secuencial: string }> {
    const cliente = datos.cliente;
    const envio   = datos.envio;

    const detalles = datos.productos.map((p) => ({
      producto: p.nombre,
      cantidad: p.cantidad,
      unidad: p.unidad,
    }));

    const resultado = await this.proformasService.createProformaWeb({
      ideEmpr,
      ideSucu: 0,
      login: nombreBot,
      solicitante: {
        fecha: getCurrentDate(),
        nombres: cliente.nombres,
        correo: cliente.correo,
        telefono: telefonoWa.replace(/^\+/, ''),
        provincia: envio?.provincia || '',
        direccion: envio?.direccion || '',
        formaPago: 'cash',
        formaEntrega: envio?.transporte || 'Por definir',
        observacion: `Cotización generada automáticamente por bot ${nombreBot} vía WhatsApp`,
        ideEmpr,
      },
      detalles,
    } as any);

    return {
      ide_cccpr: resultado.data.ide_cccpr,
      secuencial: resultado.data.secuencial_cccpr,
    };
  }
}
