import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { CmpBanco, CmpErp, CmpMatch, construirComparacion } from './comparacion';
import { ConciliacionBancariaService, diaAnterior } from './conciliacion-bancaria.service';
import type { MovimientoBanco } from './parsers/estado-cuenta.types';
import { calcularSaldosCadena, detectarSaltosDeSaldo } from './parsers/parser-util';

/** Tope de bloques que se devuelven (un mes normal tiene cientos; esto solo protege el servidor). */
const MAX_BLOQUES = 3000;

/**
 * Comparación banco ↔ ERP de una conciliación (vista de solo lectura "tipo merge"): junta los
 * movimientos del banco, los del libro de bancos y los cruces, y deja que `construirComparacion`
 * arme los bloques alineados con sus advertencias.
 */
@Injectable()
export class ComparacionConciliacionService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly consultas: ConciliacionBancariaService,
    ) { }

    async getComparacion(ideTecnc: number, headers: HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(ideTecnc, headers);

        const [{ rows: filasBanco }, { rows: filasMatch }, filasErp, saldoInicialErp] = await Promise.all([
            this.dataSource.pool.query(
                `SELECT ide_tecmv, fecha_tecmv::text AS fecha, documento_tecmv AS documento, descripcion_tecmv AS descripcion,
                        referencia_tecmv AS referencia, monto_tecmv AS monto, signo_tecmv AS signo, saldo_tecmv AS saldo,
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
            this.consultas.getSaldoErp(cabecera.ide_tecba, diaAnterior(cabecera.fecha_desde_tecnc)),
        ]);

        const banco: CmpBanco[] = filasBanco.map((r) => ({
            ide_tecmv: Number(r.ide_tecmv),
            fecha: r.fecha,
            documento: r.documento ?? '',
            descripcion: r.descripcion ?? '',
            referencia: r.referencia ?? '',
            valor: Number(r.monto) * Number(r.signo),
            saldo: r.saldo === null ? null : Number(r.saldo),
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

        // Saltos de la cadena de saldos: solo si el archivo NO encadena (si encadena no hay saltos, y algunos
        // bancos desordenan dentro del día, lo que daría falsos saltos)
        const saltosBanco = new Set<number>();
        const movs = banco.map((b) => ({ ...b, monto: Math.abs(b.valor), signo: (b.valor >= 0 ? 1 : -1) as 1 | -1, oficina: '' })) as unknown as MovimientoBanco[];
        const saldos = calcularSaldosCadena(movs);
        if (saldos.inicial !== null && !saldos.consistente) {
            detectarSaltosDeSaldo(movs, saldos.inicial).forEach((s) => saltosBanco.add(banco[s.indice].ide_tecmv));
        }

        const resultado = construirComparacion({
            desde: cabecera.fecha_desde_tecnc,
            hasta: cabecera.fecha_hasta_tecnc,
            toleranciaDias: cabecera.tolerancia_dias_tecnc,
            saldoInicialBanco: cabecera.saldo_inicial_banco_tecnc,
            saldoInicialErp,
            banco, erp, matches, saltosBanco,
        });

        const truncado = resultado.bloques.length > MAX_BLOQUES;
        return {
            cabecera: {
                ide_tecnc: cabecera.ide_tecnc,
                nombre_tecba: cabecera.nombre_tecba,
                nombre_teban: cabecera.nombre_teban,
                fecha_desde: cabecera.fecha_desde_tecnc,
                fecha_hasta: cabecera.fecha_hasta_tecnc,
                tolerancia_dias: cabecera.tolerancia_dias_tecnc,
                estado: cabecera.estado_tecnc,
            },
            ...resultado,
            bloques: truncado ? resultado.bloques.slice(0, MAX_BLOQUES) : resultado.bloques,
            truncado,
        };
    }
}
