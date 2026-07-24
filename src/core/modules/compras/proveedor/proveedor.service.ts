import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { CoreService } from 'src/core/core.service';
import { getDateFormat, getDateFormatFront } from 'src/util/helpers/date-util';
import { normalizeString } from 'src/util/helpers/sql-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';

import { ComprasMensualesProveedorDto } from './dto/compras-mensuales-proveedor.dto';
import { GetProveedoresDto } from './dto/get-proveedores.dto';
import { IdProveedorDto } from './dto/id-proveedor.dto';
import { TrnProveedorDto } from './dto/trn-proveedor.dto';
import { GetCtaBancoProveedorDto } from './dto/get-cta-banco-proveedor.dto';

@Injectable()
export class ProveedorService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
  ) {
    super();
    this.core
      .getVariables([
        'p_cxp_estado_factura_normal',
        'p_cxp_tipo_trans_anticipo',
        'p_con_estado_comp_inicial',
        'p_con_estado_comprobante_normal',
        'p_con_estado_comp_final',
        'p_con_lugar_debe',
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async searchProveedor(dto: SearchDto & HeaderParamsDto) {
    if (dto.value === '') {
      return [];
    }

    const normalizedSearchValue = normalizeString(dto.value.trim());
    const sqlSearchValue = `%${normalizedSearchValue}%`;

    const query = new SelectQuery(
      `
    SELECT
        p.ide_geper,
        p.uuid,
        p.identificac_geper,
        p.nom_geper,
        p.correo_geper,
        CASE
            WHEN regexp_replace(unaccent(LOWER(COALESCE(ti.nombre_getid, ''))), '[^a-z0-9]', '', 'g') LIKE '%cedula%' THEN 'CEDULA'
            WHEN regexp_replace(unaccent(LOWER(COALESCE(ti.nombre_getid, ''))), '[^a-z0-9]', '', 'g') LIKE '%ruc%' THEN 'RUC'
            WHEN regexp_replace(unaccent(LOWER(COALESCE(ti.nombre_getid, ''))), '[^a-z0-9]', '', 'g') LIKE '%pasaporte%' THEN 'PASAPORTE'
            ELSE COALESCE(ti.nombre_getid, '')
        END AS tipo_identificacion,
        COALESCE(tp.detalle_getip, '') AS tipo_persona,
        p.ide_getid,
        p.ide_getip,
        prov.ide_geprov,
        prov.nombre_geprov,
        p.direccion_geper,
        p.telefono_geper,
        p.fecha_ingre_geper
    FROM
        gen_persona p
        LEFT JOIN gen_tipo_identifi ti ON p.ide_getid = ti.ide_getid
        LEFT JOIN gen_tipo_persona tp ON p.ide_getip = tp.ide_getip
        LEFT JOIN gen_provincia prov ON p.ide_geprov = prov.ide_geprov
    WHERE
        (
            regexp_replace(unaccent(LOWER(p.nom_geper)), '[^a-z0-9]', '', 'g') LIKE $1
            OR regexp_replace(unaccent(LOWER(p.identificac_geper)), '[^a-z0-9]', '', 'g') LIKE $2
            OR regexp_replace(unaccent(LOWER(p.correo_geper)), '[^a-z0-9]', '', 'g') LIKE $3
        )
        AND p.ide_empr = ${dto.ideEmpr}
        AND p.activo_geper = true
        and p.es_proveedo_geper = true
        AND p.nivel_geper = 'HIJO'
    ORDER BY
        p.nom_geper
    LIMIT ${dto.limit}
    `,
      dto,
    );
    query.addStringParam(1, sqlSearchValue);
    query.addStringParam(2, sqlSearchValue);
    query.addStringParam(3, sqlSearchValue);
    return this.dataSource.createSelectQuery(query);
  }

  async getProveedores(dtoIn: GetProveedoresDto & HeaderParamsDto) {
    const activeClause = dtoIn.activos ? 'and activo_geper = true' : '';
    const query = new SelectQuery(
      `
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            p.ide_getip,
            detalle_getip,
            p.correo_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            activo_geper
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN gen_tipo_persona d on p.ide_getip = d.ide_getip
            LEFT JOIN gen_tipo_identifi h on p.ide_getid = h.ide_getid
        WHERE
            p.es_proveedo_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
            AND p.ide_empr = ${dtoIn.ideEmpr}
            ${activeClause}
        ORDER BY
            p.nom_geper
        `,
      dtoIn,
    );

    return this.dataSource.createQuery(query);
  }

  async getSaldo(dtoIn: IdProveedorDto & HeaderParamsDto) {
    const paramValue = dtoIn.ide_geper || dtoIn.uuid;
    if (!paramValue) {
      throw new Error('Se requiere ide_geper o uuid en el DTO de entrada');
    }

    const joinPersona = dtoIn.ide_geper ? '' : 'INNER JOIN gen_persona p ON ct.ide_geper = p.ide_geper';
    const whereClause = dtoIn.ide_geper ? 'ct.ide_geper = $1' : 'p.uuid = $1';

    const query = new SelectQuery(`
        SELECT
            ct.ide_geper,
            COALESCE(SUM(valor_cpdtr * tt.signo_cpttr), 0) AS saldo
        FROM
            cxp_detall_transa dt
        INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
        INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
        ${joinPersona}
        WHERE
            ${whereClause}
            AND ct.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY
            ct.ide_geper
        `);

    query.addParam(1, paramValue);
    return this.dataSource.createQuery(query);
  }

  async getProveedorByUuid(dtoIn: UuidDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT
            p.ide_geper,
            p.uuid,
            p.codigo_geper,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            p.nombre_compl_geper,
            p.contacto_geper,
            p.direccion_geper,
            nombre_geprov,
            nombre_gecant,
            p.correo_geper,
            p.telefono_geper,
            p.movil_geper,
            p.observacion_geper,
            p.fecha_ingre_geper,
            p.activo_geper,
            p.es_proveedo_geper,
            b.nombre_cndfp,
            nombre_cntco
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN gen_provincia e ON p.ide_geprov = e.ide_geprov
            LEFT JOIN gen_canton f ON p.ide_gecant = f.ide_gecant
            LEFT JOIN gen_tipo_identifi h ON p.ide_getid = h.ide_getid
            LEFT JOIN con_tipo_contribu i ON p.ide_cntco = i.ide_cntco
        WHERE
            p.uuid = $1
            AND p.es_proveedo_geper = true
        `);
    query.addStringParam(1, dtoIn.uuid);

    const res = await this.dataSource.createSingleQuery(query);
    return {
      rowCount: res ? 1 : 0,
      row: res ?? null,
      message: res ? 'ok' : 'Proveedor no encontrado',
    } as ResultQuery;
  }

  async getTrnProveedor(dtoIn: TrnProveedorDto & HeaderParamsDto) {
    const paramValue = dtoIn.ide_geper || dtoIn.uuid;
    if (!paramValue) {
      throw new Error('Se requiere ide_geper o uuid en el DTO de entrada');
    }

    const joinPersona = dtoIn.ide_geper ? '' : 'INNER JOIN gen_persona p ON ct.ide_geper = p.ide_geper';
    const whereClause1 = dtoIn.ide_geper ? 'ct.ide_geper = $1' : 'p.uuid = $1';
    const whereClause3 = dtoIn.ide_geper ? 'ct.ide_geper = $3' : 'p.uuid = $3';

    const query = new SelectQuery(
      `
        WITH saldo_inicial AS (
            SELECT
                ct.ide_geper,
                COALESCE(SUM(valor_cpdtr * tt.signo_cpttr), 0) AS saldo_inicial
            FROM
                cxp_detall_transa dt
                INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
                INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
                ${joinPersona}
            WHERE
                ${whereClause1}
                AND fecha_trans_cpdtr < $2
                AND dt.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY
                ct.ide_geper
        ),
        movimientos AS (
            SELECT
                a.ide_cpdtr,
                fecha_trans_cpdtr,
                docum_relac_cpdtr,
                observacion_cpdtr AS observacion,
                nombre_cpttr AS transaccion,
                CASE WHEN b.signo_cpttr = 1 THEN valor_cpdtr END AS debe,
                CASE WHEN b.signo_cpttr = -1 THEN valor_cpdtr END AS haber,
                0 as saldo,
                fecha_venci_cpdtr,
                ide_teclb,
                ide_cnccc
            FROM
                cxp_detall_transa a
                INNER JOIN cxp_tipo_transacc b ON a.ide_cpttr = b.ide_cpttr
                INNER JOIN cxp_cabece_transa ct ON a.ide_cpctr = ct.ide_cpctr
                ${joinPersona}
            WHERE
                ${whereClause3}
                AND fecha_trans_cpdtr BETWEEN $4 AND $5
                AND a.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY
                fecha_trans_cpdtr, a.ide_cpdtr
        )
        SELECT
            -1 AS ide_cpdtr,
            '${getDateFormat(dtoIn.fechaInicio)}' AS fecha_trans_cpdtr,
            NULL AS docum_relac_cpdtr,
            'SALDO INICIAL AL ${getDateFormatFront(dtoIn.fechaInicio)}' AS observacion,
            'Saldo Inicial' AS transaccion,
            NULL AS debe,
            NULL AS haber,
            COALESCE(saldo_inicial.saldo_inicial, 0) AS saldo,
            NULL AS fecha_venci_cpdtr,
            NULL AS ide_teclb,
            NULL AS ide_cnccc
        FROM
            (SELECT 1) AS dummy
            LEFT JOIN saldo_inicial ON TRUE

        UNION ALL

        SELECT
            mov.ide_cpdtr,
            mov.fecha_trans_cpdtr,
            mov.docum_relac_cpdtr,
            mov.observacion,
            mov.transaccion,
            mov.debe,
            mov.haber,
            COALESCE(saldo_inicial.saldo_inicial, 0) +
            COALESCE(SUM(mov.debe) OVER (ORDER BY mov.fecha_trans_cpdtr, mov.ide_cpdtr), 0) -
            COALESCE(SUM(mov.haber) OVER (ORDER BY mov.fecha_trans_cpdtr, mov.ide_cpdtr), 0) AS saldo,
            mov.fecha_venci_cpdtr,
            mov.ide_teclb,
            mov.ide_cnccc
        FROM
            movimientos mov
            CROSS JOIN (SELECT COALESCE(SUM(saldo_inicial), 0) AS saldo_inicial FROM saldo_inicial) saldo_inicial
        ORDER BY
            fecha_trans_cpdtr, ide_cpdtr
        `,
      dtoIn,
    );

    query.addParam(1, paramValue);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, paramValue);
    query.addParam(4, dtoIn.fechaInicio);
    query.addParam(5, dtoIn.fechaFin);

    return this.dataSource.createQuery(query);
  }

  async getKpiTrnProveedor(dtoIn: TrnProveedorDto & HeaderParamsDto) {
    const paramValue = dtoIn.ide_geper || dtoIn.uuid;
    if (!paramValue) {
      throw new Error('Se requiere ide_geper o uuid en el DTO de entrada');
    }

    const joinPersona = dtoIn.ide_geper ? '' : 'INNER JOIN gen_persona p ON ct.ide_geper = p.ide_geper';
    const whereClause = dtoIn.ide_geper ? 'ct.ide_geper = $1' : 'p.uuid = $1';

    const query = new SelectQuery(`
        WITH saldo_inicial AS (
            SELECT COALESCE(SUM(valor_cpdtr * tt.signo_cpttr), 0) AS saldo
            FROM cxp_detall_transa dt
            INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
            INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            ${joinPersona}
            WHERE ${whereClause}
              AND fecha_trans_cpdtr < $2
              AND dt.ide_empr = ${dtoIn.ideEmpr}
        ),
        stats AS (
            SELECT
                COALESCE(SUM(CASE WHEN tt.signo_cpttr = 1 THEN valor_cpdtr ELSE 0 END), 0) AS total_debe,
                COALESCE(SUM(CASE WHEN tt.signo_cpttr = -1 THEN valor_cpdtr ELSE 0 END), 0) AS total_haber,
                COUNT(*) FILTER (WHERE tt.signo_cpttr = 1) AS movimientos_debe,
                COUNT(*) FILTER (WHERE tt.signo_cpttr = -1) AS movimientos_haber,
                COUNT(DISTINCT dt.ide_cpctr) AS total_documentos,
                MIN(fecha_trans_cpdtr) AS fecha_primera,
                MAX(fecha_trans_cpdtr) AS fecha_ultima
            FROM cxp_detall_transa dt
            INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
            INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            ${joinPersona}
            WHERE ${whereClause}
              AND fecha_trans_cpdtr BETWEEN $2 AND $3
              AND dt.ide_empr = ${dtoIn.ideEmpr}
        ),
        pendiente AS (
            SELECT COALESCE(
                SUM(
                    CASE WHEN tt.signo_cpttr = 1 AND fecha_venci_cpdtr < CURRENT_DATE THEN valor_cpdtr ELSE 0 END
                ) -
                SUM(
                    CASE WHEN tt.signo_cpttr = -1 THEN valor_cpdtr ELSE 0 END
                ), 0
            ) AS monto_vencido
            FROM cxp_detall_transa dt
            INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
            INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            ${joinPersona}
            WHERE ${whereClause}
              AND dt.ide_empr = ${dtoIn.ideEmpr}
        )
        SELECT
            si.saldo AS saldo_inicial,
            si.saldo + s.total_debe - s.total_haber AS saldo_final,
            s.total_debe,
            s.total_haber,
            s.movimientos_debe,
            s.movimientos_haber,
            s.total_documentos,
            s.fecha_primera,
            s.fecha_ultima,
            CASE WHEN s.movimientos_debe > 0
                THEN ROUND(s.total_debe / s.movimientos_debe, 6)
                ELSE 0
            END AS valor_promedio_debe,
            CASE WHEN s.movimientos_haber > 0
                THEN ROUND(s.total_haber / s.movimientos_haber, 6)
                ELSE 0
            END AS valor_promedio_haber,
            CASE WHEN s.total_debe > 0
                THEN ROUND((s.total_haber / s.total_debe) * 100, 2)
                ELSE 0
            END AS porcentaje_pagado,
            p.monto_vencido
        FROM saldo_inicial si
        CROSS JOIN stats s
        CROSS JOIN pendiente p
        `,
      dtoIn,
    );

    query.addParam(1, paramValue);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, dtoIn.fechaFin);

    return this.dataSource.createSingleQuery(query);
  }

  async getDireccionesProveedor(dtoIn: IdProveedorDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        select
            a.ide_gedirp,
            a.nombre_dir_gedirp,
            a.direccion_gedirp,
            a.referencia_gedirp ,
            a.telefono_gedirp ,
            a.movil_gedirp,
            a.longitud_gedirp,
            a.latitud_gedirp ,
            a.ide_geprov,
            b.nombre_geprov ,
            a.ide_gecant,
            c.nombre_gecant ,
            a.ide_getidi,
            d.nombre_getidi,
            a.activo_gedirp,
            a.defecto_gedirp,
            CASE
              WHEN a.latitud_gedirp IS NULL OR a.longitud_gedirp IS NULL THEN NULL
              ELSE ROUND(
                6371 * 2 * ASIN(SQRT(
                  POWER(SIN(RADIANS((a.latitud_gedirp::numeric - e.latitud_empr) / 2)), 2) +
                  COS(RADIANS(e.latitud_empr)) * COS(RADIANS(a.latitud_gedirp::numeric)) *
                  POWER(SIN(RADIANS((a.longitud_gedirp::numeric - e.longitud_empr) / 2)), 2)
                ))::numeric, 2
              )
            END AS distancia_km
        from
            gen_direccion_persona a
        left join gen_provincia b on
            a.ide_geprov = b.ide_geprov
        left join gen_canton c on
            a.ide_gecant = c.ide_gecant
        inner join gen_tipo_direccion d on
            a.ide_getidi = d.ide_getidi
        cross join sis_empresa e
        where a.ide_geper = $1
        and a.ide_getidi is not null
        and e.ide_empr = ${dtoIn.ideEmpr}
        order by defecto_gedirp desc, activo_gedirp desc
        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_geper!);
    return this.dataSource.createSelectQuery(query);
  }

  async getProductosProveedor(dtoIn: IdProveedorDto & HeaderParamsDto) {
    const paramValue = dtoIn.ide_geper || dtoIn.uuid;
    if (!paramValue) {
      throw new Error('Se requiere ide_geper o uuid en el DTO de entrada');
    }

    const joinPersona = dtoIn.ide_geper ? '' : 'INNER JOIN gen_persona p ON b.ide_geper = p.ide_geper';
    const whereClause = dtoIn.ide_geper ? 'b.ide_geper = $1' : 'p.uuid = $1';

    const query = new SelectQuery(
      `
        SELECT DISTINCT
            a.ide_inarti,
            c.nombre_inarti,
            MAX(b.fecha_emisi_cpcfa) AS fecha_ultima_compra,
            COALESCE(
                (SELECT precio_cpdfa
                 FROM cxp_detall_factur df
                 INNER JOIN cxp_cabece_factur cf ON df.ide_cpcfa = cf.ide_cpcfa
                 WHERE cf.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
                   AND cf.ide_geper = b.ide_geper
                   AND df.ide_inarti = a.ide_inarti
                 ORDER BY cf.fecha_emisi_cpcfa DESC
                 LIMIT 1), 0
            ) AS ultimo_precio,
            COALESCE(u.siglas_inuni, '') AS unidad,
            c.foto_inarti
        FROM cxp_detall_factur a
        INNER JOIN cxp_cabece_factur b ON a.ide_cpcfa = b.ide_cpcfa
        ${joinPersona}
        INNER JOIN inv_articulo c ON a.ide_inarti = c.ide_inarti
        LEFT JOIN inv_unidad u ON c.ide_inuni = u.ide_inuni
        WHERE ${whereClause}
          AND b.ide_cpefa = ${this.variables.get('p_cxp_estado_factura_normal')}
          AND a.ide_empr = ${dtoIn.ideEmpr}
        GROUP BY a.ide_inarti, c.nombre_inarti, b.ide_geper, u.siglas_inuni, c.foto_inarti
        ORDER BY c.nombre_inarti
        `,
      dtoIn,
    );
    query.addParam(1, paramValue);
    return this.dataSource.createSelectQuery(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cuenta contable del proveedor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Retorna la cuenta contable configurada del proveedor para el identificador
   * 'CUENTA POR PAGAR' (con_cab_conf_asie / con_vig_conf_asie / con_det_conf_asie),
   * subiendo recursivamente por el padre del proveedor si no la tiene asignada.
   */
  async getCuentaContableProveedor(dtoIn: IdProveedorDto & HeaderParamsDto) {
    const ideCndpc = await this.resolverCuentaProveedor(Number(dtoIn.ide_geper), dtoIn.ideEmpr, dtoIn.ideSucu, 3);
    if (!ideCndpc) return { ide_cndpc: null, codig_recur_cndpc: null, nombre_cndpc: null };

    const q = new SelectQuery(`
        SELECT ide_cndpc, codig_recur_cndpc, nombre_cndpc
        FROM con_det_plan_cuen
        WHERE ide_cndpc = $1
        LIMIT 1
    `);
    q.addIntParam(1, ideCndpc);
    const cuenta = await this.dataSource.createSingleQuery(q);
    return cuenta ?? { ide_cndpc: ideCndpc, codig_recur_cndpc: null, nombre_cndpc: null };
  }

  private async resolverCuentaProveedor(
    ideGeper: number, ideEmpr: number, ideSucu: number, maxNivel: number,
  ): Promise<number | null> {
    if (!ideGeper || maxNivel < 0) return null;

    const q = new SelectQuery(`
        SELECT cn_d.ide_cndpc
        FROM con_vig_conf_asie cn_v
        JOIN con_det_conf_asie cn_d ON cn_v.ide_cnvca = cn_d.ide_cnvca
        JOIN con_cab_conf_asie cn_c ON cn_v.ide_cncca = cn_c.ide_cncca
        WHERE UPPER(cn_c.nombre_cncca) = 'CUENTA POR PAGAR'
          AND cn_v.estado_cnvca = true
          AND cn_d.ide_geper = $1
          AND cn_v.ide_sucu = $2
        LIMIT 1
    `);
    q.addIntParam(1, ideGeper);
    q.addIntParam(2, ideSucu);
    const result = await this.dataSource.createSingleQuery(q);
    if (result?.ide_cndpc) return Number(result.ide_cndpc);

    const qPadre = new SelectQuery(`
        SELECT gen_ide_geper FROM gen_persona WHERE ide_geper = $1
    `);
    qPadre.addIntParam(1, ideGeper);
    const padre = await this.dataSource.createSingleQuery(qPadre);
    if (padre?.gen_ide_geper && Number(padre.gen_ide_geper) !== ideGeper) {
      return this.resolverCuentaProveedor(Number(padre.gen_ide_geper), ideEmpr, ideSucu, maxNivel - 1);
    }
    return null;
  }

  /**
   * Movimientos contables del proveedor sobre su cuenta configurada, con saldo
   * inicial del período contable y saldo corrido (paridad legacy
   * getSqlMovimientosCuentaPersona + getSaldoInicialCuenta)
   */
  async getMovimientosCuentaProveedor(dtoIn: TrnProveedorDto & HeaderParamsDto) {
    const ideCndpc = await this.resolverCuentaProveedor(Number(dtoIn.ide_geper), dtoIn.ideEmpr, dtoIn.ideSucu, 3);
    if (!ideCndpc) {
      throw new BadRequestException('El proveedor seleccionado no tiene asociada una cuenta contable');
    }
    const estados = [
      Number(this.variables.get('p_con_estado_comp_inicial')),
      Number(this.variables.get('p_con_estado_comprobante_normal')),
      Number(this.variables.get('p_con_estado_comp_final')),
    ].filter((v) => !Number.isNaN(v));
    const lugarDebe = Number(this.variables.get('p_con_lugar_debe') || '1');

    const query = new SelectQuery(
      `
      WITH periodo AS (
          SELECT COALESCE(
              (SELECT fecha_inicio_cnper
               FROM con_periodo
               WHERE $1::date BETWEEN fecha_inicio_cnper AND fecha_fin_cnper
                 AND ide_sucu = $2
               ORDER BY ide_cnper DESC
               LIMIT 1),
              '2012-01-01'::date
          ) AS fecha_inicio
      ),
      saldo_inicial AS (
          SELECT COALESCE(SUM(dcc.valor_cndcc * sc.signo_cnscu), 0) AS saldo
          FROM con_cab_comp_cont ccc
          INNER JOIN con_det_comp_cont dcc ON ccc.ide_cnccc = dcc.ide_cnccc
          INNER JOIN con_det_plan_cuen dpc ON dpc.ide_cndpc = dcc.ide_cndpc
          INNER JOIN con_tipo_cuenta tc ON dpc.ide_cntcu = tc.ide_cntcu
          INNER JOIN con_signo_cuenta sc ON tc.ide_cntcu = sc.ide_cntcu AND dcc.ide_cnlap = sc.ide_cnlap
          CROSS JOIN periodo
          WHERE ccc.fecha_trans_cnccc >= periodo.fecha_inicio
            AND ccc.fecha_trans_cnccc < $3::date
            AND ccc.ide_cneco = ANY($4)
            AND ccc.ide_sucu = $5
            AND ccc.ide_geper = $6
            AND dpc.ide_cndpc = $7
      ),
      movimientos AS (
          SELECT cab.fecha_trans_cnccc,
                 cab.ide_cnccc,
                 perso.nom_geper AS beneficiario,
                 deta.ide_cnlap,
                 CASE WHEN deta.ide_cnlap = ${lugarDebe} THEN ABS(deta.valor_cndcc) END AS debe,
                 CASE WHEN deta.ide_cnlap != ${lugarDebe} THEN deta.valor_cndcc END AS haber,
                 (deta.valor_cndcc * sc.signo_cnscu) AS valor,
                 cab.observacion_cnccc AS observacion
          FROM con_cab_comp_cont cab
          LEFT JOIN gen_persona perso ON cab.ide_geper = perso.ide_geper
          INNER JOIN con_det_comp_cont deta ON cab.ide_cnccc = deta.ide_cnccc
          INNER JOIN con_det_plan_cuen cuenta ON cuenta.ide_cndpc = deta.ide_cndpc
          INNER JOIN con_tipo_cuenta tc ON cuenta.ide_cntcu = tc.ide_cntcu
          INNER JOIN con_signo_cuenta sc ON tc.ide_cntcu = sc.ide_cntcu AND deta.ide_cnlap = sc.ide_cnlap
          WHERE cuenta.ide_cndpc = $8
            AND cab.fecha_trans_cnccc BETWEEN $9 AND $10
            AND cab.ide_cneco = ANY($11)
            AND cab.ide_sucu = $12
            AND cab.ide_geper = $13
      )
      SELECT NULL::date AS fecha_trans_cnccc,
             NULL::int AS ide_cnccc,
             'SALDO INICIAL' AS beneficiario,
             NULL::int AS ide_cnlap,
             NULL::numeric AS debe,
             NULL::numeric AS haber,
             saldo_inicial.saldo AS valor,
             saldo_inicial.saldo AS saldo,
             'SALDO INICIAL AL ' || $14 AS observacion
      FROM saldo_inicial
      UNION ALL
      SELECT mov.fecha_trans_cnccc,
             mov.ide_cnccc,
             mov.beneficiario,
             mov.ide_cnlap,
             mov.debe,
             mov.haber,
             mov.valor,
             (SELECT saldo FROM saldo_inicial) +
             SUM(mov.valor) OVER (ORDER BY mov.fecha_trans_cnccc, mov.ide_cnccc) AS saldo,
             mov.observacion
      FROM movimientos mov
      ORDER BY fecha_trans_cnccc NULLS FIRST, ide_cnccc
      `,
      dtoIn,
    );
    query.addStringParam(1, dtoIn.fechaInicio);
    query.addIntParam(2, dtoIn.ideSucu);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addParam(4, estados);
    query.addIntParam(5, dtoIn.ideSucu);
    query.addIntParam(6, dtoIn.ide_geper);
    query.addIntParam(7, ideCndpc);
    query.addIntParam(8, ideCndpc);
    query.addStringParam(9, dtoIn.fechaInicio);
    query.addStringParam(10, dtoIn.fechaFin);
    query.addParam(11, estados);
    query.addIntParam(12, dtoIn.ideSucu);
    query.addIntParam(13, dtoIn.ide_geper);
    query.addStringParam(14, dtoIn.fechaInicio);
    return this.dataSource.createQuery(query);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Informes / combos del proveedor
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Totales de compras del proveedor por mes en un período (gráfico)
   */
  async getComprasMensualesProveedor(dtoIn: ComprasMensualesProveedorDto & HeaderParamsDto) {
    const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
    const query = new SelectQuery(`
        SELECT m.nombre_gemes,
               COUNT(c.ide_cpcfa)                                                  AS num_facturas,
               COALESCE(SUM(c.base_grabada_cpcfa), 0)                              AS ventas12,
               COALESCE(SUM(c.base_tarifa0_cpcfa + c.base_no_objeto_iva_cpcfa), 0) AS ventas0,
               COALESCE(SUM(c.valor_iva_cpcfa), 0)                                 AS iva,
               COALESCE(SUM(c.total_cpcfa), 0)                                     AS total
        FROM gen_mes m
        LEFT JOIN cxp_cabece_factur c
          ON EXTRACT(MONTH FROM c.fecha_emisi_cpcfa) = m.ide_gemes
         AND EXTRACT(YEAR FROM c.fecha_emisi_cpcfa) = $1
         AND c.ide_geper = $2
         AND c.ide_cpefa = ${estadoNormal}
         AND c.ide_sucu = $3
        WHERE m.ide_empr = $4
        GROUP BY m.ide_gemes, m.nombre_gemes
        ORDER BY m.ide_gemes
    `);
    query.addIntParam(1, dtoIn.periodo);
    query.addIntParam(2, dtoIn.ide_geper);
    query.addIntParam(3, dtoIn.ideSucu);
    query.addIntParam(4, dtoIn.ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Detalle de compras del proveedor por rango de fechas (por artículo)
   */
  async getDetalleComprasProveedor(dtoIn: TrnProveedorDto & HeaderParamsDto) {
    const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
    const query = new SelectQuery(
      `
      SELECT cdf.ide_cpdfa,
             cf.fecha_emisi_cpcfa,
             cf.numero_cpcfa,
             iart.nombre_inarti,
             cdf.cantidad_cpdfa,
             cdf.precio_cpdfa,
             cdf.valor_cpdfa,
             s.nom_sucu AS empresa
      FROM cxp_detall_factur cdf
      LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = cdf.ide_cpcfa
      LEFT JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
      LEFT JOIN sis_sucursal s ON s.ide_sucu = cf.ide_sucu
      WHERE cf.ide_geper = $1
        AND cdf.ide_empr = $2
        AND cf.fecha_emisi_cpcfa BETWEEN $3 AND $4
        AND cf.ide_cpefa = ${estadoNormal}
      ORDER BY cf.fecha_emisi_cpcfa, cf.numero_cpcfa
      `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_geper);
    query.addIntParam(2, dtoIn.ideEmpr);
    query.addStringParam(3, dtoIn.fechaInicio);
    query.addStringParam(4, dtoIn.fechaFin);
    return this.dataSource.createQuery(query);
  }

  /**
   * Estructura jerárquica de proveedores (árbol gen_persona por gen_ide_geper)
   */
  async getArbolProveedores(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT ide_geper, gen_ide_geper, nom_geper, nivel_geper, identificac_geper
        FROM gen_persona
        WHERE es_proveedo_geper = TRUE
          AND ide_empr = $1
        ORDER BY nom_geper
    `);
    query.addIntParam(1, dtoIn.ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Combo de años con compras registradas
   */
  async getListDataAniosCompras(dtoIn: HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT DISTINCT CAST(EXTRACT(YEAR FROM fecha_emisi_cpcfa) AS VARCHAR) AS value,
               CAST(EXTRACT(YEAR FROM fecha_emisi_cpcfa) AS VARCHAR) AS label
        FROM cxp_cabece_factur
        WHERE ide_empr = $1
        ORDER BY 1 DESC
    `);
    query.addIntParam(1, dtoIn.ideEmpr);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Combo de tipos de transacción CxP (cxp_tipo_transacc)
   */
  async getListDataTiposTransaccionCxP() {
    const query = new SelectQuery(`
        SELECT CAST(ide_cpttr AS VARCHAR) AS value,
               nombre_cpttr AS label,
               signo_cpttr
        FROM cxp_tipo_transacc
        ORDER BY nombre_cpttr
    `);
    return this.dataSource.createSelectQuery(query);
  }

  /**
   * Combo de cuentas por pagar pendientes del proveedor (para asociar pagos o
   * transacciones manuales). Paridad getSqlComboFacturasPorPagar legacy.
   */
  async getListDataCuentasPorPagarProveedor(dtoIn: IdProveedorDto & HeaderParamsDto) {
    const estadoNormal = this.variables.get('p_cxp_estado_factura_normal');
    const query = new SelectQuery(`
        SELECT CAST(dt.ide_cpctr AS VARCHAR) AS value,
               COALESCE(co.nombre_cntdo, 'Cuenta por Pagar') || ' ' || COALESCE(cf.numero_cpcfa, '')
                 || ' - ' || CAST(ROUND(SUM(dt.valor_cpdtr * tt.signo_cpttr)::numeric, 2) AS VARCHAR) AS label,
               SUM(dt.valor_cpdtr * tt.signo_cpttr) AS saldo_x_pagar
        FROM cxp_detall_transa dt
        LEFT JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
        LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa = ct.ide_cpcfa AND cf.ide_cpefa = ${estadoNormal}
        LEFT JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
        LEFT JOIN con_tipo_document co ON cf.ide_cntdo = co.ide_cntdo
        WHERE ct.ide_geper = $1
          AND ct.ide_sucu = $2
        GROUP BY dt.ide_cpctr, cf.numero_cpcfa, co.nombre_cntdo, cf.fecha_emisi_cpcfa, ct.fecha_trans_cpctr
        HAVING SUM(dt.valor_cpdtr * tt.signo_cpttr) > 0
        ORDER BY cf.fecha_emisi_cpcfa ASC, ct.fecha_trans_cpctr ASC, dt.ide_cpctr ASC
    `);
    query.addIntParam(1, dtoIn.ide_geper);
    query.addIntParam(2, dtoIn.ideSucu);
    return this.dataSource.createSelectQuery(query);
  }



  async getCtaBancoProveedor(dtoIn: GetCtaBancoProveedorDto & HeaderParamsDto) {
    const activeClause = dtoIn.activo === 'true' ? 'AND cb.activo_cpcbp = true' : '';
    const query = new SelectQuery(
      `
        SELECT
            cb.ide_cpcbp,
            cb.ide_geper,
            cb.ide_teban,
            b.nombre_teban,
            cb.ide_tetcb,
            tcb.nombre_tetcb,
            cb.numero_cpcbp,
            cb.nombre_cpcbp,
            cb.observacion_cpcbp,
            cb.activo_cpcbp,
            cb.defecto_cpcbp
        FROM
            cxp_cta_banco_prove cb
            LEFT JOIN tes_banco b ON b.ide_teban = cb.ide_teban
            LEFT JOIN tes_tip_cuen_banc tcb ON tcb.ide_tetcb = cb.ide_tetcb
        WHERE
            cb.ide_geper = $1
            AND cb.ide_empr = ${dtoIn.ideEmpr}
            ${activeClause}
        ORDER BY
            cb.defecto_cpcbp DESC, cb.nombre_cpcbp
        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ideGeper);
    return this.dataSource.createQuery(query);
  }

  async getListDataCtaBancoProveedor(dtoIn: GetCtaBancoProveedorDto & HeaderParamsDto) {
    const activeClause = dtoIn.activo === 'true' ? 'AND cb.activo_cpcbp = true' : '';
    const query = new SelectQuery(
      `
        SELECT
            CAST(cb.ide_cpcbp AS VARCHAR) AS value,
            COALESCE(cb.nombre_cpcbp, CONCAT(tcb.nombre_tetcb, ' - ', cb.numero_cpcbp)) AS label
        FROM
            cxp_cta_banco_prove cb
            LEFT JOIN tes_tip_cuen_banc tcb ON tcb.ide_tetcb = cb.ide_tetcb
        WHERE
            cb.ide_geper = $1
            AND cb.ide_empr = ${dtoIn.ideEmpr}
            ${activeClause}
        ORDER BY
            cb.defecto_cpcbp DESC, cb.nombre_cpcbp
        `,
    );
    query.addIntParam(1, dtoIn.ideGeper);
    return this.dataSource.createSelectQuery(query);
  }
}




