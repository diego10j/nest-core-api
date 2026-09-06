import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetAnticiposProveedorDto } from './dto/anticipo-proveedor-query.dto';

/**
 * Consultas de Anticipo a Proveedores: vive en cxp_cabece_transa/cxp_detall_transa (mismo
 * mecanismo genérico que savePagoCxP/saveAnticipoCxP, identificado por
 * ide_cpttr = p_cxp_tipo_trans_anticipo y ide_cpcfa IS NULL mientras no se aplique completo a
 * una sola factura) - el saldo/estado se calcula en vivo contra cxp_aplicacion_anticipo (solo
 * tiene filas cuando se liquida contra varias facturas o parcialmente; el caso "una factura,
 * saldo completo" se resuelve seteando ide_cpcfa directo, sin fila acá). El guardado
 * (registrar/liquidar/anular) vive en AnticipoProveedorSaveService.
 */
@Injectable()
export class AnticipoProveedorService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
        this.core
            .getVariables(['p_cxp_tipo_trans_anticipo'])
            .then((result) => {
                this.variables = result;
            });
    }

    /** Anticipos (activos, no anulados) de un proveedor, con su saldo disponible para liquidar.
     * Sin ide_geper, lista todos (tabla de control general). */
    async getAnticiposProveedor(dtoIn: GetAnticiposProveedorDto & HeaderParamsDto) {
        const tipoAnticipo = this.variables.get('p_cxp_tipo_trans_anticipo');
        const condicionProveedor = dtoIn.ide_geper ? `AND ct.ide_geper = ${Number(dtoIn.ide_geper)}` : '';
        const query = new SelectQuery(`
            SELECT
                ct.ide_cpctr,
                ct.ide_geper,
                p.nom_geper AS proveedor,
                p.identificac_geper,
                cd.valor_cpdtr AS valor_teanp,
                COALESCE(ap.aplicado, 0) AS valor_liquidado_teanp,
                (cd.valor_cpdtr - COALESCE(ap.aplicado, 0)) AS saldo_teanp,
                cd.fecha_trans_cpdtr AS fecha_teanp,
                ct.observacion_cpctr AS observacion_teanp,
                CASE
                    WHEN ct.ide_cpcfa IS NOT NULL OR COALESCE(ap.aplicado, 0) >= cd.valor_cpdtr THEN 'LIQUIDADO'
                    WHEN COALESCE(ap.aplicado, 0) > 0 THEN 'PARCIALMENTE LIQUIDADO'
                    ELSE 'PENDIENTE DE LIQUIDAR'
                END AS estado,
                CASE
                    WHEN ct.ide_cpcfa IS NOT NULL OR COALESCE(ap.aplicado, 0) >= cd.valor_cpdtr THEN 'success'
                    WHEN COALESCE(ap.aplicado, 0) > 0 THEN 'info'
                    ELSE 'warning'
                END AS color_estado,
                ct.hora_ingre
            FROM cxp_cabece_transa ct
            INNER JOIN cxp_detall_transa cd ON cd.ide_cpctr = ct.ide_cpctr
            INNER JOIN gen_persona p        ON ct.ide_geper = p.ide_geper
            LEFT JOIN (
                SELECT ide_cpctr, SUM(valor_aplicado_cpaan) AS aplicado
                FROM cxp_aplicacion_anticipo
                WHERE activo_cpaan = true
                GROUP BY ide_cpctr
            ) ap ON ap.ide_cpctr = ct.ide_cpctr
            WHERE ct.ide_cpttr = ${tipoAnticipo}
              AND ct.ide_empr = $1
              AND ct.ide_sucu = $2
              ${condicionProveedor}
            ORDER BY cd.fecha_trans_cpdtr DESC, ct.ide_cpctr DESC
        `);
        query.addIntParam(1, dtoIn.ideEmpr);
        query.addIntParam(2, dtoIn.ideSucu);
        return this.dataSource.createQuery(query);
    }

    /** Detalle de un anticipo, con las facturas a las que ya se aplicó (parcial/multi-factura). */
    async getAnticipoProveedorById(ideCpctr: number, dtoIn: HeaderParamsDto) {
        const tipoAnticipo = this.variables.get('p_cxp_tipo_trans_anticipo');
        const qCab = new SelectQuery(`
            SELECT
                ct.ide_cpctr,
                ct.ide_geper,
                p.nom_geper AS proveedor,
                p.identificac_geper,
                cd.ide_teclb,
                cd.ide_cnccc,
                cd.valor_cpdtr AS valor_teanp,
                COALESCE(ap.aplicado, 0) AS valor_liquidado_teanp,
                (cd.valor_cpdtr - COALESCE(ap.aplicado, 0)) AS saldo_teanp,
                cd.fecha_trans_cpdtr AS fecha_teanp,
                ct.observacion_cpctr AS observacion_teanp,
                CASE
                    WHEN ct.ide_cpcfa IS NOT NULL OR COALESCE(ap.aplicado, 0) >= cd.valor_cpdtr THEN 'LIQUIDADO'
                    WHEN COALESCE(ap.aplicado, 0) > 0 THEN 'PARCIALMENTE LIQUIDADO'
                    ELSE 'PENDIENTE DE LIQUIDAR'
                END AS estado,
                CASE
                    WHEN ct.ide_cpcfa IS NOT NULL OR COALESCE(ap.aplicado, 0) >= cd.valor_cpdtr THEN 'success'
                    WHEN COALESCE(ap.aplicado, 0) > 0 THEN 'info'
                    ELSE 'warning'
                END AS color_estado
            FROM cxp_cabece_transa ct
            INNER JOIN cxp_detall_transa cd ON cd.ide_cpctr = ct.ide_cpctr
            INNER JOIN gen_persona p        ON ct.ide_geper = p.ide_geper
            LEFT JOIN (
                SELECT ide_cpctr, SUM(valor_aplicado_cpaan) AS aplicado
                FROM cxp_aplicacion_anticipo
                WHERE activo_cpaan = true
                GROUP BY ide_cpctr
            ) ap ON ap.ide_cpctr = ct.ide_cpctr
            WHERE ct.ide_cpctr = $1
              AND ct.ide_cpttr = ${tipoAnticipo}
              AND ct.ide_empr = $2
              AND ct.ide_sucu = $3
        `);
        qCab.addIntParam(1, ideCpctr);
        qCab.addIntParam(2, dtoIn.ideEmpr);
        qCab.addIntParam(3, dtoIn.ideSucu);
        const cabecera = await this.dataSource.createSingleQuery(qCab);
        if (!cabecera) {
            throw new BadRequestException(`Anticipo a proveedor ide_cpctr=${ideCpctr} no encontrado.`);
        }

        const qDet = new SelectQuery(`
            SELECT
                a.ide_cpaan,
                a.ide_cpcfa,
                f.numero_cpcfa,
                a.valor_aplicado_cpaan,
                a.ide_cnccc,
                a.fecha_cpaan
            FROM cxp_aplicacion_anticipo a
            INNER JOIN cxp_cabece_factur f ON a.ide_cpcfa = f.ide_cpcfa
            WHERE a.ide_cpctr = $1
              AND a.activo_cpaan = true
            ORDER BY a.ide_cpaan
        `);
        qDet.addIntParam(1, ideCpctr);
        const liquidaciones = await this.dataSource.createSelectQuery(qDet);

        return { ...cabecera, liquidaciones };
    }
}
