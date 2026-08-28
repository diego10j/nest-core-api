import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetComprobantesBancoDto } from './dto/get-comprobantes-banco.dto';

@Injectable()
export class ComprobanteBancoService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    async getComprobantes(dtoIn: GetComprobantesBancoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                c.ide_teincb,
                c.ide_teclb,
                c.ide_empr,
                c.ide_sucu,
                c.foto_teincb,
                c.tipo_trns_teincb,
                c.valor_teincb,
                c.num_comprobante_teincb,
                c.fecha_teincb,
                c.ordenante_teincb,
                c.cuenta_origen_teincb,
                c.banco_origen_teincb,
                c.beneficiario_teincb,
                c.cuenta_destino_teincb,
                c.banco_destino_teincb,
                c.texto_original_teincb,
                c.por_ocr_teincb,
                c.por_ia_teincb,
                c.validado_teincb,
                c.fecha_validacion_teincb,
                c.activo_teincb,
                c.es_efectivo_teincb,
                c.valor_entregado_teincb,
                c.cambio_teincb
            FROM tes_info_comprobante_banco c
            WHERE ($3::int8 IS NULL OR c.ide_teclb = $3)
              AND ($4::varchar IS NULL OR c.tipo_trns_teincb = $4)
            ORDER BY c.fecha_teincb DESC, c.ide_teincb DESC
        `, dtoIn);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addParam(3, dtoIn.ideTeclb ?? null);
        query.addParam(4, dtoIn.tipoTrnsTeincb ?? null);
        return this.dataSource.createQuery(query, 'tes_info_comprobante_banco');
    }

    async getComprobanteById(ideTeincb: number) {
        const query = new SelectQuery(`
            SELECT
                c.ide_teincb,
                c.ide_teclb,
                c.ide_empr,
                c.ide_sucu,
                c.foto_teincb,
                c.tipo_trns_teincb,
                c.valor_teincb,
                c.num_comprobante_teincb,
                c.fecha_teincb,
                c.ordenante_teincb,
                c.cuenta_origen_teincb,
                c.banco_origen_teincb,
                c.beneficiario_teincb,
                c.cuenta_destino_teincb,
                c.banco_destino_teincb,
                c.texto_original_teincb,
                c.por_ocr_teincb,
                c.por_ia_teincb,
                c.validado_teincb,
                c.fecha_validacion_teincb,
                c.activo_teincb,
                c.es_efectivo_teincb,
                c.valor_entregado_teincb,
                c.cambio_teincb
            FROM tes_info_comprobante_banco c
            WHERE c.ide_teincb = $1
        `);
        query.addIntParam(1, ideTeincb);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Comprobantes de un movimiento de libro bancos - incluye también el comprobante del
     * movimiento "hermano" que comparte el mismo asiento contable (ide_cnccc): en flujos que
     * generan un PAR de movimientos para una misma transacción física (Depósito de Caja:
     * retiro de caja + ingreso a banco; Transferencia entre Cuentas: igual) el comprobante solo
     * se guarda ligado a UNO de los 2 (ver DepositoCajaSaveService.completar, que lo liga solo a
     * ideRetiro) - sin este fallback, consultar el detalle del movimiento del otro lado (ej. el
     * ingreso al banco) no mostraba ninguna imagen aunque sí existiera.
     */
    async getComprobantesByBanco(ideTeclb: number, dtoIn: GetComprobantesBancoDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT
                c.ide_teincb,
                c.ide_teclb,
                c.ide_empr,
                c.ide_sucu,
                c.foto_teincb,
                c.tipo_trns_teincb,
                c.valor_teincb,
                c.num_comprobante_teincb,
                c.fecha_teincb,
                c.ordenante_teincb,
                c.cuenta_origen_teincb,
                c.banco_origen_teincb,
                c.beneficiario_teincb,
                c.cuenta_destino_teincb,
                c.banco_destino_teincb,
                c.texto_original_teincb,
                c.por_ocr_teincb,
                c.por_ia_teincb,
                c.validado_teincb,
                c.fecha_validacion_teincb,
                c.activo_teincb,
                c.es_efectivo_teincb,
                c.valor_entregado_teincb,
                c.cambio_teincb
            FROM tes_info_comprobante_banco c
            WHERE c.ide_teclb = $1
               OR c.ide_teclb IN (
                    SELECT hermano.ide_teclb
                    FROM tes_cab_libr_banc actual
                    INNER JOIN tes_cab_libr_banc hermano
                        ON hermano.ide_cnccc = actual.ide_cnccc
                       AND hermano.ide_teclb != actual.ide_teclb
                    WHERE actual.ide_teclb = $1
                      AND actual.ide_cnccc IS NOT NULL
               )
            ORDER BY c.fecha_teincb DESC, c.ide_teincb DESC
        `, dtoIn);
        query.addIntParam(1, ideTeclb);
        return this.dataSource.createQuery(query, 'tes_info_comprobante_banco');
    }
}
