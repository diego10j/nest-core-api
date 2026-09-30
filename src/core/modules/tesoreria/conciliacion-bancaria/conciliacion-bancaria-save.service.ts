import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';
import { v4 as uuid } from 'uuid';

import { ConciliacionBancariaService, ConciliacionCabecera, diaAnterior } from './conciliacion-bancaria.service';
import {
    ActualizarToleranciaDto, CargarArchivoDto, CerrarConciliacionDto, ConciliarManualDto,
    DesconciliarDto, MarcarMovimientosDto, SugerirDto,
} from './dto/conciliacion-bancaria.dto';
import { emparejarUnoAUno, ItemBanco, ItemErp, MatchPropuesto, sugerirPorSuma } from './matching';
import { EstadoCuentaParserService } from './parsers/estado-cuenta-parser.service';
import type { MovimientoBanco } from './parsers/estado-cuenta.types';
import { aCentavos, calcularSaldosCadena, deCentavos } from './parsers/parser-util';

const DIR_CONCILIACIONES = path.join(envs.pathDrive, 'tesoreria', 'conciliaciones');

/** Diferencia máxima (en centavos) que se acepta en una sugerencia de la IA antes de descartarla. */
const MAX_DIFERENCIA_IA = 500;
/** Cantidad máxima de movimientos por lado que se le envían a la IA en una consulta. */
const MAX_ITEMS_IA = 60;

export interface MovBancoFila {
    ide_tecmv: number;
    fecha_tecmv: string;
    documento_tecmv: string;
    descripcion_tecmv: string;
    referencia_tecmv: string;
    valor_signado: number;
    estado_tecmv: string;
}

export interface ErpFila {
    ide_teclb: number;
    fecha_trans_teclb: string;
    numero_teclb: string | null;
    num_comprobante_teclb: string | null;
    beneficiari_teclb: string | null;
    observacion_teclb: string | null;
    valor_signado: number;
}

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
function huellaMovimiento(m: MovimientoBanco, ocurrencia: number): string {
    const clave = [m.fecha, m.documento, m.signo * aCentavos(m.monto), m.saldo === null ? '' : aCentavos(m.saldo), ocurrencia].join('|');
    return createHash('sha1').update(clave).digest('hex');
}

const primerDiaMes = (anio: number, mes: number): string => `${anio}-${String(mes).padStart(2, '0')}-01`;
const ultimoDiaMes = (anio: number, mes: number): string => new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);

/** Escrituras de la conciliación bancaria: carga de archivos, cruces automáticos/manuales/IA, cierre. */
@Injectable()
export class ConciliacionBancariaSaveService {
    private readonly logger = new Logger(ConciliacionBancariaSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly consultas: ConciliacionBancariaService,
        private readonly parser: EstadoCuentaParserService,
        private readonly gpt: GptService,
    ) { }

    // ─── CARGA DE ARCHIVOS ───────────────────────────────────────────────────

    /**
     * Vista previa: lee el archivo SIN guardar nada y dice qué banco es, qué cuenta del ERP le
     * corresponde, qué periodo cubre y cuántos movimientos nuevos aportaría. Con ideTecba (elegida
     * a mano) calcula además cuántos movimientos ya estaban cargados en la conciliación del mes.
     */
    async analizarArchivo(buffer: Buffer, nombreOriginal: string, dtoIn: CargarArchivoDto & HeaderParamsDto) {
        const estado = await this.parser.leer(buffer, nombreOriginal);
        const cuentas = await this.consultas.getCuentasConciliables(dtoIn.ideEmpr, null);
        const candidatas = cuentas
            .filter((c) => coincideCuenta(estado.cuenta, c.nombre_tecba, c.observacion_tecba))
            .map((c) => ({ ...c, misma_sucursal: Number(c.ide_sucu) === Number(dtoIn.ideSucu) }));

        const desde = primerDiaMes(dtoIn.anio, dtoIn.mes);
        const hasta = ultimoDiaMes(dtoIn.anio, dtoIn.mes);
        const enMes = estado.movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
        const ideTecba = dtoIn.ideTecba ?? (candidatas.length === 1 ? Number(candidatas[0].ide_tecba) : null);

        let existente: { ide_tecnc: number; estado_tecnc: string; movimientos: number } | null = null;
        let nuevos = enMes.length;
        if (ideTecba) {
            const { rows } = await this.dataSource.pool.query(
                `SELECT n.ide_tecnc, n.estado_tecnc, (SELECT COUNT(*) FROM tes_conciliacion_mov m WHERE m.ide_tecnc = n.ide_tecnc) AS movimientos
                 FROM tes_conciliacion n
                 WHERE n.ide_tecba = $1 AND n.anio_tecnc = $2 AND n.mes_tecnc = $3 AND n.anulado_tecnc = false`,
                [ideTecba, dtoIn.anio, dtoIn.mes],
            );
            if (rows.length > 0) {
                existente = rows[0];
                const { rows: hashes } = await this.dataSource.pool.query(
                    'SELECT hash_tecmv FROM tes_conciliacion_mov WHERE ide_tecnc = $1', [rows[0].ide_tecnc],
                );
                const conocidos = new Set(hashes.map((h) => h.hash_tecmv));
                nuevos = this.conHuellas(enMes).filter((h) => !conocidos.has(h.hash)).length;
            }
        }

        const ingresos = enMes.filter((m) => m.signo === 1).reduce((s, m) => s + aCentavos(m.monto), 0);
        const egresos = enMes.filter((m) => m.signo === -1).reduce((s, m) => s + aCentavos(m.monto), 0);
        return {
            formato: estado.formato,
            cuentaArchivo: estado.cuenta,
            candidatas,
            ideTecbaSugerida: ideTecba,
            fechaDesde: estado.fechaDesde,
            fechaHasta: estado.fechaHasta,
            /** El mes que realmente cubren los movimientos, por si el usuario eligió otro. */
            mesDeLosMovimientos: estado.movimientos.length > 0
                ? { anio: Number(estado.movimientos[estado.movimientos.length - 1].fecha.slice(0, 4)), mes: Number(estado.movimientos[estado.movimientos.length - 1].fecha.slice(5, 7)) }
                : null,
            totalMovimientos: estado.movimientos.length,
            movimientosEnMes: enMes.length,
            fueraDePeriodo: estado.movimientos.length - enMes.length,
            nuevos,
            ingresos: deCentavos(ingresos),
            egresos: deCentavos(egresos),
            saldoInicial: estado.saldoInicial,
            saldoFinal: estado.saldoFinal,
            cadenaConsistente: estado.cadenaConsistente,
            existente,
            advertencias: estado.advertencias,
            vistaPrevia: enMes.slice(0, 8),
        };
    }

    /**
     * Carga un archivo del banco a la conciliación de (cuenta, mes), creándola si no existe. Si ya
     * existe se AGREGAN solo los movimientos nuevos (un corte posterior del mismo mes): los ya
     * cargados no se tocan y sus cruces se conservan. Luego recalcula los saldos del banco y corre
     * el cruce automático.
     */
    async cargarArchivo(
        file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
        dtoIn: CargarArchivoDto & HeaderParamsDto,
    ) {
        if (!dtoIn.ideTecba) throw new BadRequestException('Seleccione la cuenta bancaria del archivo.');
        const cuentas = await this.consultas.getCuentasConciliables(dtoIn.ideEmpr, dtoIn.ideSucu);
        const cuenta = cuentas.find((c) => Number(c.ide_tecba) === Number(dtoIn.ideTecba));
        if (!cuenta) {
            throw new BadRequestException('La cuenta no existe, está inactiva o pertenece a otra sucursal: cambie de sucursal para conciliarla.');
        }

        const estado = await this.parser.leer(file.buffer, file.originalname);
        if (estado.cuenta && !coincideCuenta(estado.cuenta, cuenta.nombre_tecba, cuenta.observacion_tecba)) {
            throw new BadRequestException(
                `El archivo es de la cuenta ${estado.cuenta} y la cuenta seleccionada es "${cuenta.nombre_tecba}". Verifique que sea la cuenta correcta.`,
            );
        }

        const desde = primerDiaMes(dtoIn.anio, dtoIn.mes);
        const hasta = ultimoDiaMes(dtoIn.anio, dtoIn.mes);
        const enMes = estado.movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
        if (enMes.length === 0) {
            throw new BadRequestException(
                `El archivo no tiene movimientos de ${String(dtoIn.mes).padStart(2, '0')}/${dtoIn.anio} (cubre del ${estado.fechaDesde} al ${estado.fechaHasta}).`,
            );
        }
        const advertencias = [...estado.advertencias];
        if (enMes.length < estado.movimientos.length) {
            advertencias.push(`${estado.movimientos.length - enMes.length} movimiento(s) del archivo son de otro mes y no se cargaron.`);
        }

        const sha256 = createHash('sha256').update(file.buffer).digest('hex');
        const client = await this.dataSource.pool.connect();
        let ideTecnc: number;
        let ideTecar: number;
        let nuevos = 0;
        let rutaGuardada: string | null = null;
        try {
            await client.query('BEGIN');

            const { rows: existentes } = await client.query(
                `SELECT ide_tecnc, estado_tecnc FROM tes_conciliacion
                 WHERE ide_tecba = $1 AND anio_tecnc = $2 AND mes_tecnc = $3 AND anulado_tecnc = false FOR UPDATE`,
                [dtoIn.ideTecba, dtoIn.anio, dtoIn.mes],
            );
            if (existentes.length > 0) {
                if (existentes[0].estado_tecnc === 'CERRADA') {
                    throw new BadRequestException('La conciliación de ese mes está CERRADA: reábrala para cargar otro archivo.');
                }
                ideTecnc = Number(existentes[0].ide_tecnc);
                const { rows: repetido } = await client.query(
                    'SELECT 1 FROM tes_conciliacion_archivo WHERE ide_tecnc = $1 AND sha256_tecar = $2', [ideTecnc, sha256],
                );
                if (repetido.length > 0) throw new BadRequestException('Este mismo archivo ya fue cargado en la conciliación.');
            } else {
                ideTecnc = await this.dataSource.getSeqTable('tes_conciliacion', 'ide_tecnc', 1, dtoIn.login);
                await client.query(
                    `INSERT INTO tes_conciliacion (ide_tecnc, ide_empr, ide_sucu, ide_tecba, anio_tecnc, mes_tecnc,
                        fecha_desde_tecnc, fecha_hasta_tecnc, tolerancia_dias_tecnc, usuario_ingre)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [ideTecnc, dtoIn.ideEmpr, cuenta.ide_sucu, dtoIn.ideTecba, dtoIn.anio,
                        dtoIn.mes, desde, hasta, dtoIn.toleranciaDias ?? 3, dtoIn.login],
                );
            }

            // Archivo físico: carpeta permanente del drive (temp_media se purga a los 90 días)
            const carpeta = path.join(DIR_CONCILIACIONES, String(dtoIn.ideTecba), `${dtoIn.anio}-${String(dtoIn.mes).padStart(2, '0')}`);
            await fs.promises.mkdir(carpeta, { recursive: true });
            const nombreArchivo = `${uuid()}${path.extname(file.originalname).toLowerCase()}`;
            rutaGuardada = path.join(carpeta, nombreArchivo);
            await fs.promises.writeFile(rutaGuardada, file.buffer);

            // Movimientos nuevos (los que ya estaban cargados se omiten por su huella)
            const { rows: hashesExistentes } = await client.query(
                'SELECT hash_tecmv FROM tes_conciliacion_mov WHERE ide_tecnc = $1', [ideTecnc],
            );
            const conocidos = new Set(hashesExistentes.map((h) => h.hash_tecmv));
            const conHuella = this.conHuellas(enMes);
            const aInsertar = conHuella.filter((h) => !conocidos.has(h.hash));
            nuevos = aInsertar.length;

            ideTecar = await this.dataSource.getSeqTable('tes_conciliacion_archivo', 'ide_tecar', 1, dtoIn.login);
            await client.query(
                `INSERT INTO tes_conciliacion_archivo (ide_tecar, ide_tecnc, nombre_original_tecar, nombre_archivo_tecar, mime_tecar,
                    tamano_tecar, sha256_tecar, formato_tecar, cuenta_detectada_tecar, fecha_desde_tecar, fecha_hasta_tecar,
                    saldo_inicial_tecar, saldo_final_tecar, num_movimientos_tecar, num_nuevos_tecar, num_duplicados_tecar,
                    advertencias_tecar, usuario_ingre)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [ideTecar, ideTecnc, file.originalname.slice(0, 255), path.relative(DIR_CONCILIACIONES, rutaGuardada).replace(/\\/g, '/'),
                    file.mimetype, file.size, sha256, estado.formato, estado.cuenta, estado.fechaDesde, estado.fechaHasta,
                    estado.saldoInicial, estado.saldoFinal, enMes.length, nuevos, enMes.length - nuevos,
                    advertencias.length ? advertencias.join('\n') : null, dtoIn.login],
            );

            if (aInsertar.length > 0) {
                const baseId = await this.dataSource.getSeqTable('tes_conciliacion_mov', 'ide_tecmv', aInsertar.length, dtoIn.login);
                await client.query(
                    `INSERT INTO tes_conciliacion_mov (ide_tecmv, ide_tecnc, ide_tecar, orden_tecmv, fecha_tecmv, documento_tecmv,
                        descripcion_tecmv, referencia_tecmv, oficina_tecmv, monto_tecmv, signo_tecmv, saldo_tecmv, hash_tecmv, usuario_ingre)
                     SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[], $4::int[], $5::date[], $6::text[], $7::text[],
                        $8::text[], $9::text[], $10::numeric[], $11::smallint[], $12::numeric[], $13::text[], $14::text[])`,
                    [
                        aInsertar.map((_m, i) => baseId + i),
                        aInsertar.map(() => ideTecnc),
                        aInsertar.map(() => ideTecar),
                        aInsertar.map((m) => m.orden),
                        aInsertar.map((m) => m.mov.fecha),
                        aInsertar.map((m) => m.mov.documento),
                        aInsertar.map((m) => m.mov.descripcion),
                        aInsertar.map((m) => m.mov.referencia),
                        aInsertar.map((m) => m.mov.oficina),
                        aInsertar.map((m) => m.mov.monto),
                        aInsertar.map((m) => m.mov.signo),
                        aInsertar.map((m) => m.mov.saldo),
                        aInsertar.map((m) => m.hash),
                        aInsertar.map(() => dtoIn.login),
                    ],
                );
            }

            await this.recalcularSaldosBanco(client, ideTecnc);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (rutaGuardada) await fs.promises.unlink(rutaGuardada).catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }

        const auto = await this.conciliarAutomatico(ideTecnc, dtoIn);
        return {
            message: nuevos > 0 ? `Archivo cargado: ${nuevos} movimiento(s) nuevo(s).` : 'El archivo no aportó movimientos nuevos.',
            ideTecnc,
            ideTecar,
            formato: estado.formato,
            movimientosArchivo: enMes.length,
            nuevos,
            duplicados: enMes.length - nuevos,
            conciliadosAutomaticamente: auto.conciliados,
            advertencias,
        };
    }

    /** Huellas de los movimientos (con el índice de ocurrencia de los idénticos) y su orden en el archivo. */
    private conHuellas(movimientos: MovimientoBanco[]) {
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
    private async recalcularSaldosBanco(client: Pick<PoolClient, 'query'>, ideTecnc: number) {
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

    // ─── CRUCES ──────────────────────────────────────────────────────────────

    /** Cruce automático 1 a 1 (documento, monto y fecha) de lo que esté pendiente. Se puede repetir sin riesgo. */
    async conciliarAutomatico(ideTecnc: number, headers: HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(ideTecnc, headers);
        this.consultas.assertAbierta(cabecera);

        const banco = await this.bancoPendiente(ideTecnc, ['PENDIENTE', 'FALTANTE']);
        const erp = await this.consultas.consultarErp(cabecera, true) as ErpFila[];
        const propuestas = emparejarUnoAUno(banco.map(this.aItemBanco), erp.map(this.aItemErp), cabecera.tolerancia_dias_tecnc);

        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            for (const p of propuestas) {
                await this.crearGrupo(client, cabecera, p.idsBanco, p.idsErp, 'AUTO', p.regla, p.confianza, null, headers.login);
            }
            await this.sincronizarSnapshot(client, cabecera);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }
        const resumen = await this.consultas.calcularResumen(await this.consultas.getCabecera(ideTecnc, headers));
        return {
            message: propuestas.length > 0 ? `${propuestas.length} cruce(s) automático(s).` : 'No se encontraron cruces automáticos nuevos.',
            conciliados: propuestas.length,
            ambiguos: propuestas.filter((p) => p.regla === 'MONTO_FECHA_AMBIGUO').length,
            resumen,
        };
    }

    /** Cruce manual (o aceptación de una sugerencia de la IA / de suma): N movimientos del banco con M del ERP. */
    async conciliarManual(dtoIn: ConciliarManualDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);

        const idsBanco = [...new Set(dtoIn.idsBanco)];
        const idsErp = [...new Set(dtoIn.idsErp)];
        const banco = (await this.bancoPendiente(dtoIn.ideTecnc, ['PENDIENTE', 'FALTANTE', 'IGNORADO'])).filter((b) => idsBanco.includes(Number(b.ide_tecmv)));
        if (banco.length !== idsBanco.length) {
            throw new BadRequestException('Algún movimiento del banco no existe en esta conciliación o ya está conciliado.');
        }
        const erp = (await this.consultas.consultarErp(cabecera, true) as ErpFila[]).filter((e) => idsErp.includes(Number(e.ide_teclb)));
        if (erp.length !== idsErp.length) {
            throw new BadRequestException('Algún movimiento del ERP no está disponible: ya está conciliado o no es de esta cuenta/periodo.');
        }

        const totalBanco = banco.reduce((s, b) => s + aCentavos(b.valor_signado), 0);
        const totalErp = erp.reduce((s, e) => s + aCentavos(e.valor_signado), 0);
        const diferencia = totalBanco - totalErp;
        if (diferencia !== 0) {
            if (!dtoIn.permitirDiferencia) {
                throw new BadRequestException(
                    `Los montos no coinciden: banco ${deCentavos(totalBanco).toFixed(2)} vs ERP ${deCentavos(totalErp).toFixed(2)} (diferencia ${deCentavos(diferencia).toFixed(2)}).`,
                );
            }
            if (!dtoIn.observacion?.trim()) {
                throw new BadRequestException('Para conciliar con diferencia debe indicar una observación que la justifique.');
            }
        }

        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            await this.crearGrupo(client, cabecera, idsBanco, idsErp, dtoIn.tipo ?? 'MANUAL', dtoIn.regla ?? null, dtoIn.confianza ?? null,
                dtoIn.observacion?.trim() || null, dtoIn.login);
            await this.sincronizarSnapshot(client, cabecera);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            if ((e as { code?: string }).code === '23505') {
                throw new BadRequestException('Algún movimiento del ERP ya fue conciliado por otro usuario.');
            }
            throw e;
        } finally {
            client.release();
        }
        return { message: 'Movimientos conciliados.', diferencia: deCentavos(diferencia) };
    }

    /** Deshace el cruce completo (grupo) al que pertenece un movimiento del banco. */
    async desconciliar(dtoIn: DesconciliarDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);

        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows: grupo } = await client.query(
                `SELECT grupo_tecmt FROM tes_conciliacion_match WHERE ide_tecnc = $1 AND ide_tecmv = $2 AND activo_tecmt = true LIMIT 1`,
                [dtoIn.ideTecnc, dtoIn.ideTecmv],
            );
            if (grupo.length === 0) throw new BadRequestException('El movimiento no está conciliado.');
            const { rows: filas } = await client.query(
                `UPDATE tes_conciliacion_match SET activo_tecmt = false, usuario_desconcilia = $2, hora_desconcilia = NOW()
                 WHERE grupo_tecmt = $1 AND activo_tecmt = true RETURNING ide_tecmv, ide_teclb`,
                [grupo[0].grupo_tecmt, dtoIn.login],
            );
            await client.query(
                `UPDATE tes_conciliacion_mov SET estado_tecmv = 'PENDIENTE', usuario_actua = $2, hora_actua = NOW()
                 WHERE ide_tecmv = ANY($1::bigint[])`,
                [filas.map((f) => f.ide_tecmv), dtoIn.login],
            );
            await this.marcarLibro(client, filas.map((f) => f.ide_teclb), false, null, dtoIn.login);
            await this.sincronizarSnapshot(client, cabecera);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }
        return { message: 'Cruce deshecho.' };
    }

    /** Marca movimientos del banco sin cruce como FALTANTE en el ERP, IGNORADO o de vuelta a PENDIENTE. */
    async marcarMovimientos(dtoIn: MarcarMovimientosDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);
        const res = await this.dataSource.pool.query(
            `UPDATE tes_conciliacion_mov SET estado_tecmv = $3, nota_tecmv = $4, usuario_actua = $5, hora_actua = NOW()
             WHERE ide_tecnc = $1 AND ide_tecmv = ANY($2::bigint[]) AND estado_tecmv <> 'CONCILIADO'`,
            [dtoIn.ideTecnc, dtoIn.idsBanco, dtoIn.estado, dtoIn.nota?.trim() || null, dtoIn.login],
        );
        return { message: `${res.rowCount} movimiento(s) marcado(s) como ${dtoIn.estado}.`, actualizados: res.rowCount };
    }

    async actualizarTolerancia(dtoIn: ActualizarToleranciaDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);
        await this.dataSource.pool.query(
            'UPDATE tes_conciliacion SET tolerancia_dias_tecnc = $2, usuario_actua = $3, hora_actua = NOW() WHERE ide_tecnc = $1',
            [dtoIn.ideTecnc, Math.round(dtoIn.toleranciaDias), dtoIn.login],
        );
        return { message: 'Tolerancia actualizada.' };
    }

    // ─── SUGERENCIAS (SUMA + IA) ─────────────────────────────────────────────

    /**
     * Sugiere cruces para lo que el automático no resolvió. Siempre calcula los cruces por SUMA
     * (uno contra varios); con `usarIa` además le pide a GPT proponer cruces por beneficiario /
     * concepto / diferencias pequeñas. NADA se aplica solo: el contador acepta cada sugerencia
     * (POST conciliarManual con tipo IA), y toda sugerencia de la IA se valida aquí (ids reales,
     * sin repetir, mismo signo y diferencia acotada) antes de mostrarla.
     */
    async sugerir(dtoIn: SugerirDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        const banco = await this.bancoPendiente(dtoIn.ideTecnc, ['PENDIENTE', 'FALTANTE']);
        const erp = await this.consultas.consultarErp(cabecera, true) as ErpFila[];
        const itemsBanco = banco.map(this.aItemBanco);
        const itemsErp = erp.map(this.aItemErp);

        const propuestas: Array<MatchPropuesto & { origen: string; motivo?: string }> = sugerirPorSuma(itemsBanco, itemsErp, cabecera.tolerancia_dias_tecnc)
            .map((p) => ({ ...p, origen: 'SUMA' }));

        let aviso: string | null = null;
        if (dtoIn.usarIa) {
            const usadosBanco = new Set(propuestas.flatMap((p) => p.idsBanco));
            const usadosErp = new Set(propuestas.flatMap((p) => p.idsErp));
            const restoBanco = banco.filter((b) => !usadosBanco.has(Number(b.ide_tecmv)));
            const restoErp = erp.filter((e) => !usadosErp.has(Number(e.ide_teclb)));
            if (restoBanco.length > 0 && restoErp.length > 0) {
                try {
                    const { validas, truncado } = await this.sugerirConIa(restoBanco, restoErp);
                    propuestas.push(...validas);
                    if (truncado) aviso = `Se analizaron solo los primeros ${MAX_ITEMS_IA} movimientos de cada lado; repita después de conciliar los primeros.`;
                } catch (e) {
                    this.logger.warn(`Sugerencias con IA fallaron: ${(e as Error).message}`);
                    aviso = 'No se pudo consultar a la IA en este momento; se muestran solo las sugerencias por suma.';
                }
            }
        }

        const bancoPorId = new Map(banco.map((b) => [Number(b.ide_tecmv), b]));
        const erpPorId = new Map(erp.map((e) => [Number(e.ide_teclb), e]));
        return {
            aviso,
            sugerencias: propuestas.map((p) => {
                const totalBanco = p.idsBanco.reduce((s, id) => s + aCentavos(bancoPorId.get(id)?.valor_signado), 0);
                const totalErp = p.idsErp.reduce((s, id) => s + aCentavos(erpPorId.get(id)?.valor_signado), 0);
                return {
                    ...p,
                    totalBanco: deCentavos(totalBanco),
                    totalErp: deCentavos(totalErp),
                    diferencia: deCentavos(totalBanco - totalErp),
                    movimientosBanco: p.idsBanco.map((id) => bancoPorId.get(id)),
                    movimientosErp: p.idsErp.map((id) => erpPorId.get(id)),
                };
            }),
        };
    }

    private async sugerirConIa(banco: MovBancoFila[], erp: ErpFila[]) {
        const truncado = banco.length > MAX_ITEMS_IA || erp.length > MAX_ITEMS_IA;
        const b = banco.slice(0, MAX_ITEMS_IA);
        const e = erp.slice(0, MAX_ITEMS_IA);
        const prompt = `
Eres un contador que concilia un estado de cuenta bancario contra el libro de bancos de un ERP en Ecuador (USD).
Recibirás dos listas de movimientos SIN cruzar: "banco" y "erp". Los valores son con signo (ingreso +, egreso -).
Propón cruces entre ambas listas. Reglas:
- Un cruce es {"idsBanco":[...],"idsErp":[...]}: normalmente 1 a 1; puede ser varios de un lado contra uno del otro si SUMAN lo mismo.
- Solo cruza movimientos del MISMO signo. La suma del banco debe ser igual a la del ERP; se tolera una diferencia de hasta 5.00 USD solo si el beneficiario/concepto coincide claramente (ej. comisiones).
- Apóyate en: nombre del ordenante/beneficiario en descripcion/referencia del banco vs beneficiario/observacion del ERP, números de documento/comprobante, y cercanía de fechas (hasta ~10 días).
- NO inventes ids: usa solo los que aparecen. Un id no puede estar en más de un cruce.
- Si no estás razonablemente seguro, NO propongas el cruce. Mejor pocos y buenos.
Responde SOLO un JSON: {"sugerencias":[{"idsBanco":[number],"idsErp":[number],"confianza":number (0-100),"motivo":"breve, en español"}]}
`;
        const datos = JSON.stringify({
            banco: b.map((m) => ({ id: Number(m.ide_tecmv), fecha: m.fecha_tecmv, documento: m.documento_tecmv, descripcion: m.descripcion_tecmv, referencia: m.referencia_tecmv, valor: m.valor_signado })),
            erp: e.map((m) => ({ id: Number(m.ide_teclb), fecha: m.fecha_trans_teclb, numero: m.numero_teclb, comprobante: m.num_comprobante_teclb, beneficiario: m.beneficiari_teclb, observacion: m.observacion_teclb, valor: m.valor_signado })),
        });
        const respuesta = await this.gpt.parseTextToJson(prompt, datos);

        const bancoPorId = new Map(b.map((m) => [Number(m.ide_tecmv), aCentavos(m.valor_signado)]));
        const erpPorId = new Map(e.map((m) => [Number(m.ide_teclb), aCentavos(m.valor_signado)]));
        const usadosBanco = new Set<number>();
        const usadosErp = new Set<number>();
        const validas: Array<MatchPropuesto & { origen: string; motivo?: string }> = [];
        for (const s of Array.isArray(respuesta?.sugerencias) ? respuesta.sugerencias : []) {
            const idsBanco: number[] = [...new Set<number>((s.idsBanco ?? []).map(Number))];
            const idsErp: number[] = [...new Set<number>((s.idsErp ?? []).map(Number))];
            if (idsBanco.length === 0 || idsErp.length === 0) continue;
            if (!idsBanco.every((id) => bancoPorId.has(id) && !usadosBanco.has(id))) continue;
            if (!idsErp.every((id) => erpPorId.has(id) && !usadosErp.has(id))) continue;
            const totalBanco = idsBanco.reduce((sum, id) => sum + (bancoPorId.get(id) ?? 0), 0);
            const totalErp = idsErp.reduce((sum, id) => sum + (erpPorId.get(id) ?? 0), 0);
            if (Math.sign(totalBanco) !== Math.sign(totalErp) || Math.abs(totalBanco - totalErp) > MAX_DIFERENCIA_IA) continue;
            idsBanco.forEach((id) => usadosBanco.add(id));
            idsErp.forEach((id) => usadosErp.add(id));
            validas.push({
                idsBanco, idsErp, regla: 'IA', origen: 'IA',
                confianza: Math.max(0, Math.min(100, Math.round(Number(s.confianza) || 50))),
                motivo: typeof s.motivo === 'string' ? s.motivo.slice(0, 300) : undefined,
            });
        }
        return { validas, truncado };
    }

    // ─── CIERRE / ANULACIÓN ──────────────────────────────────────────────────

    async cerrar(dtoIn: CerrarConciliacionDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);
        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            await this.sincronizarSnapshot(client, cabecera);
            await client.query(
                `UPDATE tes_conciliacion SET estado_tecnc = 'CERRADA', usuario_cierre = $2, fecha_cierre_tecnc = NOW(),
                        observacion_tecnc = COALESCE($3, observacion_tecnc), usuario_actua = $2, hora_actua = NOW()
                 WHERE ide_tecnc = $1`,
                [dtoIn.ideTecnc, dtoIn.login, dtoIn.observacion?.trim() || null],
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }
        return { message: 'Conciliación cerrada.' };
    }

    async reabrir(dtoIn: { ideTecnc: number } & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        if (cabecera.estado_tecnc !== 'CERRADA') throw new BadRequestException('La conciliación ya está abierta.');
        await this.dataSource.pool.query(
            `UPDATE tes_conciliacion SET estado_tecnc = 'ABIERTA', usuario_cierre = NULL, fecha_cierre_tecnc = NULL,
                    usuario_actua = $2, hora_actua = NOW() WHERE ide_tecnc = $1`,
            [dtoIn.ideTecnc, dtoIn.login],
        );
        return { message: 'Conciliación reabierta.' };
    }

    /** Anula la conciliación: libera todos los cruces (el libro de bancos vuelve a no conciliado) y permite volver a crearla. */
    async anular(dtoIn: { ideTecnc: number } & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);
        const client = await this.dataSource.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `UPDATE tes_conciliacion_match SET activo_tecmt = false, usuario_desconcilia = $2, hora_desconcilia = NOW()
                 WHERE ide_tecnc = $1 AND activo_tecmt = true RETURNING ide_teclb`,
                [dtoIn.ideTecnc, dtoIn.login],
            );
            await this.marcarLibro(client, rows.map((r) => r.ide_teclb), false, null, dtoIn.login);
            await client.query(
                'UPDATE tes_conciliacion SET anulado_tecnc = true, usuario_actua = $2, hora_actua = NOW() WHERE ide_tecnc = $1',
                [dtoIn.ideTecnc, dtoIn.login],
            );
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }
        return { message: 'Conciliación anulada.' };
    }

    // ─── INTERNOS ────────────────────────────────────────────────────────────

    private aItemBanco = (m: MovBancoFila): ItemBanco => ({
        id: Number(m.ide_tecmv), fecha: m.fecha_tecmv, documento: m.documento_tecmv ?? '', centavos: aCentavos(m.valor_signado),
    });

    private aItemErp = (e: ErpFila): ItemErp => ({
        id: Number(e.ide_teclb), fecha: e.fecha_trans_teclb, numero: e.numero_teclb ?? '', comprobante: e.num_comprobante_teclb ?? '', centavos: aCentavos(e.valor_signado),
    });

    private async bancoPendiente(ideTecnc: number, estados: string[]): Promise<MovBancoFila[]> {
        const { rows } = await this.dataSource.pool.query(
            `SELECT ide_tecmv, fecha_tecmv::text AS fecha_tecmv, documento_tecmv, descripcion_tecmv, referencia_tecmv,
                    monto_tecmv * signo_tecmv AS valor_signado, estado_tecmv
             FROM tes_conciliacion_mov WHERE ide_tecnc = $1 AND estado_tecmv = ANY($2::text[])
             ORDER BY fecha_tecmv, orden_tecmv`,
            [ideTecnc, estados],
        );
        return rows;
    }

    /**
     * Inserta un cruce (grupo) y sincroniza los dos lados. Filas del match = max(N, M) para que cada
     * movimiento aparezca al menos una vez sin repetir ningún par (banco[i mod N], erp[i mod M]).
     */
    private async crearGrupo(
        client: Pick<PoolClient, 'query'>,
        cabecera: ConciliacionCabecera,
        idsBanco: number[],
        idsErp: number[],
        tipo: string,
        regla: string | null,
        confianza: number | null,
        observacion: string | null,
        login: string,
    ) {
        const filas = Math.max(idsBanco.length, idsErp.length);
        const base = await this.dataSource.getSeqTable('tes_conciliacion_match', 'ide_tecmt', filas, login);
        const pares = Array.from({ length: filas }, (_v, i) => ({
            ide_tecmt: base + i, ide_tecmv: idsBanco[i % idsBanco.length], ide_teclb: idsErp[i % idsErp.length],
        }));
        await client.query(
            `INSERT INTO tes_conciliacion_match (ide_tecmt, ide_tecnc, ide_tecmv, ide_teclb, grupo_tecmt, tipo_tecmt, regla_tecmt,
                confianza_tecmt, observacion_tecmt, usuario_ingre)
             SELECT t.ide_tecmt, $1, t.ide_tecmv, t.ide_teclb, $2, $3, $4, $5, $6, $7
             FROM UNNEST($8::bigint[], $9::bigint[], $10::bigint[]) AS t(ide_tecmt, ide_tecmv, ide_teclb)`,
            [cabecera.ide_tecnc, base, tipo, regla, confianza, observacion, login,
                pares.map((p) => p.ide_tecmt), pares.map((p) => p.ide_tecmv), pares.map((p) => p.ide_teclb)],
        );
        const { rows } = await client.query(
            `UPDATE tes_conciliacion_mov SET estado_tecmv = 'CONCILIADO', usuario_actua = $2, hora_actua = NOW()
             WHERE ide_tecmv = ANY($1::bigint[]) RETURNING fecha_tecmv::text AS fecha`,
            [idsBanco, login],
        );
        // fecha_concilia_teclb = cuándo el banco lo acreditó (la última fecha del grupo)
        const fechaConcilia = rows.map((r) => r.fecha as string).sort().pop() ?? null;
        await this.marcarLibro(client, idsErp, true, fechaConcilia, login);
    }

    /** Mantiene tes_cab_libr_banc.conciliado_teclb / fecha_concilia_teclb para las pantallas y reportes que ya los usan. */
    private async marcarLibro(
        client: Pick<PoolClient, 'query'>,
        idsTeclb: number[], conciliado: boolean, fecha: string | null, login: string,
    ) {
        if (idsTeclb.length === 0) return;
        await client.query(
            `UPDATE tes_cab_libr_banc SET conciliado_teclb = $2, fecha_concilia_teclb = $3, usuario_actua = $4,
                    fecha_actua = $5, hora_actua = $6
             WHERE ide_teclb = ANY($1::bigint[])`,
            [idsTeclb, conciliado, fecha, login, getCurrentDate(), getCurrentTime()],
        );
    }

    /** Foto de los saldos del ERP en la cabecera (para el listado/tablero sin recalcular cada fila). */
    private async sincronizarSnapshot(client: Pick<PoolClient, 'query'>, cabecera: ConciliacionCabecera) {
        const [inicial, final] = await Promise.all([
            this.consultas.getSaldoErp(cabecera.ide_tecba, diaAnterior(cabecera.fecha_desde_tecnc)),
            this.consultas.getSaldoErp(cabecera.ide_tecba, cabecera.fecha_hasta_tecnc),
        ]);
        await client.query(
            'UPDATE tes_conciliacion SET saldo_inicial_erp_tecnc = $2, saldo_final_erp_tecnc = $3 WHERE ide_tecnc = $1',
            [cabecera.ide_tecnc, inicial, final],
        );
    }
}
