import { Injectable, Logger } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { ComprobanteContabilidadService } from './comprobante-contabilidad/comprobante-contabilidad.service';
import { SaveComprobanteDto } from './comprobante-contabilidad/dto/comprobante-contabilidad.dto';

export interface GenerarAsientoCobroCxCDto {
    ideTeclb: number;
    fecha: string;
    ideTecba: number;
    ideTettb: number;
    ideGeper: number;
    valor: number;
    observacion: string;
}

export interface AsientoCobroResult {
    ide_cnccc?: number;
    numero_cnccc?: string;
    generado: boolean;
    banco_encontrado: boolean;
    cliente_encontrado: boolean;
    advertencias: string[];
}

@Injectable()
export class AsientosAutomaticosService extends BaseService {
    private readonly logger = new Logger(AsientosAutomaticosService.name);

    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly comprobanteService: ComprobanteContabilidadService,
    ) {
        super();
        this.core
            .getVariables([
                'p_con_tipo_comprobante_ingreso',
                'p_con_tipo_comprobante_egreso',
                'p_con_beneficiario_empresa',
                'p_con_lugar_debe',
                'p_con_lugar_haber',
            ])
            .then((result) => {
                this.variables = result;
            });
    }

    private get lugarDebe(): number {
        return Number(this.variables.get('p_con_lugar_debe') || '1');
    }

    private get lugarHaber(): number {
        return Number(this.variables.get('p_con_lugar_haber') || '0');
    }

    async generarAsientoCobroCxC(dtoIn: GenerarAsientoCobroCxCDto & HeaderParamsDto): Promise<AsientoCobroResult> {
        const advertencias: string[] = [];

        // PASO 1: Obtener signo de la transaccion bancaria
        const signoQuery = new SelectQuery(`
            SELECT signo_tettb FROM tes_tip_tran_banc WHERE ide_tettb = $1 LIMIT 1
        `);
        signoQuery.addIntParam(1, dtoIn.ideTettb);
        const signoRow = await this.dataSource.createSingleQuery(signoQuery);
        const signoTettb = Number(signoRow?.signo_tettb ?? 1);

        // PASO 2: Obtener cuenta contable del BANCO
        const ctaBancoQuery = new SelectQuery(`
            SELECT ide_cndpc FROM tes_cuenta_banco WHERE ide_tecba = $1 LIMIT 1
        `);
        ctaBancoQuery.addIntParam(1, dtoIn.ideTecba);
        const ctaBancoRow = await this.dataSource.createSingleQuery(ctaBancoQuery);
        const ideCndpcBanco = ctaBancoRow?.ide_cndpc ?? null;

        if (!ideCndpcBanco) {
            advertencias.push('Cuenta contable del banco no configurada en tes_cuenta_banco');
        }

        // PASO 3: Obtener cuenta contable del CLIENTE (CxC)
        const ideCndpcCliente = await this.getCuentaPersona('CUENTA POR COBRAR', dtoIn.ideGeper, dtoIn.ideEmpr, dtoIn.ideSucu);

        if (!ideCndpcCliente) {
            advertencias.push('Cuenta por cobrar del cliente no configurada en con_det_conf_asie');
        }

        // PASO 4: Determinar tipo de comprobante y lugares
        const ideCntcm = signoTettb === 1
            ? Number(this.variables.get('p_con_tipo_comprobante_ingreso'))
            : Number(this.variables.get('p_con_tipo_comprobante_egreso'));

        // Para cobro CxC: entra dinero al banco (DEBE) y sale de CxC (HABER)
        // Si signo_tettb == 1 (ingreso): banco=DEBE, cliente=HABER
        // Si signo_tettb == -1 (egreso): banco=HABER, cliente=DEBE

        let bancoLap: number;
        let clienteLap: number;
        if (signoTettb === 1) {
            bancoLap = this.lugarDebe;
            clienteLap = this.lugarHaber;
        } else {
            bancoLap = this.lugarHaber;
            clienteLap = this.lugarDebe;
        }

        // PASO 5: Construir y guardar comprobante via saveAutomatico()
        const saveDto: SaveComprobanteDto = {
            isUpdate: false,
            data: {
                ide_cntcm: ideCntcm,
                ide_geper: dtoIn.ideGeper,
                fecha_trans_cnccc: dtoIn.fecha,
                observacion_cnccc: `[AUTO-TES] ${dtoIn.observacion}`.substring(0, 190),
                automatico_cnccc: true,
            },
            detalles: [
                {
                    ide_cnlap: bancoLap,
                    ide_cndpc: ideCndpcBanco ?? 0,
                    valor_cndcc: dtoIn.valor,
                    observacion_cndcc: 'BANCO',
                },
                {
                    ide_cnlap: clienteLap,
                    ide_cndpc: ideCndpcCliente ?? 0,
                    valor_cndcc: dtoIn.valor,
                    observacion_cndcc: 'CUENTA POR COBRAR',
                },
            ],
        } as SaveComprobanteDto;

        try {
            const result = await this.comprobanteService.saveAutomatico({
                ...dtoIn,
                ...saveDto,
            } as any);

            const ideCnccc = result.ide_cnccc;

            // PASO 6: Vincular ide_cnccc a tes_cab_libr_banc
            await this.dataSource.pool.query(
                `UPDATE tes_cab_libr_banc SET ide_cnccc = $1 WHERE ide_teclb = $2`,
                [ideCnccc, dtoIn.ideTeclb],
            );

            // PASO 7: Vincular ide_cnccc a cxc_detall_transa
            await this.dataSource.pool.query(
                `UPDATE cxc_detall_transa SET ide_cnccc = $1 WHERE ide_teclb = $2 AND numero_pago_ccdtr > 0 AND ide_cnccc IS NULL`,
                [ideCnccc, dtoIn.ideTeclb],
            );

            return {
                ide_cnccc: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                banco_encontrado: ideCndpcBanco != null,
                cliente_encontrado: ideCndpcCliente != null,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento automatico para ide_teclb=${dtoIn.ideTeclb}: ${error}`);
            return {
                generado: false,
                banco_encontrado: ideCndpcBanco != null,
                cliente_encontrado: ideCndpcCliente != null,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Obtiene la cuenta contable de una persona para un tipo de configuracion contable
     */
    private async getCuentaPersona(identificador: string, ideGeper: number, ideEmpr: number, ideSucu: number): Promise<number | null> {
        const qConf = new SelectQuery(`
            SELECT ide_cncca FROM con_cab_conf_asie
            WHERE UPPER(nombre_cncca) = UPPER($1)
              AND ide_empr = $2
              AND ide_sucu = $3
            LIMIT 1
        `);
        qConf.addStringParam(1, identificador);
        qConf.addIntParam(2, ideEmpr);
        qConf.addIntParam(3, ideSucu);
        const conf = await this.dataSource.createSingleQuery(qConf);
        if (!conf?.ide_cncca) return null;

        return this.buscarCuentaPersona(conf.ide_cncca, ideGeper, 3, ideEmpr, ideSucu);
    }

    /**
     * Busca recursivamente la cuenta contable de una persona
     */
    private async buscarCuentaPersona(
        ideCncca: number, ideGeper: number, maxNivel: number, ideEmpr: number, ideSucu: number,
    ): Promise<number | null> {
        if (!ideGeper || maxNivel < 0) return null;

        const qCuenta = new SelectQuery(`
            SELECT cn_d.ide_cndpc
            FROM con_vig_conf_asie cn_v
            JOIN con_det_conf_asie cn_d ON cn_v.ide_cnvca = cn_d.ide_cnvca
            WHERE cn_v.ide_cncca = $1
              AND cn_v.estado_cnvca = true
              AND cn_d.ide_geper = $2
              AND cn_v.ide_empr = $3
              AND cn_v.ide_sucu = $4
            LIMIT 1
        `);
        qCuenta.addIntParam(1, ideCncca);
        qCuenta.addIntParam(2, ideGeper);
        qCuenta.addIntParam(3, ideEmpr);
        qCuenta.addIntParam(4, ideSucu);
        const result = await this.dataSource.createSingleQuery(qCuenta);
        if (result?.ide_cndpc) return result.ide_cndpc;

        if (maxNivel > 0) {
            const qPadre = new SelectQuery(`
                SELECT gen_ide_geper FROM gen_persona
                WHERE ide_geper = $1
                  AND ide_empr = $2
            `);
            qPadre.addIntParam(1, ideGeper);
            qPadre.addIntParam(2, ideEmpr);
            const padre = await this.dataSource.createSingleQuery(qPadre);
            if (padre?.gen_ide_geper && padre.gen_ide_geper !== ideGeper) {
                return this.buscarCuentaPersona(ideCncca, padre.gen_ide_geper, maxNivel - 1, ideEmpr, ideSucu);
            }
        }
        return null;
    }
}
