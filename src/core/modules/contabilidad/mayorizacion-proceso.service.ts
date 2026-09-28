import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { AsientosAutomaticosService } from './asientos-automaticos.service';
import { AccionMayorizar, IniciarMayorizacionDto } from './dto/iniciar-mayorizacion.dto';
import { TipoOrigenMayorizar } from './dto/log-mayorizacion.dto';

type EstadoItem = 'PENDIENTE' | 'PROCESANDO' | 'OK' | 'ADVERTENCIA' | 'ERROR' | 'OMITIDO';

interface PasoItem {
    label: string;
    ok: boolean;
    ide_cnccc: number | null;
}

interface ItemDetalle {
    id: number;
    numero: string;
    persona: string;
    total: number;
    estado: EstadoItem;
    pasos: PasoItem[];
    mensajes: string[];
}

/** Resultado común de los métodos de generar/deshacer de AsientosAutomaticosService. */
interface ResultadoAsiento {
    ide_cnccc?: number;
    ide_cnccc_costo?: number;
    generado?: boolean;
    deshecho?: boolean;
    advertencias?: string[];
}

interface Paso {
    label: string;
    ejecutar: () => Promise<ResultadoAsiento>;
}

/** Tabla y columnas del documento origen (para saber qué asientos tiene al momento de procesarlo). */
const ORIGEN_TABLA: Record<TipoOrigenMayorizar, { tabla: string; id: string; tieneCosto: boolean }> = {
    DOCUMENTOS_PAGAR: { tabla: 'cxp_cabece_factur', id: 'ide_cpcfa', tieneCosto: false },
    FACTURA_VENTA: { tabla: 'cxc_cabece_factura', id: 'ide_cccfa', tieneCosto: true },
    // cxp_cabecera_nota es de VENTAS pese al prefijo cxp_ (notas de crédito a clientes).
    NOTA_CREDITO: { tabla: 'cxp_cabecera_nota', id: 'ide_cpcno', tieneCosto: true },
};

/**
 * "Generar / Anular asientos" de la pantalla Mayorizar en SEGUNDO PLANO: el avance vive en
 * con_mayorizacion_proceso (scripts/contabilidad-mayorizacion-proceso.sql), así que la página puede
 * cerrarse y al volver retoma la barra de avance. Una sola corrida activa por empresa.
 *
 * Cada documento se procesa con los mismos métodos de AsientosAutomaticosService que usan los
 * endpoints por lote (que ya registran con_mayorizacion_log). Lo que se genera o anula en cada
 * documento se decide al procesarlo, con el estado actual del documento (no con el de la pantalla).
 */
@Injectable()
export class MayorizacionProcesoService implements OnModuleInit {
    private readonly logger = new Logger(MayorizacionProcesoService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly asientos: AsientosAutomaticosService,
    ) {}

    /** Corridas que quedaron a medias por un reinicio del servidor. */
    async onModuleInit() {
        try {
            await this.dataSource.pool.query(
                `UPDATE con_mayorizacion_proceso
                    SET estado_cnmpr = 'INTERRUMPIDO', fecha_fin_cnmpr = NOW(), documento_actual_cnmpr = NULL
                  WHERE estado_cnmpr = 'EJECUTANDO'`,
            );
        } catch (error) {
            // Sin scripts/contabilidad-mayorizacion-proceso.sql aún: no debe impedir que el servidor arranque.
            this.logger.warn(`No se pudieron cerrar corridas de mayorización interrumpidas: ${(error as Error).message}`);
        }
    }

    async iniciar(dto: IniciarMayorizacionDto & HeaderParamsDto) {
        const activa = await this.dataSource.pool.query(
            `SELECT ide_cnmpr, usuario_ingre FROM con_mayorizacion_proceso
              WHERE ide_empr = $1 AND estado_cnmpr = 'EJECUTANDO' LIMIT 1`,
            [dto.ideEmpr],
        );
        if (activa.rows.length) {
            throw new BadRequestException(
                `Ya hay una mayorización en curso (iniciada por ${activa.rows[0].usuario_ingre ?? 'otro usuario'}). Espera a que termine.`,
            );
        }

        const ids = [...new Set(dto.documentos.map((d) => d.id))];
        const porId = new Map(dto.documentos.map((d) => [d.id, d]));
        const detalle: ItemDetalle[] = ids.map((id) => {
            const d = porId.get(id);
            return {
                id,
                numero: d?.numero || String(id),
                persona: d?.persona || '',
                total: Number(d?.total ?? 0),
                estado: 'PENDIENTE',
                pasos: [],
                mensajes: [],
            };
        });

        const ins = await this.dataSource.pool.query(
            `INSERT INTO con_mayorizacion_proceso (tipo_origen_cnmpr, accion_cnmpr, mes_cnmpr, periodo_cnmpr, total_cnmpr,
                                                   detalle_cnmpr, ide_empr, ide_sucu, usuario_ingre)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ide_cnmpr`,
            [dto.tipoOrigen, dto.accion, dto.mes, dto.periodo, ids.length, JSON.stringify(detalle), dto.ideEmpr, dto.ideSucu, dto.login],
        );
        const ideCnmpr: number = ins.rows[0].ide_cnmpr;

        // Solo los datos de sesión: el dto trae además la lista de documentos.
        const headers: HeaderParamsDto = {
            ideUsua: dto.ideUsua,
            ideEmpr: dto.ideEmpr,
            ideSucu: dto.ideSucu,
            idePerf: dto.idePerf,
            login: dto.login,
            ip: dto.ip,
            device: dto.device,
        } as HeaderParamsDto;
        setImmediate(() => {
            this.ejecutar(ideCnmpr, dto.tipoOrigen, dto.accion, detalle, headers).catch(async (err) => {
                this.logger.error(`Mayorización ${ideCnmpr} falló: ${err?.message}`, err?.stack);
                await this.dataSource.pool
                    .query(
                        `UPDATE con_mayorizacion_proceso
                            SET estado_cnmpr = 'FALLIDO', error_cnmpr = $2, fecha_fin_cnmpr = NOW(), documento_actual_cnmpr = NULL
                          WHERE ide_cnmpr = $1`,
                        [ideCnmpr, String(err?.message ?? err)],
                    )
                    .catch(() => undefined);
            });
        });
        return { ide_cnmpr: ideCnmpr, total: ids.length };
    }

    /**
     * Corrida en curso de la empresa, o la última si terminó hace poco (la página la muestra solo
     * mientras está activa o si el usuario se quedó mirando hasta el final).
     */
    async getEstado(ideEmpr: number) {
        const r = await this.dataSource.pool.query(
            `SELECT ide_cnmpr, tipo_origen_cnmpr, accion_cnmpr, mes_cnmpr, periodo_cnmpr, estado_cnmpr, total_cnmpr,
                    procesados_cnmpr, correctos_cnmpr, advertencias_cnmpr, errores_cnmpr, cancelado_cnmpr,
                    documento_actual_cnmpr, detalle_cnmpr, error_cnmpr, fecha_inicio_cnmpr, fecha_fin_cnmpr, usuario_ingre,
                    EXTRACT(EPOCH FROM (COALESCE(fecha_fin_cnmpr, NOW()) - fecha_inicio_cnmpr))::int AS segundos
               FROM con_mayorizacion_proceso
              WHERE ide_empr = $1
              ORDER BY ide_cnmpr DESC LIMIT 1`,
            [ideEmpr],
        );
        const c = r.rows[0];
        if (!c) return { proceso: null };
        const activa = c.estado_cnmpr === 'EJECUTANDO';
        const hechos = Number(c.procesados_cnmpr);
        const total = Number(c.total_cnmpr) || 0;
        return {
            proceso: {
                ...c,
                activa,
                porcentaje: total ? Math.min(100, Math.round((hechos / total) * 100)) : 0,
                segundosRestantes: activa && hechos > 0 ? Math.round((c.segundos / hechos) * (total - hechos)) : null,
            },
        };
    }

    async cancelar(ideEmpr: number) {
        const r = await this.dataSource.pool.query(
            `UPDATE con_mayorizacion_proceso SET cancelado_cnmpr = TRUE
              WHERE ide_empr = $1 AND estado_cnmpr = 'EJECUTANDO' RETURNING ide_cnmpr`,
            [ideEmpr],
        );
        if (!r.rows.length) throw new BadRequestException('No hay una mayorización en curso');
        return { message: 'La mayorización se detendrá al terminar el documento actual' };
    }

    // ------------------------------------------------------------------ ejecución

    private async ejecutar(
        ideCnmpr: number,
        tipoOrigen: TipoOrigenMayorizar,
        accion: AccionMayorizar,
        detalle: ItemDetalle[],
        headers: HeaderParamsDto,
    ) {
        const contadores = { procesados: 0, correctos: 0, advertencias: 0, errores: 0 };
        let cancelado = false;

        for (let i = 0; i < detalle.length; i++) {
            const control = await this.dataSource.pool.query(
                `SELECT cancelado_cnmpr FROM con_mayorizacion_proceso WHERE ide_cnmpr = $1`,
                [ideCnmpr],
            );
            if (control.rows[0]?.cancelado_cnmpr) {
                cancelado = true;
                for (let k = i; k < detalle.length; k++) detalle[k].estado = 'OMITIDO';
                break;
            }

            const item = detalle[i];
            item.estado = 'PROCESANDO';
            await this.guardarItem(ideCnmpr, i, item, contadores, `${item.numero}${item.persona ? ` · ${item.persona}` : ''}`);

            let huboError = false;
            try {
                const pasos = await this.pasosDe(tipoOrigen, accion, item.id, headers);
                if (!pasos.length) {
                    item.mensajes.push(
                        accion === 'GENERAR' ? 'Ya estaba contabilizado: no hay asientos por generar' : 'No tiene asientos para anular',
                    );
                }
                for (const paso of pasos) {
                    try {
                        const r = await paso.ejecutar();
                        const ok = Boolean(accion === 'GENERAR' ? r?.generado : r?.deshecho);
                        item.pasos.push({ label: paso.label, ok, ide_cnccc: r?.ide_cnccc ?? r?.ide_cnccc_costo ?? null });
                        item.mensajes.push(...(r?.advertencias ?? []).filter(Boolean).map((m) => `${paso.label}: ${m}`));
                        if (!ok) huboError = true;
                    } catch (error) {
                        huboError = true;
                        item.pasos.push({ label: paso.label, ok: false, ide_cnccc: null });
                        item.mensajes.push(`${paso.label}: ${(error as Error)?.message ?? 'Error al procesar'}`);
                    }
                }
                item.estado = !pasos.length ? 'OMITIDO' : huboError ? 'ERROR' : item.mensajes.length ? 'ADVERTENCIA' : 'OK';
            } catch (error) {
                item.estado = 'ERROR';
                item.mensajes.push((error as Error)?.message ?? 'Error al procesar');
            }

            contadores.procesados++;
            if (item.estado === 'OK') contadores.correctos++;
            else if (item.estado === 'ADVERTENCIA') contadores.advertencias++;
            else if (item.estado === 'ERROR') contadores.errores++;
            await this.guardarItem(ideCnmpr, i, item, contadores, null);
        }

        const estado = cancelado ? 'CANCELADO' : contadores.errores ? 'CON_ERRORES' : 'OK';
        await this.dataSource.pool.query(
            `UPDATE con_mayorizacion_proceso
                SET estado_cnmpr = $2, detalle_cnmpr = $3, documento_actual_cnmpr = NULL, fecha_fin_cnmpr = NOW()
              WHERE ide_cnmpr = $1`,
            [ideCnmpr, estado, JSON.stringify(detalle)],
        );
    }

    /** Actualiza un documento del detalle y los contadores (la página lo consulta cada pocos segundos). */
    private async guardarItem(
        ideCnmpr: number,
        indice: number,
        item: ItemDetalle,
        c: { procesados: number; correctos: number; advertencias: number; errores: number },
        documentoActual: string | null,
    ) {
        await this.dataSource.pool.query(
            `UPDATE con_mayorizacion_proceso
                SET detalle_cnmpr = jsonb_set(detalle_cnmpr, ARRAY[$2::text], $3::jsonb),
                    procesados_cnmpr = $4, correctos_cnmpr = $5, advertencias_cnmpr = $6, errores_cnmpr = $7,
                    documento_actual_cnmpr = $8
              WHERE ide_cnmpr = $1`,
            [ideCnmpr, indice, JSON.stringify(item), c.procesados, c.correctos, c.advertencias, c.errores, documentoActual?.slice(0, 250) ?? null],
        );
    }

    /** Asientos a generar/anular del documento según lo que tiene AHORA (venta y/o costo). */
    private async pasosDe(tipoOrigen: TipoOrigenMayorizar, accion: AccionMayorizar, id: number, h: HeaderParamsDto): Promise<Paso[]> {
        const o = ORIGEN_TABLA[tipoOrigen];
        const r = await this.dataSource.pool.query(
            `SELECT ide_cnccc${o.tieneCosto ? ', ide_cnccc_costo' : ''} FROM ${o.tabla} WHERE ${o.id} = $1`,
            [id],
        );
        if (!r.rows.length) throw new Error('El documento ya no existe');
        const doc = r.rows[0];
        const aplica = (campo: string) => (accion === 'GENERAR' ? doc[campo] == null : doc[campo] != null);
        const generar = accion === 'GENERAR';
        const pasos: Paso[] = [];

        if (tipoOrigen === 'DOCUMENTOS_PAGAR') {
            if (aplica('ide_cnccc'))
                pasos.push({
                    label: 'Compra',
                    ejecutar: () =>
                        generar
                            ? this.asientos.generarAsientoComprasCxP({ ...h, ide_cpcfa: id })
                            : this.asientos.deshacerAsientoComprasCxP({ ...h, ide_cpcfa: id }),
                });
        } else if (tipoOrigen === 'FACTURA_VENTA') {
            if (aplica('ide_cnccc'))
                pasos.push({
                    label: 'Venta',
                    ejecutar: () =>
                        generar
                            ? this.asientos.generarAsientoFacturaCxC({ ...h, ide_cccfa: id })
                            : this.asientos.deshacerAsientoFacturaCxC({ ...h, ide_cccfa: id }),
                });
            if (aplica('ide_cnccc_costo'))
                pasos.push({
                    label: 'Costo',
                    ejecutar: () =>
                        generar
                            ? this.asientos.generarAsientoCostoVenta({ ...h, ide_cccfa: id })
                            : this.asientos.deshacerAsientoCostoVenta({ ...h, ide_cccfa: id }),
                });
        } else {
            if (aplica('ide_cnccc'))
                pasos.push({
                    label: 'Nota',
                    ejecutar: () =>
                        generar
                            ? this.asientos.generarAsientoNotaCredito({ ...h, ide_cpcno: id })
                            : this.asientos.deshacerAsientoNotaCredito({ ...h, ide_cpcno: id }),
                });
            if (aplica('ide_cnccc_costo'))
                pasos.push({
                    label: 'Costo',
                    ejecutar: () =>
                        generar
                            ? this.asientos.generarAsientoCostoNotaCredito({ ...h, ide_cpcno: id })
                            : this.asientos.deshacerAsientoCostoNotaCredito({ ...h, ide_cpcno: id }),
                });
        }
        return pasos;
    }
}
