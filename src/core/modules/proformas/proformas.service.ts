import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentDateTime, getCurrentTime } from 'src/util/helpers/date-util';

import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { GetProformaDto } from './dto/get-proforma.dto';
import { ProformasDto } from './dto/proformas.dto';
import { DetaProformaDto, SaveProformaDto } from './dto/save-proforma.dto';

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
  private readonly logger = new Logger(ProformasService.name);
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
    const estadoFacturaNormal = this.variables.get('p_cxc_estado_factura_normal');

    const query = new SelectQuery(`
    SELECT
      -- Identificadores
      prof.ide_cccpr,
      prof.secuencial_cccpr                                         AS numero_proforma,

      -- Datos de la proforma
      prof.fecha_cccpr                                              AS fecha_proforma,
      prof.solicitante_cccpr                                        AS solicitante,
      prof.correo_cccpr                                             AS correo_contacto,
      tipo.nombre_cctpr                                             AS tipo_proforma,
      vend.nombre_vgven                                             AS vendedor,
      usua.nom_usua                                                 AS usuario_registro,

      -- Totales proforma
      prof.total_cccpr                                              AS total_proforma,
      prof.utilidad_cccpr                                           AS utilidad_proforma,

      -- Conteo de ítems de la proforma
      (
        SELECT COUNT(1)
        FROM cxc_deta_proforma dp
        WHERE dp.ide_cccpr = prof.ide_cccpr
      )                                                             AS total_items_proforma,

      -- Estado de la proforma
      prof.anulado_cccpr                                            AS esta_anulada,
      prof.enviado_cccpr                                            AS fue_enviada,

      -- Datos de la factura vinculada
      fact.ide_cccfa                                                AS ide_factura,
      fact.secuencial_cccfa                                         AS numero_factura,
      fact.fecha_emisi_cccfa                                        AS fecha_factura,
      dfac.establecimiento_ccdfa                                    AS establecimiento_factura,
      dfac.pto_emision_ccdfa                                        AS punto_emision_factura,
      fact.total_cccfa                                              AS total_factura,

      -- Ítems facturados (solo artículos que mueven kardex)
      (
        SELECT COUNT(1)
        FROM inv_det_comp_inve det
        INNER JOIN inv_articulo art ON det.ide_inarti = art.ide_inarti
        WHERE det.ide_cccfa = fact.ide_cccfa
          AND art.hace_kardex_inarti = TRUE
      )                                                             AS total_items_facturados,

      -- Cliente de la factura
      fact.ide_geper,
      pers.nom_geper                                                AS nombre_cliente,
      pers.identificac_geper                                        AS identificacion_cliente,
      pers.uuid                                                     AS uuid_cliente,

      -- Análisis comparativo proforma vs factura
      COALESCE(fact.total_cccfa, 0) - COALESCE(prof.total_cccpr, 0) AS diferencia_proforma_factura,
      CASE
        WHEN fact.ide_cccfa IS NULL                                              THEN 'SIN_FACTURA'
        WHEN COALESCE(fact.total_cccfa, 0) = COALESCE(prof.total_cccpr, 0)      THEN 'TOTALES_IGUALES'
        WHEN COALESCE(fact.total_cccfa, 0) > COALESCE(prof.total_cccpr, 0)      THEN 'FACTURA_MAYOR'
        ELSE                                                                          'PROFORMA_MAYOR'
      END                                                           AS estado_comparativo

    FROM cxc_cabece_proforma         prof
    INNER JOIN sis_usuario            usua ON prof.ide_usua       = usua.ide_usua
    LEFT  JOIN cxc_tipo_proforma      tipo ON prof.ide_cctpr      = tipo.ide_cctpr
    LEFT  JOIN ven_vendedor           vend ON prof.ide_vgven       = vend.ide_vgven
    LEFT  JOIN cxc_cabece_factura     fact ON prof.secuencial_cccpr = fact.num_proforma_cccfa
                                          AND fact.ide_ccefa       = ${estadoFacturaNormal}
    LEFT  JOIN cxc_datos_fac          dfac ON fact.ide_ccdaf       = dfac.ide_ccdaf
    LEFT  JOIN gen_persona            pers ON fact.ide_geper        = pers.ide_geper

    WHERE prof.fecha_cccpr  BETWEEN $1 AND $2
      AND prof.ide_empr     = ${dtoIn.ideEmpr}

    ORDER BY prof.secuencial_cccpr DESC
  `, dtoIn);

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);

    return this.dataSource.createQuery(query);
  }


  async getProformaByID(dtoIn: GetProformaDto & HeaderParamsDto) {
    const estadoFacturaNormal = this.variables.get('p_cxc_estado_factura_normal');

    const queryCabecera = new SelectQuery(
      `
      SELECT
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
        c.ide_getid,
        ti.nombre_getid,
        c.identificac_cccpr,
        c.ide_vgven,
        v.nombre_vgven,
        c.direccion_cccpr,
        c.contacto_cccpr,
        c.ide_ccten,
        te.nombre_ccten,
        c.ide_ccvap,
        va.nombre_ccvap,
        c.ide_cctpr,
        t.nombre_cctpr,
        c.utilidad_cccpr,
        c.ide_usua,
        u.nom_usua,
        c.fecha_ingre,
        c.hora_ingre,
        c.usuario_ingre,
        c.fecha_actua,
        c.hora_actua,
        c.usuario_actua
      FROM cxc_cabece_proforma c
      LEFT JOIN gen_tipo_identifi ti ON c.ide_getid = ti.ide_getid
      LEFT JOIN sis_usuario u ON c.ide_usua = u.ide_usua
      LEFT JOIN ven_vendedor v ON c.ide_vgven = v.ide_vgven
      LEFT JOIN cxc_tipo_proforma t ON c.ide_cctpr = t.ide_cctpr
      LEFT JOIN cxc_validez_prof va ON c.ide_ccvap = va.ide_ccvap
      LEFT JOIN cxc_tiempo_entrega te ON c.ide_ccten = te.ide_ccten
      WHERE c.ide_cccpr = $1
        AND c.ide_empr = ${dtoIn.ideEmpr}
      `,
    );
    queryCabecera.addIntParam(1, dtoIn.ide_cccpr);

    const queryDetalles = new SelectQuery(
      `
      SELECT
        d.ide_ccdpr,
        d.ide_inarti,
        d.observacion_ccdpr,
        d.cantidad_ccdpr,
        d.precio_ccdpr,
        d.total_ccdpr,
        d.iva_inarti_ccdpr,
        d.ide_inuni,
        u.siglas_inuni,
        a.codigo_inarti,
        a.nombre_inarti,
        a.uuid,
        d.precio_compra_ccdpr,
        d.porcentaje_util_ccdpr,
        d.utilidad_ccdpr,
        d.fecha_ingre,
        d.hora_ingre,
        d.usuario_ingre,
        d.fecha_actua,
        d.hora_actua,
        d.usuario_actua
      FROM cxc_deta_proforma d
      INNER JOIN inv_articulo a ON d.ide_inarti = a.ide_inarti
      LEFT JOIN inv_unidad u ON d.ide_inuni = u.ide_inuni
      WHERE d.ide_cccpr = $1
        AND d.ide_empr = ${dtoIn.ideEmpr}
      ORDER BY d.ide_ccdpr
      `,
    );
    queryDetalles.addIntParam(1, dtoIn.ide_cccpr);

    const queryFactura = new SelectQuery(
      `
      SELECT
        f.ide_cccfa,
        f.secuencial_cccfa,
        f.fecha_emisi_cccfa,
        f.base_grabada_cccfa,
        f.base_tarifa0_cccfa,
        f.valor_iva_cccfa,
        f.total_cccfa,
        p.ide_geper,
        p.nom_geper,
        p.identificac_geper,
        p.usuario_ingre,
        p.fecha_ingre,
        p.hora_ingre
      FROM cxc_cabece_proforma c
      INNER JOIN cxc_cabece_factura f ON c.secuencial_cccpr = f.num_proforma_cccfa
      LEFT JOIN gen_persona p ON f.ide_geper = p.ide_geper
      WHERE c.ide_cccpr = $1
        AND c.ide_empr = ${dtoIn.ideEmpr}
        AND f.ide_empr = ${dtoIn.ideEmpr}
        AND f.ide_ccefa = ${estadoFacturaNormal}
      ORDER BY f.ide_cccfa DESC
      LIMIT 1
      `,
    );
    queryFactura.addIntParam(1, dtoIn.ide_cccpr);

    const [cabecera, detalles, factura] = await Promise.all([
      this.dataSource.createSingleQuery(queryCabecera),
      this.dataSource.createSelectQuery(queryDetalles),
      this.dataSource.createSingleQuery(queryFactura),
    ]);

    if (!cabecera) {
      throw new BadRequestException(`No se encontró la proforma con ide_cccpr: ${dtoIn.ide_cccpr}`);
    }

    return {
      cabecera,
      detalles,
      factura: factura
        ? {
          ide_cccfa: factura.ide_cccfa,
          secuencial_cccfa: factura.secuencial_cccfa,
          fecha_emision_cccfa: factura.fecha_emisi_cccfa,
          base_grabada_cccfa: factura.base_grabada_cccfa,
          base_tarifa0_cccfa: factura.base_tarifa0_cccfa,
          valor_iva_cccfa: factura.valor_iva_cccfa,
          total_cccfa: factura.total_cccfa,
          ide_geper: factura.ide_geper,
          cliente: factura.nom_geper,
          identificacion_cliente: factura.identificac_geper,
          usuario_ingre: factura.usuario_ingre,
          fecha_ingre: factura.fecha_ingre,
          hora_ingre: factura.hora_ingre,
        }
        : null,
    };
  }

  private calcularTotalesProforma(detalles: DetaProformaDto[], tarifaIva: number) {
    let baseTarifa0 = 0;
    let baseGrabada = 0;
    let utilidad = 0;

    for (const det of detalles) {
      const cantidad = Number(det.cantidad_ccdpr);
      const precio = Number(det.precio_ccdpr);
      const totalDetalle = isDefined(det.total_ccdpr)
        ? Number(det.total_ccdpr)
        : Number((cantidad * precio).toFixed(2));

      if (det.iva_inarti_ccdpr > 0) {
        baseGrabada += totalDetalle;
      } else {
        baseTarifa0 += totalDetalle;
      }

      if (isDefined(det.utilidad_ccdpr)) {
        utilidad += Number(det.utilidad_ccdpr);
      } else if (isDefined(det.precio_compra_ccdpr)) {
        utilidad += Number(((precio - Number(det.precio_compra_ccdpr)) * cantidad).toFixed(2));
      }
    }

    const valorIva = Number((baseGrabada * (tarifaIva / 100)).toFixed(2));
    const total = Number((baseTarifa0 + baseGrabada + valorIva).toFixed(2));

    return {
      base_tarifa0: Number(baseTarifa0.toFixed(2)),
      base_grabada: Number(baseGrabada.toFixed(2)),
      valor_iva: valorIva,
      total,
      utilidad: Number(utilidad.toFixed(2)),
    };
  }

  private async validateSaveProforma(dtoIn: SaveProformaDto & HeaderParamsDto) {
    if (!dtoIn.detalles || dtoIn.detalles.length === 0) {
      throw new BadRequestException('La proforma debe tener al menos un ítem en el detalle.');
    }

    for (const det of dtoIn.detalles) {
      if (Number(det.cantidad_ccdpr) <= 0) {
        throw new BadRequestException(
          `La cantidad del artículo ide_inarti=${det.ide_inarti} debe ser mayor a 0.`,
        );
      }
      if (Number(det.precio_ccdpr) < 0) {
        throw new BadRequestException(
          `El precio del artículo ide_inarti=${det.ide_inarti} no puede ser negativo.`,
        );
      }
    }

    const qTipo = new SelectQuery(`
      SELECT ide_cctpr
      FROM cxc_tipo_proforma
      WHERE ide_cctpr = $1
    `);
    qTipo.addIntParam(1, dtoIn.ide_cctpr);
    const tipo = await this.dataSource.createSingleQuery(qTipo);

    if (!tipo) {
      throw new BadRequestException(`El tipo de proforma ide_cctpr=${dtoIn.ide_cctpr} no existe.`);
    }
  }

  async saveProforma(dtoIn: SaveProformaDto & HeaderParamsDto) {
    await this.validateSaveProforma(dtoIn);

    const tarifaIva = isDefined(dtoIn.tarifa_iva_cccpr) ? Number(dtoIn.tarifa_iva_cccpr) : 15;
    const totales = this.calcularTotalesProforma(dtoIn.detalles, tarifaIva);

    const [ideCccpr, baseIdeCcdpr] = await Promise.all([
      this.dataSource.getSeqTable(SOLICITUD.tableName, SOLICITUD.primaryKey, 1, dtoIn.login),
      this.dataSource.getSeqTable(DETALLES.tableName, DETALLES.primaryKey, dtoIn.detalles.length, dtoIn.login),
    ]);

    const secuencial = String(ideCccpr).padStart(9, '0');

    const insertCabecera = new InsertQuery(SOLICITUD.tableName, SOLICITUD.primaryKey, dtoIn);
    insertCabecera.values.set('ide_cccpr', ideCccpr);
    insertCabecera.values.set('ide_usua', dtoIn.ideUsua);
    insertCabecera.values.set('ide_sucu', dtoIn.ideSucu);
    insertCabecera.values.set('ide_empr', dtoIn.ideEmpr);
    insertCabecera.values.set('fecha_cccpr', dtoIn.fecha_cccpr);
    insertCabecera.values.set('solicitante_cccpr', dtoIn.solicitante_cccpr);
    insertCabecera.values.set('correo_cccpr', dtoIn.correo_cccpr);
    insertCabecera.values.set('secuencial_cccpr', secuencial);
    insertCabecera.values.set('base_grabada_cccpr', totales.base_grabada);
    insertCabecera.values.set('base_tarifa0_cccpr', totales.base_tarifa0);
    insertCabecera.values.set('valor_iva_cccpr', totales.valor_iva);
    insertCabecera.values.set('total_cccpr', totales.total);
    insertCabecera.values.set('tarifa_iva_cccpr', tarifaIva);
    insertCabecera.values.set('ide_cctpr', dtoIn.ide_cctpr);
    insertCabecera.values.set('anulado_cccpr', false);
    insertCabecera.values.set('enviado_cccpr', false);
    insertCabecera.values.set('utilidad_cccpr', totales.utilidad);

    if (isDefined(dtoIn.observacion_cccpr)) insertCabecera.values.set('observacion_cccpr', dtoIn.observacion_cccpr);
    if (isDefined(dtoIn.referencia_cccpr)) insertCabecera.values.set('referencia_cccpr', dtoIn.referencia_cccpr);
    if (isDefined(dtoIn.telefono_cccpr)) insertCabecera.values.set('telefono_cccpr', dtoIn.telefono_cccpr);
    if (isDefined(dtoIn.ide_getid)) insertCabecera.values.set('ide_getid', dtoIn.ide_getid);
    if (isDefined(dtoIn.identificac_cccpr)) insertCabecera.values.set('identificac_cccpr', dtoIn.identificac_cccpr);
    if (isDefined(dtoIn.ide_vgven)) insertCabecera.values.set('ide_vgven', dtoIn.ide_vgven);
    if (isDefined(dtoIn.direccion_cccpr)) insertCabecera.values.set('direccion_cccpr', dtoIn.direccion_cccpr);
    if (isDefined(dtoIn.contacto_cccpr)) insertCabecera.values.set('contacto_cccpr', dtoIn.contacto_cccpr);
    if (isDefined(dtoIn.ide_ccten)) insertCabecera.values.set('ide_ccten', dtoIn.ide_ccten);
    if (isDefined(dtoIn.ide_ccvap)) insertCabecera.values.set('ide_ccvap', dtoIn.ide_ccvap);
    if (isDefined(dtoIn.ide_geprov)) insertCabecera.values.set('ide_geprov', dtoIn.ide_geprov);

    const insertDetalles = dtoIn.detalles.map((det, idx) => {
      const q = new InsertQuery(DETALLES.tableName, DETALLES.primaryKey, dtoIn);
      q.values.set('ide_ccdpr', baseIdeCcdpr + idx);
      q.values.set('ide_cccpr', ideCccpr);
      q.values.set('ide_empr', dtoIn.ideEmpr);
      q.values.set('ide_sucu', dtoIn.ideSucu);
      q.values.set('ide_inarti', det.ide_inarti);
      q.values.set('cantidad_ccdpr', det.cantidad_ccdpr);
      q.values.set('precio_ccdpr', det.precio_ccdpr);

      const totalDetalle = isDefined(det.total_ccdpr)
        ? Number(det.total_ccdpr)
        : Number((Number(det.cantidad_ccdpr) * Number(det.precio_ccdpr)).toFixed(2));

      q.values.set('total_ccdpr', totalDetalle);
      q.values.set('iva_inarti_ccdpr', det.iva_inarti_ccdpr);

      if (isDefined(det.observacion_ccdpr)) q.values.set('observacion_ccdpr', det.observacion_ccdpr);
      if (isDefined(det.ide_inuni)) q.values.set('ide_inuni', det.ide_inuni);
      if (isDefined(det.precio_compra_ccdpr)) q.values.set('precio_compra_ccdpr', det.precio_compra_ccdpr);
      if (isDefined(det.porcentaje_util_ccdpr)) q.values.set('porcentaje_util_ccdpr', det.porcentaje_util_ccdpr);
      if (isDefined(det.utilidad_ccdpr)) q.values.set('utilidad_ccdpr', det.utilidad_ccdpr);

      return q;
    });

    await this.dataSource.createListQuery([insertCabecera, ...insertDetalles]);

    return {
      rowCount: 1,
      row: {
        ide_cccpr: ideCccpr,
        secuencial_cccpr: secuencial,
        total_cccpr: totales.total,
        total_items: dtoIn.detalles.length,
      },
      message: 'Proforma guardada exitosamente',
    };
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
    this.logger.debug(`Abriendo proforma: ${JSON.stringify(query)}`);
    return this.dataSource.createQuery(query);
  }
}
