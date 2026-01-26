import { Injectable } from '@nestjs/common';
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
import { SaveDetInvEgresoDto } from './dto/save-det-inv-ingreso.dto';
import { SaveLoteDto } from './dto/save-lote.dto';
import { LoteEgreso } from './dto/lote-egreso.dto';
import { LotesProductoDto } from './dto/lotes-producto.dto';

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
   * Retorna los comprobantes de inventario según el tipo especificado
   * @param dtoIn - Parámetros de consulta incluyendo el tipo de comprobante
   * @returns Query con los comprobantes filtrados
   */
  async getComprobantesInventario(dtoIn: ComprobantesInvDto & HeaderParamsDto) {
    const condBodega = dtoIn.ide_inbod ? `AND a.ide_inbod = ${dtoIn.ide_inbod}` : '';
    const condEstado = dtoIn.ide_inepi ? `AND a.ide_inepi = ${dtoIn.ide_inepi}` : '';

    // Determinar condición según el tipo de comprobante
    let condTipoComprobante = '';
    const signo = dtoIn.signo;

    if (signo) {
      condTipoComprobante = `AND e.signo_intci = ${signo} AND (a.verifica_incci = false OR a.verifica_incci IS NULL)`;
    }


    const query = new SelectQuery(
      `
    SELECT
      a.ide_incci,
      a.fecha_trans_incci,
      a.numero_incci,
      c.nombre_inbod,
      d.nombre_intti,
      COALESCE(
      (
        SELECT 'Fact. ' || MAX(cccfa.secuencial_cccfa)
        FROM cxc_cabece_factura cccfa
        INNER JOIN inv_det_comp_inve det ON cccfa.ide_cccfa = det.ide_cccfa
        WHERE det.ide_incci = a.ide_incci
      ),
      (
        SELECT 'Fact. ' || MAX(cpcfa.numero_cpcfa)
        FROM cxp_cabece_factur cpcfa
        INNER JOIN inv_det_comp_inve det ON cpcfa.ide_cpcfa = det.ide_cpcfa
        WHERE det.ide_incci = a.ide_incci
      ),
      (
        SELECT MAX(det2.referencia_indci)
        FROM inv_det_comp_inve det2
        WHERE det2.ide_incci = a.ide_incci
      )
      ) AS referencia,
      f.nom_geper,
      a.ide_cnccc,
      a.ide_inepi,
      c.ide_inbod,
      a.verifica_incci,
      a.fec_cam_est_incci, 
      a.usuario_verifica_incci,
      a.automatico_incci,
      (
      SELECT COUNT(1) 
      FROM inv_det_comp_inve d
      INNER JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti 
      WHERE d.ide_incci = a.ide_incci
        AND art.hace_kardex_inarti = true
      ) AS total_items,
      a.observacion_incci,
      a.usuario_ingre,
      a.fecha_ingre,
      a.hora_ingre,
      a.usuario_actua,
      a.fecha_actua,
      a.hora_actua,
      f.uuid,
      e.signo_intci
    FROM
      inv_cab_comp_inve a
      INNER JOIN inv_bodega c ON a.ide_inbod = c.ide_inbod
      INNER JOIN inv_tip_tran_inve d ON a.ide_intti = d.ide_intti
      INNER JOIN inv_tip_comp_inve e ON d.ide_intci = e.ide_intci
      INNER JOIN gen_persona f ON a.ide_geper = f.ide_geper
    WHERE
      a.fecha_trans_incci BETWEEN $1 AND $2
      AND a.ide_empr = $3
      ${condBodega}
      ${condEstado}
      ${condTipoComprobante}
    ORDER BY a.fecha_trans_incci DESC, a.ide_incci DESC
    `,
      dtoIn,
    );

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    query.addIntParam(3, dtoIn.ideEmpr);

    return this.dataSource.createQuery(query);
  }

  // Métodos wrapper para mantener compatibilidad con código existente
  async getComprobantesIngresoPendientes(dtoIn: ComprobantesInvDto & HeaderParamsDto) {
    dtoIn.signo = 1;
    return this.getComprobantesInventario({
      ...dtoIn
    });
  }

  async getComprobantesEgresoPendientes(dtoIn: ComprobantesInvDto & HeaderParamsDto) {
    dtoIn.signo = -1;
    return this.getComprobantesInventario({
      ...dtoIn,
    });
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
    return this.dataSource.createQuery(query);
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
    return this.dataSource.createQuery(query);
  }

  async setComporbantesVerificados(dtoIn: ArrayIdeDto & HeaderParamsDto) {

    // Crea lote de ingreso / egreso según el tipo de comprobante, con valores por defecto 
    // Consultar tipo de comprobante (ingreso o egreso) para cada ide_incci
    const comprobantesQuery = new SelectQuery(
      `
        SELECT a.ide_incci, e.signo_intci
        FROM inv_cab_comp_inve a
        INNER JOIN inv_tip_tran_inve d ON a.ide_intti = d.ide_intti
        INNER JOIN inv_tip_comp_inve e ON d.ide_intci = e.ide_intci
        WHERE a.ide_incci = ANY ($1)
      `,
      dtoIn,
    );
    comprobantesQuery.addParam(1, dtoIn.ide);

    const comprobantes: { ide_incci: number; signo_intci: number }[] = await this.dataSource.createSelectQuery(comprobantesQuery);

    for (const comprobante of comprobantes) {
      // Obtener detalles del comprobante
      const detallesQuery = new SelectQuery(
        `
          SELECT ide_indci
          FROM inv_det_comp_inve
          WHERE ide_incci = $1
        `,
        dtoIn,
      );
      detallesQuery.addIntParam(1, comprobante.ide_incci);
      const detalles: { ide_indci: number }[] = await this.dataSource.createSelectQuery(detallesQuery);

      for (const detalle of detalles) {
        // Verifica si ya existe un lote para este detalle
        const loteExisteQuery = new SelectQuery(
          `
            SELECT 1 FROM inv_lote
            WHERE ${comprobante.signo_intci === 1 ? 'ide_indci_ingreso' : 'ide_indci_egreso'} = $1
            LIMIT 1
          `,
          dtoIn,
        );
        loteExisteQuery.addIntParam(1, detalle.ide_indci);
        const loteExiste = await this.dataSource.createSingleQuery(loteExisteQuery);

        if (!loteExiste) {
          // Crear lote con valores por defecto
          const module = 'inv';
          const tableName = 'lote';
          const primaryKey = 'ide_inlot';
          const ide_inlot = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);

          const loteData: any = {
            ide_inlot,
            activo_inlot: true,
            usuario_ingre: dtoIn.login,
            fecha_ingre: getCurrentDateTime(),
          };
          if (comprobante.signo_intci === 1) {
            loteData.ide_indci_ingreso = detalle.ide_indci;
          } else if (comprobante.signo_intci === -1) {
            loteData.ide_indci_egreso = detalle.ide_indci;
          }

          const objQuery: ObjectQueryDto = {
            operation: 'insert',
            module,
            tableName,
            primaryKey,
            object: loteData,
          };
          await this.core.save({
            ...dtoIn,
            listQuery: [objQuery],
            audit: false,
          });
        }
        else {
          // El lote ya existe, actualizar con valores por defecto
          const updateLoteQuery = new UpdateQuery('inv_lote', 'ide_inlot');
          updateLoteQuery.values.set('activo_inlot', true);
          updateLoteQuery.values.set('usuario_actua', dtoIn.login);
          updateLoteQuery.values.set('fecha_actua', getCurrentDateTime());
          // Buscar el ide_inlot correspondiente
          const loteIdQuery = new SelectQuery(
            `
              SELECT ide_inlot FROM inv_lote
              WHERE ${comprobante.signo_intci === 1 ? 'ide_indci_ingreso' : 'ide_indci_egreso'} = $1
              LIMIT 1
            `,
            dtoIn,
          );
          loteIdQuery.addIntParam(1, detalle.ide_indci);
          const loteRow = await this.dataSource.createSingleQuery(loteIdQuery);
          if (loteRow && loteRow.ide_inlot) {
            updateLoteQuery.where = 'ide_inlot = $1';
            updateLoteQuery.addIntParam(1, loteRow.ide_inlot);
            await this.dataSource.createQuery(updateLoteQuery);
          }

        }
      }
    }

    // Actualiza cabecera
    const updateQuery = new UpdateQuery('inv_cab_comp_inve', 'ide_incci');
    updateQuery.values.set('verifica_incci', true);
    updateQuery.values.set('fec_cam_est_incci', getCurrentDate()); // fecha de actualizacion
    updateQuery.values.set('sis_ide_usua', dtoIn.ideUsua); // usuario que actualiza
    updateQuery.where = 'ide_incci = ANY ($1) and verifica_incci = false';
    updateQuery.addParam(1, dtoIn.ide);

    // Actualiza detalles relacionados
    const updateDetQuery = new UpdateQuery('inv_det_comp_inve', 'ide_indci');
    updateDetQuery.values.set('verifica_indci', true);
    updateDetQuery.values.set('fecha_verifica_indci', getCurrentDateTime());
    updateDetQuery.values.set('usuario_verifica_indci', dtoIn.login); // usuario que actualiza
    updateDetQuery.where = 'ide_incci = ANY ($1) and (verifica_indci = false OR verifica_indci IS NULL)';
    updateDetQuery.addParam(1, dtoIn.ide);



    // Ejecuta ambas actualizaciones
    await this.dataSource.createQuery(updateQuery);
    return this.dataSource.createQuery(updateDetQuery);
  }

  async anularComprobante(dtoIn: CabComprobanteInventarioDto & HeaderParamsDto) {
    const updateQuery = new UpdateQuery('inv_cab_comp_inve', 'ide_incci');
    updateQuery.values.set('ide_inepi', this.variables.get('p_inv_estado_anulado'));
    updateQuery.values.set('fec_cam_est_incci', getCurrentDate()); // fecha de anulacion
    updateQuery.values.set('sis_ide_usua', dtoIn.ideUsua); // usuario que actualiza
    updateQuery.where = 'ide_incci = $1 and ide_inepi != $2 ';
    updateQuery.addParam(1, dtoIn.ide_incci);
    updateQuery.addParam(2, this.variables.get('p_inv_estado_anulado'));
    return this.dataSource.createQuery(updateQuery);
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
    return this.dataSource.createQuery(updateQuery);
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
    return this.dataSource.createSingleQuery(query);
  }

  async getLoteEgreso(dtoIn: LoteEgreso & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        select
            *
        from
            inv_lote
        where
            ide_indci_egreso = $1
    `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_indci_egreso);
    return this.dataSource.createSingleQuery(query);
  }

  /**
   * Guarda la verificación de un ingreso de inventario
   * Si ide_inlot es undefined: crea un nuevo registro en inv_lote
   * Si ide_inlot existe: actualiza el registro existente
   * @param dtoIn - Datos de verificación del ingreso con ide_indci_ingreso
   * @returns Resultado de la operación
   */
  async saveLoteIngreso(dtoIn: SaveLoteDto & HeaderParamsDto) {
    const module = 'inv';
    const tableName = 'lote';
    const primaryKey = 'ide_inlot';

    let ide_inlot: number;
    let objQuery: ObjectQueryDto;

    if (dtoIn.data.ide_inlot === undefined) {
      // CREAR nuevo registro en inv_lote
      ide_inlot = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);

      const loteData = {
        ide_inlot,
        ide_indci_ingreso: dtoIn.data.ide_indci_ingreso,
        lote_inlot: dtoIn.data.lote_inlot,
        fecha_ingreso_inlot: dtoIn.data.fecha_ingreso_inlot,
        fecha_caducidad_inlot: dtoIn.data.fecha_caducidad_inlot,
        pais_inlot: dtoIn.data.pais_inlot,
        peso_inlot: dtoIn.data.peso_inlot,
        peso_verifica_inlot: dtoIn.data.peso_verifica_inlot,
        peso_tara_inlot: dtoIn.data.peso_tara_inlot,
        diferencia_peso_inlot: dtoIn.data.diferencia_peso_inlot,
        activo_inlot: dtoIn.data.activo_inlot,
        archivo1_inlot: dtoIn.data.archivo1_inlot,
        archivo2_inlot: dtoIn.data.archivo2_inlot,
        archivo3_inlot: dtoIn.data.archivo3_inlot,
        observacion_inlot: dtoIn.data.observacion_inlot,
        verificado_inlot: dtoIn.data.verificado_inlot,
        usuario_verif_inlot: dtoIn.data.verificado_inlot ? dtoIn.login : null,
        fecha_verif_inlot: dtoIn.data.verificado_inlot ? getCurrentDateTime() : null,
        usuario_ingre: dtoIn.login,
        fecha_ingre: getCurrentDateTime(),
      };

      objQuery = {
        operation: 'insert',
        module,
        tableName,
        primaryKey,
        object: loteData,
      } as ObjectQueryDto;
    } else {
      // ACTUALIZAR registro existente en inv_lote
      ide_inlot = dtoIn.data.ide_inlot;

      const loteData: any = {};

      // Solo actualiza campos que no sean undefined
      if (dtoIn.data.lote_inlot !== undefined) {
        loteData.lote_inlot = dtoIn.data.lote_inlot;
      }
      if (dtoIn.data.fecha_ingreso_inlot !== undefined) {
        loteData.fecha_ingreso_inlot = dtoIn.data.fecha_ingreso_inlot;
      }
      if (dtoIn.data.fecha_caducidad_inlot !== undefined) {
        loteData.fecha_caducidad_inlot = dtoIn.data.fecha_caducidad_inlot;
      }
      if (dtoIn.data.pais_inlot !== undefined) {
        loteData.pais_inlot = dtoIn.data.pais_inlot;
      }
      if (dtoIn.data.peso_inlot !== undefined) {
        loteData.peso_inlot = dtoIn.data.peso_inlot;
      }
      if (dtoIn.data.peso_tara_inlot !== undefined) {
        loteData.peso_tara_inlot = dtoIn.data.peso_tara_inlot;
      }
      if (dtoIn.data.diferencia_peso_inlot !== undefined) {
        loteData.diferencia_peso_inlot = dtoIn.data.diferencia_peso_inlot;
      }
      if (dtoIn.data.activo_inlot !== undefined) {
        loteData.activo_inlot = dtoIn.data.activo_inlot;
      }
      if (dtoIn.data.archivo1_inlot !== undefined) {
        loteData.archivo1_inlot = dtoIn.data.archivo1_inlot;
      }
      if (dtoIn.data.archivo2_inlot !== undefined) {
        loteData.archivo2_inlot = dtoIn.data.archivo2_inlot;
      }
      if (dtoIn.data.archivo3_inlot !== undefined) {
        loteData.archivo3_inlot = dtoIn.data.archivo3_inlot;
      }
      if (dtoIn.data.observacion_inlot !== undefined) {
        loteData.observacion_inlot = dtoIn.data.observacion_inlot;
      }
      if (dtoIn.data.peso_verifica_inlot !== undefined) {
        loteData.peso_verifica_inlot = dtoIn.data.peso_verifica_inlot;
      }


      // Si se verifica, actualiza campos de verificación
      if (dtoIn.data.verificado_inlot === true) {
        loteData.verificado_inlot = true;
        loteData.usuario_verif_inlot = dtoIn.login;
        loteData.fecha_verif_inlot = getCurrentDateTime();
      }
      loteData.usuario_actua = dtoIn.login;
      loteData.fecha_actua = getCurrentDateTime();

      objQuery = {
        operation: 'update',
        module,
        tableName,
        primaryKey,
        object: loteData,
        condition: `${primaryKey} = ${ide_inlot}`,
      } as ObjectQueryDto;
    }

    // Actualiza la tabla inv_det_comp_inve (detalle del comprobante)
    const updateDetQuery = new UpdateQuery('inv_det_comp_inve', 'ide_indci', dtoIn);

    // Vincula el lote al detalle del comprobante
    updateDetQuery.values.set('ide_inlot', ide_inlot);

    // Si se verifica, marca el detalle como verificado

    updateDetQuery.values.set('verifica_indci', dtoIn.data.verificado_inlot);

    updateDetQuery.where = 'ide_indci = $1';
    updateDetQuery.addParam(1, dtoIn.data.ide_indci_ingreso);

    // Ejecuta la operación del lote y la actualización del detalle
    const saveResult = await this.core.save({
      ...dtoIn,
      listQuery: [objQuery],
      audit: false,
    });

    // Actualiza el detalle
    await this.dataSource.createQuery(updateDetQuery);

    return saveResult;
  }

  /**
   * Guarda la verificación de un egreso de inventario (ventas, salidas)
   * Si ide_inlot es undefined: crea un nuevo registro en inv_lote
   * Si ide_inlot existe: actualiza el registro existente en inv_lote
   * Actualiza inv_det_comp_inve con los datos de verificación del egreso
   * @param dtoIn - Datos de verificación del egreso
   * @returns Resultado de la operación
   */
  async saveLoteEgreso(dtoIn: SaveLoteDto & HeaderParamsDto) {
    const module = 'inv';
    const tableName = 'lote';
    const primaryKey = 'ide_inlot';

    let ide_inlot: number;
    let objQuery: ObjectQueryDto | null = null;

    if (dtoIn.data.ide_inlot === undefined) {
      // CREAR nuevo registro en inv_lote para el egreso
      ide_inlot = await this.dataSource.getSeqTable(`${module}_${tableName}`, primaryKey, 1, dtoIn.login);

      const loteData = {
        ide_inlot,
        ide_indci_egreso: dtoIn.data.ide_indci_egreso,
        fecha_ingreso_inlot: dtoIn.data.fecha_ingreso_inlot,
        peso_inlot: dtoIn.data.peso_inlot,
        peso_tara_inlot: dtoIn.data.peso_tara_inlot,
        peso_verifica_inlot: dtoIn.data.peso_verifica_inlot,
        diferencia_peso_inlot: dtoIn.data.diferencia_peso_inlot,
        activo_inlot: dtoIn.data.activo_inlot,
        observacion_inlot: dtoIn.data.observacion_inlot,
        verificado_inlot: dtoIn.data.verificado_inlot,
        usuario_verif_inlot: dtoIn.data.verificado_inlot ? dtoIn.login : null,
        fecha_verif_inlot: dtoIn.data.verificado_inlot ? getCurrentDateTime() : null,
        inv_ide_inlot: dtoIn.data.inv_ide_inlot,
        usuario_ingre: dtoIn.login,
        fecha_ingre: getCurrentDateTime(),
      };

      objQuery = {
        operation: 'insert',
        module,
        tableName,
        primaryKey,
        object: loteData,
      } as ObjectQueryDto;
    } else {
      // ACTUALIZAR registro existente en inv_lote
      ide_inlot = dtoIn.data.ide_inlot;

      const loteData: any = {};

      // Solo actualiza campos que no sean undefined
      if (dtoIn.data.lote_inlot !== undefined) {
        loteData.lote_inlot = dtoIn.data.lote_inlot;
      }
      if (dtoIn.data.fecha_ingreso_inlot !== undefined) {
        loteData.fecha_ingreso_inlot = dtoIn.data.fecha_ingreso_inlot;
      }
      if (dtoIn.data.fecha_caducidad_inlot !== undefined) {
        loteData.fecha_caducidad_inlot = dtoIn.data.fecha_caducidad_inlot;
      }
      if (dtoIn.data.pais_inlot !== undefined) {
        loteData.pais_inlot = dtoIn.data.pais_inlot;
      }
      if (dtoIn.data.peso_inlot !== undefined) {
        loteData.peso_inlot = dtoIn.data.peso_inlot;
      }
      if (dtoIn.data.peso_verifica_inlot !== undefined) {
        loteData.peso_inlot = dtoIn.data.peso_verifica_inlot;
      }
      if (dtoIn.data.peso_tara_inlot !== undefined) {
        loteData.peso_tara_inlot = dtoIn.data.peso_tara_inlot;
      }
      if (dtoIn.data.diferencia_peso_inlot !== undefined) {
        loteData.diferencia_peso_inlot = dtoIn.data.diferencia_peso_inlot;
      }
      if (dtoIn.data.es_saldo_inicial !== undefined) {
        loteData.es_saldo_inicial = dtoIn.data.es_saldo_inicial;
      }
      if (dtoIn.data.activo_inlot !== undefined) {
        loteData.activo_inlot = dtoIn.data.activo_inlot;
      }
      if (dtoIn.data.observacion_inlot !== undefined) {
        loteData.observacion_inlot = dtoIn.data.observacion_inlot;
      }

      if (dtoIn.data.inv_ide_inlot !== undefined) {
        loteData.inv_ide_inlot = dtoIn.data.inv_ide_inlot;
      }
      // Si se verifica, actualiza campos de verificación
      if (dtoIn.data.verificado_inlot === true) {
        loteData.verificado_inlot = true;
        loteData.usuario_verif_inlot = dtoIn.login;
        loteData.fecha_verif_inlot = getCurrentDateTime();
      }

      loteData.usuario_actua = dtoIn.login;
      loteData.fecha_actua = getCurrentDateTime();

      objQuery = {
        operation: 'update',
        module,
        tableName,
        primaryKey,
        object: loteData,
        condition: `${primaryKey} = ${ide_inlot}`,
      } as ObjectQueryDto;
    }

    // Actualiza la tabla inv_det_comp_inve (detalle del comprobante)
    const updateQuery = new UpdateQuery('inv_det_comp_inve', 'ide_indci', dtoIn);

    // Vincula el lote al detalle del comprobante
    updateQuery.values.set('ide_inlot', ide_inlot);

    // Actualiza campos adicionales si se proporcionan
    if (dtoIn.data.peso_verifica_inlot !== undefined) {
      updateQuery.values.set('peso_verifica_inlot', dtoIn.data.peso_verifica_inlot);
    }
    if (dtoIn.data.archivo1_inlot !== undefined) {
      updateQuery.values.set('foto_verifica_indci', dtoIn.data.archivo1_inlot);
    }
    if (dtoIn.data.observacion_inlot !== undefined) {
      updateQuery.values.set('observ_verifica_indci', dtoIn.data.observacion_inlot);
    }

    // Si se verifica, actualiza la fecha y usuario de verificación
    if (dtoIn.data.verificado_inlot === true) {
      updateQuery.values.set('fecha_verifica_indci', getCurrentDateTime());
      updateQuery.values.set('usuario_verifica_indci', dtoIn.login);
      updateQuery.values.set('verifica_indci', true);
    }

    updateQuery.where = 'ide_indci = $1';
    updateQuery.addParam(1, dtoIn.data.ide_indci_egreso);

    // Ejecuta la operación del lote (si hay) y la actualización del detalle
    let saveResult;
    if (objQuery) {
      saveResult = await this.core.save({
        ...dtoIn,
        listQuery: [objQuery],
        audit: false,
      });
    }

    // Actualiza el detalle
    await this.dataSource.createQuery(updateQuery);

    return saveResult || { message: 'Verificación actualizada correctamente' };
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

  async getListDataPresentacion(dto: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'inv',
      tableName: 'presentacion',
      primaryKey: 'ide_inpres',
      columnLabel: 'nombre_inpres',
    };
    return this.core.getListDataValues(dtoIn);
  }

  /**
   * Retorna los lotes de ingreso activos de un producto con información básica
   * @param dtoIn - DTO con ide_inarti del producto
   * @returns Lista de lotes con columnas reales
   */
  async getLotesIngresoProducto(dtoIn: LotesProductoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT 
          l.ide_inlot,
          l.lote_inlot,
          l.fecha_ingreso_inlot,
          l.fecha_caducidad_inlot,
          l.pais_inlot,
          l.peso_inlot,
          l.peso_tara_inlot,
          l.diferencia_peso_inlot,
          p.nom_geper as proveedor
        FROM 
          inv_lote l
          INNER JOIN inv_det_comp_inve dci ON l.ide_indci_ingreso = dci.ide_indci
          INNER JOIN inv_cab_comp_inve cci ON dci.ide_incci = cci.ide_incci
          LEFT JOIN gen_persona p ON cci.ide_geper = p.ide_geper
        WHERE 
          l.activo_inlot = true
          AND dci.ide_inarti = $1
          AND cci.ide_empr = ${dtoIn.ideEmpr}
        ORDER BY 
          l.fecha_ingreso_inlot DESC, l.ide_inlot DESC
      `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_inarti);
    const data: any[] = await this.dataSource.createSelectQuery(query);
    return data;
  }
}
