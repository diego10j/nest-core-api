import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { GptService } from 'src/core/integration/gpt/gpt.service';
import { v4 as uuid } from 'uuid';

import {
    coincideCuenta, conHuellas, DIR_CONCILIACIONES, primerDiaMes, recalcularSaldosBanco, ultimoDiaMes,
} from './carga-util';
import { ConciliacionBancariaSaveService } from './conciliacion-bancaria-save.service';
import { ConciliacionBancariaService, ConciliacionCabecera } from './conciliacion-bancaria.service';
import { CargarArchivoDto, CrearConciliacionDto } from './dto/conciliacion-bancaria.dto';
import { EstadoCuentaLeido, EstadoCuentaParserService } from './parsers/estado-cuenta-parser.service';
import { aCentavos, calcularSaldosCadena, deCentavos } from './parsers/parser-util';

export type NivelValidacion = 'ERROR' | 'ADVERTENCIA' | 'INFO' | 'OK';

export interface Validacion {
    nivel: NivelValidacion;
    codigo: string;
    texto: string;
}

/** Tiempo máximo que se espera a la IA en la validación del archivo (no debe frenar la carga). */
const TIMEOUT_IA_MS = 25_000;

const fechaLarga = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Flujo de CARGA de estados de cuenta (pantalla "Carga de Estados de Cuenta"), separado del trabajo de
 * conciliar:
 *  1. crearConciliacion: se crea cuenta + mes (todavía sin archivo).
 *  2. analizarArchivo: se lee el archivo SIN guardar y se valida contra la conciliación creada — cuenta,
 *     mes, continuidad de saldos, duplicados y, aparte, una verificación con IA. Devuelve errores (bloquean),
 *     advertencias (se pueden aceptar) y la vista previa de los movimientos.
 *  3. cargarArchivo: repite las validaciones deterministas (nunca se confía en el front) y guarda el
 *     original + los movimientos. El cruce lo corre después quien concilia (o `procesar`).
 */
@Injectable()
export class CargaEstadosCuentaService {
    private readonly logger = new Logger(CargaEstadosCuentaService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly consultas: ConciliacionBancariaService,
        private readonly parser: EstadoCuentaParserService,
        private readonly gpt: GptService,
        private readonly saveService: ConciliacionBancariaSaveService,
    ) { }

    // ─── 1. CREAR ────────────────────────────────────────────────────────────

    async crearConciliacion(dtoIn: CrearConciliacionDto & HeaderParamsDto) {
        const cuentas = await this.consultas.getCuentasConciliables(dtoIn.ideEmpr, dtoIn.ideSucu);
        const cuenta = cuentas.find((c) => Number(c.ide_tecba) === Number(dtoIn.ideTecba));
        if (!cuenta) {
            throw new BadRequestException('La cuenta no existe, está inactiva o pertenece a otra sucursal: cambie de sucursal para conciliarla.');
        }
        const hoy = new Date();
        if (dtoIn.anio * 12 + dtoIn.mes > hoy.getFullYear() * 12 + hoy.getMonth() + 1) {
            throw new BadRequestException('No se puede crear la conciliación de un mes futuro.');
        }

        const { rows: existentes } = await this.dataSource.pool.query(
            `SELECT ide_tecnc, estado_tecnc FROM tes_conciliacion
             WHERE ide_tecba = $1 AND anio_tecnc = $2 AND mes_tecnc = $3 AND anulado_tecnc = false`,
            [dtoIn.ideTecba, dtoIn.anio, dtoIn.mes],
        );
        if (existentes.length > 0) {
            throw new BadRequestException(
                `Ya existe la conciliación de "${cuenta.nombre_tecba}" para ${String(dtoIn.mes).padStart(2, '0')}/${dtoIn.anio} (${existentes[0].estado_tecnc}). Úsela, o anúlela primero si necesita rehacerla.`,
            );
        }

        const ideTecnc = await this.dataSource.getSeqTable('tes_conciliacion', 'ide_tecnc', 1, dtoIn.login);
        await this.dataSource.pool.query(
            `INSERT INTO tes_conciliacion (ide_tecnc, ide_empr, ide_sucu, ide_tecba, anio_tecnc, mes_tecnc,
                fecha_desde_tecnc, fecha_hasta_tecnc, tolerancia_dias_tecnc, usuario_ingre)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [ideTecnc, dtoIn.ideEmpr, cuenta.ide_sucu, dtoIn.ideTecba, dtoIn.anio, dtoIn.mes,
                primerDiaMes(dtoIn.anio, dtoIn.mes), ultimoDiaMes(dtoIn.anio, dtoIn.mes), dtoIn.toleranciaDias ?? 3, dtoIn.login],
        );
        return { message: 'Conciliación creada. Ahora cargue el estado de cuenta del banco.', ideTecnc };
    }

    // ─── 2. ANALIZAR (vista previa + validaciones) ───────────────────────────

    async analizarArchivo(buffer: Buffer, nombreOriginal: string, dtoIn: CargarArchivoDto & HeaderParamsDto) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);
        const cuenta = await this.cuentaDe(cabecera, dtoIn);
        const evaluacion = await this.evaluar(buffer, nombreOriginal, cabecera, cuenta);

        const validaciones = [...evaluacion.validaciones];
        if (dtoIn.validarConIa !== false && !validaciones.some((v) => v.nivel === 'ERROR')) {
            const ia = await this.validarConIa(evaluacion.estado, cabecera, cuenta, nombreOriginal, evaluacion.enMes.length);
            if (ia) validaciones.push(ia);
        }
        const { estado, enMes } = evaluacion;
        const ingresos = enMes.filter((m) => m.signo === 1).reduce((s, m) => s + aCentavos(m.monto), 0);
        const egresos = enMes.filter((m) => m.signo === -1).reduce((s, m) => s + aCentavos(m.monto), 0);
        return {
            conciliacion: {
                ide_tecnc: cabecera.ide_tecnc,
                nombre_tecba: cabecera.nombre_tecba,
                nombre_teban: cabecera.nombre_teban,
                anio: cabecera.anio_tecnc,
                mes: cabecera.mes_tecnc,
                movimientosCargados: evaluacion.movimientosExistentes,
            },
            formato: estado.formato,
            cuentaArchivo: estado.cuenta,
            fechaDesde: estado.fechaDesde,
            fechaHasta: estado.fechaHasta,
            totalMovimientos: estado.movimientos.length,
            movimientosEnMes: enMes.length,
            fueraDePeriodo: estado.movimientos.length - enMes.length,
            nuevos: evaluacion.nuevos,
            ingresos: deCentavos(ingresos),
            egresos: deCentavos(egresos),
            saldoInicial: evaluacion.saldos.inicial,
            saldoFinal: evaluacion.saldos.final,
            cadenaConsistente: evaluacion.saldos.consistente,
            validaciones,
            puedeCargar: !validaciones.some((v) => v.nivel === 'ERROR'),
            hayAdvertencias: validaciones.some((v) => v.nivel === 'ADVERTENCIA'),
            vistaPrevia: enMes.slice(0, 8),
        };
    }

    // ─── 3. CARGAR ───────────────────────────────────────────────────────────

    async cargarArchivo(
        file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
        dtoIn: CargarArchivoDto & HeaderParamsDto,
    ) {
        const cabecera = await this.consultas.getCabecera(dtoIn.ideTecnc, dtoIn);
        this.consultas.assertAbierta(cabecera);
        const cuenta = await this.cuentaDe(cabecera, dtoIn);
        const evaluacion = await this.evaluar(file.buffer, file.originalname, cabecera, cuenta);
        const errores = evaluacion.validaciones.filter((v) => v.nivel === 'ERROR');
        if (errores.length > 0) throw new BadRequestException(errores.map((e) => e.texto).join(' '));

        const { estado, enMes } = evaluacion;
        const advertencias = evaluacion.validaciones.filter((v) => v.nivel === 'ADVERTENCIA').map((v) => v.texto);
        const sha256 = createHash('sha256').update(file.buffer).digest('hex');
        const client = await this.dataSource.pool.connect();
        let ideTecar: number;
        let nuevos = 0;
        let rutaGuardada: string | null = null;
        try {
            await client.query('BEGIN');
            // Bloquea la conciliación mientras se cargan los movimientos (dos cargas a la vez no se pisan)
            await client.query('SELECT 1 FROM tes_conciliacion WHERE ide_tecnc = $1 FOR UPDATE', [cabecera.ide_tecnc]);

            // Archivo físico: carpeta permanente del drive (temp_media se purga a los 90 días)
            const carpeta = path.join(DIR_CONCILIACIONES, String(cabecera.ide_tecba), `${cabecera.anio_tecnc}-${String(cabecera.mes_tecnc).padStart(2, '0')}`);
            await fs.promises.mkdir(carpeta, { recursive: true });
            const nombreArchivo = `${uuid()}${path.extname(file.originalname).toLowerCase()}`;
            rutaGuardada = path.join(carpeta, nombreArchivo);
            await fs.promises.writeFile(rutaGuardada, file.buffer);

            // Movimientos nuevos (los que ya estaban cargados se omiten por su huella)
            const { rows: hashesExistentes } = await client.query(
                'SELECT hash_tecmv FROM tes_conciliacion_mov WHERE ide_tecnc = $1', [cabecera.ide_tecnc],
            );
            const conocidos = new Set(hashesExistentes.map((h) => h.hash_tecmv));
            const aInsertar = conHuellas(enMes).filter((h) => !conocidos.has(h.hash));
            nuevos = aInsertar.length;

            ideTecar = await this.dataSource.getSeqTable('tes_conciliacion_archivo', 'ide_tecar', 1, dtoIn.login);
            await client.query(
                `INSERT INTO tes_conciliacion_archivo (ide_tecar, ide_tecnc, nombre_original_tecar, nombre_archivo_tecar, mime_tecar,
                    tamano_tecar, sha256_tecar, formato_tecar, cuenta_detectada_tecar, fecha_desde_tecar, fecha_hasta_tecar,
                    saldo_inicial_tecar, saldo_final_tecar, num_movimientos_tecar, num_nuevos_tecar, num_duplicados_tecar,
                    advertencias_tecar, usuario_ingre)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
                [ideTecar, cabecera.ide_tecnc, file.originalname.slice(0, 255), path.relative(DIR_CONCILIACIONES, rutaGuardada).replace(/\\/g, '/'),
                    file.mimetype, file.size, sha256, estado.formato, estado.cuenta, estado.fechaDesde, estado.fechaHasta,
                    evaluacion.saldos.inicial, evaluacion.saldos.final, enMes.length, nuevos, enMes.length - nuevos,
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
                        aInsertar.map(() => cabecera.ide_tecnc),
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

            await recalcularSaldosBanco(client, cabecera.ide_tecnc);
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            if (rutaGuardada) await fs.promises.unlink(rutaGuardada).catch(() => undefined);
            throw e;
        } finally {
            client.release();
        }

        // La pantalla de carga solo sube el archivo; el cruce lo corre después quien concilia
        const auto = dtoIn.procesar ? await this.saveService.conciliarAutomatico(cabecera.ide_tecnc, dtoIn) : { conciliados: 0 };
        return {
            message: `Archivo cargado: ${nuevos} movimiento(s) nuevo(s).`,
            ideTecnc: cabecera.ide_tecnc,
            ideTecar,
            formato: estado.formato,
            movimientosArchivo: enMes.length,
            nuevos,
            duplicados: enMes.length - nuevos,
            conciliadosAutomaticamente: auto.conciliados,
            advertencias,
        };
    }

    // ─── VALIDACIONES ────────────────────────────────────────────────────────

    private async cuentaDe(cabecera: ConciliacionCabecera, headers: HeaderParamsDto) {
        const cuentas = await this.consultas.getCuentasConciliables(headers.ideEmpr, headers.ideSucu);
        const cuenta = cuentas.find((c) => Number(c.ide_tecba) === Number(cabecera.ide_tecba));
        if (!cuenta) {
            throw new BadRequestException('Esta conciliación es de una cuenta de otra sucursal: cambie de sucursal para cargarle archivos.');
        }
        return cuenta;
    }

    /** Validaciones deterministas del archivo contra la conciliación (las mismas al analizar y al cargar). */
    private async evaluar(
        buffer: Buffer,
        nombreOriginal: string,
        cabecera: ConciliacionCabecera,
        cuenta: { nombre_tecba: string; observacion_tecba: string | null },
    ) {
        const estado = await this.parser.leer(buffer, nombreOriginal);
        const validaciones: Validacion[] = [{ nivel: 'OK', codigo: 'FORMATO', texto: `Formato reconocido: ${estado.formato}.` }];
        const mm = String(cabecera.mes_tecnc).padStart(2, '0');
        const etiquetaMes = `${mm}/${cabecera.anio_tecnc}`;
        const desde = primerDiaMes(cabecera.anio_tecnc, cabecera.mes_tecnc);
        const hasta = ultimoDiaMes(cabecera.anio_tecnc, cabecera.mes_tecnc);

        // Cuenta
        if (estado.cuenta) {
            if (coincideCuenta(estado.cuenta, cuenta.nombre_tecba, cuenta.observacion_tecba)) {
                validaciones.push({ nivel: 'OK', codigo: 'CUENTA', texto: `La cuenta del archivo (${estado.cuenta}) corresponde a "${cuenta.nombre_tecba}".` });
            } else {
                validaciones.push({
                    nivel: 'ERROR', codigo: 'CUENTA',
                    texto: `El archivo es de la cuenta ${estado.cuenta} y esta conciliación es de "${cuenta.nombre_tecba}". Verifique que sea el archivo de la cuenta correcta.`,
                });
            }
        } else {
            validaciones.push({
                nivel: 'ADVERTENCIA', codigo: 'CUENTA',
                texto: 'El archivo no trae el número de cuenta: no se pudo verificar que sea de esta cuenta. Revise la vista previa.',
            });
        }

        // Periodo
        const enMes = estado.movimientos.filter((m) => m.fecha >= desde && m.fecha <= hasta);
        const fuera = estado.movimientos.length - enMes.length;
        if (enMes.length === 0) {
            validaciones.push({
                nivel: 'ERROR', codigo: 'PERIODO',
                texto: `El archivo no tiene movimientos de ${etiquetaMes}: cubre del ${estado.fechaDesde ? fechaLarga(estado.fechaDesde) : '?'} al ${estado.fechaHasta ? fechaLarga(estado.fechaHasta) : '?'}. Parece de otro mes.`,
            });
        } else {
            if (fuera > 0) {
                validaciones.push({
                    nivel: 'ADVERTENCIA', codigo: 'PERIODO',
                    texto: `${fuera} de ${estado.movimientos.length} movimientos del archivo son de otro mes y no se cargarán (esta conciliación es de ${etiquetaMes}).`,
                });
            } else {
                validaciones.push({ nivel: 'OK', codigo: 'PERIODO', texto: `Todos los movimientos son de ${etiquetaMes}.` });
            }
            const ultima = enMes[enMes.length - 1].fecha;
            if (ultima < hasta && diasHasta(ultima, hasta) > 3) {
                validaciones.push({
                    nivel: 'INFO', codigo: 'COBERTURA',
                    texto: `Corte parcial: los movimientos llegan hasta el ${fechaLarga(ultima)} y el mes termina el ${fechaLarga(hasta)}. Podrá agregar otro corte después.`,
                });
            }
        }

        const saldos = calcularSaldosCadena(enMes);
        if (enMes.length > 0 && saldos.inicial !== null && !saldos.consistente) {
            validaciones.push({
                nivel: 'ADVERTENCIA', codigo: 'SALDOS',
                texto: 'Los saldos del archivo no encadenan entre sí (faltan movimientos, hay repetidos o el banco aplicó un ajuste que no lista).',
            });
        }
        estado.advertencias
            .filter((a) => !a.startsWith('Los saldos del archivo no encadenan'))
            .forEach((a) => validaciones.push({ nivel: 'ADVERTENCIA', codigo: 'ARCHIVO', texto: a }));

        // Duplicados: el mismo archivo y movimientos nuevos
        const sha256 = createHash('sha256').update(buffer).digest('hex');
        const [{ rows: repetido }, { rows: hashes }] = await Promise.all([
            this.dataSource.pool.query('SELECT 1 FROM tes_conciliacion_archivo WHERE ide_tecnc = $1 AND sha256_tecar = $2', [cabecera.ide_tecnc, sha256]),
            this.dataSource.pool.query('SELECT hash_tecmv FROM tes_conciliacion_mov WHERE ide_tecnc = $1', [cabecera.ide_tecnc]),
        ]);
        const conocidos = new Set(hashes.map((h) => h.hash_tecmv));
        const nuevos = conHuellas(enMes).filter((h) => !conocidos.has(h.hash)).length;
        if (repetido.length > 0) {
            validaciones.push({ nivel: 'ERROR', codigo: 'DUPLICADO', texto: 'Este mismo archivo ya fue cargado en esta conciliación.' });
        } else if (enMes.length > 0 && nuevos === 0) {
            validaciones.push({ nivel: 'ERROR', codigo: 'SIN_NUEVOS', texto: 'El archivo no aporta movimientos nuevos: ya están todos cargados en esta conciliación.' });
        } else if (hashes.length > 0 && enMes.length > 0) {
            validaciones.push({
                nivel: 'INFO', codigo: 'CORTE',
                texto: `La conciliación ya tiene ${hashes.length} movimientos: se agregarán solo los ${nuevos} nuevos y se actualizarán los saldos.`,
            });
        }

        // Continuidad de saldos
        if (enMes.length > 0 && saldos.inicial !== null) {
            if (hashes.length > 0) {
                const previo = cabecera.saldo_inicial_banco_tecnc;
                if (previo !== null && aCentavos(previo) !== aCentavos(saldos.inicial)) {
                    validaciones.push({
                        nivel: 'ADVERTENCIA', codigo: 'CONTINUIDAD',
                        texto: `El saldo inicial de este archivo (${saldos.inicial.toFixed(2)}) no coincide con el ya cargado (${previo.toFixed(2)}): puede ser de otra cuenta o estar incompleto.`,
                    });
                }
            } else if (fuera === 0) {
                const { rows: anterior } = await this.dataSource.pool.query(
                    `SELECT saldo_final_banco_tecnc FROM tes_conciliacion
                     WHERE ide_tecba = $1 AND anulado_tecnc = false AND (anio_tecnc * 12 + mes_tecnc) = $2`,
                    [cabecera.ide_tecba, cabecera.anio_tecnc * 12 + cabecera.mes_tecnc - 1],
                );
                const saldoAnterior = anterior[0]?.saldo_final_banco_tecnc;
                if (saldoAnterior !== undefined && saldoAnterior !== null) {
                    if (aCentavos(saldoAnterior) === aCentavos(saldos.inicial)) {
                        validaciones.push({ nivel: 'OK', codigo: 'CONTINUIDAD', texto: 'El saldo inicial continúa el saldo final de la conciliación del mes anterior.' });
                    } else {
                        validaciones.push({
                            nivel: 'ADVERTENCIA', codigo: 'CONTINUIDAD',
                            texto: `El saldo inicial (${saldos.inicial.toFixed(2)}) no coincide con el saldo final de la conciliación del mes anterior (${Number(saldoAnterior).toFixed(2)}).`,
                        });
                    }
                }
            }
        }

        return { estado, enMes, nuevos, saldos, validaciones, movimientosExistentes: hashes.length };
    }

    /**
     * Verificación con IA de que el archivo corresponde a la cuenta y el mes de la conciliación. Es solo
     * ORIENTATIVA (nunca bloquea): recibe el encabezado del archivo (sin correos), unos pocos movimientos y
     * lo esperado, y responde si corresponde y por qué. Si la IA falla o tarda, se informa y se sigue.
     */
    private async validarConIa(
        estado: EstadoCuentaLeido, cabecera: ConciliacionCabecera,
        cuenta: { nombre_tecba: string; nombre_teban?: string }, nombreArchivo: string, enMes: number,
    ): Promise<Validacion | null> {
        const prompt = `
Eres un auditor que verifica que un estado de cuenta bancario subido a un sistema contable corresponde a la
cuenta y al mes de la conciliación para la que se subió (Ecuador, USD).
Recibirás lo ESPERADO (banco y cuenta del ERP, mes y año) y lo que se LEYÓ del archivo (encabezado tal cual,
formato, cuenta detectada, periodo declarado, primeros y últimos movimientos).
Evalúa: ¿el banco coincide?, ¿el número de cuenta coincide (puede venir recortado o con ceros)?, ¿el periodo
o las fechas de los movimientos son del mes esperado?, ¿hay algo raro (otro titular, otra moneda, otro banco)?
No inventes: si un dato no aparece, dilo. Responde SOLO un JSON:
{"corresponde":"si"|"no"|"dudoso","confianza":number (0-100),"motivo":"una o dos frases en español"}
`;
        const primeros = estado.movimientos.slice(0, 3);
        const ultimos = estado.movimientos.slice(-3);
        const datos = JSON.stringify({
            esperado: { banco: cabecera.nombre_teban, cuentaEnElErp: cuenta.nombre_tecba, mes: cabecera.mes_tecnc, anio: cabecera.anio_tecnc },
            archivo: {
                nombre: nombreArchivo,
                formato: estado.formato,
                cuentaDetectada: estado.cuenta,
                periodoDeclarado: [estado.fechaDesde, estado.fechaHasta],
                encabezado: estado.encabezado ?? [],
                totalMovimientos: estado.movimientos.length,
                movimientosDelMesEsperado: enMes,
                primerosMovimientos: primeros.map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, monto: m.monto * m.signo })),
                ultimosMovimientos: ultimos.map((m) => ({ fecha: m.fecha, descripcion: m.descripcion, monto: m.monto * m.signo })),
            },
        });
        try {
            const respuesta = await Promise.race([
                this.gpt.parseTextToJson(prompt, datos),
                new Promise<never>((_r, rechazar) => { setTimeout(() => rechazar(new Error('La IA tardó demasiado')), TIMEOUT_IA_MS); }),
            ]);
            const motivo = typeof respuesta?.motivo === 'string' ? respuesta.motivo.slice(0, 400) : '';
            const confianza = Math.max(0, Math.min(100, Math.round(Number(respuesta?.confianza) || 0)));
            if (respuesta?.corresponde === 'si') {
                return { nivel: 'OK', codigo: 'IA', texto: `Verificación con IA: el archivo parece corresponder a esta cuenta y mes (${confianza}%). ${motivo}`.trim() };
            }
            return {
                nivel: 'ADVERTENCIA', codigo: 'IA',
                texto: `Verificación con IA: ${respuesta?.corresponde === 'no' ? 'el archivo NO parece corresponder a esta cuenta o mes' : 'no se pudo confirmar que corresponda'} (${confianza}%). ${motivo}`.trim(),
            };
        } catch (e) {
            this.logger.warn(`Validación con IA falló: ${(e as Error).message}`);
            return { nivel: 'INFO', codigo: 'IA', texto: 'No se pudo consultar a la IA en este momento; se validó solo con las reglas del sistema.' };
        }
    }
}

/** Días entre dos fechas ISO (a <= b). */
function diasHasta(a: string, b: string): number {
    return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
