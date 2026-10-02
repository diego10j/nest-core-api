import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { AjustesErpConciliacionService } from './ajustes-erp-conciliacion.service';
import { primerDiaMes, ultimoDiaMes } from './carga-util';
import { CmpBanco, CmpErp, CmpMatch, construirComparacion } from './comparacion';
import { ConciliacionBancariaService } from './conciliacion-bancaria.service';
import { GetResumenMensualDto } from './dto/conciliacion-bancaria.dto';
import { diasEntre } from './matching';

/**
 * "Diferencias en Conciliación": la vista para AUXILIARES que solo revisan qué movimientos falta identificar
 * o registrar. Por diseño NO devuelve ningún saldo (ni del banco, ni del ERP, ni acumulados, ni diferencias de
 * saldos): solo movimientos y sus montos. Por eso tiene endpoints propios en vez de reutilizar los del resumen o
 * de la comparación, que sí traen saldos.
 */
@Injectable()
export class DiferenciasConciliacionService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly consultas: ConciliacionBancariaService,
        private readonly ajustes: AjustesErpConciliacionService,
    ) { }

    /**
     * Tablero del mes: por cada cuenta de la sucursal, cuántos movimientos faltan en el ERP (los del banco sin
     * registro) y cuántos faltan en el banco (los del ERP del mes que el banco no muestra). Sin saldos.
     */
    async getResumenDiferencias(dtoIn: GetResumenMensualDto & HeaderParamsDto) {
        const { rows } = await this.dataSource.pool.query(
            `SELECT a.ide_tecba, a.nombre_tecba, b.nombre_teban, b.foto_teban, b.color_teban,
                    n.ide_tecnc, n.estado_tecnc,
                    COALESCE(f.num_archivos, 0) AS num_archivos,
                    COALESCE(s.total, 0) AS total_movimientos,
                    COALESCE(s.conciliados, 0) AS conciliados,
                    COALESCE(s.faltan_en_erp, 0) AS faltan_en_erp,
                    COALESCE(s.ignorados, 0) AS ignorados,
                    COALESCE(e.faltan_en_banco, 0) AS faltan_en_banco,
                    COALESCE(g.movimientos_erp, 0) AS movimientos_erp
             FROM tes_cuenta_banco a
             INNER JOIN tes_banco b ON b.ide_teban = a.ide_teban
             LEFT JOIN tes_conciliacion n ON n.ide_tecba = a.ide_tecba AND n.anio_tecnc = $2 AND n.mes_tecnc = $3
                                          AND n.anulado_tecnc = false
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS num_archivos FROM tes_conciliacion_archivo r WHERE r.ide_tecnc = n.ide_tecnc
             ) f ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS total,
                        COUNT(*) FILTER (WHERE m.estado_tecmv = 'CONCILIADO') AS conciliados,
                        COUNT(*) FILTER (WHERE m.estado_tecmv IN ('PENDIENTE', 'FALTANTE')) AS faltan_en_erp,
                        COUNT(*) FILTER (WHERE m.estado_tecmv = 'IGNORADO') AS ignorados
                 FROM tes_conciliacion_mov m WHERE m.ide_tecnc = n.ide_tecnc
             ) s ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS faltan_en_banco
                 FROM tes_cab_libr_banc l
                 WHERE n.ide_tecnc IS NOT NULL AND l.ide_tecba = a.ide_tecba AND l.ide_teelb = $4
                   AND l.fecha_trans_teclb BETWEEN n.fecha_desde_tecnc AND n.fecha_hasta_tecnc
                   AND NOT EXISTS (SELECT 1 FROM tes_conciliacion_match x WHERE x.ide_teclb = l.ide_teclb AND x.activo_tecmt = true)
             ) e ON true
             LEFT JOIN LATERAL (
                 SELECT COUNT(*) AS movimientos_erp FROM tes_cab_libr_banc l
                 WHERE l.ide_tecba = a.ide_tecba AND l.ide_teelb = $4 AND l.fecha_trans_teclb BETWEEN $5::date AND $6::date
             ) g ON true
             WHERE a.ide_sucu = $1
               AND COALESCE(a.activo_tecba, true) = true
               AND COALESCE(b.es_caja_teban, false) = false
               AND (COALESCE(g.movimientos_erp, 0) > 0 OR n.ide_tecnc IS NOT NULL)
             ORDER BY b.nombre_teban, a.nombre_tecba`,
            [
                dtoIn.ideSucu, dtoIn.anio, dtoIn.mes, await this.consultas.estadoLibroNormal(),
                primerDiaMes(dtoIn.anio, dtoIn.mes), ultimoDiaMes(dtoIn.anio, dtoIn.mes),
            ],
        );
        return rows;
    }

    /** Detalle de una conciliación: solo los movimientos con diferencia, en tres listas y sin saldos. */
    async getDiferencias(ideTecnc: number, headers: HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(ideTecnc, headers);

        const [{ rows: filasBanco }, { rows: filasMatch }, filasErp, { rows: archivos }] = await Promise.all([
            this.dataSource.pool.query(
                `SELECT ide_tecmv, fecha_tecmv::text AS fecha, documento_tecmv AS documento, descripcion_tecmv AS descripcion,
                        referencia_tecmv AS referencia, monto_tecmv AS monto, signo_tecmv AS signo,
                        estado_tecmv AS estado, nota_tecmv AS nota
                 FROM tes_conciliacion_mov WHERE ide_tecnc = $1 ORDER BY fecha_tecmv, orden_tecmv, ide_tecmv`,
                [ideTecnc],
            ),
            this.dataSource.pool.query(
                `SELECT ide_tecmv, ide_teclb, grupo_tecmt AS grupo, tipo_tecmt AS tipo, regla_tecmt AS regla,
                        confianza_tecmt AS confianza, observacion_tecmt AS observacion
                 FROM tes_conciliacion_match WHERE ide_tecnc = $1 AND activo_tecmt = true`,
                [ideTecnc],
            ),
            this.consultas.consultarErp(cabecera, false),
            this.dataSource.pool.query('SELECT COUNT(*) AS n FROM tes_conciliacion_archivo WHERE ide_tecnc = $1', [ideTecnc]),
        ]);

        const banco: CmpBanco[] = filasBanco.map((r) => ({
            ide_tecmv: Number(r.ide_tecmv),
            fecha: r.fecha,
            documento: r.documento ?? '',
            descripcion: r.descripcion ?? '',
            referencia: r.referencia ?? '',
            valor: Number(r.monto) * Number(r.signo),
            saldo: null, // los saldos no salen de aquí
            estado: r.estado,
            nota: r.nota,
        }));
        const erp: CmpErp[] = filasErp.map((r: any) => ({
            ide_teclb: Number(r.ide_teclb),
            fecha: r.fecha_trans_teclb,
            numero: r.numero_teclb,
            comprobante: r.num_comprobante_teclb,
            beneficiario: r.beneficiari_teclb,
            observacion: r.observacion_teclb,
            valor: Number(r.valor_signado),
            tipo: r.nombre_tettb,
            conciliado_legado: !!r.conciliado_legado,
            en_periodo: !!r.en_periodo,
        }));
        const matches: CmpMatch[] = filasMatch.map((r) => ({
            ide_tecmv: Number(r.ide_tecmv),
            ide_teclb: Number(r.ide_teclb),
            grupo: Number(r.grupo),
            tipo: r.tipo,
            regla: r.regla,
            confianza: r.confianza === null ? null : Number(r.confianza),
            observacion: r.observacion,
        }));

        const { bloques, contadores } = construirComparacion({
            desde: cabecera.fecha_desde_tecnc,
            hasta: cabecera.fecha_hasta_tecnc,
            toleranciaDias: cabecera.tolerancia_dias_tecnc,
            saldoInicialBanco: null, // sin saldos: no se calculan acumulados
            saldoInicialErp: 0,
            banco, erp, matches,
            saltosBanco: new Set(),
        });
        const tieneCodigo = (b: { alertas: { codigo: string }[] }, codigo: string) => b.alertas.some((a) => a.codigo === codigo);

        const faltanEnErp = bloques
            .filter((b) => b.tipo === 'SOLO_BANCO' && b.severidad === 'ROJO')
            .map((b) => ({
                id: b.banco[0].ide_tecmv,
                fecha: b.banco[0].fecha,
                documento: b.banco[0].documento,
                descripcion: b.banco[0].descripcion,
                referencia: b.banco[0].referencia,
                valor: b.banco[0].valor,
                marcado: b.banco[0].estado === 'FALTANTE',
                nota: b.banco[0].nota,
                repetido: tieneCodigo(b, 'DUPLICADO'),
            }));
        const faltanEnBanco = bloques
            .filter((b) => b.tipo === 'SOLO_ERP')
            .map((b) => ({
                id: b.erp[0].ide_teclb,
                fecha: b.erp[0].fecha,
                numero: b.erp[0].numero,
                comprobante: b.erp[0].comprobante,
                beneficiario: b.erp[0].beneficiario,
                observacion: b.erp[0].observacion,
                tipo: b.erp[0].tipo,
                valor: b.erp[0].valor,
                legado: b.erp[0].conciliado_legado,
                repetido: tieneCodigo(b, 'DUPLICADO'),
                /** Otro movimiento del ERP con el mismo número ya está cruzado con el banco: posible registro duplicado. */
                documentoRepetido: b.alertas.find((a) => a.codigo === 'DOCUMENTO_REPETIDO')?.texto ?? null,
            }));
        const conDiferencia = bloques
            .filter((b) => b.tipo === 'CRUCE' && (tieneCodigo(b, 'DIFERENCIA') || tieneCodigo(b, 'SIGNO')))
            .map((b) => ({
                grupo: b.cruce?.grupo ?? 0,
                banco: b.banco.map((m) => ({ fecha: m.fecha, documento: m.documento, descripcion: m.descripcion, valor: m.valor })),
                erp: b.erp.map((m) => ({ fecha: m.fecha, numero: m.numero, beneficiario: m.beneficiario, valor: m.valor })),
                totalBanco: b.totalBanco,
                totalErp: b.totalErp,
                diferencia: b.diferencia,
                motivos: b.alertas.filter((a) => a.codigo === 'DIFERENCIA' || a.codigo === 'SIGNO').map((a) => a.texto),
            }));

        // Cruces 1 a 1 cuyas fechas no coinciden (el monto sí): se pueden corregir igualando la fecha del ERP a la del banco
        const fechasDistintas = bloques
            .filter((b) => b.tipo === 'CRUCE' && tieneCodigo(b, 'FECHAS') && !tieneCodigo(b, 'DIFERENCIA') && !tieneCodigo(b, 'SIGNO')
                && b.banco.length === 1 && b.erp.length === 1 && b.banco[0].fecha !== b.erp[0].fecha)
            .map((b) => ({
                ide_tecmv: b.banco[0].ide_tecmv,
                ide_teclb: b.erp[0].ide_teclb,
                fechaBanco: b.banco[0].fecha,
                fechaErp: b.erp[0].fecha,
                dias: Math.abs(diasEntre(b.banco[0].fecha, b.erp[0].fecha)),
                documento: b.banco[0].documento,
                descripcion: b.banco[0].descripcion,
                numero: b.erp[0].numero,
                beneficiario: b.erp[0].beneficiario,
                valor: b.banco[0].valor,
                otroMes: !b.erp[0].en_periodo,
            }))
            .sort((x, y) => x.fechaBanco.localeCompare(y.fechaBanco));
        const cuentasSugeridas = await this.ajustes.getCuentasSugeridas(headers.ideEmpr);

        return {
            cabecera: {
                ide_tecnc: cabecera.ide_tecnc,
                nombre_tecba: cabecera.nombre_tecba,
                nombre_teban: cabecera.nombre_teban,
                foto_teban: cabecera.foto_teban,
                color_teban: cabecera.color_teban,
                anio: cabecera.anio_tecnc,
                mes: cabecera.mes_tecnc,
                estado: cabecera.estado_tecnc,
                tolerancia_dias: cabecera.tolerancia_dias_tecnc,
                num_archivos: Number(archivos[0].n),
                totalMovimientosBanco: banco.length,
                /** Cuentas contables sugeridas al registrar un movimiento: comisiones si el banco debitó, otros ingresos si acreditó. */
                cuentaComision: cuentasSugeridas.comision,
                cuentaOtrosIngresos: cuentasSugeridas.otrosIngresos,
                /** Hay al menos un cruce: alguien ya corrió el proceso; antes de eso "todo falta" no significa nada. */
                procesada: matches.length > 0,
            },
            contadores: {
                faltanEnErp: faltanEnErp.length,
                faltanEnBanco: faltanEnBanco.length,
                conDiferencia: conDiferencia.length,
                fechasDistintas: fechasDistintas.length,
                ignorados: contadores.ignorados,
                erpFueraDeMesSinCruce: contadores.erpFueraDeMesSinCruce,
            },
            faltanEnErp,
            faltanEnBanco,
            conDiferencia,
            fechasDistintas,
        };
    }
}
