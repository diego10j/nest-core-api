import { BadRequestException, Injectable } from '@nestjs/common';
import { ArrayIdeDto } from 'src/common/dto/array-ide.dto';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { UpdateQuery } from 'src/core/connection/helpers';
import { getCurrentDate, getCurrentDateTime } from 'src/util/helpers/date-util';

import { BaseService } from '../../../../common/base-service';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { CoreService } from '../../../core.service';

import { CabComprobanteInventarioDto } from './dto/cab-compr-inv.dto';
import { ComprobantesInvDto } from './dto/comprobantes-inv.dto';
import { LoteIngreso } from './dto/lote-ingreso.dto';
import { MovimientosPendientesInvDto } from './dto/mov-pendientes-inv.dto';
import { SaveDetInvEgresoDto } from './dto/save-det-inv-ingreso.dto';
import { SaveLoteDto } from './dto/save-lote.dto';

@Injectable()
export class ComprobantesInvService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    // obtiene las variables del sistema para el servicio
    this.core
      .getVariables([
        'p_inv_estado_normal', // 1
        'p_inv_estado_anulado', //0
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  /**
   * Retorna los comprovantes de inventario en todas las bodegas en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getComprobantesInventario(dtoIn: ComprobantesInvDto & HeaderParamsDto) {
    const condBodega = dtoIn.ide_inbod ? `AND a.ide_inbod = ${dtoIn.ide_inbod}` : '';

    const condEstado = dtoIn.ide_inepi ? `AND a.ide_inepi = ${dtoIn.ide_inepi}` : '';
    const query = new SelectQuery(
      `
    select
        a.ide_incci,
        a.fecha_trans_incci,
        a.numero_incci,
        c.nombre_inbod,
        d.nombre_intti,
        COALESCE(
              (
                  SELECT MAX(cccfa.secuencial_cccfa)
                  FROM cxc_cabece_factura cccfa
                  INNER JOIN inv_det_comp_inve det ON cccfa.ide_cccfa = det.ide_cccfa
                  WHERE det.ide_incci = a.ide_incci
              ),
              (
                  SELECT MAX(cpcfa.numero_cpcfa)
                  FROM cxp_cabece_factur cpcfa
                  INNER JOIN inv_det_comp_inve det ON cpcfa.ide_cpcfa = det.ide_cpcfa
                  WHERE det.ide_incci = a.ide_incci
              )
        ) AS referencia,
        f.nom_geper,
        a.ide_cnccc,
        a.ide_inepi,
        c.ide_inbod,
        verifica_incci,
        fec_cam_est_incci, 
        usuario_verifica_incci,
        automatico_incci,
            (
                SELECT COUNT(1) 
                FROM inv_det_comp_inve d
                INNER JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti 
                WHERE d.ide_incci = a.ide_incci
                    AND art.hace_kardex_inarti = true
            ) as total_items,
        a.observacion_incci,
        a.usuario_ingre,
        a.fecha_ingre,
        a.hora_ingre,
        a.usuario_actua,
        a.fecha_actua,
        a.hora_actua,
        f.uuid,
        signo_intci
    from
        inv_cab_comp_inve a
        inner join inv_bodega c on a.ide_inbod = c.ide_inbod
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join gen_persona f on a.ide_geper = f.ide_geper
    where
        fecha_trans_incci BETWEEN $1  and $2
        and a.ide_empr = $3
        ${condBodega}
        ${condEstado}
        order by  fecha_trans_incci desc, ide_incci desc
    `,
      dtoIn,
    );

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    query.addIntParam(3, dtoIn.ideEmpr);

    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna el detalle de productos de un comprobante de inventario
   * @param dtoIn
   * @returns
   */
  async getDetComprobanteInventario(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    select
        b.ide_indci,
        d.nombre_intti,
        g.nombre_inarti,
        case
            when signo_intci = 1 THEN f_decimales(b.cantidad_indci, g.decim_stock_inarti)
        end as INGRESO,
        case
            when signo_intci = -1 THEN f_decimales(b.cantidad_indci, g.decim_stock_inarti)
        end as EGRESO,
        precio_indci,
        valor_indci,
        b.observacion_indci,
        referencia_incci,
        peso_verifica_inlot,
        foto_verifica_indci,
        verifica_indci,
        usuario_verifica_indci,
        observ_verifica_indci,
        fecha_verifica_indci,
        signo_intci,
        b.cantidad_indci,
        decim_stock_inarti,
        siglas_inuni,
        g.uuid,
        a.usuario_ingre,
        a.fecha_ingre,
        a.hora_ingre,
        a.usuario_actua,
        a.fecha_actua,
        a.hora_actua
    from
        inv_cab_comp_inve a
        inner join inv_det_comp_inve b on a.ide_incci = b.ide_incci
        inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
        inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
        inner join inv_articulo g on b.ide_inarti = g.ide_inarti
        inner join inv_unidad h on g.ide_inuni = h.ide_inuni
    where
		a.ide_incci = $1
        and hace_kardex_inarti = true
        order by  g.nombre_inarti
    `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_incci);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna los comprovantes de inventario en todas las bodegas en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getCabComprobanteInventario(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        select
            a.ide_incci,
            a.numero_incci,
            a.fecha_trans_incci,
            c.nombre_inbod,
            d.nombre_intti,
            f.nom_geper,
            a.observacion_incci,
            a.ide_cnccc,
            g.nombre_inepi,
            automatico_incci,
            a.usuario_ingre,
            a.fecha_ingre,
            a.hora_ingre,
            a.usuario_actua,
            a.fecha_actua,
            a.hora_actua,
            verifica_incci,
            fec_cam_est_incci, 
            usuario_verifica_incci,
            signo_intci,
            f.uuid,
              COALESCE(
              (
                  SELECT MAX(cccfa.secuencial_cccfa)
                  FROM cxc_cabece_factura cccfa
                  INNER JOIN inv_det_comp_inve det ON cccfa.ide_cccfa = det.ide_cccfa
                  WHERE det.ide_incci = a.ide_incci
              ),
              (
                  SELECT MAX(cpcfa.numero_cpcfa)
                  FROM cxp_cabece_factur cpcfa
                  INNER JOIN inv_det_comp_inve det ON cpcfa.ide_cpcfa = det.ide_cpcfa
                  WHERE det.ide_incci = a.ide_incci
              )
          ) AS num_documento,
            (
                SELECT COUNT(1) 
                FROM inv_det_comp_inve d
                INNER JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti 
                WHERE d.ide_incci = a.ide_incci
                    AND art.hace_kardex_inarti = true
            ) as total_items
        from
            inv_cab_comp_inve a
            inner join inv_bodega c on a.ide_inbod = c.ide_inbod
            inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
            inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
            inner join gen_persona f on a.ide_geper = f.ide_geper
            inner join inv_est_prev_inve g on a.ide_inepi = g.ide_inepi
        where
            a.ide_incci = $1
            and a.ide_empr = ${dtoIn.ideEmpr}
    `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_incci);
    return await this.dataSource.createQuery(query);
  }

  async getIngresosPendientes(dtoIn: MovimientosPendientesInvDto & HeaderParamsDto) {
    if (dtoIn.signo !== 1) {
      throw new BadRequestException('El signo debe ser 1');
    }
    return this.getMovimientosPendientes(dtoIn);
  }

  async getEgresosPendientes(dtoIn: MovimientosPendientesInvDto & HeaderParamsDto) {
    if (dtoIn.signo !== -1) {
      throw new BadRequestException('El signo debe ser -1');
    }
    return this.getMovimientosPendientes(dtoIn);
  }

  private async getMovimientosPendientes(dtoIn: MovimientosPendientesInvDto & HeaderParamsDto) {
    const condBodega = dtoIn.ide_inbod ? 'AND a.ide_inbod = $3' : '';
    const nomCol = dtoIn.signo === 1 ? 'ingreso' : 'egreso';
    const query = new SelectQuery(
      `
        select
            a.ide_incci,
            a.numero_incci,
            a.fecha_trans_incci,
            c.nombre_inbod,
            d.nombre_intti,
            g.nombre_inarti,
            b.cantidad_indci as ${nomCol} ,
            siglas_inuni,
            f.nom_geper,
            a.observacion_incci,
            a.ide_cnccc,
            a.usuario_ingre,
            g.uuid,
            a.ide_inbod,
            f.uuid as uuid_per
        from
            inv_cab_comp_inve a
            inner join inv_det_comp_inve b on a.ide_incci = b.ide_incci
            inner join inv_bodega c on a.ide_inbod = c.ide_inbod
            inner join inv_tip_tran_inve d on a.ide_intti = d.ide_intti
            inner join inv_tip_comp_inve e on d.ide_intci = e.ide_intci
            inner join gen_persona f on a.ide_geper = f.ide_geper
            inner join inv_articulo g on b.ide_inarti = g.ide_inarti
            LEFT JOIN inv_unidad h ON g.ide_inuni = h.ide_inuni
        where
            a.verifica_incci  = false
            and hace_kardex_inarti = true
            and a.ide_empr = $1
            and signo_intci = $2
            ${condBodega}
            order by  fecha_trans_incci desc, ide_incci desc
        `,
      dtoIn,
    );

    query.addIntParam(1, dtoIn.ideEmpr);
    query.addIntParam(2, dtoIn.signo);
    if (dtoIn.ide_inbod) {
      query.addIntParam(3, dtoIn.ide_inbod);
    }
    return await this.dataSource.createQuery(query);
  }

  async setComporbantesVerificados(dtoIn: ArrayIdeDto & HeaderParamsDto) {
    const updateQuery = new UpdateQuery('inv_cab_comp_inve', 'ide_incci');
    updateQuery.values.set('verifica_incci', true);
    updateQuery.values.set('fec_cam_est_incci', getCurrentDate()); // fecha de actualizacion
    updateQuery.values.set('sis_ide_usua', dtoIn.ideUsua); // usuario que actualiza
    updateQuery.where = 'ide_incci = ANY ($1) and verifica_incci = false';
    updateQuery.addParam(1, dtoIn.ide);
    return await this.dataSource.createQuery(updateQuery);
  }

  async anularComprobante(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const updateQuery = new UpdateQuery('inv_cab_comp_inve', 'ide_incci');
    updateQuery.values.set('ide_inepi', this.variables.get('p_inv_estado_anulado'));
    updateQuery.values.set('fec_cam_est_incci', getCurrentDate()); // fecha de anulacion
    updateQuery.values.set('sis_ide_usua', dtoIn.ideUsua); // usuario que actualiza
    updateQuery.where = 'ide_incci = $1 and ide_inepi != $2 ';
    updateQuery.addParam(1, dtoIn.ide_incci);
    updateQuery.addParam(2, this.variables.get('p_inv_estado_anulado'));
    return await this.dataSource.createQuery(updateQuery);
  }

  async saveDetInvEgreso(dtoIn: SaveDetInvEgresoDto & HeaderParamsDto) {
    const updateQuery = new UpdateQuery('inv_det_comp_inve', 'ide_indci');
    updateQuery.values.set('peso_verifica_inlot', dtoIn.data.peso_verifica_inlot);
    updateQuery.values.set('foto_verifica_indci', dtoIn.data.foto_verifica_indci);
    updateQuery.values.set('observ_verifica_indci', dtoIn.data.observ_verifica_indci);
    if (dtoIn.data.verifica_indci === true) {
      updateQuery.values.set('fecha_verifica_indci', getCurrentDateTime());
      updateQuery.values.set('usuario_verifica_indci', dtoIn.login);
      updateQuery.values.set('verifica_indci', true);
    }
    updateQuery.where = 'ide_indci = $1';
    updateQuery.addParam(1, dtoIn.data.ide_indci);
    return await this.dataSource.createQuery(updateQuery);
  }

  async saveLoteInv(dtoIn: SaveLoteDto & HeaderParamsDto) {
    const module = 'inv';
    const tableName = 'lote';
    const primaryKey = 'ide_inlot';

    if (dtoIn.isUpdate === true) {
      // Actualiza
      const isValid = true; // validaciones cuando se actualiza
      if (isValid) {
        const ide_inlot = dtoIn.data.ide_inlot;
        const objQuery = {
          operation: 'update',
          module,
          tableName,
          primaryKey,
          object: dtoIn.data,
          condition: `${primaryKey} = ${ide_inlot}`,
        } as ObjectQueryDto;
        return await this.core.save({
          ...dtoIn,
          listQuery: [objQuery],
          audit: true,
        });
      }
    } else {
      // Crear
      const isValid = true; // validaciones para insertar
      if (isValid === true) {
        dtoIn.data.ide_inlot = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);
        const objQuery = {
          operation: 'insert',
          module,
          tableName,
          primaryKey,
          object: dtoIn.data,
        } as ObjectQueryDto;
        return await this.core.save({
          ...dtoIn,
          listQuery: [objQuery],
          audit: true,
        });
      }
    }
  }

  async getLoteIngreso(dtoIn: LoteIngreso & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        select
            *
        from
            inv_lote
        where
            ide_indci_ingreso = $1
    `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_indci_ingreso);
    return await this.dataSource.createSingleQuery(query);
  }

  // ==================================ListData==============================
  /**
   * Retorna las estados de los comprobantes de inventario
   * @returns
   */
  async getListDataEstadosComprobantes(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'inv',
      tableName: 'est_prev_inve',
      primaryKey: 'ide_inepi',
      columnLabel: 'nombre_inepi',
    };
    return this.core.getListDataValues(dtoIn);
  }
}
