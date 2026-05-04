import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { LibroDiarioDto } from './dto/libro-diario.dto';
import { LibroMayorDto } from './dto/libro-mayor.dto';
import { PeriodoFechaDto, PeriodoIdDto } from './dto/periodo.dto';

@Injectable()
export class ContabilidadService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_estado_comprobante_normal', // 0
                'p_con_estado_comp_inicial',        // 1
                'p_con_estado_comp_final',          // 2
                'p_con_lugar_debe',                 // 3
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /** Helper privado: retorna los estados de comprobantes como string para IN (...) */
    private get estadosComprobantes(): string {
        return [
            this.variables.get('p_con_estado_comprobante_normal'),
            this.variables.get('p_con_estado_comp_inicial'),
            this.variables.get('p_con_estado_comp_final'),
        ].join(',');
    }

    /**
     * Obtiene el libro diario contable en un rango de fechas.
     * Retorna todos los asientos ordenados por fecha descendente.
     */
    async getLibroDiario(dto: HeaderParamsDto & LibroDiarioDto) {
        const estados = this.estadosComprobantes;

        const query = new SelectQuery(`
            SELECT
                CCC.fecha_trans_cnccc,
                CCC.numero_cnccc,
                CCC.ide_cnccc,
                TC.nombre_cntcm,
                DPC.codig_recur_cndpc,
                DPC.nombre_cndpc,
                CASE WHEN DCC.ide_cnlap = 1 THEN DCC.valor_cndcc END AS debe,
                CASE WHEN DCC.ide_cnlap = 0 THEN DCC.valor_cndcc END AS haber,
                CCC.observacion_cnccc,
                DCC.ide_cndcc
            FROM con_cab_comp_cont CCC
            INNER JOIN con_tipo_comproba TC     ON CCC.ide_cntcm    = TC.ide_cntcm
            INNER JOIN con_det_comp_cont DCC    ON CCC.ide_cnccc    = DCC.ide_cnccc
            INNER JOIN con_det_plan_cuen DPC    ON DCC.ide_cndpc    = DPC.ide_cndpc
            LEFT  JOIN con_signo_cuenta  sc     ON DPC.ide_cntcu    = sc.ide_cntcu
                                               AND DCC.ide_cnlap    = sc.ide_cnlap
            WHERE CCC.ide_sucu = $1
              AND CCC.ide_cneco IN (${estados})
              AND CCC.fecha_trans_cnccc BETWEEN $2 AND $3
            ORDER BY
                CCC.fecha_trans_cnccc DESC,
                CCC.ide_cneco          DESC,
                CCC.numero_cnccc       DESC,
                DCC.ide_cnlap          DESC
        `);

        query.addIntParam(1, dto.ideSucu);
        query.addStringParam(2, dto.fechaInicio);
        query.addStringParam(3, dto.fechaFin);

        return this.dataSource.createQuery(query);
    }

    /**
     * Obtiene el libro mayor de una cuenta contable.
     * Usa una única query con CTEs y window functions para calcular:
     *   - Saldo inicial (desde el inicio del periodo activo hasta fechaInicio)
     *   - Movimientos del período con debe/haber
     *   - Saldo acumulado por fila
     *   - Fila de "SALDO INICIAL" prepend con UNION ALL
     * Retorna también los totales de debe, haber y saldo final.
     */
    async getLibroMayor(dto: HeaderParamsDto & LibroMayorDto) {
        const estados = this.estadosComprobantes;
        const lugarDebe = this.variables.get('p_con_lugar_debe');

        const query = new SelectQuery(`
            WITH periodo AS (
                SELECT COALESCE(MIN(fecha_inicio_cnper), '2012-01-01'::date) AS fecha_inicio
                FROM   con_periodo
                WHERE  $1::date BETWEEN fecha_inicio_cnper AND fecha_fin_cnper
                  AND  ide_empr       = $2
                  AND  activo_cnper   = true
            ),
            saldo_ini AS (
                SELECT COALESCE(SUM(dcc.valor_cndcc * sc.signo_cnscu), 0) AS saldo
                FROM   con_cab_comp_cont  ccc
                JOIN   con_det_comp_cont  dcc  ON ccc.ide_cnccc  = dcc.ide_cnccc
                JOIN   con_det_plan_cuen  dpc  ON dpc.ide_cndpc  = dcc.ide_cndpc
                JOIN   con_tipo_cuenta    tc   ON dpc.ide_cntcu  = tc.ide_cntcu
                JOIN   con_signo_cuenta   sc   ON tc.ide_cntcu   = sc.ide_cntcu
                                              AND dcc.ide_cnlap  = sc.ide_cnlap
                CROSS JOIN periodo
                WHERE  ccc.fecha_trans_cnccc >= periodo.fecha_inicio
                  AND  ccc.fecha_trans_cnccc  < $1::date
                  AND  ccc.ide_cneco         IN (${estados})
                  AND  ccc.ide_sucu           = $3
                  AND  dpc.ide_cndpc          = $4
            ),
            movs AS (
                SELECT
                    cab.fecha_trans_cnccc,
                    cab.ide_cnccc,
                    cab.numero_cnccc,
                    COALESCE(per.nom_geper, '')                         AS beneficiario,
                    det.ide_cnlap,
                    CASE WHEN det.ide_cnlap  = ${lugarDebe}
                         THEN ABS(det.valor_cndcc * sc.signo_cnscu)
                         ELSE 0 END                                     AS debe,
                    CASE WHEN det.ide_cnlap != ${lugarDebe}
                         THEN ABS(det.valor_cndcc * sc.signo_cnscu)
                         ELSE 0 END                                     AS haber,
                    (det.valor_cndcc * sc.signo_cnscu)                  AS valor,
                    cab.observacion_cnccc                               AS observacion,
                    cab.ide_cneco
                FROM  con_cab_comp_cont  cab
                LEFT  JOIN gen_persona        per  ON cab.ide_geper   = per.ide_geper
                JOIN  con_det_comp_cont  det  ON cab.ide_cnccc    = det.ide_cnccc
                JOIN  con_det_plan_cuen  cta  ON cta.ide_cndpc    = det.ide_cndpc
                JOIN  con_tipo_cuenta    tc   ON cta.ide_cntcu    = tc.ide_cntcu
                JOIN  con_signo_cuenta   sc   ON tc.ide_cntcu     = sc.ide_cntcu
                                             AND det.ide_cnlap    = sc.ide_cnlap
                WHERE  cta.ide_cndpc           = $4
                  AND  cab.fecha_trans_cnccc BETWEEN $1 AND $5
                  AND  cab.ide_cneco         IN (${estados})
                  AND  cab.ide_sucu           = $3
            ),
            movs_saldo AS (
                SELECT
                    fecha_trans_cnccc,
                    ide_cnccc,
                    numero_cnccc,
                    beneficiario,
                    ide_cnlap,
                    debe,
                    haber,
                    observacion,
                    ide_cneco,
                    (SELECT saldo FROM saldo_ini)
                        + SUM(valor) OVER (
                            ORDER BY fecha_trans_cnccc, ide_cneco DESC, ide_cnccc ASC
                            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                          )                                             AS saldo
                FROM movs
            )
            -- Fila saldo inicial (solo si saldo != 0) + movimientos
            SELECT
                $1::date         AS fecha_trans_cnccc,
                NULL::int        AS ide_cnccc,
                NULL::text       AS numero_cnccc,
                ''               AS beneficiario,
                NULL::int        AS ide_cnlap,
                0::numeric       AS debe,
                0::numeric       AS haber,
                'SALDO INICIAL AL ' || $1  AS observacion,
                NULL::int        AS ide_cneco,
                (SELECT saldo FROM saldo_ini) AS saldo
            FROM saldo_ini
            WHERE saldo_ini.saldo <> 0

            UNION ALL

            SELECT
                fecha_trans_cnccc,
                ide_cnccc,
                numero_cnccc::text,
                beneficiario,
                ide_cnlap,
                debe,
                haber,
                observacion,
                ide_cneco,
                saldo
            FROM movs_saldo
            ORDER BY
                CASE WHEN ide_cnccc IS NULL THEN 0 ELSE 1 END,
                fecha_trans_cnccc,
                ide_cneco DESC,
                ide_cnccc ASC
        `);

        query.addStringParam(1, dto.fechaInicio);
        query.addIntParam(2, dto.ideEmpr);
        query.addIntParam(3, dto.ideSucu);
        query.addIntParam(4, dto.ideCndpc);
        query.addStringParam(5, dto.fechaFin);

        // Query de totales globales (independiente de la paginación)
        const queryTotales = new SelectQuery(`
            WITH periodo AS (
                SELECT COALESCE(MIN(fecha_inicio_cnper), '2012-01-01'::date) AS fecha_inicio
                FROM   con_periodo
                WHERE  $1::date BETWEEN fecha_inicio_cnper AND fecha_fin_cnper
                  AND  ide_empr     = $2
                  AND  activo_cnper = true
            ),
            saldo_ini AS (
                SELECT COALESCE(SUM(dcc.valor_cndcc * sc.signo_cnscu), 0) AS saldo
                FROM   con_cab_comp_cont  ccc
                JOIN   con_det_comp_cont  dcc  ON ccc.ide_cnccc = dcc.ide_cnccc
                JOIN   con_det_plan_cuen  dpc  ON dpc.ide_cndpc = dcc.ide_cndpc
                JOIN   con_tipo_cuenta    tc   ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN   con_signo_cuenta   sc   ON tc.ide_cntcu  = sc.ide_cntcu
                                             AND dcc.ide_cnlap  = sc.ide_cnlap
                CROSS JOIN periodo
                WHERE  ccc.fecha_trans_cnccc >= periodo.fecha_inicio
                  AND  ccc.fecha_trans_cnccc  < $1::date
                  AND  ccc.ide_cneco         IN (${estados})
                  AND  ccc.ide_sucu           = $3
                  AND  dpc.ide_cndpc          = $4
            ),
            movs AS (
                SELECT
                    CASE WHEN det.ide_cnlap  = ${lugarDebe}
                         THEN ABS(det.valor_cndcc * sc.signo_cnscu)
                         ELSE 0 END                                AS debe,
                    CASE WHEN det.ide_cnlap != ${lugarDebe}
                         THEN ABS(det.valor_cndcc * sc.signo_cnscu)
                         ELSE 0 END                                AS haber,
                    (det.valor_cndcc * sc.signo_cnscu)             AS valor
                FROM  con_cab_comp_cont  cab
                LEFT  JOIN gen_persona       per ON cab.ide_geper  = per.ide_geper
                JOIN  con_det_comp_cont  det ON cab.ide_cnccc    = det.ide_cnccc
                JOIN  con_det_plan_cuen  cta ON cta.ide_cndpc    = det.ide_cndpc
                JOIN  con_tipo_cuenta    tc  ON cta.ide_cntcu    = tc.ide_cntcu
                JOIN  con_signo_cuenta   sc  ON tc.ide_cntcu     = sc.ide_cntcu
                                           AND det.ide_cnlap     = sc.ide_cnlap
                WHERE  cta.ide_cndpc           = $4
                  AND  cab.fecha_trans_cnccc BETWEEN $1 AND $5
                  AND  cab.ide_cneco         IN (${estados})
                  AND  cab.ide_sucu           = $3
            )
            SELECT
                COALESCE(SUM(debe),  0)                              AS total_debe,
                COALESCE(SUM(haber), 0)                              AS total_haber,
                (SELECT saldo FROM saldo_ini) + COALESCE(SUM(valor), 0) AS saldo_final,
                (SELECT saldo FROM saldo_ini)                        AS saldo_inicial
            FROM movs
        `);

        queryTotales.addStringParam(1, dto.fechaInicio);
        queryTotales.addIntParam(2, dto.ideEmpr);
        queryTotales.addIntParam(3, dto.ideSucu);
        queryTotales.addIntParam(4, dto.ideCndpc);
        queryTotales.addStringParam(5, dto.fechaFin);

        const [filas, totalesRow] = await Promise.all([
            this.dataSource.createQuery(query),
            this.dataSource.createSingleQuery(queryTotales),
        ]);

        return {
            movimientos: filas,
            totales: {
                debe: Number(totalesRow?.total_debe) || 0,
                haber: Number(totalesRow?.total_haber) || 0,
                saldo: Number(totalesRow?.saldo_final) || 0,
                saldoInicial: Number(totalesRow?.saldo_inicial) || 0,
            },
            isEmpty: (filas.rowCount ?? 0) === 0,
        };
    }

    /**
     * Retorna el listado de periodos contables de la sucursal para un combo.
     */
    async getComboPeriodos(dto: HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT ide_cnper, nombre_cnper,estado_cnper,fecha_inicio_cnper,fecha_fin_cnper
            FROM   con_periodo
            WHERE  ide_sucu = $1
            ORDER BY ide_cnper DESC
        `);
        query.addIntParam(1, dto.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los datos completos de un periodo contable por su ID.
     */
    async getPeriodo(dto: HeaderParamsDto & PeriodoIdDto) {
        const query = new SelectQuery(`
            SELECT
                ide_cnper,
                estado_cnper,
                cerrado_cnper,
                fecha_inicio_cnper,
                fecha_fin_cnper,
                nombre_cnper
            FROM con_periodo
            WHERE ide_cnper = $1
              AND ide_sucu  = $2
        `);
        query.addIntParam(1, dto.ideCnper);
        query.addIntParam(2, dto.ideSucu);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna el periodo contable que contiene una fecha determinada.
     */
    async getPeriodoFecha(dto: HeaderParamsDto & PeriodoFechaDto) {
        const query = new SelectQuery(`
            SELECT
                ide_cnper,
                estado_cnper,
                cerrado_cnper,
                fecha_inicio_cnper,
                fecha_fin_cnper,
                nombre_cnper
            FROM con_periodo
            WHERE $1::date BETWEEN fecha_inicio_cnper AND fecha_fin_cnper
              AND ide_sucu = $2
            ORDER BY ide_cnper DESC
        `);
        query.addStringParam(1, dto.fecha);
        query.addIntParam(2, dto.ideSucu);
        return this.dataSource.createSingleQuery(query);
    }
}
