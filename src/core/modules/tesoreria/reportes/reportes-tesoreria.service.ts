import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetDepositosCajaPendientesDto } from './dto/get-depositos-caja-pendientes.dto';
import { ReporteCobrosDto } from './dto/reporte-cobros.dto';
import { ReportePagosDto } from './dto/reporte-pagos.dto';

@Injectable()
export class ReportesTesoreriaService extends BaseService {
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
     * Reporte de Cobros CxC en tesoreria para un mes/año
     */
    async getReporteCobros(dtoIn: ReporteCobrosDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const fechaInicio = `${dtoIn.anio}-${dtoIn.numeroMes.padStart(2, '0')}-01`;
        const fechaFin = this.ultimaFechaMes(fechaInicio);

        const query = new SelectQuery(`
            SELECT dt.ide_ccdtr,
                   cb.nombre_tecba       AS cuenta,
                   dt.fecha_trans_ccdtr  AS fecha_cxc,
                   dt.ide_cnccc          AS asiento,
                   tc.beneficiari_teclb  AS cliente,
                   tt.nombre_ccttr       AS t_tran_cxc,
                   tb.nombre_tettb       AS t_tran_tes,
                   dt.docum_relac_ccdtr  AS doc_relacion,
                   dt.valor_ccdtr        AS valor_cxc,
                   dt.observacion_ccdtr  AS observacion,
                   tc.usuario_ingre,
                   tc.hora_ingre,
                   tc.usuario_actua,
                   tc.hora_actua,
                   tc.ide_teclb
            FROM cxc_detall_transa dt
            INNER JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
            INNER JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            INNER JOIN tes_cab_libr_banc tc ON dt.ide_teclb = tc.ide_teclb
                AND tc.ide_teelb = $1
            INNER JOIN tes_cuenta_banco cb ON tc.ide_tecba = cb.ide_tecba
            INNER JOIN tes_tip_tran_banc tb ON tc.ide_tettb = tb.ide_tettb
            WHERE dt.ide_sucu = $2
              AND tt.signo_ccttr < 1
              AND dt.fecha_trans_ccdtr BETWEEN $3 AND $4
              AND tt.ide_ccttr != 8
            GROUP BY dt.ide_ccdtr, dt.fecha_trans_ccdtr, cb.nombre_tecba,
                     tc.beneficiari_teclb, dt.ide_cnccc, tt.nombre_ccttr,
                     tb.nombre_tettb, dt.docum_relac_ccdtr, dt.observacion_ccdtr,
                     tc.usuario_ingre, tc.hora_ingre, tc.usuario_actua, tc.hora_actua,
                     tc.ide_teclb
            ORDER BY dt.fecha_trans_ccdtr, tc.beneficiari_teclb, dt.ide_ccdtr
        `);
        query.addIntParam(1, ideTeelb);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addStringParam(3, fechaInicio);
        query.addStringParam(4, fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Reporte de Pagos CxP en tesoreria para un mes/año
     */
    async getReportePagos(dtoIn: ReportePagosDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));
        const fechaInicio = `${dtoIn.anio}-${dtoIn.numeroMes.padStart(2, '0')}-01`;
        const fechaFin = this.ultimaFechaMes(fechaInicio);

        const query = new SelectQuery(`
            SELECT dt.ide_cpdtr,
                   cb.nombre_tecba       AS cuenta,
                   dt.fecha_trans_cpdtr  AS fecha_cxc,
                   dt.ide_cnccc          AS asiento,
                   tc.beneficiari_teclb  AS proveedor,
                   tt.nombre_cpttr       AS t_tran_cxp,
                   tb.nombre_tettb       AS t_tran_tes,
                   dt.docum_relac_cpdtr  AS doc_relacion,
                   dt.valor_cpdtr        AS valor_cxp,
                   dt.observacion_cpdtr  AS observacion,
                   tc.usuario_ingre,
                   tc.hora_ingre,
                   tc.usuario_actua,
                   tc.hora_actua,
                   tc.ide_teclb
            FROM cxp_detall_transa dt
            INNER JOIN cxp_cabece_transa ct ON dt.ide_cpctr = ct.ide_cpctr
            INNER JOIN cxp_tipo_transacc tt ON tt.ide_cpttr = dt.ide_cpttr
            INNER JOIN tes_cab_libr_banc tc ON dt.ide_teclb = tc.ide_teclb
                AND tc.ide_teelb = $1
            INNER JOIN tes_cuenta_banco cb ON tc.ide_tecba = cb.ide_tecba
            INNER JOIN tes_tip_tran_banc tb ON tc.ide_tettb = tb.ide_tettb
            WHERE dt.ide_sucu = $2
              AND tt.signo_cpttr < 1
              AND dt.fecha_trans_cpdtr BETWEEN $3 AND $4
              AND tt.ide_cpttr != 21
            GROUP BY dt.ide_cpdtr, dt.fecha_trans_cpdtr, cb.nombre_tecba,
                     tc.beneficiari_teclb, dt.ide_cnccc, tt.nombre_cpttr,
                     tb.nombre_tettb, dt.docum_relac_cpdtr, dt.observacion_cpdtr,
                     tc.usuario_ingre, tc.hora_ingre, tc.usuario_actua, tc.hora_actua,
                     tc.ide_teclb
            ORDER BY dt.fecha_trans_cpdtr, tc.beneficiari_teclb, dt.ide_cpdtr
        `);
        query.addIntParam(1, ideTeelb);
        query.addIntParam(2, dtoIn.ideSucu);
        query.addStringParam(3, fechaInicio);
        query.addStringParam(4, fechaFin);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Retorna los depositos pendientes de caja a banco
     */
    async getDepositosCajaPendientes(dtoIn: GetDepositosCajaPendientesDto & HeaderParamsDto) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   a.fecha_trans_teclb,
                   b.nombre_tettb       AS transaccion,
                   a.numero_teclb       AS num_documento,
                   a.beneficiari_teclb  AS beneficiario,
                   a.valor_teclb        AS valor,
                   a.fec_cam_est_teclb  AS fecha_vence,
                   a.observacion_teclb  AS observacion
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_tecba = $1
              AND a.ide_teelb  = $2
              AND a.fecha_trans_teclb BETWEEN $3 AND $4
              AND b.signo_tettb = 1
              AND a.depositado_teclb = false
              AND a.ide_sucu = $5
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, dtoIn.ideTecba);
        query.addIntParam(2, ideTeelb);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addIntParam(5, dtoIn.ideSucu);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Reporte de movimientos de cuenta
     */
    async getReporteMovimientosCuenta(
        dtoIn: { ideTecba: number; fechaInicio: string; fechaFin: string } & HeaderParamsDto,
    ) {
        const ideTeelb = Number(this.variables.get('p_tes_estado_lib_banco_normal'));

        const query = new SelectQuery(`
            SELECT a.ide_teclb,
                   a.fecha_trans_teclb,
                   a.ide_cnccc          AS asiento,
                   b.nombre_tettb       AS transaccion,
                   a.beneficiari_teclb  AS beneficiario,
                   CASE WHEN b.signo_tettb = 1  THEN a.valor_teclb ELSE 0 END AS ingresos,
                   CASE WHEN b.signo_tettb = -1 THEN a.valor_teclb ELSE 0 END AS egresos,
                   a.observacion_teclb  AS observacion,
                   a.usuario_ingre      AS usuario
            FROM tes_cab_libr_banc a
            INNER JOIN tes_tip_tran_banc b ON a.ide_tettb = b.ide_tettb
            WHERE a.ide_sucu  = $1
              AND a.ide_teelb  = $2
              AND a.fecha_trans_teclb BETWEEN $3 AND $4
              AND a.ide_tecba = $5
            ORDER BY a.fecha_trans_teclb, a.ide_teclb
        `);
        query.addIntParam(1, dtoIn.ideSucu);
        query.addIntParam(2, ideTeelb);
        query.addStringParam(3, dtoIn.fechaInicio);
        query.addStringParam(4, dtoIn.fechaFin);
        query.addIntParam(5, dtoIn.ideTecba);
        return this.dataSource.createSelectQuery(query);
    }

    /**
     * Calcula la ultima fecha de un mes
     */
    private ultimaFechaMes(fechaInicio: string): string {
        const fecha = new Date(fechaInicio);
        fecha.setMonth(fecha.getMonth() + 1, 0);
        return fecha.toISOString().split('T')[0];
    }
}
