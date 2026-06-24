import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { isDefined } from 'class-validator';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { extractErrorMessage } from 'src/util/helpers/common-util';
import { getCurrentDateTime } from 'src/util/helpers/date-util';

import { DataSourceService } from 'src/core/connection/datasource.service';
import { DeleteQuery, InsertQuery, Query, UpdateQuery } from '../../connection/helpers';
import { EnviarCampaniaDto } from '../dto/enviar-campania.dto';
import { GetDetalleCampaniaDto } from '../dto/get-detalle-camp';
import { SaveCampaniaDto } from '../dto/save-campania.dto';
import { createFileFromTempPath } from '../helpers/media-util';
import { WhatsappDbService } from '../whatsapp-db.service';

import { YcloudService } from './ycloud.service';

const CABECERA = {
  tableName: 'wha_cab_camp_envio',
  primaryKey: 'ide_whcenv',
};

const DETALLES = {
  tableName: 'wha_det_camp_envio',
  primaryKey: 'ide_whdenv',
};

const CAMPAIGN_STATUS = {
  PENDIENTE: 1,
  PROCESANDO: 2,
  ENVIADO: 3,
};

@Injectable()
export class YcloudCampaniaService {
  private readonly logger = new Logger(YcloudCampaniaService.name);

  constructor(
    private readonly dataSource: DataSourceService,
    private readonly ycloudService: YcloudService,
    private readonly whatsappDB: WhatsappDbService,
  ) {}

  async getCampanias(dto: QueryOptionsDto & HeaderParamsDto) {
    return this.whatsappDB.getListaCampanias(dto);
  }

  async getCampaniaById(dto: EnviarCampaniaDto & HeaderParamsDto) {
    return this.whatsappDB.getCampaniaById(dto);
  }

  async getDetalleCampania(dto: GetDetalleCampaniaDto & HeaderParamsDto) {
    return this.whatsappDB.getDetalleCampania(dto);
  }

  async saveCampania(dtoIn: SaveCampaniaDto & HeaderParamsDto) {
    const listQuery: Query[] = [];
    const cabeceraId = dtoIn.cabecera.ide_whcenv;

    if (cabeceraId) {
      listQuery.push(this.buildDeleteDetailsQuery(cabeceraId));
    }

    const seqCabecera = cabeceraId || (await this.getNextCabeceraId(dtoIn));

    const cabeceraQuery = cabeceraId
      ? this.buildUpdateCabeceraQuery(seqCabecera, dtoIn)
      : this.buildInsertCabeceraQuery(seqCabecera, dtoIn);
    listQuery.push(cabeceraQuery);

    const detallesIds = await this.getNextDetalleIds(dtoIn.detalles.length, dtoIn.login);
    await this.processDetails(dtoIn, seqCabecera, detallesIds, listQuery);
    const resultMessage = await this.dataSource.createListQuery(listQuery);

    return {
      success: true,
      message: 'Campania guardada correctamente',
      data: {
        ide_whcenv: seqCabecera,
        totalQueries: listQuery.length,
        resultMessage,
      },
    };
  }

  async sendCampania(dtoIn: EnviarCampaniaDto & HeaderParamsDto) {
    return this.processCampaignSend(dtoIn);
  }

  async deleteDetailCampaniaById(detalleId: number) {
    const deleteQuery = new DeleteQuery(DETALLES.tableName);
    deleteQuery.where = 'ide_whdenv = $1';
    deleteQuery.addIntParam(1, detalleId);
    return await this.dataSource.createQuery(deleteQuery);
  }

  async updateCampaignStatus(ide_whcenv: number, status: number) {
    const query = new UpdateQuery(CABECERA.tableName, CABECERA.primaryKey);
    query.values.set('ide_whesce', status);
    query.where = 'ide_whcenv = $1';
    query.addIntParam(1, ide_whcenv);
    return await this.dataSource.createQuery(query);
  }

  private async processCampaignSend(dtoIn: EnviarCampaniaDto & HeaderParamsDto) {
    const dataCamp = await this.validateCampaign(dtoIn);
    const mediaFileName = dataCamp.cabecera.media_whcenv;
    const file = mediaFileName ? await createFileFromTempPath(mediaFileName) : undefined;

    await this.updateCampaignStatus(dtoIn.ide_whcenv, CAMPAIGN_STATUS.PROCESANDO);

    const type = file ? 'media' : 'text';
    this.processMessages(dataCamp.cabecera, dataCamp.detalles, dtoIn, type, file);

    return {
      message: 'Se inicia el envio de la campania via YCloud',
    };
  }

  private async validateCampaign(dtoIn: EnviarCampaniaDto & HeaderParamsDto) {
    const dataCamp = await this.whatsappDB.getCampaniaById(dtoIn);

    if (!isDefined(dataCamp.cabecera)) {
      throw new BadRequestException(`La campania de id ${dtoIn.ide_whcenv} no existe`);
    }

    if (dataCamp.detalles.length === 0) {
      throw new BadRequestException(`La campania de id ${dtoIn.ide_whcenv} no tiene detalles`);
    }

    if (dataCamp.cabecera.ide_whesce !== CAMPAIGN_STATUS.PENDIENTE) {
      throw new BadRequestException('La campania no se encuentra en estado Pendiente');
    }

    const phoneRegex = /^\d{8,15}$/;
    const invalidPhones = dataCamp.detalles.filter((detalle) => {
      const phoneStr = detalle.telefono_whden?.toString().trim() || '';
      if (phoneStr.startsWith('+')) {
        const parts = phoneStr.substring(1).split(/(?=\d{8,15}$)/);
        return parts.length !== 2 || !phoneRegex.test(parts[1]);
      }
      return !phoneRegex.test(phoneStr);
    });

    if (invalidPhones.length > 0) {
      const invalidNumbers = invalidPhones.map((d) => d.telefono_whden).join(', ');
      throw new BadRequestException(
        `Los siguientes numeros no tienen formato internacional valido: ${invalidNumbers}. ` +
          `Ejemplo valido: +593987654321 o 593987654321`,
      );
    }

    return dataCamp;
  }

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
          const validation = await this.ycloudService.validateNumber(
            dtoIn.ideEmpr,
            current.telefono_whden,
          );

          if (validation.isValid) {
            const telefono = validation.formattedNumber || current.telefono_whden;

            let res: { messageId: string };
            if (type === 'text') {
              res = await this.ycloudService.enviarMensajeTextoCampania(
                dtoIn.ideEmpr,
                telefono,
                cabecera.mensaje_whcenv,
              );
            } else {
              res = await this.ycloudService.enviarMensajeMediaCampania(
                dtoIn.ideEmpr,
                telefono,
                cabecera.mensaje_whcenv,
                file,
              );
            }

            if (res?.messageId) {
              await this.updateMessageId(current.ide_whdenv, res.messageId, telefono);
            }
          } else {
            await this.updateMessageError(current.ide_whdenv, validation.error || 'Numero no valido');
          }
        } catch (error) {
          this.logger.error(`Error enviando mensaje a ${current.telefono_whden}:`, error);
          await this.updateMessageError(current.ide_whdenv, extractErrorMessage(error));
        }
      }

      await this.updateCampaignStatus(dtoIn.ide_whcenv, CAMPAIGN_STATUS.ENVIADO);
    } catch (error) {
      this.logger.error('Error general en processMessages:', error);
      throw error;
    }
  }

  private async updateMessageId(ide_whdenv: number, messageId: string, formattedNumber: string) {
    const query = new UpdateQuery(DETALLES.tableName, DETALLES.primaryKey);
    query.values.set('id_mensaje_whden', messageId);
    query.values.set('telefono_whden', formattedNumber);
    query.values.set('tiene_whats_whden', true);
    query.values.set('fecha_envio_whden', getCurrentDateTime());
    query.where = 'ide_whdenv = $1';
    query.addIntParam(1, ide_whdenv);
    await this.dataSource.createQuery(query);
  }

  private async updateMessageError(ide_whdenv: number, error: string) {
    const query = new UpdateQuery(DETALLES.tableName, DETALLES.primaryKey);
    query.values.set('error_whden', error);
    query.values.set('fecha_envio_whden', getCurrentDateTime());
    query.where = 'ide_whdenv = $1';
    query.addIntParam(1, ide_whdenv);
    await this.dataSource.createQuery(query);
  }

  private buildDeleteDetailsQuery(cabeceraId: number): DeleteQuery {
    const deleteQuery = new DeleteQuery(DETALLES.tableName);
    deleteQuery.where = 'ide_whcenv = $1';
    deleteQuery.addIntParam(1, cabeceraId);
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
    q.addIntParam(1, seqCabecera);
    return q;
  }

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

  private async getNextCabeceraId(dtoIn: HeaderParamsDto): Promise<number> {
    return this.dataSource.getSeqTable(CABECERA.tableName, CABECERA.primaryKey, 1, dtoIn.login);
  }

  private async getNextDetalleIds(length: number, login: string): Promise<number> {
    return this.dataSource.getSeqTable(DETALLES.tableName, DETALLES.primaryKey, length, login);
  }
}
