import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import {
    SaveEnvioDto,
    SaveRutaDetDto,
    SaveRutaDto,
    SaveTransporteCompletoDto,
    SetActivoTransDto,
} from './dto/save-transporte.dto';

@Injectable()
export class TransportesSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─── TRANSPORTE ───────────────────────────────────────────────────────────

    async setActivoTransporte(dtoIn: SetActivoTransDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE ven_transporte SET activo_vgtra = $1 WHERE ide_vgtra = $2`,
            [dtoIn.activo, dtoIn.ide],
        );
        return { message: 'ok' };
    }
    async saveTransporteCompleto(dtoIn: SaveTransporteCompletoDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_vgtra != null;
        const pk = isUpdate ? dtoIn.ide_vgtra! : await this.dataSource.getSeqTable('ven_transporte', 'ide_vgtra', 1, dtoIn.login);

        // 1. Guardar cabecera
        const cabQuery = [{
            operation: isUpdate ? 'update' as const : 'insert' as const,
            module: 'ven',
            tableName: 'transporte',
            primaryKey: 'ide_vgtra',
            object: {
                ide_vgtra: pk,
                ide_geper: dtoIn.ide_geper,
                nombre_vgtra: dtoIn.nombre_vgtra,
                descripcion_vgtra: dtoIn.descripcion_vgtra ?? null,
                cobertura_nacional_vgtra: dtoIn.cobertura_nacional_vgtra ?? false,
                flete_cobro_vgtra: dtoIn.flete_cobro_vgtra ?? false,
                logo_vgtra: dtoIn.logo_vgtra ?? null,
            },
            condition: isUpdate ? `ide_vgtra = ${pk}` : undefined,
        }];

        await this.core.save({ ...dtoIn, listQuery: cabQuery, audit: false });

        // 2. Si es update, obtener tarifas existentes
        const existingIds = new Set<number>();
        if (isUpdate) {
            const q = new SelectQuery(`SELECT ide_vgttr FROM ven_tarifa_transporte WHERE ide_vgtra = $1`);
            q.addIntParam(1, pk);
            const rows = await this.dataSource.createSelectQuery(q);
            rows.forEach((r: any) => existingIds.add(Number(r.ide_vgttr)));
        }

        const receivedIds = new Set<number>();
        const tarifaQueries: any[] = [];

        for (const t of (dtoIn.tarifas || [])) {
            const tarifaIsUpdate = t.ide_vgttr != null;
            const tarifaPk = tarifaIsUpdate
                ? t.ide_vgttr!
                : await this.dataSource.getSeqTable('ven_tarifa_transporte', 'ide_vgttr', 1, dtoIn.login);

            if (tarifaIsUpdate) receivedIds.add(tarifaPk);

            tarifaQueries.push({
                operation: tarifaIsUpdate ? 'update' as const : 'insert' as const,
                module: 'ven',
                tableName: 'tarifa_transporte',
                primaryKey: 'ide_vgttr',
                object: {
                    ide_vgttr: tarifaPk,
                    ide_vgtra: pk,
                    ide_geprov: t.ide_geprov,
                    ide_gecant: t.ide_gecant,
                    ciudad_vgttr: t.ciudad_vgttr || null,
                    nombre1_vgttr: t.nombre1_vgttr ?? null,
                    precio1_vgttr: t.precio1_vgttr ?? null,
                    descripcion1_vgttr: t.descripcion1_vgttr ?? null,
                    activo1_vgttr: t.activo1_vgttr ?? (t.precio1_vgttr != null),
                    nombre2_vgttr: t.nombre2_vgttr ?? null,
                    precio2_vgttr: t.precio2_vgttr ?? null,
                    descripcion2_vgttr: t.descripcion2_vgttr ?? null,
                    activo2_vgttr: t.activo2_vgttr ?? (t.precio2_vgttr != null),
                    nombre3_vgttr: t.nombre3_vgttr ?? null,
                    precio3_vgttr: t.precio3_vgttr ?? null,
                    descripcion3_vgttr: t.descripcion3_vgttr ?? null,
                    activo3_vgttr: t.activo3_vgttr ?? (t.precio3_vgttr != null),
                    nombre4_vgttr: t.nombre4_vgttr ?? null,
                    precio4_vgttr: t.precio4_vgttr ?? null,
                    descripcion4_vgttr: t.descripcion4_vgttr ?? null,
                    activo4_vgttr: t.activo4_vgttr ?? (t.precio4_vgttr != null),
                    comentario_vgttr: t.comentario_vgttr ?? null,
                },
                condition: tarifaIsUpdate ? `ide_vgttr = ${tarifaPk}` : undefined,
            });
        }

        // 3. Eliminar tarifas huérfanas (existían en BD pero no en el request)
        for (const existingId of existingIds) {
            if (!receivedIds.has(existingId)) {
                tarifaQueries.push({
                    operation: 'delete' as const,
                    module: 'ven',
                    tableName: 'tarifa_transporte',
                    primaryKey: 'ide_vgttr',
                    object: { ide_vgttr: existingId },
                });
            }
        }

        if (tarifaQueries.length > 0) {
            await this.core.save({ ...dtoIn, listQuery: tarifaQueries, audit: false });
        }

        return { message: 'ok', ide_vgtra: pk };
    }

    // ─── ENVÍO (cxc_transporte_factura) ───────────────────────────────────────

    async saveEnvio(dtoIn: SaveEnvioDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_cctfa != null;
        const pk = isUpdate ? dtoIn.ide_cctfa! : await this.dataSource.getSeqTable('cxc_transporte_factura', 'ide_cctfa', 1, dtoIn.login);

        // Si es transporte propio y no se envió vehículo/transportista, heredarlos de la guía
        let ideGecam = dtoIn.ide_gecam ?? null;
        let ideGeper = dtoIn.ide_geper ?? null;

        if (dtoIn.es_transporte_propio_cctfa && (!ideGecam || !ideGeper)) {
            const qGuia = new SelectQuery(`
                SELECT placa_gecam, gen_ide_geper
                FROM cxc_guia
                WHERE ide_cccfa = $1
                LIMIT 1
            `);
            qGuia.addIntParam(1, dtoIn.ide_cccfa);
            const guia = await this.dataSource.createSingleQuery(qGuia);
            if (guia) {
                if (!ideGecam && guia.placa_gecam) ideGecam = guia.placa_gecam;
                if (!ideGeper && guia.gen_ide_geper) ideGeper = Number(guia.gen_ide_geper);
            }
        }

        const listQuery = [{
            operation: isUpdate ? 'update' as const : 'insert' as const,
            module: 'cxc',
            tableName: 'transporte_factura',
            primaryKey: 'ide_cctfa',
            object: {
                ide_cctfa: pk,
                ide_cccfa: dtoIn.ide_cccfa,
                ide_vgtra: dtoIn.ide_vgtra ?? null,
                es_transporte_propio_cctfa: dtoIn.es_transporte_propio_cctfa ?? false,
                ide_gecam: ideGecam,
                ide_geper: ideGeper,
                ide_cceen: dtoIn.ide_cceen,
                fecha_inicio_cctfa: dtoIn.fecha_inicio_cctfa ?? null,
                fecha_fin_cctfa: dtoIn.fecha_fin_cctfa ?? null,
                fecha_fin_real_cctfa: dtoIn.fecha_fin_real_cctfa ?? null,
                path_imagen_guia_cctfa: dtoIn.path_imagen_guia_cctfa ?? null,
                base_flete_cctfa: dtoIn.base_flete_cctfa ?? 0,
                valor_iva_flete_cctfa: dtoIn.valor_iva_flete_cctfa ?? 0,
                total_flete_cctfa: dtoIn.total_flete_cctfa ?? 0,
                base_flete_real_cctfa: dtoIn.base_flete_real_cctfa ?? 0,
                valor_iva_flete_real_cctfa: dtoIn.valor_iva_flete_real_cctfa ?? 0,
                total_flete_real_cctfa: dtoIn.total_flete_real_cctfa ?? 0,
                flete_pagado_cctfa: dtoIn.flete_pagado_cctfa ?? true,
                comentario_cctfa: dtoIn.comentario_cctfa ?? null,
            },
            condition: isUpdate ? `ide_cctfa = ${pk}` : undefined,
        }];

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_cctfa: pk };
    }

    async setActivoEnvio(dtoIn: SetActivoTransDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE cxc_transporte_factura SET ide_cceen = $1 WHERE ide_cctfa = $2`,
            [dtoIn.activo ? 1 : 6, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    // ─── RUTA ─────────────────────────────────────────────────────────────────

    async saveRuta(dtoIn: SaveRutaDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_vgrta != null;
        const pk = isUpdate ? dtoIn.ide_vgrta! : await this.dataSource.getSeqTable('ven_ruta', 'ide_vgrta', 1, dtoIn.login);

        const listQuery = [{
            operation: isUpdate ? 'update' as const : 'insert' as const,
            module: 'ven',
            tableName: 'ruta',
            primaryKey: 'ide_vgrta',
            object: {
                ide_vgrta: pk,
                ide_gecam: dtoIn.ide_gecam,
                ide_geper: dtoIn.ide_geper,
                ide_usua: dtoIn.ide_usua,
                fecha_ruta_vgrta: dtoIn.fecha_ruta_vgrta,
                nombre_vgrta: dtoIn.nombre_vgrta ?? null,
                latitud_inicio_vgrta: dtoIn.latitud_inicio_vgrta ?? null,
                longitud_inicio_vgrta: dtoIn.longitud_inicio_vgrta ?? null,
                direccion_inicio_vgrta: dtoIn.direccion_inicio_vgrta ?? null,
                comentario_vgrta: dtoIn.comentario_vgrta ?? null,
            },
            condition: isUpdate ? `ide_vgrta = ${pk}` : undefined,
        }];

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ide_vgrta: pk };
    }

    async deleteRuta(dtoIn: { ide_vgrta: number } & HeaderParamsDto) {
        await this.dataSource.pool.query(`DELETE FROM ven_ruta_det WHERE ide_vgrta = $1`, [dtoIn.ide_vgrta]);
        await this.dataSource.pool.query(`DELETE FROM ven_ruta WHERE ide_vgrta = $1`, [dtoIn.ide_vgrta]);
        return { message: 'ok' };
    }

    // ─── RUTA DETALLE ─────────────────────────────────────────────────────────

    async saveRutaDet(dtoIn: SaveRutaDetDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ide_vgrtd != null;
        const pk = isUpdate ? dtoIn.ide_vgrtd! : await this.dataSource.getSeqTable('ven_ruta_det', 'ide_vgrtd', 1, dtoIn.login);

        const listQuery = [{
            operation: isUpdate ? 'update' as const : 'insert' as const,
            module: 'ven',
            tableName: 'ruta_det',
            primaryKey: 'ide_vgrtd',
            object: {
                ide_vgrtd: pk,
                ide_vgrta: dtoIn.ide_vgrta,
                orden_vgrtd: dtoIn.orden_vgrtd,
                tipo_vgrtd: dtoIn.tipo_vgrtd ?? 'ENTREGA',
                ide_cccfa: dtoIn.ide_cccfa ?? null,
                ide_cctfa: dtoIn.ide_cctfa ?? null,
                descripcion_vgrtd: dtoIn.descripcion_vgrtd,
                latitud_vgrtd: dtoIn.latitud_vgrtd ?? null,
                longitud_vgrtd: dtoIn.longitud_vgrtd ?? null,
                direccion_vgrtd: dtoIn.direccion_vgrtd ?? null,
                realizado_vgrtd: dtoIn.realizado_vgrtd ?? false,
                comentario_vgrtd: dtoIn.comentario_vgrtd ?? null,
            },
            condition: isUpdate ? `ide_vgrtd = ${pk}` : undefined,
        }];

        await this.core.save({ ...dtoIn, listQuery, audit: false });

        // Si la parada tiene envío vinculado, sincronizar vehículo + chofer + fecha desde la ruta
        if (dtoIn.ide_cctfa != null) {
            await this.dataSource.pool.query(`
                UPDATE cxc_transporte_factura e
                SET ide_gecam = r.ide_gecam,
                    ide_geper = r.ide_geper,
                    fecha_inicio_cctfa = COALESCE(e.fecha_inicio_cctfa, r.fecha_ruta_vgrta),
                    ide_cceen = CASE WHEN e.ide_cceen = 1 THEN 2 ELSE e.ide_cceen END
                FROM ven_ruta r
                WHERE e.ide_cctfa = $1 AND r.ide_vgrta = $2
            `, [dtoIn.ide_cctfa, dtoIn.ide_vgrta]);
        }

        return { message: 'ok', ide_vgrtd: pk };
    }

    async deleteRutaDet(dtoIn: { ide_vgrtd: number } & HeaderParamsDto) {
        await this.dataSource.pool.query(`DELETE FROM ven_ruta_det WHERE ide_vgrtd = $1`, [dtoIn.ide_vgrtd]);
        return { message: 'ok' };
    }
}
