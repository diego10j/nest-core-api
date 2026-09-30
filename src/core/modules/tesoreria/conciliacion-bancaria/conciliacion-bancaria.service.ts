import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import {
    GetConciliacionesDto, GetMovimientosBancoDto, GetMovimientosErpDto, GetResumenMensualDto,
} from './dto/conciliacion-bancaria.dto';
import { aCentavos, deCentavos } from './parsers/parser-util';

export interface ConciliacionCabecera {
    ide_tecnc: number;
    ide_empr: number;
    ide_sucu: number;
    ide_tecba: number;
    anio_tecnc: number;
    mes_tecnc: number;
    fecha_desde_tecnc: string;
    fecha_hasta_tecnc: string;
    fecha_ultimo_mov_tecnc: string | null;
    saldo_inicial_banco_tecnc: number | null;
    saldo_final_banco_tecnc: number | null;
    tolerancia_dias_tecnc: number;
    estado_tecnc: 'ABIERTA' | 'CERRADA';
    observacion_tecnc: string | null;
    nombre_tecba: string;
    nombre_teban: string;
}

/** Tablas de la conciliación + libro de bancos: consultas de LECTURA (las escrituras están en el servicio -save). */
@Injectable()
export class ConciliacionBancariaService extends BaseService {
    /** Se resuelve una vez: las variables del sistema se cargan de forma asíncrona. */
    private readonly listo: Promise<void>;

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.listo = this.core
            .getVariables(['p_tes_estado_lib_banco_normal'])
            .then((result) => { this.variables = result; });
    }

    /** ide_teelb de los movimientos vigentes del libro de bancos (los anulados/reversados no cuentan). */
    async estadoLibroNormal(): Promise<number> {
        await this.listo;
        return Number(this.variables.get('p_tes_estado_lib_banco_normal'));
    }

    /** Cabecera de una conciliación, validando que sea de la empresa del usuario. */
    async getCabecera(ideTecnc: number, headers: Pick<HeaderParamsDto, 'ideEmpr'>): Promise<ConciliacionCabecera> {
        const { rows } = await this.dataSource.pool.query(
            `SELECT n.ide_tecnc, n.ide_empr, n.ide_sucu, n.ide_tecba, n.anio_tecnc, n.mes_tecnc,
                    n.fecha_desde_tecnc::text AS fecha_desde_tecnc, n.fecha_hasta_tecnc::text AS fecha_hasta_tecnc,
                    n.fecha_ultimo_mov_tecnc::text AS fecha_ultimo_mov_tecnc,
                    n.saldo_inicial_banco_tecnc, n.saldo_final_banco_tecnc, n.tolerancia_dias_tecnc,
                    n.estado_tecnc, n.observacion_tecnc, a.nombre_tecba, b.nombre_teban
             FROM tes_conciliacion n
             INNER JOIN tes_cuenta_banco a ON a.ide_tecba = n.ide_tecba
             INNER JOIN tes_banco b ON b.ide_teban = a.ide_teban
             WHERE n.ide_tecnc = $1 AND n.ide_empr = $2 AND n.anulado_tecnc = false`,
            [ideTecnc, headers.ideEmpr],
        );
        if (rows.length === 0) throw new NotFoundException(`La conciliación ${ideTecnc} no existe o fue anulada.`);
        return rows[0];
    }

    /**
     * Cuentas del usuario contra las que se puede conciliar (todas menos las cajas: no tienen estado
     * de cuenta). `todasLasSucursales` amplía a toda la empresa para poder avisar cuando el archivo
     * pertenece a una cuenta de otra sucursal (= otra empresa legal en este ERP).
     */
    async getCuentasConciliables(ideEmpr: number, ideSucu: number | null) {
        const { rows } = await this.dataSource.pool.query(
            `SELECT a.ide_tecba, a.ide_sucu, a.nombre_tecba, a.observacion_tecba, b.nombre_teban,
                    b.foto_teban, b.color_teban, c.nombre_tetcb
             FROM tes_cuenta_banco a
             INNER JOIN tes_banco b ON b.ide_teban = a.ide_teban
             LEFT JOIN tes_tip_cuen_banc c ON c.ide_tetcb = a.ide_tetcb
             WHERE a.ide_empr = $1
               AND ($2::bigint IS NULL OR a.ide_sucu = $2)
               AND COALESCE(a.activo_tecba, true) = true
               AND COALESCE(b.es_caja_teban, false) = false
             ORDER BY b.nombre_teban, a.nombre_tecba`,
            [ideEmpr, ideSucu],
        );
        return rows as Array<{
            ide_tecba: number; ide_sucu: number; nombre_tecba: string; observacion_tecba: string | null;
            nombre_teban: string; foto_teban: string | null; color_teban: string | null; nombre_tetcb: string | null;
        }>;
    }

    /** Todas las cuentas de la sucursal con el estado de su conciliación del mes: el "tablero" mensual del contador. */
    async getResumenMensual(dtoIn: GetResumenMensualDto & HeaderParamsDto) {
        const { rows } = await this.dataSource.pool.query(
            `SELECT a.ide_tecba, a.nombre_tecba, b.nombre_teban, b.foto_teban, b.color_teban, c.nombre_tetcb,
                    n.ide_tecnc, n.estado_tecnc, n.saldo_inicial_banco_tecnc, n.saldo_final_banco_tecnc,
                    n.saldo_final_erp_tecnc, n.fecha_ultimo_mov_tecnc::text AS fecha_ultimo_mov_tecnc,
                    COALESCE(s.total, 0) AS total_movimientos,
                    COALESCE(s.conciliados, 0) AS conciliados,
                    COALESCE(s.por_revisar, 0) AS por_revisar
             FROM tes_cuenta_banco a
             INNER JOIN tes_banco b ON b.ide_teban = a.ide_teban
             LEFT JOIN tes_tip_cuen_banc c ON c.ide_tetcb = a.ide_tetcb
             LEFT JOIN tes_conciliacion n ON n.ide_tecba = a.ide_tecba AND n.anio_tecnc = $2 AND n.mes_tecnc = $3
                                          AND n.anulado_tecnc = false
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE m.estado_tecmv = 'CONCILIADO') AS conciliados,
                        COUNT(*) FILTER (WHERE m.estado_tecmv IN ('PENDIENTE', 'FALTANTE')) AS por_revisar
                 FROM tes_conciliacion_mov m WHERE m.ide_tecnc = n.ide_tecnc
             ) s ON true
             WHERE a.ide_sucu = $1
               AND COALESCE(a.activo_tecba, true) = true
               AND COALESCE(b.es_caja_teban, false) = false
             ORDER BY b.nombre_teban, a.nombre_tecba`,
            [dtoIn.ideSucu, dtoIn.anio, dtoIn.mes],
        );
        return rows;
    }

    /** Historial de conciliaciones de la sucursal, paginado por el motor genérico de tablas. */
    async getConciliaciones(dtoIn: GetConciliacionesDto & HeaderParamsDto) {
        const condiciones: string[] = ['n.ide_sucu = $1', 'n.anulado_tecnc = false'];
        const valores: number[] = [dtoIn.ideSucu];
        const agregar = (columna: string, valor: number | undefined) => {
            if (valor === undefined || valor === null) return;
            valores.push(valor);
            condiciones.push(`${columna} = $${valores.length}`);
        };
        agregar('n.anio_tecnc', dtoIn.anio);
        agregar('n.mes_tecnc', dtoIn.mes);
        agregar('n.ide_tecba', dtoIn.ideTecba);

        const query = new SelectQuery(`
            SELECT n.ide_tecnc, n.ide_tecba, a.nombre_tecba, b.nombre_teban, b.foto_teban, b.color_teban,
                   n.anio_tecnc, n.mes_tecnc, n.estado_tecnc,
                   n.fecha_desde_tecnc::text AS fecha_desde_tecnc, n.fecha_hasta_tecnc::text AS fecha_hasta_tecnc,
                   n.fecha_ultimo_mov_tecnc::text AS fecha_ultimo_mov_tecnc,
                   n.saldo_inicial_banco_tecnc, n.saldo_final_banco_tecnc, n.saldo_final_erp_tecnc,
                   n.usuario_ingre, n.hora_ingre,
                   COALESCE(s.total, 0) AS total_movimientos,
                   COALESCE(s.conciliados, 0) AS conciliados,
                   COALESCE(s.por_revisar, 0) AS por_revisar
            FROM tes_conciliacion n
            INNER JOIN tes_cuenta_banco a ON a.ide_tecba = n.ide_tecba
            INNER JOIN tes_banco b ON b.ide_teban = a.ide_teban
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE m.estado_tecmv = 'CONCILIADO') AS conciliados,
                       COUNT(*) FILTER (WHERE m.estado_tecmv IN ('PENDIENTE', 'FALTANTE')) AS por_revisar
                FROM tes_conciliacion_mov m WHERE m.ide_tecnc = n.ide_tecnc
            ) s ON true
            WHERE ${condiciones.join(' AND ')}
            ORDER BY n.anio_tecnc DESC, n.mes_tecnc DESC, b.nombre_teban, a.nombre_tecba
        `, dtoIn);
        valores.forEach((valor, i) => query.addIntParam(i + 1, valor));
        return this.dataSource.createQuery(query);
    }

    /** Cabecera + archivos + resumen de saldos y diferencias, todo lo que muestra el encabezado del detalle. */
    async getConciliacion(ideTecnc: number, headers: HeaderParamsDto) {
        const cabecera = await this.getCabecera(ideTecnc, headers);
        const { rows: archivos } = await this.dataSource.pool.query(
            `SELECT ide_tecar, nombre_original_tecar, formato_tecar, cuenta_detectada_tecar,
                    fecha_desde_tecar::text AS fecha_desde_tecar, fecha_hasta_tecar::text AS fecha_hasta_tecar,
                    saldo_inicial_tecar, saldo_final_tecar, num_movimientos_tecar, num_nuevos_tecar,
                    num_duplicados_tecar, advertencias_tecar, tamano_tecar, usuario_ingre, hora_ingre
             FROM tes_conciliacion_archivo WHERE ide_tecnc = $1 ORDER BY ide_tecar DESC`,
            [ideTecnc],
        );
        const resumen = await this.calcularResumen(cabecera);
        return { cabecera, archivos, resumen };
    }

    /** Saldo del libro de bancos (ERP) de la cuenta hasta `fecha` inclusive. */
    async getSaldoErp(ideTecba: number, fecha: string): Promise<number> {
        const { rows } = await this.dataSource.pool.query(
            `SELECT COALESCE(SUM(a.valor_teclb * b.signo_tettb), 0) AS saldo
             FROM tes_cab_libr_banc a
             INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
             WHERE a.ide_tecba = $1 AND a.ide_teelb = $2 AND a.fecha_trans_teclb <= $3`,
            [ideTecba, await this.estadoLibroNormal(), fecha],
        );
        return Number(rows[0].saldo);
    }

    /**
     * Resumen de la conciliación. Identidad que lo sostiene:
     *   saldoBanco - saldoERP = arrastre + bancoSinErp - erpSinBanco + otras
     * - arrastre: diferencia de los saldos INICIALES (lo que ya venía descuadrado de meses anteriores).
     * - bancoSinErp: neto de los movimientos del banco que no se cruzaron (faltantes/pendientes).
     * - erpSinBanco: neto de los movimientos del ERP del mes que el banco no muestra (ej. cheques en tránsito).
     * - otras: cruces entre meses vecinos (banco de septiembre contra ERP de agosto) y ajustes del banco
     *   no listados; debería ser 0 cuando todo está explicado.
     */
    async calcularResumen(cabecera: ConciliacionCabecera) {
        const estadoNormal = await this.estadoLibroNormal();
        const [{ rows: filasBanco }, { rows: filasErp }] = await Promise.all([
            this.dataSource.pool.query(
                `SELECT m.estado_tecmv AS estado, COUNT(*) AS cantidad,
                        COALESCE(SUM(m.monto_tecmv * m.signo_tecmv), 0) AS neto,
                        COALESCE(SUM(m.monto_tecmv) FILTER (WHERE m.signo_tecmv = 1), 0) AS ingresos,
                        COALESCE(SUM(m.monto_tecmv) FILTER (WHERE m.signo_tecmv = -1), 0) AS egresos
                 FROM tes_conciliacion_mov m WHERE m.ide_tecnc = $1 GROUP BY m.estado_tecmv`,
                [cabecera.ide_tecnc],
            ),
            this.dataSource.pool.query(
                `SELECT (m.ide_tecmt IS NOT NULL) AS cruzado, COUNT(*) AS cantidad,
                        COALESCE(SUM(a.valor_teclb * b.signo_tettb), 0) AS neto
                 FROM tes_cab_libr_banc a
                 INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
                 LEFT JOIN tes_conciliacion_match m ON m.ide_teclb = a.ide_teclb AND m.activo_tecmt = true
                 WHERE a.ide_tecba = $1 AND a.ide_teelb = $2 AND a.fecha_trans_teclb BETWEEN $3 AND $4
                 GROUP BY (m.ide_tecmt IS NOT NULL)`,
                [cabecera.ide_tecba, estadoNormal, cabecera.fecha_desde_tecnc, cabecera.fecha_hasta_tecnc],
            ),
        ]);

        const porEstado = (estado: string) => filasBanco.find((f) => f.estado === estado);
        const cant = (estado: string) => Number(porEstado(estado)?.cantidad ?? 0);
        const totalBanco = filasBanco.reduce((s, f) => s + Number(f.cantidad), 0);
        const netoBanco = filasBanco.reduce((s, f) => s + aCentavos(f.neto), 0);
        const netoBancoSinErp = filasBanco.filter((f) => f.estado !== 'CONCILIADO').reduce((s, f) => s + aCentavos(f.neto), 0);
        const erpSinBanco = filasErp.find((f) => !f.cruzado);
        const erpCruzado = filasErp.find((f) => f.cruzado);

        const saldoInicialBanco = cabecera.saldo_inicial_banco_tecnc;
        const saldoFinalBanco = cabecera.saldo_final_banco_tecnc;
        const saldoInicialErp = await this.getSaldoErp(cabecera.ide_tecba, diaAnterior(cabecera.fecha_desde_tecnc));
        const saldoFinalErp = await this.getSaldoErp(cabecera.ide_tecba, cabecera.fecha_hasta_tecnc);

        const tieneSaldosBanco = saldoInicialBanco !== null && saldoFinalBanco !== null;
        const diferencia = tieneSaldosBanco ? deCentavos(aCentavos(saldoFinalBanco) - aCentavos(saldoFinalErp)) : null;
        const arrastre = tieneSaldosBanco ? deCentavos(aCentavos(saldoInicialBanco) - aCentavos(saldoInicialErp)) : null;
        const erpSinBancoNeto = aCentavos(erpSinBanco?.neto);
        const otras = tieneSaldosBanco
            ? deCentavos(
                aCentavos(saldoFinalBanco) - aCentavos(saldoFinalErp)
                - (aCentavos(saldoInicialBanco) - aCentavos(saldoInicialErp))
                - netoBancoSinErp + erpSinBancoNeto,
            )
            : null;

        return {
            saldoInicialBanco,
            saldoFinalBanco,
            saldoInicialErp,
            saldoFinalErp,
            diferencia,
            explicacion: {
                arrastre,
                bancoSinErp: deCentavos(netoBancoSinErp),
                erpSinBanco: deCentavos(erpSinBancoNeto),
                otras,
            },
            banco: {
                total: totalBanco,
                conciliados: cant('CONCILIADO'),
                pendientes: cant('PENDIENTE'),
                faltantes: cant('FALTANTE'),
                ignorados: cant('IGNORADO'),
                neto: deCentavos(netoBanco),
            },
            erp: {
                sinBanco: Number(erpSinBanco?.cantidad ?? 0),
                cruzados: Number(erpCruzado?.cantidad ?? 0),
            },
            /** Todo cruzado, sin descuadre y con saldos del banco: lista para cerrar. */
            lista: tieneSaldosBanco && diferencia === 0 && cant('PENDIENTE') === 0 && Number(erpSinBanco?.cantidad ?? 0) === 0,
        };
    }

    async getMovimientosBanco(dtoIn: GetMovimientosBancoDto & HeaderParamsDto) {
        await this.getCabecera(dtoIn.ideTecnc, dtoIn);
        const sinCruzar = dtoIn.estado === 'SIN_CRUZAR';
        const filtroEstado = sinCruzar ? "AND m.estado_tecmv <> 'CONCILIADO'" : dtoIn.estado ? 'AND m.estado_tecmv = $2' : '';
        const query = new SelectQuery(`
            SELECT m.ide_tecmv, m.fecha_tecmv::text AS fecha_tecmv, m.documento_tecmv, m.descripcion_tecmv,
                   m.referencia_tecmv, m.oficina_tecmv, m.monto_tecmv, m.signo_tecmv,
                   m.monto_tecmv * m.signo_tecmv AS valor_signado, m.saldo_tecmv, m.estado_tecmv, m.nota_tecmv,
                   g.grupo_tecmt, g.tipo_tecmt, g.regla_tecmt, g.confianza_tecmt
            FROM tes_conciliacion_mov m
            LEFT JOIN LATERAL (
                SELECT x.grupo_tecmt, x.tipo_tecmt, x.regla_tecmt, x.confianza_tecmt
                FROM tes_conciliacion_match x
                WHERE x.ide_tecmv = m.ide_tecmv AND x.activo_tecmt = true LIMIT 1
            ) g ON true
            WHERE m.ide_tecnc = $1 ${filtroEstado}
            ORDER BY m.fecha_tecmv, m.orden_tecmv
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideTecnc);
        if (dtoIn.estado && !sinCruzar) query.addStringParam(2, dtoIn.estado);
        return this.dataSource.createQuery(query);
    }

    /**
     * Movimientos del libro de bancos candidatos a cruzarse con esta conciliación: los del mes ampliados
     * en la tolerancia de días (el banco puede acreditar el 1 de un movimiento registrado el 31), sin
     * los que ya se cruzaron en OTRA conciliación. `en_periodo` distingue los del mes de los del margen.
     */
    async getMovimientosErp(dtoIn: GetMovimientosErpDto & HeaderParamsDto) {
        const cabecera = await this.getCabecera(dtoIn.ideTecnc, dtoIn);
        const { sql, params } = this.sqlErp(cabecera, !!dtoIn.soloPendientes, await this.estadoLibroNormal());
        const query = new SelectQuery(sql, dtoIn);
        params.forEach((valor, i) => query.addParam(i + 1, valor));
        return this.dataSource.createQuery(query);
    }

    /** Mismos candidatos que getMovimientosErp, como arreglo simple para el motor de cruces. */
    async consultarErp(cabecera: ConciliacionCabecera, soloPendientes: boolean) {
        const { sql, params } = this.sqlErp(cabecera, soloPendientes, await this.estadoLibroNormal());
        const { rows } = await this.dataSource.pool.query(sql, params);
        return rows;
    }

    private sqlErp(cabecera: ConciliacionCabecera, soloPendientes: boolean, estadoNormal: number) {
        const sql = `
            SELECT a.ide_teclb, a.fecha_trans_teclb::text AS fecha_trans_teclb, a.numero_teclb,
                   a.num_comprobante_teclb, a.beneficiari_teclb, a.observacion_teclb, a.ide_cnccc,
                   b.nombre_tettb, b.signo_tettb, a.valor_teclb, a.valor_teclb * b.signo_tettb AS valor_signado,
                   COALESCE(a.conciliado_teclb, false) AS conciliado_legado,
                   (a.fecha_trans_teclb BETWEEN $3::date AND $4::date) AS en_periodo,
                   m.grupo_tecmt, m.tipo_tecmt, m.ide_tecmt
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            LEFT JOIN tes_conciliacion_match m ON m.ide_teclb = a.ide_teclb AND m.activo_tecmt = true
            WHERE a.ide_tecba = $1 AND a.ide_teelb = $2
              AND a.fecha_trans_teclb BETWEEN ($3::date - $5::int) AND ($4::date + $5::int)
              AND (m.ide_tecmt IS NULL OR m.ide_tecnc = $6)
              ${soloPendientes ? 'AND m.ide_tecmt IS NULL' : ''}
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `;
        const params = [
            cabecera.ide_tecba, estadoNormal, cabecera.fecha_desde_tecnc, cabecera.fecha_hasta_tecnc,
            cabecera.tolerancia_dias_tecnc, cabecera.ide_tecnc,
        ];
        return { sql, params };
    }

    /** Cruces vigentes agrupados: cada fila es un cruce con sus movimientos del banco y del ERP. */
    async getCruces(ideTecnc: number, headers: HeaderParamsDto) {
        await this.getCabecera(ideTecnc, headers);
        const { rows } = await this.dataSource.pool.query(
            `SELECT g.grupo_tecmt, g.tipo_tecmt, g.regla_tecmt, g.confianza_tecmt, g.observacion_tecmt,
                    g.usuario_ingre, g.hora_ingre,
                    (SELECT COALESCE(json_agg(json_build_object(
                                'ide_tecmv', m.ide_tecmv, 'fecha', m.fecha_tecmv::text, 'documento', m.documento_tecmv,
                                'descripcion', m.descripcion_tecmv, 'valor', m.monto_tecmv * m.signo_tecmv)
                            ORDER BY m.fecha_tecmv, m.orden_tecmv), '[]'::json)
                     FROM tes_conciliacion_match x INNER JOIN tes_conciliacion_mov m ON m.ide_tecmv = x.ide_tecmv
                     WHERE x.grupo_tecmt = g.grupo_tecmt AND x.activo_tecmt = true) AS movimientos_banco,
                    (SELECT COALESCE(json_agg(json_build_object(
                                'ide_teclb', l.ide_teclb, 'fecha', l.fecha_trans_teclb::text, 'numero', l.numero_teclb,
                                'beneficiario', l.beneficiari_teclb, 'valor', l.valor_teclb * t.signo_tettb)
                            ORDER BY l.fecha_trans_teclb, l.ide_teclb), '[]'::json)
                     FROM tes_conciliacion_match x
                     INNER JOIN tes_cab_libr_banc l ON l.ide_teclb = x.ide_teclb
                     INNER JOIN tes_tip_tran_banc t ON t.ide_tettb = l.ide_tettb
                     WHERE x.grupo_tecmt = g.grupo_tecmt AND x.activo_tecmt = true) AS movimientos_erp
             FROM (
                 SELECT DISTINCT ON (grupo_tecmt) grupo_tecmt, tipo_tecmt, regla_tecmt, confianza_tecmt,
                        observacion_tecmt, usuario_ingre, hora_ingre
                 FROM tes_conciliacion_match WHERE ide_tecnc = $1 AND activo_tecmt = true
                 ORDER BY grupo_tecmt, ide_tecmt
             ) g
             ORDER BY g.grupo_tecmt DESC`,
            [ideTecnc],
        );
        return rows;
    }

    /** Ruta y nombre original de un archivo subido, para descargarlo. */
    async getArchivo(ideTecar: number, headers: Pick<HeaderParamsDto, 'ideEmpr'>) {
        const { rows } = await this.dataSource.pool.query(
            `SELECT r.ide_tecar, r.nombre_original_tecar, r.nombre_archivo_tecar, r.mime_tecar, n.ide_tecba, n.anio_tecnc, n.mes_tecnc
             FROM tes_conciliacion_archivo r
             INNER JOIN tes_conciliacion n ON n.ide_tecnc = r.ide_tecnc
             WHERE r.ide_tecar = $1 AND n.ide_empr = $2`,
            [ideTecar, headers.ideEmpr],
        );
        if (rows.length === 0) throw new NotFoundException('Archivo no encontrado.');
        return rows[0];
    }

    /** Valida que la conciliación permita cambios. */
    assertAbierta(cabecera: ConciliacionCabecera): void {
        if (cabecera.estado_tecnc === 'CERRADA') {
            throw new BadRequestException('La conciliación está CERRADA: reábrala para hacer cambios.');
        }
    }
}

/** Día anterior a una fecha YYYY-MM-DD. */
export function diaAnterior(fecha: string): string {
    const d = new Date(`${fecha}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
}
