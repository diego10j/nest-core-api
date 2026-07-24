import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetChequesNoConciliadosDto } from './dto/get-cheques-no-conciliados.dto';
import { GetChequesPosfechadosCxPDto } from './dto/get-cheques-posfechados-cxp.dto';

@Injectable()
export class ChequesService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Retorna los cheques posfechados por cobrar pendientes (ide_tettb = 13)
     */
    async getChequesPosfechadosCxCPendientes(dtoIn: HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   a.fec_cam_est_teclb,
                   b.nombre_tettb    AS transaccion,
                   a.numero_teclb    AS numero,
                   a.beneficiari_teclb AS beneficiario,
                   a.valor_teclb     AS valor,
                   a.fecha_trans_teclb AS fecha_transaccion,
                   a.num_comprobante_teclb AS num_cuenta_cheque,
                   (SELECT nombre_teban FROM tes_banco WHERE ide_teban = a.ide_teban) AS banco_cheque,
                   a.observacion_teclb AS observacion
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
                AND a.ide_teelb = $1
            WHERE a.ide_tettb = 13
              AND (a.devuelto_teclb = false OR a.devuelto_teclb IS NULL)
              AND a.conciliado_teclb = false
              AND a.ide_sucu = $2
            ORDER BY a.fec_cam_est_teclb, a.ide_teclb
        `);
        query.addIntParam(1, ideTeelb);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los cheques posfechados por pagar pendientes (ide_tettb = 14)
     */
    async getChequesPosfechadosCxPPendientes(dtoIn: GetChequesPosfechadosCxPDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        // Filtro opcional por proveedor: cheques vinculados a transacciones CxP
        // del proveedor (paridad getSqlChequesPosfechadosProveedor legacy)
        const condicionProveedor = dtoIn.ide_geper
            ? `AND EXISTS (
                   SELECT 1
                   FROM cxp_detall_transa c
                   INNER JOIN cxp_cabece_transa d ON c.ide_cpctr = d.ide_cpctr
                   WHERE c.ide_teclb = a.ide_teclb
                     AND d.ide_geper = ${Number(dtoIn.ide_geper)}
               )`
            : '';

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   a.fec_cam_est_teclb,
                   b.nombre_tettb    AS transaccion,
                   a.numero_teclb    AS numero,
                   a.beneficiari_teclb AS beneficiario,
                   a.valor_teclb     AS valor,
                   a.fecha_trans_teclb AS fecha_transaccion,
                   a.observacion_teclb AS observacion
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
                AND a.ide_teelb = $1
            WHERE a.ide_tettb = 14
              AND a.conciliado_teclb = false
              AND a.ide_sucu = $2
              ${condicionProveedor}
            ORDER BY a.fec_cam_est_teclb, a.ide_teclb
        `);
        query.addIntParam(1, ideTeelb);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los cheques no conciliados de una cuenta bancaria.
     * UNION de depositos con cheques internos + depositos sin cheques.
     */
    async getChequesNoConciliados(dtoIn: GetChequesNoConciliadosDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            (
                SELECT a.ide_teclb,
                       b.ide_teclb       AS ide_teclb_caja,
                       a.fecha_trans_teclb,
                       c.nombre_tettb    AS transaccion,
                       a.numero_teclb    AS numero,
                       b.beneficiari_teclb AS beneficiario,
                       b.valor_teclb     AS valor,
                       b.fec_cam_est_teclb AS fecha_vence,
                       b.observacion_teclb AS observacion
                FROM tes_cab_libr_banc a
                INNER JOIN tes_cab_libr_banc b ON a.ide_teclb = b.tes_ide_teclb
                INNER JOIN tes_tip_tran_banc c ON a.ide_tettb = c.ide_tettb
                WHERE a.ide_tecba = $1
                  AND a.ide_tettb = 0
                  AND a.ide_teelb  = $2
                  AND a.conciliado_teclb = false
                  AND b.devuelto_teclb   = false
                  AND a.ide_sucu = $3
            )
            UNION
            (
                SELECT a.ide_teclb,
                       a.tes_ide_teclb   AS ide_teclb_caja,
                       a.fecha_trans_teclb,
                       c.nombre_tettb    AS transaccion,
                       a.numero_teclb    AS numero,
                       a.beneficiari_teclb AS beneficiario,
                       a.valor_teclb     AS valor,
                       a.fec_cam_est_teclb AS fecha_vence,
                       a.observacion_teclb AS observacion
                FROM tes_cab_libr_banc a
                INNER JOIN tes_tip_tran_banc c ON a.ide_tettb = c.ide_tettb
                WHERE a.ide_tecba = $1
                  AND a.ide_tettb = 0
                  AND a.ide_teelb  = $2
                  AND a.conciliado_teclb = false
                  AND a.devuelto_teclb  = false
                  AND a.tes_ide_teclb IS NULL
                  AND a.ide_sucu = $3
            )
            ORDER BY 3, 1
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addIntParam(3, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }
}
