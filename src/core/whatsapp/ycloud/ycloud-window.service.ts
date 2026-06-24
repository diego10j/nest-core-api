import { Injectable, Logger } from '@nestjs/common';
import { isDefined } from 'class-validator';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

@Injectable()
export class YcloudWindowService {
  private readonly logger = new Logger(YcloudWindowService.name);

  constructor(public readonly dataSource: DataSourceService) {}

  async canSendFreeMessage(
    phoneNumberId: string,
    waId: string,
  ): Promise<{ allowed: boolean; reason?: string; lastInbound?: Date }> {
    const waIdClean = waId.replace(/^\+/, '');
    const phoneIdClean = phoneNumberId.replace(/^\+/, '');
    const query = new SelectQuery(`
      SELECT
        ultimo_ingreso_cliente_whcha,
        EXTRACT(EPOCH FROM (NOW() - ultimo_ingreso_cliente_whcha))::INT AS segundos_desde_ultimo_ingreso
      FROM wha_chat
      WHERE wa_id_whcha = $1
        AND phone_number_id_whcha = $2
      LIMIT 1
    `);
    query.addParam(1, waIdClean);
    query.addStringParam(2, phoneIdClean);

    const chat = await this.dataSource.createSingleQuery(query);

    if (!isDefined(chat) || !isDefined(chat.ultimo_ingreso_cliente_whcha)) {
      return {
        allowed: false,
        reason:
          'No es posible responder.\nEl cliente nunca ha escrito.\nUtilice una plantilla aprobada o responda desde WhatsApp Business.',
      };
    }

    const lastInbound = new Date(chat.ultimo_ingreso_cliente_whcha);
    const hoursSinceLastInbound = (Date.now() - lastInbound.getTime()) / (1000 * 60 * 60);

    if (hoursSinceLastInbound > 24) {
      return {
        allowed: false,
        reason:
          'No es posible responder.\nLa ventana de atencion expiro.\nUtilice una plantilla aprobada o responda desde WhatsApp Business.',
        lastInbound,
      };
    }

    return { allowed: true, lastInbound };
  }

  async registerInboundMessage(waId: string, phoneNumberId: string): Promise<void> {
    const query = new UpdateQuery('wha_chat', 'uuid');
    query.values.set('ultimo_ingreso_cliente_whcha', new Date().toISOString());
    query.where = 'wa_id_whcha = $1 AND phone_number_id_whcha = $2';
    query.addParam(1, waId);
    query.addStringParam(2, phoneNumberId);
    await this.dataSource.createQuery(query);
  }

  async assignAgent(waId: string, phoneNumberId: string, ideUsua: number): Promise<void> {
    const query = new UpdateQuery('wha_chat', 'uuid');
    query.values.set('ide_usua_asignado_whcha', ideUsua);
    query.values.set('hora_asignacion_whcha', new Date().toISOString());
    query.where = 'wa_id_whcha = $1 AND phone_number_id_whcha = $2';
    query.addParam(1, waId);
    query.addStringParam(2, phoneNumberId);
    await this.dataSource.createQuery(query);
  }
}
