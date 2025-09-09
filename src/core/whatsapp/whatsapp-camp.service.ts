import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isDefined } from 'class-validator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { extractErrorMessage } from 'src/util/helpers/common-util';
import { getCurrentDateTime } from 'src/util/helpers/date-util';

import { DeleteQuery, InsertQuery, Query, UpdateQuery } from '../connection/helpers';

import { EnviarCampaniaDto } from './dto/enviar-campania.dto';
import { SaveCampaniaDto } from './dto/save-campania.dto';
import { createFileInstanceFromPath } from './web/helper/util';
import { WhatsappWebService } from './web/whatsapp-web.service';
import { WhatsappDbService } from './whatsapp-db.service';

const CABECERA = {
  tableName: 'wha_cab_camp_envio',
  primaryKey: 'ide_whcenv',
};

const DETALLES = {
  tableName: 'wha_det_camp_envio',
  primaryKey: 'ide_whdenv',
};

// Estados de la campaña
const CAMPAIGN_STATUS = {
  PENDIENTE: 1,
  PROCESANDO: 2,
  ENVIADO: 3,
};

@Injectable()
export class WhatsappCampaniaService {
  private readonly logger = new Logger(WhatsappCampaniaService.name);

  constructor(
    private readonly whatsappWeb: WhatsappWebService,
    private readonly whatsappDB: WhatsappDbService,
  ) {}

  /**
   * Guarda una campaña nueva o actualiza una existente
   */
  async saveCampania(dtoIn: SaveCampaniaDto & HeaderParamsDto) {
    const listQuery: Query[] = [];
    const cabeceraId = dtoIn.cabecera.ide_whcenv;

    // eliminar detalles si se proporciona un ID de cabecera
    if (cabeceraId) {
      listQuery.push(this.buildDeleteDetailsQuery(cabeceraId));
    }

    const seqCabecera = cabeceraId || (await this.getNextCabeceraId(dtoIn));

    // Construir query para cabecera
    const cabeceraQuery = cabeceraId
      ? this.buildUpdateCabeceraQuery(seqCabecera, dtoIn)
      : this.buildInsertCabeceraQuery(seqCabecera, dtoIn);
    listQuery.push(cabeceraQuery);

    // Procesar detalles
    const detallesIds = await this.getNextDetalleIds(dtoIn.detalles.length, dtoIn.login);
    await this.processDetails(dtoIn, seqCabecera, detallesIds, listQuery);
    const resultMessage = await this.whatsappDB.dataSource.createListQuery(listQuery);

    return {
      success: true,
      message: 'Campaña guardada correctamente',
      data: {
        ide_whcenv: seqCabecera,
        totalQueries: listQuery.length,
        resultMessage,
      },
    };
  }

  /**
   * Envía una campaña de texto
   */
  async sendCampania(dtoIn: EnviarCampaniaDto & HeaderParamsDto) {
    return this.processCampaignSend(dtoIn);
  }

  // ============ MÉTODOS PRIVADOS ============

  /**
   * Procesa el envío de una campaña (común para texto y multimedia)
   */
  private async processCampaignSend(dtoIn: EnviarCampaniaDto & HeaderParamsDto) {
    // Validaciones iniciales
    const dataCamp = await this.validateCampaign(dtoIn);
    const media = dataCamp.cabecera.media_whcenv;
    const file = media ? await createFileInstanceFromPath(media) : undefined;
    // Actualizar estado a "Enviado"
    await this.updateCampaignStatus(dtoIn.ide_whcenv, CAMPAIGN_STATUS.PROCESANDO);
    // Procesar envíos
    const type = file ? 'media' : 'text';
    this.processMessages(dataCamp.cabecera, dataCamp.detalles, dtoIn, type, file);

    return {
      message: 'Se Inicia el envio de la campaña',
    };
  }

  /**
   * Valida una campaña antes de enviar
   */
  private async validateCampaign(dtoIn: EnviarCampaniaDto & HeaderParamsDto) {
    const dataCamp = await this.whatsappDB.getCampaniaById(dtoIn);

    if (isDefined(dataCamp.cabecera) === false) {
      throw new BadRequestException(`La campaña de id ${dtoIn.ide_whcenv} no existe`);
    }

    if (dataCamp.detalles.length === 0) {
      throw new BadRequestException(`La campaña de id ${dtoIn.ide_whcenv} no tiene detalles`);
    }

    if (dataCamp.cabecera.ide_whesce !== CAMPAIGN_STATUS.PENDIENTE) {
      throw new BadRequestException('La campaña no se encuentra en estado Pendiente');
    }

    // Validación de números de teléfono internacionales (formato E.164 para WhatsApp)
    const phoneRegex = /^\d{8,15}$/; // Longitud total válida (incluyendo código país)
    const countryCodeRegex = /^\d{1,3}$/; // Códigos de país tienen 1-3 dígitos

    const invalidPhones = dataCamp.detalles.filter((detalle) => {
      const phoneStr = detalle.telefono_whden?.toString().trim() || '';

      // Verifica que el número tenga código de país y sea válido
      if (phoneStr.startsWith('+')) {
        const parts = phoneStr.substring(1).split(/(?=\d{8,15}$)/);
        return parts.length !== 2 || !countryCodeRegex.test(parts[0]) || !phoneRegex.test(parts[1]);
      } else {
        // Si no tiene +, verifica que al menos tenga 8-15 dígitos
        return !phoneRegex.test(phoneStr);
      }
    });

    if (invalidPhones.length > 0) {
      const invalidNumbers = invalidPhones.map((d) => d.telefono_whden).join(', ');
      throw new BadRequestException(
        `Los siguientes números no tienen formato internacional válido (código de país + número): ${invalidNumbers}. ` +
          `Ejemplo válido: +593987654321 o 593987654321`,
      );
    }

    return dataCamp;
  }

  /**
   * Procesa los mensajes en secuencia respetando la cola interna y actualiza el estado al finalizar
   */
  private async processMessages(
    cabecera: any,
    detalles: any[],
    dtoIn: EnviarCampaniaDto & HeaderParamsDto,
    type: 'text' | 'media',
    file?: Express.Multer.File,
  ) {
    try {
      for (const current of detalles) {
        try {
          // primero validamos que el numero tenga whatsapp
          const validation = await this.whatsappWeb.validateWhatsAppNumber(dtoIn.ideEmpr, current.telefono_whden);

          if (validation.isValid) {
            const telefono = validation.formattedNumber || current.telefono;
            const commonData = {
              telefono,
              emitSocket: false,
              ...(type === 'text'
                ? { texto: cabecera.mensaje_whcenv, tipo: 'text' }
                : { caption: cabecera.mensaje_whcenv }),
            };

            const res =
              type === 'text'
                ? await this.whatsappWeb.enviarMensajeTexto({
                    ...commonData,
                    ...dtoIn,
                    texto: cabecera.mensaje_whcenv,
                    tipo: 'text',
                  })
                : await this.whatsappWeb.enviarMensajeMedia(
                    { ...commonData, ...dtoIn, caption: cabecera.mensaje_whcenv },
                    file,
                  );

            if (res.messageId) {
              await this.updateMessageId(current.ide_whdenv, res.messageId, telefono);
            }
          } else {
            // actualiza error
            await this.updateMessageError(current.ide_whdenv, `El número no está registrado en WhatsApp.`);
          }
        } catch (error) {
          this.logger.error(`Error enviando mensaje a ${current.telefono_whden}:`, error);
          await this.updateMessageError(current.ide_whdenv, extractErrorMessage(error));
        }
      }

      // Actualizar estado de la campaña después de procesar todos los mensajes
      await this.updateCampaignStatus(dtoIn.ide_whcenv, CAMPAIGN_STATUS.ENVIADO);
    } catch (error) {
      this.logger.error('Error general en processMessages:', error);
      throw error;
    }
  }

  /**
   * Actualiza el ID del mensaje en el detalle
   */
  private async updateMessageId(ide_whdenv: number, messageId: string, formattedNumber: string) {
    const query = new UpdateQuery(DETALLES.tableName, DETALLES.primaryKey);
    query.values.set('id_mensaje_whden', messageId);
    query.values.set('telefono_whden', formattedNumber);
    query.values.set('tiene_whats_whden', true);
    query.values.set('fecha_envio_whden', getCurrentDateTime());
    query.where = 'ide_whdenv = $1';
    query.addNumberParam(1, ide_whdenv);
    await this.whatsappDB.dataSource.createQuery(query);
  }

  private async updateMessageError(ide_whdenv: number, error: string) {
    const query = new UpdateQuery(DETALLES.tableName, DETALLES.primaryKey);
    query.values.set('error_whden', error);
    query.values.set('fecha_envio_whden', getCurrentDateTime());
    query.where = 'ide_whdenv = $1';
    query.addNumberParam(1, ide_whdenv);
    await this.whatsappDB.dataSource.createQuery(query);
  }

  /**
   * Actualiza el estado de la campaña
   */
  async updateCampaignStatus(ide_whcenv: number, status: number) {
    const query = new UpdateQuery(CABECERA.tableName, CABECERA.primaryKey);
    query.values.set('ide_whesce', status);
    query.where = 'ide_whcenv = $1';
    query.addNumberParam(1, ide_whcenv);

    return await this.whatsappDB.dataSource.createQuery(query);
  }

  /**
   * Procesa los detalles de la campaña
   */
  private async processDetails(
    dtoIn: SaveCampaniaDto & HeaderParamsDto,
    seqCabecera: number,
    seqStart: number,
    listQuery: Query[],
  ) {
    let seq = seqStart;

    for (const detalle of dtoIn.detalles) {
      const insertQuery = new InsertQuery(DETALLES.tableName, DETALLES.primaryKey, dtoIn);
      insertQuery.values.set(DETALLES.primaryKey, seq);
      insertQuery.values.set('telefono_whden', detalle.telefono);
      insertQuery.values.set('observacion_whden', detalle.observacion);
      insertQuery.values.set('ide_whcenv', seqCabecera);
      listQuery.push(insertQuery);
      seq++;
    }
  }

  async deleteDetailCampaniaById(detalleId: number) {
    const deleteQuery = new DeleteQuery(DETALLES.tableName);
    deleteQuery.where = 'ide_whdenv = $1';
    deleteQuery.addParam(1, detalleId);
    return await this.whatsappDB.dataSource.createQuery(deleteQuery);
  }

  // ============ QUERY BUILDERS ============

  private buildDeleteDetailsQuery(cabeceraId: number): DeleteQuery {
    const deleteQuery = new DeleteQuery(DETALLES.tableName);
    deleteQuery.where = 'ide_whcenv = $1';
    deleteQuery.addParam(1, cabeceraId);
    return deleteQuery;
  }

  private buildInsertCabeceraQuery(seqCabecera: number, dtoIn: SaveCampaniaDto & HeaderParamsDto): InsertQuery {
    const q = new InsertQuery(CABECERA.tableName, CABECERA.primaryKey, dtoIn);
    const c = dtoIn.cabecera;

    q.values.set(CABECERA.primaryKey, seqCabecera);
    q.values.set('ide_whtice', c.ide_whtice);
    q.values.set('descripcion_whcenv', c.descripcion_whcenv);
    q.values.set('mensaje_whcenv', c.mensaje_whcenv);
    q.values.set('media_whcenv', c.media_whcenv);
    q.values.set('ide_whcue', c.ide_whcue);
    q.values.set('hora_progra_whcenv', c.hora_progra_whcenv);
    q.values.set('programado_whcenv', c.programado_whcenv);
    q.values.set('activo_whcenv', c.activo_whcenv);
    q.values.set('ide_whesce', c.ide_whesce);

    return q;
  }

  private buildUpdateCabeceraQuery(seqCabecera: number, dtoIn: SaveCampaniaDto & HeaderParamsDto): UpdateQuery {
    const q = new UpdateQuery(CABECERA.tableName, CABECERA.primaryKey, dtoIn);
    const c = dtoIn.cabecera;

    q.values.set('ide_whtice', c.ide_whtice);
    q.values.set('descripcion_whcenv', c.descripcion_whcenv);
    q.values.set('mensaje_whcenv', c.mensaje_whcenv);
    q.values.set('media_whcenv', c.media_whcenv);
    q.values.set('hora_progra_whcenv', c.hora_progra_whcenv);
    q.values.set('programado_whcenv', c.programado_whcenv);
    q.values.set('activo_whcenv', c.activo_whcenv);
    q.values.set('ide_whesce', c.ide_whesce);

    q.where = 'ide_whcenv = $1';
    q.addNumberParam(1, seqCabecera);

    return q;
  }

  // ============ HELPERS ============

  private async getNextCabeceraId(dtoIn: HeaderParamsDto): Promise<number> {
    return this.whatsappDB.dataSource.getSeqTable(CABECERA.tableName, CABECERA.primaryKey, 1, dtoIn.login);
  }

  private async getNextDetalleIds(length: number, login: string): Promise<number> {
    return this.whatsappDB.dataSource.getSeqTable(DETALLES.tableName, DETALLES.primaryKey, length, login);
  }
}
