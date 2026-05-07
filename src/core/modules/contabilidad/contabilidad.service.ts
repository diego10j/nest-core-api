import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { LibroDiarioDto } from './dto/libro-diario.dto';
import { LibroMayorDto } from './dto/libro-mayor.dto';
import { PeriodoFechaDto, PeriodoIdDto } from './dto/periodo.dto';
import { EstadosFinancierosDto } from './dto/estados-financieros.dto';

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
                'p_con_estado_comp_final',
                'p_con_lugar_debe',
                'p_con_tipo_cuenta_activo',
                'p_con_tipo_cuenta_pasivo',
                'p_con_tipo_cuenta_patrimonio',
                'p_con_tipo_cuenta_ingresos',
                'p_con_tipo_cuenta_gastos',
                'p_con_tipo_cuenta_costos',
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
                CCC.ide_cnccc,
                CCC.fecha_trans_cnccc,    
                CCC.ide_cnccc as id,         
                TC.nombre_cntcm,
                DPC.codig_recur_cndpc,
                DPC.nombre_cndpc,
                CASE WHEN DCC.ide_cnlap = 1 THEN DCC.valor_cndcc END AS debe,
                CASE WHEN DCC.ide_cnlap = 0 THEN DCC.valor_cndcc END AS haber,
                CCC.observacion_cnccc,
                DCC.ide_cndcc,
                CCC.numero_cnccc, 
                DCC.ide_cndpc
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
        `, dto);

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
                AND  estado_cnper   = true
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
                    cab.ide_cnccc,
                    cab.fecha_trans_cnccc,                    
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
                    ide_cnccc,
                    fecha_trans_cnccc,                    
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
            SELECT * FROM (
                SELECT
                    NULL::int        AS ide_cnccc,
                    $1::date         AS fecha_trans_cnccc,                    
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
                    ide_cnccc,
                    fecha_trans_cnccc,
                    numero_cnccc::text,
                    beneficiario,
                    ide_cnlap,
                    debe,
                    haber,
                    observacion,
                    ide_cneco,
                    saldo
                FROM movs_saldo
            ) AS combined
            ORDER BY
                fecha_trans_cnccc,
                ide_cneco DESC,
                ide_cnccc
        `, dto);

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
                AND  estado_cnper = true
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

        filas.row = {
            debe: Number(totalesRow?.total_debe) || 0,
            haber: Number(totalesRow?.total_haber) || 0,
            saldo: Number(totalesRow?.saldo_final) || 0,
            saldoInicial: Number(totalesRow?.saldo_inicial) || 0,
        };

        return filas;
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



    /**
     * Balance General: Activo + Pasivo + Patrimonio.
     * Devuelve el árbol de cuentas con saldos acumulados y
     * totales por tipo de cuenta (activo, pasivo, patrimonio).
     */
    async getBalanceGeneral(dto: HeaderParamsDto & EstadosFinancierosDto) {
        const tipos = [
            this.variables.get('p_con_tipo_cuenta_activo'),
            this.variables.get('p_con_tipo_cuenta_pasivo'),
            this.variables.get('p_con_tipo_cuenta_patrimonio'),
        ].join(',');

        const query = this.buildBalanceQuery(
            dto.fechaInicio,
            dto.fechaFin,
            tipos,
            dto.ideSucu,
            dto.nivelPlan,
        );

        // Totales por tipo de cuenta (una sola pasada adicional)
        const estados = this.estadosComprobantes;
        const queryTotales = new SelectQuery(`
        SELECT
            dpc.ide_cntcu,
            tc.nombre_cntcu,
            ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
        FROM con_cab_comp_cont   ccc
        JOIN con_det_comp_cont   dcc ON ccc.ide_cnccc = dcc.ide_cnccc
        JOIN con_det_plan_cuen   dpc ON dpc.ide_cndpc = dcc.ide_cndpc
        JOIN con_tipo_cuenta     tc  ON dpc.ide_cntcu = tc.ide_cntcu
        JOIN con_signo_cuenta    sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                   AND dcc.ide_cnlap  = sc.ide_cnlap
        WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
          AND ccc.ide_cneco IN (${estados})
          AND ccc.ide_sucu  = $3
          AND dpc.ide_cntcu IN (${tipos})
        GROUP BY dpc.ide_cntcu, tc.nombre_cntcu
    `);
        queryTotales.addStringParam(1, dto.fechaInicio);
        queryTotales.addStringParam(2, dto.fechaFin);
        queryTotales.addIntParam(3, dto.ideSucu);

        const [filas, totales] = await Promise.all([
            this.dataSource.createQuery(query),
            this.dataSource.createQuery(queryTotales),
        ]);

        filas.row = { totalesPorTipo: totales.rows ?? totales };
        return filas;
    }

    /**
     * Estado de Resultados: Ingresos + Costos + Gastos.
     * Devuelve el árbol con saldos acumulados y
     * totales por tipo + utilidad/pérdida neta.
     */
    async getEstadoResultados(dto: HeaderParamsDto & EstadosFinancierosDto) {
        const pIngresos = this.variables.get('p_con_tipo_cuenta_ingresos');
        const pCostos = this.variables.get('p_con_tipo_cuenta_costos');
        const pGastos = this.variables.get('p_con_tipo_cuenta_gastos');
        const tipos = [pIngresos, pCostos, pGastos].join(',');

        const query = this.buildBalanceQuery(
            dto.fechaInicio,
            dto.fechaFin,
            tipos,
            dto.ideSucu,
            dto.nivelPlan,
        );

        const estados = this.estadosComprobantes;
        const queryTotales = new SelectQuery(`
        SELECT
            dpc.ide_cntcu,
            tc.nombre_cntcu,
            ROUND(SUM(dcc.valor_cndcc * sc.signo_cnscu)::numeric, 2) AS total
        FROM con_cab_comp_cont   ccc
        JOIN con_det_comp_cont   dcc ON ccc.ide_cnccc = dcc.ide_cnccc
        JOIN con_det_plan_cuen   dpc ON dpc.ide_cndpc = dcc.ide_cndpc
        JOIN con_tipo_cuenta     tc  ON dpc.ide_cntcu = tc.ide_cntcu
        JOIN con_signo_cuenta    sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                   AND dcc.ide_cnlap  = sc.ide_cnlap
        WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
          AND ccc.ide_cneco IN (${estados})
          AND ccc.ide_sucu  = $3
          AND dpc.ide_cntcu IN (${tipos})
        GROUP BY dpc.ide_cntcu, tc.nombre_cntcu
    `);
        queryTotales.addStringParam(1, dto.fechaInicio);
        queryTotales.addStringParam(2, dto.fechaFin);
        queryTotales.addIntParam(3, dto.ideSucu);

        const [filas, totalesRows] = await Promise.all([
            this.dataSource.createQuery(query),
            this.dataSource.createQuery(queryTotales),
        ]);

        const totales = (totalesRows.rows ?? totalesRows) as Array<{
            ide_cntcu: number;
            nombre_cntcu: string;
            total: string | number;
        }>;

        // Comparar como Number en ambos lados para evitar string vs number
        const getTotal = (ide: string): number => {
            const found = totales.find((r) => Number(r.ide_cntcu) === Number(ide));
            return Number(found?.total ?? 0);
        };

        const totalIngresos = getTotal(pIngresos);
        const totalCostos = getTotal(pCostos);
        const totalGastos = getTotal(pGastos);
        const utilidadNeta = Math.round((totalIngresos - totalCostos - totalGastos) * 100) / 100;

        filas.row = {
            totalesPorTipo: totales,
            totalIngresos,
            totalCostos,
            totalGastos,
            utilidadNeta,
        };

        return filas;
    }


    /**
     * Estado de Flujo de Efectivo — Método Indirecto (NIC 7).
     *
     * Estructura del resultado:
     *  - utilidadEjercicio: utilidad/pérdida neta del período
     *  - ajustesNoMonetarios: cuentas marcadas como es_no_monetaria (depreciación, provisiones, etc.)
     *  - capitalTrabajo: variación de cuentas operativas (activo/pasivo corriente) clasificadas como OPERACION
     *  - flujoOperacional: suma de los tres anteriores
     *  - flujosInversion / flujoInversion
     *  - flujosFinanciamiento / flujoFinanciamiento
     *  - variacionNetaEfectivo
     *  - efectivoInicio / efectivoFin: saldo de cuentas en tes_cuenta_banco al inicio/fin del período
     *  - cuentasEfectivo: desglose de cada cuenta de Caja/Banco
     */
    async getFlujosEfectivo(dto: HeaderParamsDto & EstadosFinancierosDto) {
        const estados = this.estadosComprobantes;

        // ── 1. Resultado del ejercicio ─────────────────────────────────────────
        const resultadoData = await this.getEstadoResultados(dto);
        const utilidadEjercicio = Number(resultadoData.row?.utilidadNeta ?? 0);

        // ── 2. Ajustes no monetarios y cambios en capital de trabajo ─────────────
        // Variación de saldo entre fechaInicio y fechaFin para cuentas clasificadas
        const queryClasif = new SelectQuery(`
            WITH variacion AS (
                SELECT
                    f.ide_cnfcc,
                    f.ide_cndpc,
                    dpc.codig_recur_cndpc,
                    COALESCE(f.descripcion_cnfcc, dpc.nombre_cndpc) AS descripcion,
                    f.clasificacion_cnfcc,
                    f.es_no_monetaria_cnfcc,
                    f.orden_cnfcc,
                    COALESCE(SUM(
                        CASE WHEN ccc.fecha_trans_cnccc BETWEEN $1 AND $2
                        THEN dcc.valor_cndcc * sc.signo_cnscu ELSE 0 END
                    ), 0) AS variacion_periodo
                FROM con_flujo_cuenta_clasif  f
                JOIN con_det_plan_cuen        dpc ON f.ide_cndpc  = dpc.ide_cndpc
                JOIN con_tipo_cuenta          tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta         sc  ON tc.ide_cntcu  = sc.ide_cntcu
                LEFT JOIN con_det_comp_cont   dcc ON dpc.ide_cndpc = dcc.ide_cndpc
                LEFT JOIN con_cab_comp_cont   ccc ON dcc.ide_cnccc = ccc.ide_cnccc
                                                  AND ccc.ide_sucu  = $3
                                                  AND ccc.ide_cneco IN (${estados})
                                                  AND sc.ide_cnlap  = dcc.ide_cnlap
                WHERE f.ide_sucu = $3
                GROUP BY
                    f.ide_cnfcc, f.ide_cndpc, dpc.codig_recur_cndpc,
                    f.descripcion_cnfcc, dpc.nombre_cndpc,
                    f.clasificacion_cnfcc, f.es_no_monetaria_cnfcc, f.orden_cnfcc
            )
            SELECT * FROM variacion
            ORDER BY clasificacion_cnfcc, orden_cnfcc, codig_recur_cndpc
        `);
        queryClasif.addStringParam(1, dto.fechaInicio);
        queryClasif.addStringParam(2, dto.fechaFin);
        queryClasif.addIntParam(3, dto.ideSucu);
        queryClasif.isLazy = false;

        // ── 3. Efectivo inicio / fin (desde tes_cuenta_banco) ─────────────────
        const queryEfectivo = new SelectQuery(`
            WITH cuentas_efectivo AS (
                SELECT DISTINCT tcb.ide_cndpc
                FROM tes_cuenta_banco tcb
                WHERE tcb.ide_sucu      = $3
                  AND tcb.activo_tecba  = true
            ),
            saldo_inicio AS (
                SELECT
                    dpc.ide_cndpc,
                    tcb.nombre_tecba,
                    COALESCE(SUM(dcc.valor_cndcc * sc.signo_cnscu), 0) AS saldo
                FROM tes_cuenta_banco    tcb
                JOIN con_det_plan_cuen   dpc ON tcb.ide_cndpc = dpc.ide_cndpc
                JOIN con_tipo_cuenta     tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta    sc  ON tc.ide_cntcu  = sc.ide_cntcu
                LEFT JOIN con_det_comp_cont dcc ON dpc.ide_cndpc = dcc.ide_cndpc
                LEFT JOIN con_cab_comp_cont ccc ON dcc.ide_cnccc  = ccc.ide_cnccc
                                               AND ccc.ide_sucu   = $3
                                               AND ccc.ide_cneco  IN (${estados})
                                               AND sc.ide_cnlap   = dcc.ide_cnlap
                                               AND ccc.fecha_trans_cnccc < $1
                WHERE tcb.ide_sucu     = $3
                  AND tcb.activo_tecba = true
                GROUP BY dpc.ide_cndpc, tcb.nombre_tecba
            ),
            saldo_fin AS (
                SELECT
                    dpc.ide_cndpc,
                    tcb.nombre_tecba,
                    COALESCE(SUM(dcc.valor_cndcc * sc.signo_cnscu), 0) AS saldo
                FROM tes_cuenta_banco    tcb
                JOIN con_det_plan_cuen   dpc ON tcb.ide_cndpc = dpc.ide_cndpc
                JOIN con_tipo_cuenta     tc  ON dpc.ide_cntcu = tc.ide_cntcu
                JOIN con_signo_cuenta    sc  ON tc.ide_cntcu  = sc.ide_cntcu
                LEFT JOIN con_det_comp_cont dcc ON dpc.ide_cndpc = dcc.ide_cndpc
                LEFT JOIN con_cab_comp_cont ccc ON dcc.ide_cnccc  = ccc.ide_cnccc
                                               AND ccc.ide_sucu   = $3
                                               AND ccc.ide_cneco  IN (${estados})
                                               AND sc.ide_cnlap   = dcc.ide_cnlap
                                               AND ccc.fecha_trans_cnccc <= $2
                WHERE tcb.ide_sucu     = $3
                  AND tcb.activo_tecba = true
                GROUP BY dpc.ide_cndpc, tcb.nombre_tecba
            )
            SELECT
                si.ide_cndpc,
                si.nombre_tecba,
                ROUND(si.saldo::numeric, 2) AS saldo_inicio,
                ROUND(sf.saldo::numeric, 2) AS saldo_fin
            FROM saldo_inicio si
            JOIN saldo_fin    sf ON si.ide_cndpc = sf.ide_cndpc
            ORDER BY si.nombre_tecba
        `);
        queryEfectivo.addStringParam(1, dto.fechaInicio);
        queryEfectivo.addStringParam(2, dto.fechaFin);
        queryEfectivo.addIntParam(3, dto.ideSucu);
        queryEfectivo.isLazy = false;

        const [clasifResult, efectivoResult] = await Promise.all([
            this.dataSource.createQuery(queryClasif),
            this.dataSource.createQuery(queryEfectivo),
        ]);

        const clasifRows = (clasifResult.rows ?? clasifResult) as Array<{
            ide_cnfcc: number;
            ide_cndpc: number;
            codig_recur_cndpc: string;
            descripcion: string;
            clasificacion_cnfcc: string;
            es_no_monetaria_cnfcc: boolean;
            orden_cnfcc: number;
            variacion_periodo: string | number;
        }>;

        const efectivoRows = (efectivoResult.rows ?? efectivoResult) as Array<{
            ide_cndpc: number;
            nombre_tecba: string;
            saldo_inicio: string | number;
            saldo_fin: string | number;
        }>;

        // Particiones
        const ajustesNoMonetarios = clasifRows
            .filter((r) => r.es_no_monetaria_cnfcc)
            .map((r) => ({ ...r, variacion_periodo: Number(r.variacion_periodo) }));

        const capitalTrabajo = clasifRows
            .filter((r) => r.clasificacion_cnfcc === 'OPERACION' && !r.es_no_monetaria_cnfcc)
            .map((r) => ({ ...r, variacion_periodo: Number(r.variacion_periodo) }));

        const flujosInversion = clasifRows
            .filter((r) => r.clasificacion_cnfcc === 'INVERSION')
            .map((r) => ({ ...r, variacion_periodo: Number(r.variacion_periodo) }));

        const flujosFinanciamiento = clasifRows
            .filter((r) => r.clasificacion_cnfcc === 'FINANCIAMIENTO')
            .map((r) => ({ ...r, variacion_periodo: Number(r.variacion_periodo) }));

        const totalAjustes = ajustesNoMonetarios.reduce((s, r) => s + r.variacion_periodo, 0);
        const totalCapTrab = capitalTrabajo.reduce((s, r) => s + r.variacion_periodo, 0);
        const flujoOperacional = Math.round((utilidadEjercicio + totalAjustes + totalCapTrab) * 100) / 100;
        const flujoInversion = Math.round(flujosInversion.reduce((s, r) => s + Number(r.variacion_periodo), 0) * 100) / 100;
        const flujoFinanciamiento = Math.round(flujosFinanciamiento.reduce((s, r) => s + Number(r.variacion_periodo), 0) * 100) / 100;
        const variacionNetaEfectivo = Math.round((flujoOperacional + flujoInversion + flujoFinanciamiento) * 100) / 100;

        const cuentasEfectivo = efectivoRows.map((r) => ({
            ...r,
            saldo_inicio: Number(r.saldo_inicio),
            saldo_fin: Number(r.saldo_fin),
        }));

        const efectivoInicio = Math.round(cuentasEfectivo.reduce((s, r) => s + r.saldo_inicio, 0) * 100) / 100;
        const efectivoFin = Math.round(cuentasEfectivo.reduce((s, r) => s + r.saldo_fin, 0) * 100) / 100;

        return {
            utilidadEjercicio,
            ajustesNoMonetarios,
            totalAjustes: Math.round(totalAjustes * 100) / 100,
            capitalTrabajo,
            totalCapitalTrabajo: Math.round(totalCapTrab * 100) / 100,
            flujoOperacional,
            flujosInversion,
            flujoInversion,
            flujosFinanciamiento,
            flujoFinanciamiento,
            variacionNetaEfectivo,
            efectivoInicio,
            efectivoFin,
            cuentasEfectivo,
            fechaInicio: dto.fechaInicio,
            fechaFin: dto.fechaFin,
        };
    }

    // ─── Helper privado ──────────────────────────────────────────────────────────
    /**
     * Query base de balances con CTE recursiva que:
     *  1. Obtiene movimientos reales de cuentas hoja (nivel más bajo).
     *  2. Propaga los saldos hacia los padres con recursive CTE.
     *  3. Filtra por nivelTope si se indica.
     *  4. Elimina cuentas con saldo 0.
     */
    private buildBalanceQuery(
        fechaInicio: string,
        fechaFin: string,
        tiposCuenta: string,
        ideSucu: number,
        nivelTope?: number,
    ): SelectQuery {
        const estados = this.estadosComprobantes;
        const nivelFilter = nivelTope ? `AND t.nivel <= ${nivelTope}` : '';

        const query = new SelectQuery(`
        WITH
        movimientos AS (
            SELECT
                dpc.ide_cndpc,
                dpc.con_ide_cndpc,
                dpc.codig_recur_cndpc,
                dpc.nombre_cndpc,
                dpc.ide_cnncu::int                        AS nivel,
                dpc.ide_cntcu,
                SUM(dcc.valor_cndcc * sc.signo_cnscu)     AS valor
            FROM con_cab_comp_cont   ccc
            JOIN con_det_comp_cont   dcc ON ccc.ide_cnccc = dcc.ide_cnccc
            JOIN con_det_plan_cuen   dpc ON dpc.ide_cndpc = dcc.ide_cndpc
            JOIN con_tipo_cuenta     tc  ON dpc.ide_cntcu = tc.ide_cntcu
            JOIN con_signo_cuenta    sc  ON tc.ide_cntcu  = sc.ide_cntcu
                                       AND dcc.ide_cnlap  = sc.ide_cnlap
            WHERE ccc.fecha_trans_cnccc BETWEEN $1 AND $2
              AND ccc.ide_cneco IN (${estados})
              AND ccc.ide_sucu  = $3
              AND dpc.ide_cntcu IN (${tiposCuenta})
            GROUP BY
                dpc.ide_cndpc, dpc.con_ide_cndpc,
                dpc.codig_recur_cndpc, dpc.nombre_cndpc,
                dpc.ide_cnncu, dpc.ide_cntcu
            HAVING SUM(dcc.valor_cndcc * sc.signo_cnscu) <> 0
        ),
        padres AS (
            SELECT
                ide_cndpc,
                con_ide_cndpc,
                codig_recur_cndpc,
                nombre_cndpc,
                ide_cnncu::int   AS nivel,
                ide_cntcu,
                0::numeric       AS valor
            FROM con_det_plan_cuen
            WHERE nivel_cndpc = 'PADRE'
              AND ide_cntcu IN (${tiposCuenta})
        ),
        todas AS (
            SELECT * FROM movimientos
            UNION ALL
            SELECT * FROM padres
            WHERE ide_cndpc NOT IN (SELECT ide_cndpc FROM movimientos)
        ),
        ancestros AS (
            SELECT
                p.ide_cndpc   AS ide_padre,
                m.ide_cndpc   AS ide_hijo,
                m.valor
            FROM movimientos m
            JOIN todas p
              ON p.nivel < m.nivel
             AND m.codig_recur_cndpc LIKE (p.codig_recur_cndpc || '%')
        ),
        saldos_padre AS (
            SELECT
                ide_padre     AS ide_cndpc,
                SUM(valor)    AS valor
            FROM ancestros
            GROUP BY ide_padre
        ),
        resultado AS (
            SELECT
                t.ide_cndpc,
                t.con_ide_cndpc,
                t.codig_recur_cndpc,
                t.nombre_cndpc,
                t.nivel,
                t.ide_cntcu,
                COALESCE(sp.valor, t.valor) AS valor
            FROM todas t
            LEFT JOIN saldos_padre sp ON sp.ide_cndpc = t.ide_cndpc
        )
        SELECT
            ide_cndpc,
            con_ide_cndpc,
            codig_recur_cndpc,
            REPEAT('  ', nivel) || nombre_cndpc  AS nombre_cndpc,
            nivel,
            ide_cntcu,
            ROUND(valor::numeric, 2)             AS valor
        FROM resultado t
        WHERE valor <> 0
          ${nivelFilter}
        ORDER BY codig_recur_cndpc
    `);

        query.addStringParam(1, fechaInicio);
        query.addStringParam(2, fechaFin);
        query.addIntParam(3, ideSucu);
        query.isLazy = false; // Para que no intente paginar esta consulta
        return query;
    }

}
