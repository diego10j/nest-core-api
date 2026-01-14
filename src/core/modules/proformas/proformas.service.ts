import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { IdeDto } from 'src/common/dto/ide.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate, getCurrentDateTime, getCurrentTime } from 'src/util/helpers/date-util';

import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { ProformasDto } from './dto/proformas.dto';

const SOLICITUD = {
  tableName: 'cxc_cabece_proforma',
  primaryKey: 'ide_cccpr',
};

const DETALLES = {
  tableName: 'cxc_deta_proforma',
  primaryKey: 'ide_ccdpr',
};

@Injectable()
export class ProformasService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    // obtiene las variables del sistema para el servicio
    this.core
      .getVariables([
        'p_cxc_estado_factura_normal', // 0
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async getProformas(dtoIn: ProformasDto & HeaderParamsDto) {
    const query = new SelectQuery(`     
        select
            a.ide_cccpr,
            a.secuencial_cccpr,
            a.fecha_cccpr,
            a.solicitante_cccpr,
            a.correo_cccpr,
            b.nom_usua,
            c.nombre_cctpr,
            a.total_cccpr,
            a.utilidad_cccpr,   
            v.nombre_vgven,
            f.fecha_emisi_cccfa,
            f.secuencial_cccfa,
            f.total_cccfa,
            f.ide_geper,
            g.nom_geper,
            a.anulado_cccpr,
            a.enviado_cccpr,
            (select count(1) from cxc_deta_proforma where ide_cccpr = a.ide_cccpr ) as num_articulos
        from
            cxc_cabece_proforma a
            inner join sis_usuario b on a.ide_usua = b.ide_usua
            left join cxc_tipo_proforma c on a.ide_cctpr = c.ide_cctpr
            left join ven_vendedor v on a.ide_vgven = v.ide_vgven
            left join cxc_cabece_factura f on a.secuencial_cccpr = f.num_proforma_cccfa  and f.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}         
            left join gen_persona g on f.ide_geper = g.ide_geper
        where
            a.fecha_cccpr between $1 and $2
            and a.ide_empr = ${dtoIn.ideEmpr}
        order by
            a.secuencial_cccpr desc
        `);
    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  async getCabProforma(dtoIn: IdeDto & HeaderParamsDto) {
    const query = new SelectQuery(`     
        select 
            c.ide_cccpr,
            c.secuencial_cccpr,
            c.fecha_cccpr,
            c.solicitante_cccpr,
            c.correo_cccpr,
            c.base_grabada_cccpr,
            c.base_tarifa0_cccpr,
            c.valor_iva_cccpr,
            c.total_cccpr,
            c.tarifa_iva_cccpr,
            c.observacion_cccpr,
            c.referencia_cccpr,
            c.anulado_cccpr,
            c.telefono_cccpr,
            c.enviado_cccpr,
            ti.nombre_getid,
            c.identificac_cccpr,
            v.nombre_vgven,
            c.direccion_cccpr,
            c.contacto_cccpr,
            te.nombre_ccten,
            va.nombre_ccvap,
            c.utilidad_cccpr,
            c.fecha_ingre,
            c.hora_ingre,
            c.usuario_ingre,
            c.fecha_actua,
            c.hora_actua,
            c.usuario_actua,
            f.ide_cccfa,
            f.fecha_emisi_cccfa,
            f.secuencial_cccfa,
            f.base_grabada_cccfa,
            f.base_tarifa0_cccfa,
            f.base_no_objeto_iva_cccfa,
            f.tarifa_iva_cccfa,
            f.valor_iva_cccfa,
            f.total_cccfa,
            u.nom_usua,
            p.nom_geper,
            p.uuid,
            p.identificac_geper,
            p.correo_geper,
            p.direccion_geper,
            p.telefono_geper
        from cxc_cabece_proforma c
        left join  cxc_cabece_factura f on c.secuencial_cccpr = f.num_proforma_cccfa
        left join gen_tipo_identifi ti on c.ide_getid = ti.ide_getid
        left join sis_usuario u on c.ide_usua = u.ide_usua
        left join ven_vendedor v on c.ide_vgven = v.ide_vgven
        left join cxc_tipo_proforma t on c.ide_cctpr = t.ide_cctpr
        left join cxc_validez_prof va on c.ide_ccvap = va.ide_ccvap
        left join cxc_tiempo_entrega te on c.ide_ccten = te.ide_ccten
        left join gen_persona p on c.identificac_cccpr = p.identificac_geper
        where c.ide_cccpr =  $1
        and c.ide_empr = ${dtoIn.ideEmpr}
        `);
    query.addParam(1, dtoIn.ide);
    return this.dataSource.createQuery(query);
  }

  async getDetallesProforma(dtoIn: IdeDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `     
    select 
        d.ide_ccdpr,
        d.ide_inarti,
        d.observacion_ccdpr,
        d.cantidad_ccdpr,
        u.siglas_inuni,
        d.precio_ccdpr,
        d.total_ccdpr,
        d.iva_inarti_ccdpr,
        a.nombre_inarti,
        d.precio_compra_ccdpr,
        d.porcentaje_util_ccdpr,
        d.utilidad_ccdpr,
        a.codigo_inarti,
        a.uuid,
        d.fecha_ingre,
        d.hora_ingre,
        d.usuario_ingre,
        d.fecha_actua,
        d.hora_actua,
        d.usuario_actua
        from
        cxc_deta_proforma d
        inner join inv_articulo a on d.ide_inarti = a.ide_inarti
        left join inv_unidad u on a.ide_inuni = u.ide_inuni
        where  d.ide_cccpr =  $1
        and d.ide_empr =  ${dtoIn.ideEmpr}
        order by observacion_ccdpr
        `,
      dtoIn,
    );
    query.addParam(1, dtoIn.ide);
    return this.dataSource.createQuery(query);
  }

  /**
   * Guarda una proforma proveniente de una canal externo como pagina web
   */
  async createProformaWeb(dtoIn: CreateProformaWebDto) {
    const listQuery: Query[] = [];
    const solicitudId = await this.asyncgetNextSolicitudId();
    // Construir query para cabecera
    const cabeceraQuery = this.buildInsertSolicitudQuery(solicitudId, dtoIn);
    listQuery.push(cabeceraQuery);

    // Procesar detalles
    const detallesIds = await this.getNextDetalleIds(dtoIn.detalles.length);
    await this.processDetails(dtoIn, solicitudId, detallesIds, listQuery);

    const resultMessage = await this.dataSource.createListQuery(listQuery);

    return {
      success: true,
      message: 'Campaña guardada correctamente',
      data: {
        ide_cccpr: solicitudId,
        totalQueries: listQuery.length,
        resultMessage,
      },
    };
  }

  private asyncgetNextSolicitudId(login: string = 'sa'): Promise<number> {
    return this.dataSource.getSeqTable(SOLICITUD.tableName, SOLICITUD.primaryKey, 1, login);
  }

  private async getNextDetalleIds(length: number, login: string = 'sa'): Promise<number> {
    return this.dataSource.getSeqTable(DETALLES.tableName, DETALLES.primaryKey, length, login);
  }

  private buildInsertSolicitudQuery(seqCabecera: number, dtoIn: CreateProformaWebDto): InsertQuery {
    const q = new InsertQuery(SOLICITUD.tableName, SOLICITUD.primaryKey, dtoIn);

    q.values.set(SOLICITUD.primaryKey, seqCabecera);
    q.values.set('fecha_cccpr', dtoIn.solicitante.fecha);
    q.values.set('solicitante_cccpr', dtoIn.solicitante.nombres);
    q.values.set('ide_empr', dtoIn.solicitante.ideEmpr);
    q.values.set('correo_cccpr', dtoIn.solicitante.correo);
    q.values.set('secuencial_cccpr', '');
    q.values.set('observacion_cccpr', dtoIn.solicitante.observacion);
    q.values.set('telefono_cccpr', dtoIn.solicitante.telefono);
    q.values.set('direccion_cccpr', dtoIn.solicitante.direccion);
    q.values.set('fecha_ingre', getCurrentDate());
    q.values.set('hora_actua', getCurrentTime());
    q.values.set('ide_cctpr', 2); // 2 == Pagina web

    return q;
  }

  /**
   * Procesa los detalles de la campaña
   */
  private async processDetails(dtoIn: CreateProformaWebDto, seqCabecera: number, seqStart: number, listQuery: Query[]) {
    let seq = seqStart;

    for (const detalle of dtoIn.detalles) {
      const insertQuery = new InsertQuery(DETALLES.tableName, DETALLES.primaryKey, dtoIn);
      insertQuery.values.set(DETALLES.primaryKey, seq);
      insertQuery.values.set(SOLICITUD.primaryKey, seqCabecera);
      insertQuery.values.set('cantidad_ccdpr', detalle.cantidad);
      insertQuery.values.set('observacion_ccdpr', detalle.producto);
      insertQuery.values.set('ide_empr', dtoIn.solicitante.ideEmpr);
      insertQuery.values.set('hora_actua', getCurrentTime());
      insertQuery.values.set('fecha_ingre', getCurrentDate());

      listQuery.push(insertQuery);
      seq++;
    }
  }

  async updateOpenSolicitud(ide_cccpr: number, login: string) {
    const query = new UpdateQuery(SOLICITUD.tableName, SOLICITUD.primaryKey);
    query.values.set('fecha_abre_cccpr', getCurrentDateTime());
    query.values.set('usuario_abre_cccpr', login);
    query.where = 'ide_cccpr = $1 and fecha_abre_cccpr is null and usuario_abre_cccpr is null';
    query.addNumberParam(1, ide_cccpr);
    console.log(query);
    return this.dataSource.createQuery(query);
  }
}
