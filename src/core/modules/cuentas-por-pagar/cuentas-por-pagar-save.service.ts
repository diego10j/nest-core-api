import { BadRequestException, Injectable } from '@nestjs/common';

import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery, UpdateQuery } from 'src/core/connection/helpers';
import { getCurrentDate, getCurrentTime } from 'src/util/helpers/date-util';
import { CoreService } from 'src/core/core.service';

import { SaveDetalleOrdenDto, SaveOrdenPagoDto } from './dto/save-orden-pago.dto';
import { IdOrdenPagoDto, IdsDetalleOrdenPagoDto } from './dto/id-orden-pago.dto';
import { CuentasPorPagarOrdenService } from './cuentas-por-pagar-orden.service';

@Injectable()
export class CuentasPorPagarSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly ordenService: CuentasPorPagarOrdenService,
    ) {
        super();
    }

    /**
     * Crea o actualiza una orden de pago con su detalle.
     * En UPDATE: actualiza la cabecera y reemplaza todos los detalles.
     * En INSERT: genera los secuenciales y persiste cabecera + detalles.
     */
    async saveOrdenPago(dtoIn: SaveOrdenPagoDto & HeaderParamsDto) {
        const { data, detalles } = dtoIn;

        // Validar que ningún ide_cpctr de los detalles ya exista en otra orden de pago activa
        if (detalles && detalles.length > 0) {
            for (const det of detalles) {
                const exclusion = dtoIn.isUpdate && data.ide_cpcop
                    ? `AND cab.ide_cpcop != ${data.ide_cpcop}`
                    : '';
                const dupQuery = new SelectQuery(`
                    SELECT cab.secuencial_cpcop,
                           p.nom_geper            AS nombre_proveedor,
                           cf.numero_cpcfa        AS num_documento,
                           cf.total_cpcfa         AS valor
                    FROM cxp_det_orden_pago det2
                    JOIN cxp_cab_orden_pago   cab ON cab.ide_cpcop  = det2.ide_cpcop
                    JOIN cxp_cabece_transa     ct ON ct.ide_cpctr   = det2.ide_cpctr
                    LEFT JOIN cxp_cabece_factur cf ON cf.ide_cpcfa   = ct.ide_cpcfa
                    LEFT JOIN gen_persona        p  ON p.ide_geper    = ct.ide_geper
                    WHERE det2.ide_cpctr = $1
                      AND cab.ide_cpeo != 4
                      AND cab.ide_empr = ${dtoIn.ideEmpr}
                      ${exclusion}
                `);
                dupQuery.addIntParam(1, det.ide_cpctr);
                const duplicate = await this.dataSource.createSingleQuery(dupQuery);
                if (duplicate) {
                    throw new BadRequestException(
                        `La transacción ya está registrada en la orden ${duplicate.secuencial_cpcop ?? ''} — ` +
                        `Proveedor: ${duplicate.nombre_proveedor ?? '-'}, ` +
                        `Documento: ${duplicate.num_documento ?? '-'}, ` +
                        `Valor: ${duplicate.valor ?? '-'}`,
                    );
                }
            }
        }

        // ─── UPDATE ─────────────────────────────────────────────────────────
        if (dtoIn.isUpdate) {
            if (!data.ide_cpcop) {
                throw new BadRequestException('Se requiere ide_cpcop para actualizar la orden de pago');
            }

            // Verificar que la orden existe
            const checkQuery = new SelectQuery(`
                SELECT ide_cpcop FROM cxp_cab_orden_pago
                WHERE ide_cpcop = $1 AND ide_empr = $2
            `);
            checkQuery.addIntParam(1, data.ide_cpcop);
            checkQuery.addIntParam(2, dtoIn.ideEmpr);
            const exists = await this.dataSource.createSingleQuery(checkQuery);
            if (!exists) {
                throw new BadRequestException(`Orden de pago ${data.ide_cpcop} no encontrada`);
            }

            // Actualizar cabecera
            const cabUpd = new UpdateQuery('cxp_cab_orden_pago', 'ide_cpcop');
            cabUpd.values.set('ide_cpeo', data.ide_cpeo);
            cabUpd.values.set('fecha_genera_cpcop', data.fecha_genera_cpcop);
            if (data.fecha_pago_cpcop !== undefined) cabUpd.values.set('fecha_pago_cpcop', data.fecha_pago_cpcop);
            if (data.fecha_efectiva_pago_cpcop !== undefined) cabUpd.values.set('fecha_efectiva_pago_cpcop', data.fecha_efectiva_pago_cpcop);
            if (data.referencia_cpcop !== undefined) cabUpd.values.set('referencia_cpcop', data.referencia_cpcop);
            if (data.activo_cpcop !== undefined) cabUpd.values.set('activo_cpcop', data.activo_cpcop);
            cabUpd.values.set('usuario_actua', dtoIn.login);
            cabUpd.values.set('hora_actua', getCurrentTime());
            cabUpd.where = 'ide_cpcop = $1';
            cabUpd.addIntParam(1, data.ide_cpcop);
            await this.dataSource.createQuery(cabUpd);

            // Reemplazar detalles si se enviaron
            if (detalles !== undefined) {
                await this.reemplazarDetalles(data.ide_cpcop, detalles ?? [], dtoIn);
            }

            return { message: 'ok', rowCount: 1, ide_cpcop: data.ide_cpcop };
        }

        // ─── INSERT ─────────────────────────────────────────────────────────
        const ide_cpcop = await this.dataSource.getSeqTable(
            'cxp_cab_orden_pago',
            'ide_cpcop',
            1,
            dtoIn.login,
        );

        // Generar secuencial único por empresa en formato 00000001
        const { secuencial } = await this.ordenService.getSecuencialOrden(dtoIn);

        const cabQuery: ObjectQueryDto = {
            operation: 'insert',
            module: 'cxp',
            tableName: 'cab_orden_pago',
            primaryKey: 'ide_cpcop',
            object: {
                ide_cpcop,
                ide_cpeo: data.ide_cpeo,
                fecha_genera_cpcop: data.fecha_genera_cpcop,
                fecha_pago_cpcop: data.fecha_pago_cpcop ?? null,
                fecha_efectiva_pago_cpcop: data.fecha_efectiva_pago_cpcop ?? null,
                secuencial_cpcop: secuencial,
                referencia_cpcop: data.referencia_cpcop ?? null,
                activo_cpcop: data.activo_cpcop ?? true,
                ide_usua: dtoIn.ideUsua,
                ide_empr: dtoIn.ideEmpr,
                ide_sucu: dtoIn.ideSucu,
                usuario_ingre: dtoIn.login,
                hora_ingre: getCurrentTime(),
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [cabQuery], audit: false });

        // Insertar detalles
        if (detalles && detalles.length > 0) {
            for (const det of detalles) {
                const ide_cpcdop = await this.dataSource.getSeqTable(
                    'cxp_det_orden_pago',
                    'ide_cpcdop',
                    1,
                    dtoIn.login,
                );
                const detQuery: ObjectQueryDto = {
                    operation: 'insert',
                    module: 'cxp',
                    tableName: 'det_orden_pago',
                    primaryKey: 'ide_cpcdop',
                    object: {
                        ide_cpcdop,
                        ide_cpcop,
                        ide_cpctr: det.ide_cpctr,
                        ide_cpeo: det.ide_cpeo,
                        fecha_pago_cpcdop: det.fecha_pago_cpcdop ?? null,
                        num_comprobante_cpcdop: det.num_comprobante_cpcdop ?? null,
                        valor_pagado_cpcdop: det.valor_pagado_cpcdop ?? null,
                        saldo_pendiente_cpcdop: det.saldo_pendiente_cpcdop ?? null,
                        documento_referencia_cpcdop: det.documento_referencia_cpcdop ?? null,
                        notifica_cpcdop: det.notifica_cpcdop ?? false,
                        activo_cpcdop: det.activo_cpcdop ?? true,
                        valor_pagado_banco_cpcdop: det.valor_pagado_banco_cpcdop ?? null,
                        ide_tecba: det.ide_tecba ?? null,
                        ide_tettb: det.ide_tettb ?? null,
                        observacion_cpcdop: det.observacion_cpcdop ?? null,
                        usuario_ingre: dtoIn.login,
                        hora_ingre: getCurrentTime(),
                    },
                };
                await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });
            }
        }


        return { message: 'ok', rowCount: 1, ide_cpcop };
    }

    /**
     * Activa o desactiva una orden de pago (toggle activo_cpcop).
     */
    async activarDesactivarOrdenPago(dtoIn: IdOrdenPagoDto & HeaderParamsDto) {
        // Obtener estado actual
        const checkQuery = new SelectQuery(`
            SELECT ide_cpcop, activo_cpcop
            FROM cxp_cab_orden_pago
            WHERE ide_cpcop = $1 AND ide_empr = $2
        `);
        checkQuery.addIntParam(1, dtoIn.ide_cpcop);
        checkQuery.addIntParam(2, dtoIn.ideEmpr);
        const current = await this.dataSource.createSingleQuery(checkQuery);
        if (!current) {
            throw new BadRequestException(`Orden de pago ${dtoIn.ide_cpcop} no encontrada`);
        }

        const nuevoEstado = !current.activo_cpcop;
        const updQuery = new UpdateQuery('cxp_cab_orden_pago', 'ide_cpcop');
        updQuery.values.set('activo_cpcop', nuevoEstado);
        updQuery.values.set('usuario_actua', dtoIn.login);
        updQuery.values.set('hora_actua', getCurrentTime());
        updQuery.where = 'ide_cpcop = $1';
        updQuery.addIntParam(1, dtoIn.ide_cpcop);
        await this.dataSource.createQuery(updQuery);

        return { message: 'ok', activo: nuevoEstado };
    }

    /**
     * Elimina detalles de una orden de pago por array de ids.
     */
    async eliminarDetallesOrdenPago(dtoIn: IdsDetalleOrdenPagoDto & HeaderParamsDto) {
        if (!dtoIn.ids || dtoIn.ids.length === 0) {
            throw new BadRequestException('Se requiere al menos un id de detalle');
        }

        await this.dataSource.pool.query(
            `DELETE FROM cxp_det_orden_pago WHERE ide_cpcdop = ANY($1::int8[])`,
            [dtoIn.ids],
        );

        return { message: 'ok', rowCount: dtoIn.ids.length };
    }

    /**
     * Activa o desactiva detalles de una orden de pago (toggle activo_cpcdop).
     * El nuevo estado se aplica como toggle del primer registro encontrado.
     */
    async activarDesactivarDetallesOrdenPago(dtoIn: IdsDetalleOrdenPagoDto & HeaderParamsDto) {
        if (!dtoIn.ids || dtoIn.ids.length === 0) {
            throw new BadRequestException('Se requiere al menos un id de detalle');
        }

        // Obtener estado actual del primer registro
        const checkQuery = new SelectQuery(`
            SELECT activo_cpcdop
            FROM cxp_det_orden_pago
            WHERE ide_cpcdop = $1
        `);
        checkQuery.addIntParam(1, dtoIn.ids[0]);
        const current = await this.dataSource.createSingleQuery(checkQuery);
        if (!current) {
            throw new BadRequestException(`Detalle ${dtoIn.ids[0]} no encontrado`);
        }

        const nuevoEstado = !current.activo_cpcdop;
        await this.dataSource.pool.query(
            `UPDATE cxp_det_orden_pago
             SET activo_cpcdop = $1,
                 usuario_actua = $2,
                 hora_actua    = $3
             WHERE ide_cpcdop = ANY($4::int8[])`,
            [nuevoEstado, dtoIn.login, getCurrentTime(), dtoIn.ids],
        );

        return { message: 'ok', activo: nuevoEstado, rowCount: dtoIn.ids.length };
    }

    /**
     * Agrega nuevos detalles a una orden de pago existente.
     */
    async agregarDetallesOrdenPago(
        dtoIn: { ide_cpcop: number; detalles: SaveOrdenPagoDto['detalles'] } & HeaderParamsDto,
    ) {
        if (!dtoIn.detalles || dtoIn.detalles.length === 0) {
            throw new BadRequestException('Se requiere al menos un detalle');
        }

        const checkQuery = new SelectQuery(`
            SELECT ide_cpcop FROM cxp_cab_orden_pago WHERE ide_cpcop = $1 AND ide_empr = $2
        `);
        checkQuery.addIntParam(1, dtoIn.ide_cpcop);
        checkQuery.addIntParam(2, dtoIn.ideEmpr);
        const exists = await this.dataSource.createSingleQuery(checkQuery);
        if (!exists) {
            throw new BadRequestException(`Orden de pago ${dtoIn.ide_cpcop} no encontrada`);
        }

        for (const det of dtoIn.detalles) {
            const ide_cpcdop = await this.dataSource.getSeqTable(
                'cxp_det_orden_pago',
                'ide_cpcdop',
                1,
                dtoIn.login,
            );
            const detQuery: ObjectQueryDto = {
                operation: 'insert',
                module: 'cxp',
                tableName: 'det_orden_pago',
                primaryKey: 'ide_cpcdop',
                object: {
                    ide_cpcdop,
                    ide_cpcop: dtoIn.ide_cpcop,
                    ide_cpctr: det.ide_cpctr,
                    ide_cpeo: det.ide_cpeo,
                    fecha_pago_cpcdop: det.fecha_pago_cpcdop ?? null,
                    num_comprobante_cpcdop: det.num_comprobante_cpcdop ?? null,
                    valor_pagado_cpcdop: det.valor_pagado_cpcdop ?? null,
                    saldo_pendiente_cpcdop: det.saldo_pendiente_cpcdop ?? null,
                    documento_referencia_cpcdop: det.documento_referencia_cpcdop ?? null,
                    notifica_cpcdop: det.notifica_cpcdop ?? false,
                    activo_cpcdop: det.activo_cpcdop ?? true,
                    valor_pagado_banco_cpcdop: det.valor_pagado_banco_cpcdop ?? null,
                    ide_tecba: det.ide_tecba ?? null,
                    ide_tettb: det.ide_tettb ?? null,
                    observacion_cpcdop: det.observacion_cpcdop ?? null,
                    usuario_ingre: dtoIn.login,
                    hora_ingre: getCurrentTime(),
                },
            };
            await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });
        }

        return { message: 'ok', rowCount: dtoIn.detalles.length };
    }

    /**
     * Cambia el estado de una orden de pago (ide_cpeo).
     */
    async cambiarEstadoOrdenPago(
        dtoIn: { ide_cpcop: number; ide_cpeo: number } & HeaderParamsDto,
    ) {
        const updQuery = new UpdateQuery('cxp_cab_orden_pago', 'ide_cpcop');
        updQuery.values.set('ide_cpeo', dtoIn.ide_cpeo);
        updQuery.values.set('usuario_actua', dtoIn.login);
        updQuery.values.set('hora_actua', getCurrentTime());

        if (dtoIn.ide_cpeo === 4) { // Si el nuevo estado es ANULADA, también seteamos fecha_pago_cpcop a null
            updQuery.values.set('activo_cpcop', false); // Además, inactivamos la orden
        }
        else if (dtoIn.ide_cpeo === 1) { // Si el nuevo estado es PENDIENTE, aseguramos que la orden esté activa
            updQuery.values.set('activo_cpcop', true);
        }
        updQuery.where = 'ide_cpcop = $1 AND ide_empr = $2';
        updQuery.addParam(1, dtoIn.ide_cpcop);
        updQuery.addParam(2, dtoIn.ideEmpr);
        const result = await this.dataSource.createQuery(updQuery);
        if (!result || result.rowCount === 0) {
            throw new BadRequestException(`Orden de pago ${dtoIn.ide_cpcop} no encontrada`);
        }
        return { message: 'ok', rowCount: 1 };
    }

    /**
     * Actualiza un único detalle de orden de pago con los datos de pago.
     * Campos obligatorios: ide_cpcdop, ide_cpctr, ide_tecba, ide_tettb,
     * fecha_pago_cpcdop, num_comprobante_cpcdop, valor_pagado_banco_cpcdop, foto_cpcdop.
     * Tras actualizar, verifica si todos los detalles están pagados y cierra la cabecera.
     */
    async saveDetalleOrden(dtoIn: SaveDetalleOrdenDto & HeaderParamsDto) {
        // Obtener ide_cpcop del detalle para verificar existencia y obtener la cabecera
        const checkQuery = new SelectQuery(`
            SELECT ide_cpcdop, ide_cpcop
            FROM cxp_det_orden_pago
            WHERE ide_cpcdop = $1
        `);
        checkQuery.addIntParam(1, dtoIn.ide_cpcdop);
        const detalle = await this.dataSource.createSingleQuery(checkQuery);
        if (!detalle) {
            throw new BadRequestException(`Detalle ${dtoIn.ide_cpcdop} no encontrado`);
        }
        const ide_cpcop: number = detalle.ide_cpcop;

        // Actualizar el detalle con estado PAGADA (3)
        const detQuery: ObjectQueryDto = {
            operation: 'update',
            module: 'cxp',
            tableName: 'det_orden_pago',
            primaryKey: 'ide_cpcdop',
            object: {
                ide_cpcdop: dtoIn.ide_cpcdop,
                ide_cpctr: dtoIn.ide_cpctr,
                ide_cpeo: 3,
                ide_tecba: dtoIn.ide_tecba,
                ide_tettb: dtoIn.ide_tettb,
                fecha_pago_cpcdop: dtoIn.fecha_pago_cpcdop,
                num_comprobante_cpcdop: dtoIn.num_comprobante_cpcdop,
                valor_pagado_banco_cpcdop: dtoIn.valor_pagado_banco_cpcdop,
                foto_cpcdop: dtoIn.foto_cpcdop,
                valor_pagado_cpcdop: dtoIn.valor_pagado_cpcdop ?? null,
                saldo_pendiente_cpcdop: dtoIn.saldo_pendiente_cpcdop ?? null,
                documento_referencia_cpcdop: dtoIn.documento_referencia_cpcdop ?? null,
                notifica_cpcdop: dtoIn.notifica_cpcdop ?? false,
                observacion_cpcdop: dtoIn.observacion_cpcdop ?? null,
            },
        };
        await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });

        // Verificar si todos los detalles activos de la orden están pagados
        const pendientesQuery = new SelectQuery(`
            SELECT COUNT(*) AS total_pendientes
            FROM cxp_det_orden_pago
            WHERE ide_cpcop = $1
              AND activo_cpcdop = true
              AND ide_cpeo != 3
        `);
        pendientesQuery.addIntParam(1, ide_cpcop);
        const resumen = await this.dataSource.createSingleQuery(pendientesQuery);
        const totalPendientes = parseInt(resumen?.total_pendientes ?? '1', 10);

        let cerrada = false;
        if (totalPendientes === 0) {
            const cabUpd = new UpdateQuery('cxp_cab_orden_pago', 'ide_cpcop');
            cabUpd.values.set('ide_cpeo', 3);
            cabUpd.values.set('usuario_actua', dtoIn.login);
            cabUpd.values.set('hora_actua', getCurrentTime());
            cabUpd.values.set('fecha_pago_cpcop', getCurrentDate());
            cabUpd.values.set('fecha_efectiva_pago_cpcop', dtoIn.fecha_pago_cpcdop);
            cabUpd.where = 'ide_cpcop = $1 AND ide_empr = $2';
            cabUpd.addIntParam(1, ide_cpcop);
            cabUpd.addIntParam(2, dtoIn.ideEmpr);
            await this.dataSource.createQuery(cabUpd);
            cerrada = true;
        }

        return { message: 'ok', rowCount: 1, cerrada };
    }

    // ─── PRIVADOS ─────────────────────────────────────────────────────────────

    private async reemplazarDetalles(
        ide_cpcop: number,
        detalles: SaveOrdenPagoDto['detalles'],
        dtoIn: HeaderParamsDto,
    ) {
        if (!detalles || detalles.length === 0) return;

        for (const det of detalles) {
            if (det.ide_cpcdop) {
                // UPDATE: actualizar registro existente — estado forzado a PAGADA (3)
                const detQuery: ObjectQueryDto = {
                    operation: 'update',
                    module: 'cxp',
                    tableName: 'det_orden_pago',
                    primaryKey: 'ide_cpcdop',
                    object: {
                        ide_cpcdop: det.ide_cpcdop,
                        ide_cpctr: det.ide_cpctr,
                        ide_cpeo: 3,
                        fecha_pago_cpcdop: det.fecha_pago_cpcdop ?? null,
                        num_comprobante_cpcdop: det.num_comprobante_cpcdop ?? null,
                        valor_pagado_cpcdop: det.valor_pagado_cpcdop ?? null,
                        saldo_pendiente_cpcdop: det.saldo_pendiente_cpcdop ?? null,
                        documento_referencia_cpcdop: det.documento_referencia_cpcdop ?? null,
                        notifica_cpcdop: det.notifica_cpcdop ?? false,
                        activo_cpcdop: det.activo_cpcdop ?? true,
                        valor_pagado_banco_cpcdop: det.valor_pagado_banco_cpcdop ?? null,
                        ide_tecba: det.ide_tecba ?? null,
                        ide_tettb: det.ide_tettb ?? null,
                        observacion_cpcdop: det.observacion_cpcdop ?? null,
                    },
                };
                await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });
            } else {
                // INSERT: nuevo detalle — estado forzado a GENERADA (1)
                const ide_cpcdop = await this.dataSource.getSeqTable(
                    'cxp_det_orden_pago',
                    'ide_cpcdop',
                    1,
                    dtoIn.login,
                );
                const detQuery: ObjectQueryDto = {
                    operation: 'insert',
                    module: 'cxp',
                    tableName: 'det_orden_pago',
                    primaryKey: 'ide_cpcdop',
                    object: {
                        ide_cpcdop,
                        ide_cpcop,
                        ide_cpctr: det.ide_cpctr,
                        ide_cpeo: 1,
                        fecha_pago_cpcdop: det.fecha_pago_cpcdop ?? null,
                        num_comprobante_cpcdop: det.num_comprobante_cpcdop ?? null,
                        valor_pagado_cpcdop: det.valor_pagado_cpcdop ?? null,
                        saldo_pendiente_cpcdop: det.saldo_pendiente_cpcdop ?? null,
                        documento_referencia_cpcdop: det.documento_referencia_cpcdop ?? null,
                        notifica_cpcdop: det.notifica_cpcdop ?? false,
                        activo_cpcdop: det.activo_cpcdop ?? true,
                        valor_pagado_banco_cpcdop: det.valor_pagado_banco_cpcdop ?? null,
                        ide_tecba: det.ide_tecba ?? null,
                        ide_tettb: det.ide_tettb ?? null,
                        observacion_cpcdop: det.observacion_cpcdop ?? null,
                        usuario_ingre: dtoIn.login,
                        hora_ingre: getCurrentTime(),
                    },
                };
                await this.core.save({ ...dtoIn, listQuery: [detQuery], audit: false });
            }
        }
    }
}
