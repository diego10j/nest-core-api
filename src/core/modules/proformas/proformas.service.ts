import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { InsertQuery, Query, SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate, getCurrentDateTime, getCurrentTime } from 'src/util/helpers/date-util';
import { fNumber } from 'src/util/helpers/number-util';

import { CreateProformaWebDto } from './dto/create-proforma-web.dto';
import { GetPrecioClienteDto } from './dto/get-precio-cliente.dto';
import { GetProformaDto } from './dto/get-proforma.dto';
import { ProformasDto } from './dto/proformas.dto';
import { CabProformaDto, DetaProformaDto, SaveProformaDto } from './dto/save-proforma.dto';
import { assignIfDefined } from 'src/util/helpers/sql-util';
import { ca } from 'zod/v4/locales';

const SOLICITUD = {
  tableName: 'cxc_cabece_proforma',
  primaryKey: 'ide_cccpr',
};

const DETALLES = {
  tableName: 'cxc_deta_proforma',
  primaryKey: 'ide_ccdpr',
};

// Campos opcionales de cabecera que se copian al objeto de base de datos solo si están definidos
const OPTIONAL_CAB_FIELDS = [
  'observacion_cccpr', 'referencia_cccpr', 'ide_cndfp', 'telefono_cccpr',
  'ide_getid', 'identificac_cccpr', 'ide_vgven', 'direccion_cccpr',
  'contacto_cccpr', 'ide_ccten', 'ide_ccvap', 'ide_geprov',
  'ide_geper', 'fecha_abre_cccpr', 'usuario_abre_cccpr',
];

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
        'p_inv_estado_normal',          // 1
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async getProformas(dtoIn: ProformasDto & HeaderParamsDto) {
    const estadoFacturaNormal = this.variables.get('p_cxc_estado_factura_normal');

    const query = new SelectQuery(`
WITH items_proforma AS (
  SELECT
    ide_cccpr,
    COUNT(1) AS total_items
  FROM cxc_deta_proforma
  GROUP BY ide_cccpr
),
items_facturados AS (
  SELECT
    det.ide_cccfa,
    COUNT(1) AS total_items
  FROM inv_det_comp_inve det
  INNER JOIN inv_articulo art ON det.ide_inarti = art.ide_inarti
  WHERE art.hace_kardex_inarti = TRUE
  GROUP BY det.ide_cccfa
)
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
  COALESCE(ip.total_items, 0)                                   AS total_items_proforma,

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

  -- Ítems facturados
  COALESCE(ifc.total_items, 0)                                  AS total_items_facturados,

  -- Cliente de la factura
  fact.ide_geper,
  pers.nom_geper                                                AS nombre_cliente,
  pers.identificac_geper                                        AS identificacion_cliente,
  pers.uuid                                                     AS uuid_cliente,

  -- Análisis comparativo proforma vs factura
  COALESCE(fact.total_cccfa, 0) - COALESCE(prof.total_cccpr, 0) AS diferencia_proforma_factura,
  CASE
    WHEN fact.ide_cccfa IS NULL                                              THEN 'SIN_FACTURA'
    WHEN fact.total_cccfa = prof.total_cccpr                                 THEN 'TOTALES_IGUALES'
    WHEN fact.total_cccfa > prof.total_cccpr                                 THEN 'FACTURA_MAYOR'
    ELSE                                                                          'PROFORMA_MAYOR'
  END                                                           AS estado_comparativo

FROM cxc_cabece_proforma          prof
INNER JOIN sis_usuario             usua ON prof.ide_usua        = usua.ide_usua
LEFT  JOIN cxc_tipo_proforma       tipo ON prof.ide_cctpr       = tipo.ide_cctpr
LEFT  JOIN ven_vendedor            vend ON prof.ide_vgven        = vend.ide_vgven
LEFT  JOIN items_proforma          ip   ON ip.ide_cccpr         = prof.ide_cccpr
LEFT  JOIN cxc_cabece_factura      fact ON prof.secuencial_cccpr = fact.num_proforma_cccfa
                                       AND fact.ide_ccefa        = ${estadoFacturaNormal}
LEFT  JOIN cxc_datos_fac           dfac ON fact.ide_ccdaf        = dfac.ide_ccdaf
LEFT  JOIN gen_persona             pers ON fact.ide_geper         = pers.ide_geper
LEFT  JOIN items_facturados        ifc  ON ifc.ide_cccfa         = fact.ide_cccfa

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
        c.ide_cndfp,
        fp.nombre_cndfp,
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
        c.usuario_actua,
        c.ide_geprov,
        c.ide_geper,
        p.nom_geper,
        p.identificac_geper,
        p.ide_getid AS ide_getid_cliente,
        p.ide_getip AS ide_getip_cliente,
        ti2.nombre_getid AS nombre_getid_cliente

      FROM cxc_cabece_proforma c
      LEFT JOIN gen_tipo_identifi ti ON c.ide_getid = ti.ide_getid
      LEFT JOIN sis_usuario u ON c.ide_usua = u.ide_usua
      LEFT JOIN ven_vendedor v ON c.ide_vgven = v.ide_vgven
      LEFT JOIN cxc_tipo_proforma t ON c.ide_cctpr = t.ide_cctpr
      LEFT JOIN cxc_validez_prof va ON c.ide_ccvap = va.ide_ccvap
      LEFT JOIN cxc_tiempo_entrega te ON c.ide_ccten = te.ide_ccten
      LEFT JOIN con_deta_forma_pago fp ON c.ide_cndfp = fp.ide_cndfp
      LEFT JOIN gen_persona p ON c.ide_geper = p.ide_geper
      left join gen_tipo_identifi ti2 on p.ide_getid = ti2.ide_getid
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
        f_decimales(d.cantidad_ccdpr, a.decim_stock_inarti)::text AS cantidad_ccdpr,
        d.precio_ccdpr,
        d.total_ccdpr,
        COALESCE(d.iva_inarti_ccdpr, 0) AS aplica_iva_ccdpr,
        CASE
          WHEN COALESCE(d.iva_inarti_ccdpr, 0) = 1 THEN COALESCE(c.tarifa_iva_cccpr, 0)
          ELSE 0
        END AS iva_inarti_ccdpr,
        d.ide_inuni,
        u.siglas_inuni,
        a.codigo_inarti,
        a.nombre_inarti,
        d.observacion_ccdpr,
        a.uuid,
        d.precio_compra_ccdpr,
        d.porcentaje_util_ccdpr,
        d.utilidad_ccdpr,
        d.fecha_ingre,
        d.hora_ingre,
        d.usuario_ingre,
        d.fecha_actua,
        d.hora_actua,
        d.usuario_actua,
        precio_sugerido_ccdpr
      FROM cxc_deta_proforma d
      INNER JOIN cxc_cabece_proforma c ON d.ide_cccpr = c.ide_cccpr
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
    if (!dtoIn.data.detalles || dtoIn.data.detalles.length === 0) {
      throw new BadRequestException('La proforma debe tener al menos un ítem en el detalle.');
    }

    for (const det of dtoIn.data.detalles) {
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
    qTipo.addIntParam(1, dtoIn.data.ide_cctpr);
    const tipo = await this.dataSource.createSingleQuery(qTipo);

    if (!tipo) {
      throw new BadRequestException(`El tipo de proforma ide_cctpr=${dtoIn.data.ide_cctpr} no existe.`);
    }
  }

  async saveProforma(dtoIn: SaveProformaDto & HeaderParamsDto) {
    await this.validateSaveProforma(dtoIn);

    const module = 'cxc';
    const tableName = 'cabece_proforma';
    const primaryKey = 'ide_cccpr';
    const detTableName = 'deta_proforma';
    const detPrimaryKey = 'ide_ccdpr';
    const cab: CabProformaDto = dtoIn.data;

    const tarifaIva = isDefined(cab.tarifa_iva_cccpr) ? Number(cab.tarifa_iva_cccpr) : 15;
    const totales = this.calcularTotalesProforma(cab.detalles, tarifaIva);

    const isUpdate = dtoIn.isUpdate === true;
    let ideCccpr = cab.ide_cccpr;
    let secuencial = '';
    const listQuery: ObjectQueryDto[] = [];

    if (isUpdate) {
      // Verifica que la proforma exista
      const queryExiste = new SelectQuery(
        `SELECT ide_cccpr, secuencial_cccpr
         FROM cxc_cabece_proforma
         WHERE ide_cccpr = $1 AND ide_empr = $2
         LIMIT 1`,
      );
      queryExiste.addIntParam(1, cab.ide_cccpr);
      queryExiste.addIntParam(2, dtoIn.ideEmpr);
      const proforma = await this.dataSource.createSingleQuery(queryExiste);
      if (!proforma) {
        throw new BadRequestException(`No se encontró la proforma con ide_cccpr: ${cab.ide_cccpr}`);
      }
      secuencial = proforma.secuencial_cccpr;

      // UPDATE cabecera — core.save agrega usuario_actua automáticamente
      const cabeceraData: any = {
        ide_cccpr: ideCccpr,
        fecha_cccpr: cab.fecha_cccpr,
        solicitante_cccpr: cab.solicitante_cccpr,
        correo_cccpr: cab.correo_cccpr,
        base_grabada_cccpr: totales.base_grabada,
        base_tarifa0_cccpr: totales.base_tarifa0,
        valor_iva_cccpr: totales.valor_iva,
        total_cccpr: totales.total,
        tarifa_iva_cccpr: tarifaIva,
        ide_cctpr: cab.ide_cctpr,
        utilidad_cccpr: totales.utilidad,
        fecha_actua: getCurrentDate(),
        hora_actua: getCurrentTime(),
        ide_usua: cab.ide_usua,
      };
      assignIfDefined(cabeceraData, cab, OPTIONAL_CAB_FIELDS);

      listQuery.push({
        operation: 'update',
        module,
        tableName,
        primaryKey,
        object: cabeceraData,
        condition: `${primaryKey} = ${ideCccpr} AND ide_empr = ${dtoIn.ideEmpr}`,
      } as ObjectQueryDto);

      // DELETE detalles existentes
      listQuery.push({
        operation: 'delete',
        module,
        tableName: detTableName,
        primaryKey: detPrimaryKey,
        object: { [detPrimaryKey]: 0 },
        condition: `ide_cccpr = ${ideCccpr} AND ide_empr = ${dtoIn.ideEmpr}`,
      } as ObjectQueryDto);
    } else {
      ideCccpr = await this.dataSource.getSeqTable(SOLICITUD.tableName, SOLICITUD.primaryKey, 1, dtoIn.login);
      secuencial = String(ideCccpr).padStart(9, '0');

      // INSERT cabecera — core.save agrega ide_empr, ide_sucu, usuario_ingre automáticamente
      const cabeceraData: any = {
        ide_cccpr: ideCccpr,
        ide_usua: cab.ide_usua,
        fecha_cccpr: cab.fecha_cccpr,
        solicitante_cccpr: cab.solicitante_cccpr,
        correo_cccpr: cab.correo_cccpr,
        secuencial_cccpr: secuencial,
        base_grabada_cccpr: totales.base_grabada,
        base_tarifa0_cccpr: totales.base_tarifa0,
        valor_iva_cccpr: totales.valor_iva,
        total_cccpr: totales.total,
        tarifa_iva_cccpr: tarifaIva,
        ide_cctpr: cab.ide_cctpr,
        anulado_cccpr: false,
        enviado_cccpr: false,
        utilidad_cccpr: totales.utilidad,
        fecha_ingre: getCurrentDate(),
        hora_ingre: getCurrentTime(),
      };
      assignIfDefined(cabeceraData, cab, OPTIONAL_CAB_FIELDS);

      listQuery.push({
        operation: 'insert',
        module,
        tableName,
        primaryKey,
        object: cabeceraData,
      } as ObjectQueryDto);
    }

    // INSERT detalles — core.save agrega ide_empr, ide_sucu, usuario_ingre automáticamente
    const baseIdeCcdpr = await this.dataSource.getSeqTable(
      DETALLES.tableName,
      DETALLES.primaryKey,
      cab.detalles.length,
      dtoIn.login,
    );

    cab.detalles.forEach((det, idx) => {
      const totalDetalle = isDefined(det.total_ccdpr)
        ? Number(det.total_ccdpr)
        : Number((Number(det.cantidad_ccdpr) * Number(det.precio_ccdpr)).toFixed(2));

      const detData: any = {
        ide_ccdpr: baseIdeCcdpr + idx,
        ide_cccpr: ideCccpr,
        ide_inarti: det.ide_inarti,
        cantidad_ccdpr: det.cantidad_ccdpr,
        precio_ccdpr: det.precio_ccdpr,
        total_ccdpr: totalDetalle,
        iva_inarti_ccdpr: det.iva_inarti_ccdpr,
        precio_sugerido_ccdpr: det.precio_sugerido_ccdpr,
        fecha_ingre: getCurrentDate(),
        hora_ingre: getCurrentTime(),
      };
      assignIfDefined(detData, det, ['observacion_ccdpr', 'ide_inuni', 'precio_compra_ccdpr', 'porcentaje_util_ccdpr', 'utilidad_ccdpr', 'precio_sugerido_ccdpr']);

      listQuery.push({
        operation: 'insert',
        module,
        tableName: detTableName,
        primaryKey: detPrimaryKey,
        object: detData,
      } as ObjectQueryDto);
    });

    await this.core.save({
      ...dtoIn,
      listQuery,
      audit: false,
    });

    return {
      rowCount: 1,
      row: {
        ide_cccpr: ideCccpr,
        secuencial_cccpr: secuencial,
        total_cccpr: totales.total,
        total_items: cab.detalles.length,
      },
      message: isUpdate ? 'Proforma actualizada exitosamente' : 'Proforma guardada exitosamente',
    };
  }

  // ==================================Precios==============================
  async calcularPreciosCliente(dtoIn: GetPrecioClienteDto & HeaderParamsDto) {
    const { ide_inarti, cantidad, ide_geper, ide_cndfp } = dtoIn;

    const fechaFin = getCurrentDate();
    const fechaInicioDate = new Date();
    fechaInicioDate.setFullYear(fechaInicioDate.getFullYear() - 1);
    const fechaInicio = fechaInicioDate.toISOString().split('T')[0];

    const estadoFacturaNormal = this.variables.get('p_cxc_estado_factura_normal');
    const estadoNormal = this.variables.get('p_inv_estado_normal');

    const whereCantidadVentas = isDefined(cantidad)
      ? `AND ABS(cdf.cantidad_ccdfa - ${cantidad}) <= 0.3 * ${cantidad}`
      : '';
    const whereCantidadCotizaciones = isDefined(cantidad)
      ? `AND ABS(dep.cantidad_ccdpr - ${cantidad}) <= 0.3 * ${cantidad}`
      : '';

    const qConfigPrecios = new SelectQuery(`
      SELECT
        a.*,
        nombre_cncfp,
        nombre_cndfp,
        dias_cndfp
      FROM f_calcula_precio_venta($1, $2, $3, NULL) a
      LEFT JOIN con_deta_forma_pago fp ON a.forma_pago_config = fp.ide_cndfp
      LEFT JOIN con_cabece_forma_pago cp ON fp.ide_cncfp = cp.ide_cncfp
    `);
    qConfigPrecios.addParam(1, ide_inarti);
    qConfigPrecios.addParam(2, cantidad ?? 1);
    qConfigPrecios.addParam(3, ide_cndfp ?? null);

    const qVentasCliente = isDefined(ide_geper)
      ? new SelectQuery(`
          SELECT
            cf.fecha_emisi_cccfa,
            cf.secuencial_cccfa,
            p.nom_geper,
            f_decimales(cdf.cantidad_ccdfa, iart.decim_stock_inarti)::numeric AS cantidad_ccdfa,
            uni.siglas_inuni,
            cdf.precio_ccdfa,
            cdf.total_ccdfa
          FROM cxc_deta_factura cdf
          INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
          INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
          LEFT  JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
          INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
          WHERE cdf.ide_inarti = $1
            AND cf.ide_geper = $2
            AND cf.ide_ccefa = ${estadoFacturaNormal}
            AND cf.fecha_emisi_cccfa BETWEEN $3 AND $4
            AND cf.ide_empr = ${dtoIn.ideEmpr}
          ORDER BY cf.fecha_emisi_cccfa DESC
        `)
      : null;

    if (qVentasCliente) {
      qVentasCliente.addIntParam(1, ide_inarti);
      qVentasCliente.addIntParam(2, ide_geper);
      qVentasCliente.addParam(3, fechaInicio);
      qVentasCliente.addParam(4, fechaFin);
    }
    // excluye cliente y DIQUIMEC
    const whereExcluirCliente = isDefined(ide_geper)
      ? `AND cf.ide_geper <> ${ide_geper} AND cf.ide_geper <> 16477`
      : 'AND cf.ide_geper <> 16477';
    const qVentasOtros = new SelectQuery(`
      SELECT
        cf.fecha_emisi_cccfa,
        cf.secuencial_cccfa,
        p.nom_geper,
        f_decimales(cdf.cantidad_ccdfa, iart.decim_stock_inarti)::numeric AS cantidad_ccdfa,
        uni.siglas_inuni,
        cdf.precio_ccdfa,
        cdf.total_ccdfa
      FROM cxc_deta_factura cdf
      INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
      INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
      LEFT  JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
      INNER JOIN gen_persona p ON cf.ide_geper = p.ide_geper
      WHERE cdf.ide_inarti = $1
        AND cf.ide_ccefa = ${estadoFacturaNormal}
        AND cf.fecha_emisi_cccfa BETWEEN $2 AND $3
        AND cf.ide_empr = ${dtoIn.ideEmpr}
        ${whereExcluirCliente}
        ${whereCantidadVentas}
      ORDER BY cf.fecha_emisi_cccfa DESC
      LIMIT 100
    `);
    qVentasOtros.addIntParam(1, ide_inarti);
    qVentasOtros.addParam(2, fechaInicio);
    qVentasOtros.addParam(3, fechaFin);

    const qCotizaciones = new SelectQuery(`
      SELECT
        cpr.ide_cccpr,
        cpr.secuencial_cccpr,
        cpr.fecha_cccpr,
        cpr.solicitante_cccpr,
        gp.nom_geper AS cliente_cotizacion,
        f_decimales(dep.cantidad_ccdpr, iart.decim_stock_inarti)::numeric AS cantidad_ccdpr,
        dep.precio_ccdpr,
        dep.total_ccdpr,
        uni.siglas_inuni
      FROM cxc_deta_proforma dep
      INNER JOIN cxc_cabece_proforma cpr ON dep.ide_cccpr = cpr.ide_cccpr
      INNER JOIN inv_articulo iart ON dep.ide_inarti = iart.ide_inarti
      LEFT  JOIN inv_unidad uni ON iart.ide_inuni = uni.ide_inuni
      LEFT  JOIN gen_persona gp ON cpr.ide_geper = gp.ide_geper
      WHERE dep.ide_inarti = $1
        AND cpr.ide_empr = ${dtoIn.ideEmpr}
        AND cpr.fecha_cccpr BETWEEN $2 AND $3
        AND COALESCE(cpr.anulado_cccpr, false) = false
        ${whereCantidadCotizaciones}
      ORDER BY cpr.fecha_cccpr DESC
      LIMIT 100
    `);
    qCotizaciones.addIntParam(1, ide_inarti);
    qCotizaciones.addParam(2, fechaInicio);
    qCotizaciones.addParam(3, fechaFin);

    const qUltimaCompra = new SelectQuery(`
      SELECT
        dci.precio_indci AS ultima_precio_compra,
        cci.fecha_trans_incci AS ultima_fecha_compra,
        p.nom_geper AS proveedor
      FROM inv_det_comp_inve dci
      INNER JOIN inv_cab_comp_inve cci ON cci.ide_incci = dci.ide_incci
      INNER JOIN inv_tip_tran_inve tti ON tti.ide_intti = cci.ide_intti
      INNER JOIN inv_tip_comp_inve tci ON tci.ide_intci = tti.ide_intci
      LEFT  JOIN gen_persona p ON cci.ide_geper = p.ide_geper
      WHERE dci.ide_inarti = $1
        AND cci.ide_inepi = ${estadoNormal}
        AND tci.signo_intci = 1
        AND cci.ide_intti IN (19, 16, 3025)
        AND dci.precio_indci > 0
        AND cci.ide_empr = ${dtoIn.ideEmpr}
      ORDER BY cci.fecha_trans_incci DESC
      LIMIT 1
    `);
    qUltimaCompra.addIntParam(1, ide_inarti);

    const [configPrecios, ventasCliente, ventasOtros, cotizaciones, ultimaCompra] = await Promise.all([
      this.dataSource.createSelectQuery(qConfigPrecios),
      qVentasCliente
        ? this.dataSource.createSelectQuery(qVentasCliente)
        : Promise.resolve([] as any[]),
      this.dataSource.createSelectQuery(qVentasOtros),
      this.dataSource.createSelectQuery(qCotizaciones),
      this.dataSource.createSingleQuery(qUltimaCompra),
    ]);

    // ✅ CORRECCIÓN: config activa solo si realmente produjo un precio calculado
    const tiene_config_precio = configPrecios.some(
      (c: any) => c.precio_venta_con_iva != null || c.precio_venta_sin_iva != null
    );

    const preciosVentasCliente = ventasCliente
      .map((v: any) => Number(v.precio_ccdfa))
      .filter((p: number) => p > 0);
    const preciosVentasOtros = ventasOtros
      .map((v: any) => Number(v.precio_ccdfa))
      .filter((p: number) => p > 0);
    const preciosCotizaciones = cotizaciones
      .map((c: any) => Number(c.precio_ccdpr))
      .filter((p: number) => p > 0);
    const todosLosPrecios = [...preciosVentasCliente, ...preciosVentasOtros, ...preciosCotizaciones];

    let metricas: any = null;
    let precio_sugerido: number | null = null;

    if (todosLosPrecios.length > 0) {
      const precio_minimo = Math.min(...todosLosPrecios);
      const precio_maximo = Math.max(...todosLosPrecios);
      const precio_promedio = todosLosPrecios.reduce((a, b) => a + b, 0) / todosLosPrecios.length;

      metricas = {
        precio_minimo: Number(fNumber(precio_minimo)),
        precio_maximo: Number(fNumber(precio_maximo)),
        precio_promedio: Number(fNumber(precio_promedio)),
        total_ventas_cliente: ventasCliente.length,
        total_ventas_otros: ventasOtros.length,
        total_cotizaciones: cotizaciones.length,
        total_registros_analizados: todosLosPrecios.length,
      };

      // ✅ CORRECCIÓN: sugerir precio cuando la config no produjo un precio válido
      if (!tiene_config_precio) {
        precio_sugerido = Number(fNumber((precio_minimo + precio_maximo) / 2));
      }
    }

    return {
      config_precios: configPrecios,
      tiene_config_precio,
      ventas_cliente: isDefined(ide_geper) ? ventasCliente : null,
      ventas_otros_clientes: ventasOtros,
      cotizaciones,
      ultima_precio_compra: ultimaCompra?.ultima_precio_compra ?? null,
      ultima_fecha_compra: ultimaCompra?.ultima_fecha_compra ?? null,
      proveedor_ultima_compra: ultimaCompra?.proveedor ?? null,
      metricas,
      precio_sugerido,
    };
  }
  // ==================================ListData==============================
  async getListDataTipoProforma(dto?: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'cxc',
      tableName: 'tipo_proforma',
      primaryKey: 'ide_cctpr',
      columnLabel: 'nombre_cctpr',
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getListDataTiempoEntrega(dto?: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'cxc',
      tableName: 'tiempo_entrega',
      primaryKey: 'ide_ccten',
      columnLabel: 'nombre_ccten',
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getListDataValidezProforma(dto?: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'cxc',
      tableName: 'validez_prof',
      primaryKey: 'ide_ccvap',
      columnLabel: 'nombre_ccvap',
    };
    return this.core.getListDataValues(dtoIn);
  }


  async getListDataFormaPago(dto?: QueryOptionsDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'con',
      tableName: 'deta_forma_pago',
      primaryKey: 'ide_cndfp',
      columnLabel: 'nombre_cndfp',
    };
    return this.core.getListDataValues(dtoIn);
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
