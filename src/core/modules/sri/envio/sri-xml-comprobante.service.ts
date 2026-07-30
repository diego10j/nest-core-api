import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { InsertQuery, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

export interface SriXmlComprobanteRow {
  ideSrxmc: number;
  ideSrcom: number;
  codigoEstado: number;
  xmlComprobante?: string;
  mensajeRecepcion?: string;
  mensajeAutorizacion?: string;
}

export interface GuardarXmlComprobanteData {
  ideSrxmc?: number;
  ideSrcom: number;
  codigoEstado: number;
  xmlComprobante?: string;
  mensajeRecepcion?: string;
  mensajeAutorizacion?: string;
}

/** Puerto de XmlComprobanteDAOImp.java (legacy sigafi-ceo): historial de XML/mensajes por comprobante SRI. */
@Injectable()
export class SriXmlComprobanteService extends BaseService {
  constructor(private readonly dataSource: DataSourceService) {
    super();
  }

  async getUltimo(ideSrcom: number, dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<SriXmlComprobanteRow | undefined> {
    const query = new SelectQuery(
      `
        SELECT
            ide_srxmc AS "ideSrxmc",
            ide_srcom AS "ideSrcom",
            ide_sresc AS "codigoEstado",
            xml_srxmc AS "xmlComprobante",
            msg_recepcion_srxmc AS "mensajeRecepcion",
            msg_autoriza_srxmc AS "mensajeAutorizacion"
        FROM sri_xml_comprobante
        WHERE ide_srcom = $1
        ORDER BY fecha_hora_srxmc DESC
        LIMIT 1
        `,
      dtoIn,
    );
    query.addIntParam(1, ideSrcom);
    const res = await this.dataSource.createSingleQuery(query);
    return res ?? undefined;
  }

  /**
   * Último registro de historial (XML + estado + mensajes de recepción/autorización)
   * de un comprobante, por clave de acceso. Se usa para "Ver XML": cuando el estado no
   * es AUTORIZADO, el mensaje de recepción/autorización explica por qué (ej. DEVUELTA).
   */
  async getXmlPorClaveAcceso(claveAcceso: string, dtoIn: QueryOptionsDto & HeaderParamsDto): Promise<SriXmlComprobanteRow | undefined> {
    const query = new SelectQuery(
      `
        SELECT
            x.ide_srxmc AS "ideSrxmc",
            x.ide_srcom AS "ideSrcom",
            x.ide_sresc AS "codigoEstado",
            x.xml_srxmc AS "xmlComprobante",
            x.msg_recepcion_srxmc AS "mensajeRecepcion",
            x.msg_autoriza_srxmc AS "mensajeAutorizacion"
        FROM sri_xml_comprobante x
        INNER JOIN sri_comprobante s ON x.ide_srcom = s.ide_srcom
        WHERE s.claveacceso_srcom = $1
        ORDER BY x.fecha_hora_srxmc DESC
        LIMIT 1
        `,
      dtoIn,
    );
    query.addStringParam(1, claveAcceso);
    const res = await this.dataSource.createSingleQuery(query);
    return res ?? undefined;
  }

  /** Inserta un registro nuevo si no se pasa ideSrxmc, o actualiza el existente (paridad con XmlComprobanteDAOImp.guardar). */
  async guardar(data: GuardarXmlComprobanteData): Promise<void> {
    if (!data.ideSrxmc) {
      const ideSrxmc = await this.dataSource.getSeqTable('sri_xml_comprobante', 'ide_srxmc', 1);
      const ins = new InsertQuery('sri_xml_comprobante', 'ide_srxmc');
      ins.values.set('ide_srxmc', ideSrxmc);
      ins.values.set('ide_srcom', data.ideSrcom);
      ins.values.set('ide_sresc', data.codigoEstado);
      ins.values.set('xml_srxmc', data.xmlComprobante ?? null);
      ins.values.set('msg_recepcion_srxmc', data.mensajeRecepcion ?? null);
      ins.values.set('msg_autoriza_srxmc', data.mensajeAutorizacion ?? null);
      ins.values.set('fecha_hora_srxmc', new Date());
      await this.dataSource.createQuery(ins);
      return;
    }

    const upd = new UpdateQuery('sri_xml_comprobante', 'ide_srxmc');
    upd.values.set('ide_srcom', data.ideSrcom);
    upd.values.set('ide_sresc', data.codigoEstado);
    upd.values.set('xml_srxmc', data.xmlComprobante ?? null);
    upd.values.set('msg_recepcion_srxmc', data.mensajeRecepcion ?? null);
    upd.values.set('msg_autoriza_srxmc', data.mensajeAutorizacion ?? null);
    upd.values.set('fecha_hora_srxmc', new Date());
    upd.where = `ide_srxmc = ${data.ideSrxmc}`;
    await this.dataSource.createQuery(upd);
  }
}
