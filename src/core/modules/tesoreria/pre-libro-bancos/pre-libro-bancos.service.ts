import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { ExisteNumTransaccionDto } from './dto/existe-num-transaccion.dto';
import { GetDetalleTransaccionDto } from './dto/get-detalle-transaccion.dto';
import { GetSaldoCuentaDto } from './dto/get-saldo-cuenta.dto';
import { GetTransaccionesCuentaDto } from './dto/get-transacciones-cuenta.dto';

@Injectable()
export class PreLibroBancosService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables([
                'p_tes_estado_lib_banco_normal',
                'p_tes_tran_reversa_mas',
                'p_tes_tran_reversa_menos',
                'p_tes_tran_transferencia_mas',
                'p_tes_tran_transferencia_menos',
                'p_con_beneficiario_empresa',
                'p_con_estado_comprobante_anulado',
                'p_tes_nota_debito',
                'p_tes_nota_credito',
                'p_tes_tran_cheque',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    /**
     * Retorna las transacciones de una cuenta bancaria en un rango de fechas
     */
    async getTransaccionesCuenta(dtoIn: GetTransaccionesCuentaDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const condicionConcilia = dtoIn.soloNoConciliados ? 'AND a.conciliado_teclb = false' : '';

        const query = new SelectQuery(`
            SELECT
                a.fecha_trans_teclb,
                a.ide_cnccc,
                a.numero_teclb,
                b.nombre_tettb,
                a.beneficiari_teclb,
                CASE WHEN b.signo_tettb = 1  THEN a.valor_teclb END AS ingresos,
                CASE WHEN b.signo_tettb = -1 THEN a.valor_teclb END AS egresos,
                a.observacion_teclb,
                a.ide_teclb,
                a.fec_cam_est_teclb    AS fecha_efectivo,
                a.num_comprobante_teclb AS num_comprobante,
                a.conciliado_teclb     AS conciliado,
                a.usuario_ingre,
                a.usuario_actua,
                a.fecha_ingre,
                a.hora_ingre,
                a.fecha_actua,
                a.hora_actua
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba  = $1
              AND a.ide_teelb  = $2
              AND a.ide_sucu   = $3
              AND a.fecha_trans_teclb BETWEEN $4 AND $5
              ${condicionConcilia}
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addIntParam(3, dtoIn.ideSucu);
        query.addStringParam(4, dtoIn.fechaInicio);
        query.addStringParam(5, dtoIn.fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna las transacciones NO conciliadas de una cuenta
     */
    async getTransaccionesCuentaNoConciliado(dtoIn: GetTransaccionesCuentaDto & HeaderParamsDto) {
        return this.getTransaccionesCuenta({ ...dtoIn, soloNoConciliados: true });
    }

    /**
     * Retorna el detalle completo de una transaccion de tesoreria
     * (UNION de tes_det_libr_banc + cxp_detall_transa + cxc_detall_transa + self-ref)
     */
    async getDetalleTransaccion(dtoIn: GetDetalleTransaccionDto & HeaderParamsDto) {
        const query = new SelectQuery(`
            SELECT a.ide_tedlb,
                   c.fecha_trans_teclb AS fecha_tran,
                   b.nombre_inarti    AS descripcion,
                   a.concepto_tedlb   AS concepto,
                   a.valor_tedlb      AS valor
            FROM tes_det_libr_banc a
            INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
            INNER JOIN tes_cab_libr_banc c ON a.ide_teclb = c.ide_teclb
            WHERE a.ide_teclb = $1
            UNION
            SELECT ide_cpdtr,
                   fecha_trans_cpdtr,
                   'PAGO',
                   observacion_cpdtr,
                   valor_cpdtr
            FROM cxp_detall_transa
            WHERE ide_teclb = $1
              AND ide_cpttr IN (3, 19)
            UNION
            SELECT ide_ccdtr,
                   fecha_trans_ccdtr,
                   'PAGO',
                   observacion_ccdtr,
                   valor_ccdtr
            FROM cxc_detall_transa
            WHERE ide_teclb = $1
              AND ide_ccttr IN (0, 10)
            UNION
            SELECT ide_teclb,
                   fecha_trans_teclb,
                   h.nombre_tettb || '   -   ' || COALESCE(g.numero_teclb, ''),
                   g.beneficiari_teclb || ' - ' || g.observacion_teclb,
                   g.valor_teclb
            FROM tes_cab_libr_banc g
            INNER JOIN tes_tip_tran_banc h ON g.ide_tettb = h.ide_tettb
            WHERE g.tes_ide_teclb = $1
               OR g.tes_ide_teclb1 = $1
        `);
        query.addIntParam(1, dtoIn.ideTeclb);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna el saldo inicial de una cuenta a una fecha determinada
     * (transacciones con fecha_trans_teclb < fecha)
     */
    async getSaldoInicialCuenta(dtoIn: GetSaldoCuentaDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT SUM(a.valor_teclb * b.signo_tettb) AS saldo
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba = $1
              AND a.ide_teelb  = $2
              AND a.fecha_trans_teclb < $3
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addStringParam(3, dtoIn.fecha ?? getCurrentDate());
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna el saldo total de una cuenta (todas las transacciones)
     */
    async getSaldoCuenta(dtoIn: GetSaldoCuentaDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT SUM(a.valor_teclb * b.signo_tettb) AS saldo
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba = $1
              AND a.ide_teelb  = $2
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Obtiene el numero maximo de secuencial para un tipo de transaccion y cuenta
     */
    async getNumMaximoTipoTransaccion(ideTecba: number, ideTettb: number, ideSucu: number) {
        const strNotaDebito = this.variables.get('p_tes_nota_debito');
        const strNotaCredito = this.variables.get('p_tes_nota_credito');
        const strCheque = this.variables.get('p_tes_tran_cheque');
        const ideTettbStr = String(ideTettb);

        if (ideTettbStr === strNotaDebito || ideTettbStr === strNotaCredito) {
            const query = new SelectQuery(`
                SELECT COALESCE(MAX(secuencial_tesec), 0) + 1 AS secuencial
                FROM tes_secuencial_trans
                WHERE ide_tettb = $1
                  AND ide_tecba = $2
                  AND ide_sucu  = $3
            `);
            query.addIntParam(1, ideTettb);
            query.addIntParam(2, ideTecba);
            query.addIntParam(3, ideSucu);
            return this.dataSource.createSingleQuery(query);
        }

        if (ideTettbStr === strCheque || ideTettbStr === '14') {
            const query = new SelectQuery(`
                SELECT COALESCE(MAX(secuencial_tesec), 0) + 1 AS secuencial
                FROM tes_secuencial_trans
                WHERE ide_tettb IN ($1, 14)
                  AND ide_tecba = $2
                  AND ide_sucu  = $3
            `);
            query.addIntParam(1, ideTettb);
            query.addIntParam(2, ideTecba);
            query.addIntParam(3, ideSucu);
            return this.dataSource.createSingleQuery(query);
        }

        // Efectivos (ide_tettb = 8)
        const query = new SelectQuery(`
            SELECT COALESCE(MAX(secuencial_tesec), 0) + 1 AS secuencial
            FROM tes_secuencial_trans
            WHERE ide_tettb = $1
              AND ide_tecba = $2
              AND ide_sucu  = $3
        `);
        query.addIntParam(1, ideTettb);
        query.addIntParam(2, ideTecba);
        query.addIntParam(3, ideSucu);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Valida si ya existe un numero de transaccion para la cuenta y tipo
     */
    async existeNumTransaccion(dtoIn: ExisteNumTransaccionDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT numero_teclb, ide_tettb
            FROM tes_cab_libr_banc
            WHERE ide_tettb = $1
              AND ide_sucu  = $2
              AND ide_tecba = $3
              AND numero_teclb = $4
              AND ide_teelb = $5
            LIMIT 1
        `);
        query.addIntParam(1, dtoIn.ideTettb);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addIntParam(3, dtoIn.ideTecba);
        query.addStringParam(4, dtoIn.numero);
        query.addIntParam(5, ideTeelb);
        const result = await this.dataSource.createSelectQuery(query);
        return { existe: result.length > 0 };
    }

    /**
     * Retorna el signo de un tipo de transaccion bancaria
     */
    async getSignoTransaccion(ideTettb: number) {
        const query = new SelectQuery(`
            SELECT signo_tettb
            FROM tes_tip_tran_banc
            WHERE ide_tettb = $1
            LIMIT 1
        `);
        query.addIntParam(1, ideTettb);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Obtiene el ide_cndpc (cuenta contable) de una cuenta bancaria
     */
    async getCuentaContable(ideTecba: number) {
        const query = new SelectQuery(`
            SELECT ide_cndpc
            FROM tes_cuenta_banco
            WHERE ide_tecba = $1
            LIMIT 1
        `);
        query.addIntParam(1, ideTecba);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Obtiene datos de una persona por ide_geper
     */
    async getPersona(ideGeper: number) {
        const query = new SelectQuery(`
            SELECT * FROM gen_persona WHERE ide_geper = $1 LIMIT 1
        `);
        query.addIntParam(1, ideGeper);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Busca persona por identificacion
     */
    async getPersonaPorIdentificacion(identificacion: string) {
        const query = new SelectQuery(`
            SELECT * FROM gen_persona WHERE identificac_geper = $1 LIMIT 1
        `);
        query.addStringParam(1, identificacion);
        return this.dataSource.createSingleQuery(query);
    }

    /**
     * Retorna ids gen_tipo_identifi para combos
     */
    async getComboTipoIdentificacion() {
        const query = new SelectQuery(`
            SELECT ide_getid, nombre_getid
            FROM gen_tipo_identifi
            ORDER BY nombre_getid
        `);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna beneficiarios para combos
     */
    async getComboBeneficiario() {
        const query = new SelectQuery(`
            SELECT ide_geper, identificac_geper, nom_geper
            FROM gen_persona
            WHERE identificac_geper IS NOT NULL
            ORDER BY nom_geper
        `);
        return this.dataSource.createSelectQuery(query);
    }
}
