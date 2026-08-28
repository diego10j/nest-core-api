import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

/** Tipo de transacción bancaria "cheque posfechado" CxC (legacy: ide_tettb === 13) - mismo
 * criterio hardcodeado que CxcTransaccionesSaveService.IDE_TETTB_CHEQUE_POSFECHADO_CXC. */
const IDE_TETTB_CHEQUE_POSFECHADO_CXC = 13;

/**
 * Consultas de apoyo para registrar un Cheque por Cobrar Devuelto. La persistencia/orquestación
 * vive en ChequeDevueltoSaveService.
 */
@Injectable()
export class ChequeDevueltoService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables(['p_tes_estado_lib_banco_normal'])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Info batch de un cheque posfechado CxC para el diálogo "Registrar Cheque Devuelto":
     * datos del cheque, cliente (vía cxc_cabece_transa del pago original), si está cubierto por
     * un Depósito de Caja (y si ya se completó), y la comisión por defecto configurada en su
     * cuenta bancaria (caja "Cheques Diferidos").
     */
    async getInfoChequeDevuelto(ideTeclb: number, dtoIn: HeaderParamsDto) {
        const ideTeelbNormal = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const query = new SelectQuery(`
            SELECT
                a.ide_teclb,
                a.ide_teelb,
                a.ide_tecba,
                cb.nombre_tecba AS caja,
                cb.comision_cheque_devuelto_tecba,
                cb.iva_comision_cheque_tecba,
                a.valor_teclb AS valor,
                a.beneficiari_teclb AS cliente,
                a.fecha_trans_teclb AS fecha_entrega,
                a.fec_cam_est_teclb AS fecha_efectiva,
                a.devuelto_teclb,
                a.depositado_teclb,
                ct.ide_geper,
                dc.ide_tedca,
                dc.completado_tedca,
                dc.ide_tecba_destino,
                cd.nombre_tecba AS nombre_tecba_destino,
                bd.nombre_teban AS nombre_teban_destino
            FROM tes_cab_libr_banc a
            INNER JOIN tes_cuenta_banco cb ON cb.ide_tecba = a.ide_tecba
            LEFT JOIN cxc_detall_transa dt ON dt.ide_teclb = a.ide_teclb AND dt.numero_pago_ccdtr > 0
            LEFT JOIN cxc_cabece_transa ct ON ct.ide_ccctr = dt.ide_ccctr
            LEFT JOIN tes_det_deposito_caja_mov ddm ON ddm.ide_teclb = a.ide_teclb
            LEFT JOIN tes_cab_deposito_caja dc ON dc.ide_tedca = ddm.ide_tedca
            LEFT JOIN tes_cuenta_banco cd ON cd.ide_tecba = dc.ide_tecba_destino
            LEFT JOIN tes_banco bd ON bd.ide_teban = cd.ide_teban
            WHERE a.ide_teclb = $1
              AND a.ide_tettb = ${IDE_TETTB_CHEQUE_POSFECHADO_CXC}
              AND a.ide_empr = $2
              AND a.ide_sucu = $3
        `);
        query.addIntParam(1, ideTeclb);
        query.addIntParam(2, dtoIn.ideEmpr);
        query.addIntParam(3, dtoIn.ideSucu);
        const info = await this.dataSource.createSingleQuery(query);
        if (!info) return null;

        return { ...info, ide_teelb_normal: ideTeelbNormal };
    }
}
