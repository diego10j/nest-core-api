import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { BaseService } from '../../../../common/base-service';
import { HeaderParamsDto } from '../../../../common/dto/common-params.dto';
import { getCurrentDate, getCurrentTime } from '../../../../util/helpers/date-util';
import { DataSourceService } from '../../../connection/datasource.service';
import { ObjectQueryDto } from '../../../connection/dto';
import { CoreService } from '../../../core.service';

import { IdCatalogoDto } from './dto/id-catalogo.dto';
import { IdDetCatalogoDto } from './dto/id-det-catalogo.dto';
import { SaveCatalogoDto } from './dto/save-catalogo.dto';
import { SetActivoCatalogoDto } from './dto/set-activo-catalogo.dto';

@Injectable()
export class CatalogosSaveService extends BaseService {
    private readonly logger = new Logger(CatalogosSaveService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    private buildCabeceraObject(dtoIn: SaveCatalogoDto & HeaderParamsDto, ideInccat: number, isUpdate: boolean) {
        const obj: Record<string, unknown> = {
            ide_inccat: ideInccat,
            nombre_inccat: dtoIn.cabecera.nombre_inccat,
            descripcion_inccat: dtoIn.cabecera.descripcion_inccat ?? null,
            desc_corta_inccat: dtoIn.cabecera.desc_corta_inccat ?? null,
            estado_inccat: dtoIn.cabecera.estado_inccat ?? true,
            orden_inccat: dtoIn.cabecera.orden_inccat ?? 0,
            imagen_inccat: dtoIn.cabecera.imagen_inccat ?? null,
            imagenes_inccat: dtoIn.cabecera.imagenes_inccat
                ? JSON.stringify(dtoIn.cabecera.imagenes_inccat)
                : null,
            path_inccat: dtoIn.cabecera.path_inccat ?? null,
            vistas_inccat: dtoIn.cabecera.vistas_inccat ?? 0,
            color_inccat: dtoIn.cabecera.color_inccat ?? null,
            ide_tipo_inccat: dtoIn.cabecera.ide_tipo_inccat ?? null,
        };

        if (isUpdate) {
            obj.usuario_actua = dtoIn.login;
            obj.fecha_actua = getCurrentDate();
            obj.hora_actua = getCurrentTime();
        } else {
            obj.ide_empr = dtoIn.ideEmpr;
            obj.usuario_ingre = dtoIn.login;
            obj.fecha_ingre = getCurrentDate();
            obj.hora_ingre = getCurrentTime();
        }

        return obj;
    }

    private buildDetalleObject(det: SaveCatalogoDto['detalle'][0], ideInccat: number, ideIndcat: number, dtoIn: HeaderParamsDto) {
        return {
            ide_indcat: ideIndcat,
            ide_inccat: ideInccat,
            ide_inarti: det.ide_inarti,
            orden_indcat: det.orden_indcat ?? 0,
            activo_indcat: det.activo_indcat ?? true,
            publica_sin_stock_indcat: det.publica_sin_stock_indcat ?? true,
            descripcion_indcat: det.descripcion_indcat ?? null,
            fotos_indcat: det.fotos_indcat ? JSON.stringify(det.fotos_indcat) : null,
            video_indcat: det.video_indcat ?? null,
            url_indcat: det.url_indcat ?? null,
            usuario_ingre: dtoIn.login,
            fecha_ingre: getCurrentDate(),
            hora_ingre: getCurrentTime(),
        };
    }

    async saveCatalogo(dtoIn: SaveCatalogoDto & HeaderParamsDto) {
        const module = 'inv';
        const tableNameCab = 'cab_catalogo';
        const primaryKeyCab = 'ide_inccat';
        const tableNameDet = 'det_catalogo';
        const primaryKeyDet = 'ide_indcat';

        const listQuery: ObjectQueryDto[] = [];
        let ideInccat: number;

        if (dtoIn.isUpdate) {
            if (dtoIn.cabecera.ide_inccat == null) {
                throw new BadRequestException('Se requiere ide_inccat para actualizar el catálogo');
            }
            ideInccat = dtoIn.cabecera.ide_inccat;

            listQuery.push({
                operation: 'update',
                module,
                tableName: tableNameCab,
                primaryKey: primaryKeyCab,
                object: this.buildCabeceraObject(dtoIn, ideInccat, true),
                condition: `${primaryKeyCab} = ${ideInccat}`,
            });
        } else {
            ideInccat = await this.dataSource.getSeqTable(
                `${module}_${tableNameCab}`,
                primaryKeyCab,
                1,
                dtoIn.login,
            );

            listQuery.push({
                operation: 'insert',
                module,
                tableName: tableNameCab,
                primaryKey: primaryKeyCab,
                object: this.buildCabeceraObject(dtoIn, ideInccat, false),
            });
        }

        // Si es actualización, eliminar los detalles existentes y reinsertar
        if (dtoIn.isUpdate) {
            listQuery.push({
                operation: 'delete',
                module,
                tableName: tableNameDet,
                primaryKey: primaryKeyDet,
                object: {},
                condition: `ide_inccat = ${ideInccat}`,
            } as ObjectQueryDto);
        }

        // Insertar los nuevos detalles y sus cantidades
        const tableNameCant = 'cant_det_catalogo';
        const primaryKeyCant = 'ide_incdc';

        for (const det of dtoIn.detalle) {
            if (!det.ide_inarti) continue;

            const ideIndcat = await this.dataSource.getSeqTable(
                `${module}_${tableNameDet}`,
                primaryKeyDet,
                1,
                dtoIn.login,
            );

            listQuery.push({
                operation: 'insert',
                module,
                tableName: tableNameDet,
                primaryKey: primaryKeyDet,
                object: this.buildDetalleObject(det, ideInccat, ideIndcat, dtoIn),
            });

            // Insertar cantidades del detalle
            if (det.cantidades && det.cantidades.length > 0) {
                for (const cant of det.cantidades) {
                    if (cant.cantidad_incdc == null) continue;

                    const ideIncdc = await this.dataSource.getSeqTable(
                        `${module}_${tableNameCant}`,
                        primaryKeyCant,
                        1,
                        dtoIn.login,
                    );

                    listQuery.push({
                        operation: 'insert',
                        module,
                        tableName: tableNameCant,
                        primaryKey: primaryKeyCant,
                        object: {
                            ide_incdc: ideIncdc,
                            ide_indcat: ideIndcat,
                            cantidad_incdc: cant.cantidad_incdc,
                            unidad_medida_incdc: cant.unidad_medida_incdc ?? null,
                            descripcion_incdc: cant.descripcion_incdc ?? null,
                            orden_incdc: cant.orden_incdc ?? 0,
                            activo_incdc: cant.activo_incdc ?? true,
                            usuario_ingre: dtoIn.login,
                            fecha_ingre: getCurrentDate(),
                            hora_ingre: getCurrentTime(),
                        },
                    });
                }
            }
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideInccat };
    }

    async deleteCatalogo(dtoIn: IdCatalogoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `DELETE FROM inv_det_catalogo WHERE ide_inccat = $1`,
            [dtoIn.ide_inccat],
        );
        await this.dataSource.pool.query(
            `DELETE FROM inv_cab_catalogo WHERE ide_inccat = $1`,
            [dtoIn.ide_inccat],
        );
        return { message: 'ok', rowCount: 1 };
    }

    async deleteDetalleCatalogo(dtoIn: IdDetCatalogoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `DELETE FROM inv_det_catalogo WHERE ide_indcat = $1`,
            [dtoIn.ide_indcat],
        );
        return { message: 'ok', rowCount: 1 };
    }

    async setActivoCatalogo(dtoIn: SetActivoCatalogoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE inv_cab_catalogo
             SET estado_inccat = $1,
                 usuario_actua = $3,
                 fecha_actua = $4,
                 hora_actua = $5
             WHERE ide_inccat = $2`,
            [dtoIn.activo, dtoIn.ide, dtoIn.login, getCurrentDate(), getCurrentTime()],
        );
        return { message: 'ok' };
    }

    async setActivoDetalleCatalogo(dtoIn: SetActivoCatalogoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE inv_det_catalogo
             SET activo_indcat = $1,
                 usuario_actua = $3,
                 fecha_actua = $4,
                 hora_actua = $5
             WHERE ide_indcat = $2`,
            [dtoIn.activo, dtoIn.ide, dtoIn.login, getCurrentDate(), getCurrentTime()],
        );
        return { message: 'ok' };
    }

    async updateImagenCatalogo(ideInccat: number, fileName: string, dtoIn: HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'inv',
            tableName: 'cab_catalogo',
            primaryKey: 'ide_inccat',
            object: {
                ide_inccat: ideInccat,
                imagen_inccat: fileName,
                usuario_actua: dtoIn.login,
                fecha_actua: getCurrentDate(),
                hora_actua: getCurrentTime(),
            },
            condition: `ide_inccat = ${ideInccat}`,
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideInccat, imagen: fileName };
    }

    async appendImagenesCatalogo(ideInccat: number, fileNames: string[], dtoIn: HeaderParamsDto) {
        const result = await this.dataSource.pool.query(
            `SELECT imagenes_inccat FROM inv_cab_catalogo WHERE ide_inccat = $1`,
            [ideInccat],
        );

        let imagenesActuales: string[] = [];
        if (result.rows.length > 0 && result.rows[0].imagenes_inccat) {
            try {
                imagenesActuales = JSON.parse(result.rows[0].imagenes_inccat);
                if (!Array.isArray(imagenesActuales)) imagenesActuales = [];
            } catch {
                imagenesActuales = [];
            }
        }

        const nuevasImagenes = [...imagenesActuales, ...fileNames];

        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'inv',
            tableName: 'cab_catalogo',
            primaryKey: 'ide_inccat',
            object: {
                ide_inccat: ideInccat,
                imagenes_inccat: JSON.stringify(nuevasImagenes),
                usuario_actua: dtoIn.login,
                fecha_actua: getCurrentDate(),
                hora_actua: getCurrentTime(),
            },
            condition: `ide_inccat = ${ideInccat}`,
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideInccat, imagenes: nuevasImagenes };
    }

    async removeImagenCatalogo(ideInccat: number, fileName: string, dtoIn: HeaderParamsDto) {
        const result = await this.dataSource.pool.query(
            `SELECT imagenes_inccat FROM inv_cab_catalogo WHERE ide_inccat = $1`,
            [ideInccat],
        );

        let imagenesActuales: string[] = [];
        if (result.rows.length > 0 && result.rows[0].imagenes_inccat) {
            try {
                imagenesActuales = JSON.parse(result.rows[0].imagenes_inccat);
                if (!Array.isArray(imagenesActuales)) imagenesActuales = [];
            } catch {
                imagenesActuales = [];
            }
        }

        const imagenesFiltradas = imagenesActuales.filter((img) => img !== fileName);

        const listQuery: ObjectQueryDto[] = [{
            operation: 'update',
            module: 'inv',
            tableName: 'cab_catalogo',
            primaryKey: 'ide_inccat',
            object: {
                ide_inccat: ideInccat,
                imagenes_inccat: imagenesFiltradas.length > 0 ? JSON.stringify(imagenesFiltradas) : null,
                usuario_actua: dtoIn.login,
                fecha_actua: getCurrentDate(),
                hora_actua: getCurrentTime(),
            },
            condition: `ide_inccat = ${ideInccat}`,
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideInccat, imagenes: imagenesFiltradas };
    }

    // ─── TIPO CATÁLOGO ──────────────────────────────────────────────────────

    async setActivoTipoCatalogo(dtoIn: SetActivoCatalogoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE inv_tipo_catalogo
             SET activo_intica = $1,
                 usuario_actua = $3,
                 fecha_actua = $4,
                 hora_actua = $5
             WHERE ide_intica = $2`,
            [dtoIn.activo, dtoIn.ide, dtoIn.login, getCurrentDate(), getCurrentTime()],
        );
        return { message: 'ok' };
    }
}
