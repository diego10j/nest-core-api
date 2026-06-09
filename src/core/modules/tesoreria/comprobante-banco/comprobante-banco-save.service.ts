import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { CoreService } from 'src/core/core.service';

import { SaveComprobanteBancoDto } from './dto/save-comprobante-banco.dto';
import { SetActivoDto } from './dto/set-activo.dto';

@Injectable()
export class ComprobanteBancoSaveService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async saveComprobante(dtoIn: SaveComprobanteBancoDto & HeaderParamsDto) {
        const isUpdate = dtoIn.ideTeincb != null;
        const listQuery: ObjectQueryDto[] = [];
        let ideTeincb: number;

        const object: Record<string, unknown> = {
            ide_empr: dtoIn.ideEmpr,
            ide_sucu: dtoIn.ideSucu,
            ide_teclb: dtoIn.ideTeclb ?? null,
            foto_teincb: dtoIn.fotoTeincb ?? null,
            tipo_trns_teincb: dtoIn.tipoTrnsTeincb ?? null,
            valor_teincb: dtoIn.valorTeincb ?? null,
            num_comprobante_teincb: dtoIn.numComprobanteTeincb ?? null,
            fecha_teincb: dtoIn.fechaTeincb ?? null,
            ordenante_teincb: dtoIn.ordenanteTeincb ?? null,
            cuenta_origen_teincb: dtoIn.cuentaOrigenTeincb ?? null,
            banco_origen_teincb: dtoIn.bancoOrigenTeincb ?? null,
            beneficiario_teincb: dtoIn.beneficiarioTeincb ?? null,
            cuenta_destino_teincb: dtoIn.cuentaDestinoTeincb ?? null,
            banco_destino_teincb: dtoIn.bancoDestinoTeincb ?? null,
            texto_original_teincb: dtoIn.textoOriginalTeincb ?? null,
            por_ocr_teincb: dtoIn.porOcrTeincb ?? false,
            por_ia_teincb: dtoIn.porIaTeincb ?? false,
            validado_teincb: dtoIn.validadoTeincb ?? false,
            fecha_validacion_teincb: dtoIn.fechaValidacionTeincb ?? null,
            activo_teincb: dtoIn.activoTeincb ?? true,
            es_efectivo_teincb: dtoIn.esEfectivoTeincb ?? false,
            valor_entregado_teincb: dtoIn.valorEntregadoTeincb ?? null,
            cambio_teincb: dtoIn.cambioTeincb ?? null,
        };

        if (isUpdate) {
            ideTeincb = dtoIn.ideTeincb!;
            object.ide_teincb = ideTeincb;
            listQuery.push({
                operation: 'update',
                module: 'tes',
                tableName: 'info_comprobante_banco',
                primaryKey: 'ide_teincb',
                object,
            });
        } else {
            ideTeincb = await this.dataSource.getSeqTable('tes_info_comprobante_banco', 'ide_teincb', 1, dtoIn.login);
            object.ide_teincb = ideTeincb;
            listQuery.push({
                operation: 'insert',
                module: 'tes',
                tableName: 'info_comprobante_banco',
                primaryKey: 'ide_teincb',
                object,
            });
        }

        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok', ideTeincb };
    }

    async setActivoComprobante(dtoIn: SetActivoDto & HeaderParamsDto) {
        await this.dataSource.pool.query(
            `UPDATE tes_info_comprobante_banco SET activo_teincb = $1 WHERE ide_teincb = $2`,
            [dtoIn.activo, dtoIn.ide],
        );
        return { message: 'ok' };
    }

    async deleteComprobante(ideTeincb: number, dtoIn: HeaderParamsDto) {
        const listQuery: ObjectQueryDto[] = [{
            operation: 'delete',
            module: 'tes',
            tableName: 'info_comprobante_banco',
            primaryKey: 'ide_teincb',
            object: { ide_teincb: ideTeincb },
            condition: `ide_teincb = ${ideTeincb}`,
        }];
        await this.core.save({ ...dtoIn, listQuery, audit: false });
        return { message: 'ok' };
    }
}
