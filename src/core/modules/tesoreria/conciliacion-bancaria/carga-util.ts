import { createHash } from 'node:crypto';
import path from 'node:path';

import type { PoolClient } from 'pg';
import { envs } from 'src/config/envs';

import type { MovimientoBanco } from './parsers/estado-cuenta.types';
import { aCentavos, calcularSaldosCadena } from './parsers/parser-util';

/** Carpeta permanente de los estados de cuenta cargados (no `temp_media`, que se purga a los 90 días). */
export const DIR_CONCILIACIONES = path.join(envs.pathDrive, 'tesoreria', 'conciliaciones');

const soloDigitos = (t: string | null | undefined): string => (t ?? '').replace(/\D/g, '');

/**
 * ¿El número de cuenta del archivo corresponde a esta cuenta del ERP? El ERP guarda el número de
 * cuenta dentro de nombre_tecba (junto a otro texto, ej. "Pichincha 2100347177"), por eso se
 * comparan dígitos: los bloques de 6+ dígitos del nombre/observación contra los del archivo, en
 * cualquier sentido (el archivo puede traer la cuenta recortada o con ceros a la izquierda).
 */
export function coincideCuenta(cuentaArchivo: string | null, nombre: string | null, observacion: string | null): boolean {
    const objetivo = soloDigitos(cuentaArchivo).replace(/^0+/, '');
    if (objetivo.length < 6) return false;
    const candidatos = [nombre, observacion].flatMap((t) => {
        const texto = t ?? '';
        return [soloDigitos(texto), ...(texto.match(/\d[\d\s.-]{4,}\d/g) ?? []).map(soloDigitos)];
    });
    return candidatos
        .map((c) => c.replace(/^0+/, ''))
        .some((c) => c.length >= 6 && (c.includes(objetivo) || objetivo.includes(c)));
}

/** Huella de un movimiento; `ocurrencia` distingue movimientos idénticos dentro del mismo archivo. */
export function huellaMovimiento(m: MovimientoBanco, ocurrencia: number): string {
    const clave = [m.fecha, m.documento, m.signo * aCentavos(m.monto), m.saldo === null ? '' : aCentavos(m.saldo), ocurrencia].join('|');
    return createHash('sha1').update(clave).digest('hex');
}

export const primerDiaMes = (anio: number, mes: number): string => `${anio}-${String(mes).padStart(2, '0')}-01`;
export const ultimoDiaMes = (anio: number, mes: number): string => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

/** Huellas de los movimientos (con el índice de ocurrencia de los idénticos) y su orden en el archivo. */
export function conHuellas(movimientos: MovimientoBanco[]) {
    const vistos = new Map<string, number>();
    return movimientos.map((mov, orden) => {
        const base = [mov.fecha, mov.documento, mov.signo * aCentavos(mov.monto), mov.saldo === null ? '' : aCentavos(mov.saldo)].join('|');
        const ocurrencia = vistos.get(base) ?? 0;
        vistos.set(base, ocurrencia + 1);
        return { mov, orden, hash: huellaMovimiento(mov, ocurrencia) };
    });
}

/**
 * Saldos del banco a partir de TODOS los movimientos cargados (la unión de los cortes): al subir
 * un corte posterior el saldo final se actualiza solo. Si el banco no da saldo por movimiento
 * (o la cadena no cierra) se deja lo que se pueda y el resumen muestra la diferencia.
 */
export async function recalcularSaldosBanco(client: Pick<PoolClient, 'query'>, ideTecnc: number) {
    const { rows } = await client.query(
        `SELECT fecha_tecmv::text AS fecha, documento_tecmv AS documento, monto_tecmv AS monto, signo_tecmv AS signo, saldo_tecmv AS saldo
         FROM tes_conciliacion_mov WHERE ide_tecnc = $1 ORDER BY fecha_tecmv, orden_tecmv, ide_tecmv`,
        [ideTecnc],
    );
    const movimientos = rows.map((r) => ({ ...r, descripcion: '', referencia: '', oficina: '' })) as MovimientoBanco[];
    const saldos = calcularSaldosCadena(movimientos);
    const ultima = rows.length > 0 ? rows[rows.length - 1].fecha : null;
    await client.query(
        `UPDATE tes_conciliacion SET saldo_inicial_banco_tecnc = $2, saldo_final_banco_tecnc = $3, fecha_ultimo_mov_tecnc = $4
         WHERE ide_tecnc = $1`,
        [ideTecnc, saldos.inicial, saldos.final, ultima],
    );
}
