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

export interface GenerarAsientoPagoCxPDto {
    ideTeclb: number;
    fecha: string;
    ideTecba: number;
    ideTettb: number;
    ideGeper: number;
    valor: number;
    observacion: string;
}

export interface AsientoPagoResult {
    ide_cnccc?: number;
    numero_cnccc?: string;
    generado: boolean;
    banco_encontrado: boolean;
    proveedor_encontrado: boolean;
    advertencias: string[];
}

export interface GenerarAsientoComprasCxPDto {
    ide_cpcfa: number;
}

export interface AsientoCompraResult {
    ide_cpcfa: number;
    ide_cnccc?: number;
    numero_cnccc?: string;
    generado: boolean;
    advertencias: string[];
}

/** Tipo de comprobante DIARIO (hardcoded en el legacy generarAsientoComprasCxP) */
const IDE_CNTCM_DIARIO = 0;

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
                'p_con_tipo_documento_nota_credito',
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
     * Genera el asiento contable de un pago de tesorería a un proveedor (CxP),
     * simétrico a generarAsientoCobroCxC pero con las cuentas invertidas: sale
     * dinero del banco y se reduce el pasivo (cuenta por pagar) del proveedor.
     *
     *   Egreso (signo_tettb=-1, caso normal de pago): proveedor=DEBE, banco=HABER
     *   Ingreso (signo_tettb=1, ej. nota de crédito bancaria): proveedor=HABER, banco=DEBE
     */
    async generarAsientoPagoCxP(dtoIn: GenerarAsientoPagoCxPDto & HeaderParamsDto): Promise<AsientoPagoResult> {
        const advertencias: string[] = [];

        const signoQuery = new SelectQuery(`
            SELECT signo_tettb FROM tes_tip_tran_banc WHERE ide_tettb = $1 LIMIT 1
        `);
        signoQuery.addIntParam(1, dtoIn.ideTettb);
        const signoRow = await this.dataSource.createSingleQuery(signoQuery);
        const signoTettb = Number(signoRow?.signo_tettb ?? -1);

        const ctaBancoQuery = new SelectQuery(`
            SELECT ide_cndpc FROM tes_cuenta_banco WHERE ide_tecba = $1 LIMIT 1
        `);
        ctaBancoQuery.addIntParam(1, dtoIn.ideTecba);
        const ctaBancoRow = await this.dataSource.createSingleQuery(ctaBancoQuery);
        const ideCndpcBanco = ctaBancoRow?.ide_cndpc ?? null;
        if (!ideCndpcBanco) {
            advertencias.push('Cuenta contable del banco no configurada en tes_cuenta_banco');
        }

        const ideCndpcProveedor = await this.getCuentaPersona('CUENTA POR PAGAR', dtoIn.ideGeper, dtoIn.ideEmpr, dtoIn.ideSucu);
        if (!ideCndpcProveedor) {
            advertencias.push('Cuenta por pagar del proveedor no configurada en con_det_conf_asie');
        }

        const ideCntcm = signoTettb === 1
            ? Number(this.variables.get('p_con_tipo_comprobante_ingreso'))
            : Number(this.variables.get('p_con_tipo_comprobante_egreso'));

        let bancoLap: number;
        let proveedorLap: number;
        if (signoTettb === -1) {
            bancoLap = this.lugarHaber;
            proveedorLap = this.lugarDebe;
        } else {
            bancoLap = this.lugarDebe;
            proveedorLap = this.lugarHaber;
        }

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
                    ide_cnlap: proveedorLap,
                    ide_cndpc: ideCndpcProveedor ?? 0,
                    valor_cndcc: dtoIn.valor,
                    observacion_cndcc: 'CUENTA POR PAGAR',
                },
                {
                    ide_cnlap: bancoLap,
                    ide_cndpc: ideCndpcBanco ?? 0,
                    valor_cndcc: dtoIn.valor,
                    observacion_cndcc: 'BANCO',
                },
            ],
        } as SaveComprobanteDto;

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = { ...dtoIn, ...saveDto };
            const result = await this.comprobanteService.saveAutomatico(comprobanteDto);

            const ideCnccc = result.ide_cnccc;

            await this.dataSource.pool.query(
                `UPDATE tes_cab_libr_banc SET ide_cnccc = $1 WHERE ide_teclb = $2`,
                [ideCnccc, dtoIn.ideTeclb],
            );
            await this.dataSource.pool.query(
                `UPDATE cxp_detall_transa SET ide_cnccc = $1 WHERE ide_teclb = $2 AND numero_pago_cpdtr > 0 AND ide_cnccc IS NULL`,
                [ideCnccc, dtoIn.ideTeclb],
            );

            return {
                ide_cnccc: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                banco_encontrado: ideCndpcBanco != null,
                proveedor_encontrado: ideCndpcProveedor != null,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de pago CxP para ide_teclb=${dtoIn.ideTeclb}: ${error}`);
            return {
                generado: false,
                banco_encontrado: ideCndpcBanco != null,
                proveedor_encontrado: ideCndpcProveedor != null,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Genera el asiento contable de un documento de compra CxP (paridad
     * ServicioComprobanteContabilidad.generarAsientoComprasCxP legacy):
     *
     *   CUENTA                          DEBE    HABER
     *   Inventario/Gasto (por artículo)   X
     *   IVA crédito tributario            X
     *   Retención renta por pagar                  X
     *   Retención IVA por pagar                    X
     *   Cuenta por pagar (proveedor)               X  (total − retenciones)
     *
     * Las notas de crédito no generan asiento (comportamiento legacy).
     */
    async generarAsientoComprasCxP(
        dtoIn: GenerarAsientoComprasCxPDto & HeaderParamsDto,
    ): Promise<AsientoCompraResult> {
        const advertencias: string[] = [];

        // Documento + retenciones asociadas
        const qDoc = new SelectQuery(`
            SELECT a.ide_cpcfa, a.ide_geper, a.numero_cpcfa, a.fecha_emisi_cpcfa,
                   a.ide_cntdo, a.total_cpcfa, a.valor_iva_cpcfa, a.ide_cnccc,
                   b.ide_cncim, b.valor_cndre, c.ide_cnimp
            FROM cxp_cabece_factur a
            LEFT JOIN con_detall_retenc b ON a.ide_cncre = b.ide_cncre
            LEFT JOIN con_cabece_impues c ON b.ide_cncim = c.ide_cncim
            WHERE a.ide_cpcfa = $1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cpcfa);
        const filas = await this.dataSource.createSelectQuery(qDoc);
        if (!filas.length) {
            return { ide_cpcfa: dtoIn.ide_cpcfa, generado: false, advertencias: ['El documento no existe'] };
        }
        const doc = filas[0];
        if (doc.ide_cnccc) {
            return {
                ide_cpcfa: dtoIn.ide_cpcfa,
                ide_cnccc: Number(doc.ide_cnccc),
                generado: false,
                advertencias: ['El documento ya tiene asiento contable'],
            };
        }
        const notaCredito = Number(this.variables.get('p_con_tipo_documento_nota_credito'));
        if (Number(doc.ide_cntdo) === notaCredito) {
            return {
                ide_cpcfa: dtoIn.ide_cpcfa,
                generado: false,
                advertencias: ['Las notas de crédito no generan asiento de compras'],
            };
        }

        // Detalles del documento con la cuenta contable del artículo
        const qDet = new SelectQuery(`
            SELECT a.ide_inarti, b.ide_cndpc, a.valor_cpdfa, b.nombre_inarti
            FROM cxp_detall_factur a
            INNER JOIN inv_articulo b ON a.ide_inarti = b.ide_inarti
            WHERE a.ide_cpcfa = $1
        `);
        qDet.addIntParam(1, dtoIn.ide_cpcfa);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        const detallesAsiento: Array<{
            ide_cnlap: number;
            ide_cndpc: number;
            valor_cndcc: number;
            observacion_cndcc: string;
        }> = [];

        // DEBE: inventario/gasto por cada línea
        for (const det of detalles) {
            let ideCndpc = det.ide_cndpc ? Number(det.ide_cndpc) : null;
            if (!ideCndpc) {
                ideCndpc = await this.buscarCuentaProducto('INVENTARIO-GASTO-ACTIVO', Number(det.ide_inarti), dtoIn.ideSucu);
            }
            if (!ideCndpc) {
                advertencias.push(`Cuenta INVENTARIO-GASTO-ACTIVO no configurada para el artículo ${det.nombre_inarti}`);
            }
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe,
                ide_cndpc: ideCndpc ?? 0,
                valor_cndcc: Number(Number(det.valor_cpdfa || 0).toFixed(2)),
                observacion_cndcc: String(det.nombre_inarti ?? 'INVENTARIO-GASTO-ACTIVO').substring(0, 190),
            });
        }

        // DEBE: IVA crédito tributario
        const valorIva = Number(doc.valor_iva_cpcfa || 0);
        if (valorIva > 0) {
            const cuentaIva = await this.buscarCuentaConfig('IVA CREDITO TRIBUTARIO', {}, dtoIn.ideSucu);
            if (!cuentaIva) advertencias.push('Cuenta IVA CREDITO TRIBUTARIO no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe,
                ide_cndpc: cuentaIva ?? 0,
                valor_cndcc: Number(valorIva.toFixed(2)),
                observacion_cndcc: 'IVA CREDITO TRIBUTARIO',
            });
        }

        // HABER: retenciones (renta ide_cnimp = 1, resto IVA)
        let totalRetenciones = 0;
        for (const fila of filas) {
            if (!fila.ide_cncim) continue;
            const esRenta = Number(fila.ide_cnimp) === 1;
            const identificador = esRenta ? 'RETENCION RENTA POR PAGAR' : 'RETENCION IVA POR PAGAR';
            const cuentaRet = await this.buscarCuentaConfig(identificador, { ideCncim: Number(fila.ide_cncim) }, dtoIn.ideSucu);
            if (!cuentaRet) advertencias.push(`Cuenta ${identificador} no configurada para el impuesto ${fila.ide_cncim}`);
            const valorRet = Number(Number(fila.valor_cndre || 0).toFixed(2));
            totalRetenciones += valorRet;
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber,
                ide_cndpc: cuentaRet ?? 0,
                valor_cndcc: valorRet,
                observacion_cndcc: identificador,
            });
        }

        // HABER: cuenta por pagar del proveedor (total − retenciones)
        const cuentaCxP = await this.getCuentaPersona('CUENTA POR PAGAR', Number(doc.ide_geper), dtoIn.ideEmpr, dtoIn.ideSucu);
        if (!cuentaCxP) advertencias.push('Cuenta por pagar del proveedor no configurada en con_det_conf_asie');
        const valorCxP = Number((Number(doc.total_cpcfa || 0) - totalRetenciones).toFixed(2));
        detallesAsiento.push({
            ide_cnlap: this.lugarHaber,
            ide_cndpc: cuentaCxP ?? 0,
            valor_cndcc: valorCxP,
            observacion_cndcc: 'CUENTA POR PAGAR',
        });

        const saveDto: SaveComprobanteDto = {
            isUpdate: false,
            data: {
                ide_cntcm: IDE_CNTCM_DIARIO,
                ide_geper: Number(doc.ide_geper),
                fecha_trans_cnccc: doc.fecha_emisi_cpcfa,
                observacion_cnccc: `V/. FACTURA N.${doc.numero_cpcfa}`.substring(0, 190),
                automatico_cnccc: true,
            },
            detalles: detallesAsiento,
        } as SaveComprobanteDto;

        try {
            const result = await this.comprobanteService.saveAutomatico({
                ...dtoIn,
                ...saveDto,
            } as any);
            const ideCnccc = result.ide_cnccc;

            // Vincular asiento al documento y a la transacción CxP original
            await this.dataSource.pool.query(
                `UPDATE cxp_cabece_factur SET ide_cnccc = $1 WHERE ide_cpcfa = $2`,
                [ideCnccc, dtoIn.ide_cpcfa],
            );
            await this.dataSource.pool.query(
                `UPDATE cxp_detall_transa SET ide_cnccc = $1 WHERE ide_cpcfa = $2 AND numero_pago_cpdtr = 0`,
                [ideCnccc, dtoIn.ide_cpcfa],
            );

            return {
                ide_cpcfa: dtoIn.ide_cpcfa,
                ide_cnccc: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de compra ide_cpcfa=${dtoIn.ide_cpcfa}: ${error}`);
            return {
                ide_cpcfa: dtoIn.ide_cpcfa,
                generado: false,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Busca la cuenta contable de un identificador de configuración
     * (con_cab_conf_asie / con_vig_conf_asie / con_det_conf_asie), opcionalmente
     * filtrando por impuesto (ide_cncim)
     */
    private async buscarCuentaConfig(
        identificador: string,
        filtros: { ideCncim?: number },
        ideSucu: number,
    ): Promise<number | null> {
        const condicionImpuesto = filtros.ideCncim ? `AND cn_d.ide_cncim = ${Number(filtros.ideCncim)}` : '';
        const q = new SelectQuery(`
            SELECT cn_d.ide_cndpc
            FROM con_vig_conf_asie cn_v
            JOIN con_det_conf_asie cn_d ON cn_v.ide_cnvca = cn_d.ide_cnvca
            JOIN con_cab_conf_asie cn_c ON cn_v.ide_cncca = cn_c.ide_cncca
            WHERE UPPER(cn_c.nombre_cncca) = UPPER($1)
              AND cn_v.estado_cnvca = true
              AND cn_v.ide_sucu = $2
              ${condicionImpuesto}
            LIMIT 1
        `);
        q.addStringParam(1, identificador);
        q.addIntParam(2, ideSucu);
        const row = await this.dataSource.createSingleQuery(q);
        return row?.ide_cndpc ? Number(row.ide_cndpc) : null;
    }

    /**
     * Busca la cuenta contable configurada para un artículo, subiendo por su
     * jerarquía de padres (inv_ide_inarti) hasta encontrarla
     */
    private async buscarCuentaProducto(
        identificador: string,
        ideInarti: number,
        ideSucu: number,
    ): Promise<number | null> {
        const q = new SelectQuery(`
            WITH RECURSIVE arti AS (
                SELECT ide_inarti, inv_ide_inarti, 0 AS nivel
                FROM inv_articulo
                WHERE ide_inarti = $1
                UNION ALL
                SELECT i.ide_inarti, i.inv_ide_inarti, a.nivel + 1
                FROM arti a
                JOIN inv_articulo i ON i.ide_inarti = a.inv_ide_inarti
                WHERE a.nivel < 10
            )
            SELECT cn_d.ide_cndpc
            FROM arti
            JOIN con_det_conf_asie cn_d ON cn_d.ide_inarti = arti.ide_inarti
            JOIN con_vig_conf_asie cn_v ON cn_v.ide_cnvca = cn_d.ide_cnvca AND cn_v.estado_cnvca = true
            JOIN con_cab_conf_asie cn_c ON cn_v.ide_cncca = cn_c.ide_cncca
            WHERE UPPER(cn_c.nombre_cncca) = UPPER($2)
              AND cn_v.ide_sucu = $3
            ORDER BY arti.nivel
            LIMIT 1
        `);
        q.addIntParam(1, ideInarti);
        q.addStringParam(2, identificador);
        q.addIntParam(3, ideSucu);
        const row = await this.dataSource.createSingleQuery(q);
        return row?.ide_cndpc ? Number(row.ide_cndpc) : null;
    }

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
