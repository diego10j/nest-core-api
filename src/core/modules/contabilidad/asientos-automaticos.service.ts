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

export interface GenerarAsientoFacturaCxCDto {
    ide_cccfa: number;
}

export interface AsientoFacturaCxCResult {
    ide_cccfa: number;
    ide_cnccc?: number;
    numero_cnccc?: string;
    generado: boolean;
    advertencias: string[];
}

export interface GenerarAsientoNotaCreditoDto {
    ide_cpcno: number;
}

export interface AsientoNotaCreditoResult {
    ide_cpcno: number;
    ide_cnccc?: number;
    numero_cnccc?: string;
    generado: boolean;
    advertencias: string[];
}

export interface GenerarAsientoCostoVentaDto {
    ide_cccfa: number;
}

export interface AsientoCostoVentaResult {
    ide_cccfa: number;
    ide_cnccc_costo?: number;
    numero_cnccc?: string;
    generado: boolean;
    advertencias: string[];
}

export interface GenerarAsientoCostoNotaCreditoDto {
    ide_cpcno: number;
}

export interface AsientoCostoNotaCreditoResult {
    ide_cpcno: number;
    ide_cnccc_costo?: number;
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

    /**
     * Revierte (best-effort) un asiento automático ya generado - usado como compensación por
     * CxcTransaccionesSaveService/CxpTransaccionesSaveService cuando el asiento se generó
     * correctamente pero el guardado de tesorería/CxC/CxP que lo originó falló justo después.
     * Nunca lanza: si la reversión falla, sólo se registra en el log (el caller ya está
     * propagando el error original y no debe perderse por un fallo secundario de limpieza).
     */
    async eliminarAsiento(ideCnccc: number, dtoIn: HeaderParamsDto): Promise<void> {
        try {
            await this.comprobanteService.eliminarAutomatico(ideCnccc, dtoIn);
        } catch (error) {
            this.logger.error(`No se pudo revertir el asiento automático ide_cnccc=${ideCnccc}: ${error}`);
        }
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
        const datos = await this.resolverDatosAsientoPagoCxP(dtoIn);

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = {
                ...dtoIn,
                ...datos.saveDto,
            };
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
                banco_encontrado: datos.ideCndpcBanco != null,
                proveedor_encontrado: datos.ideCndpcProveedor != null,
                advertencias: datos.advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de pago CxP para ide_teclb=${dtoIn.ideTeclb}: ${error}`);
            return {
                generado: false,
                banco_encontrado: datos.ideCndpcBanco != null,
                proveedor_encontrado: datos.ideCndpcProveedor != null,
                advertencias: [...datos.advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Actualiza el asiento contable de un pago CxP ya generado (mismo ide_cnccc), re-resolviendo
     * las cuentas de proveedor/banco por si cambiaron en la edición (ej. se cambió la cuenta
     * bancaria de origen o el proveedor del pago) y reemplazando el valor. Usado cuando se edita
     * un pago de tesorería que ya tenía un asiento — evita dejarlo desactualizado o duplicarlo.
     */
    async actualizarAsientoPagoCxP(
        dtoIn: GenerarAsientoPagoCxPDto & { ideCnccc: number } & HeaderParamsDto,
    ): Promise<AsientoPagoResult> {
        const datos = await this.resolverDatosAsientoPagoCxP(dtoIn);

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = {
                ...dtoIn,
                ...datos.saveDto,
                data: { ...datos.saveDto.data, ide_cnccc: dtoIn.ideCnccc },
            };
            const result = await this.comprobanteService.actualizarAutomatico(comprobanteDto);

            return {
                ide_cnccc: result.ide_cnccc,
                generado: true,
                banco_encontrado: datos.ideCndpcBanco != null,
                proveedor_encontrado: datos.ideCndpcProveedor != null,
                advertencias: datos.advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al actualizar asiento de pago CxP ide_cnccc=${dtoIn.ideCnccc}: ${error}`);
            return {
                ide_cnccc: dtoIn.ideCnccc,
                generado: false,
                banco_encontrado: datos.ideCndpcBanco != null,
                proveedor_encontrado: datos.ideCndpcProveedor != null,
                advertencias: [...datos.advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Resuelve cuentas contables, signo, lugares (DEBE/HABER) y arma el SaveComprobanteDto para
     * un asiento de pago CxP — compartido entre generarAsientoPagoCxP y actualizarAsientoPagoCxP
     * para no duplicar la lógica de resolución de cuentas.
     */
    private async resolverDatosAsientoPagoCxP(dtoIn: GenerarAsientoPagoCxPDto & HeaderParamsDto): Promise<{
        advertencias: string[];
        ideCndpcBanco: number | null;
        ideCndpcProveedor: number | null;
        saveDto: SaveComprobanteDto;
    }> {
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

        return { advertencias, ideCndpcBanco, ideCndpcProveedor, saveDto };
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
     * Genera el asiento contable de una factura de VENTAS (paridad
     * ServicioComprobanteContabilidad.generarAsientoFacturaCxC legacy):
     *
     *   CUENTA                          DEBE    HABER
     *   Retención renta por cobrar        X            (si aplica)
     *   Retención IVA por cobrar          X            (si aplica)
     *   Cuenta por cobrar (cliente)       X       (total − retenciones)
     *   Ventas 12% / Transporte c/IVA              X
     *   Ventas 0%  / Transporte s/IVA               X
     *   IVA en ventas                              X
     *
     * "Transporte en ventas" separa la porción de líneas de artículo
     * "SERVICIOS LOGISTICOS%" del resto de Ventas 12%/0% (paridad legacy: fletes
     * facturados junto a la mercadería van a una cuenta contable distinta).
     */
    async generarAsientoFacturaCxC(
        dtoIn: GenerarAsientoFacturaCxCDto & HeaderParamsDto,
    ): Promise<AsientoFacturaCxCResult> {
        const advertencias: string[] = [];

        const qDoc = new SelectQuery(`
            SELECT
                a.ide_cccfa, a.ide_geper, a.secuencial_cccfa, a.fecha_emisi_cccfa,
                a.total_cccfa, a.base_grabada_cccfa, a.base_tarifa0_cccfa, a.valor_iva_cccfa, a.ide_cnccc,
                retRenta.valor_cndre AS ret_renta, retRenta.ide_cncim AS ide_cncim_renta,
                retIva.valor_cndre AS ret_iva, retIva.ide_cncim AS ide_cncim_iva,
                COALESCE((
                    SELECT SUM(d.precio_ccdfa * d.cantidad_ccdfa)
                    FROM cxc_deta_factura d
                    INNER JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti
                    WHERE d.ide_cccfa = a.ide_cccfa
                      AND art.nombre_inarti ILIKE 'SERVICIOS LOGISTICOS%'
                      AND d.iva_inarti_ccdfa = 1
                ), 0) AS transporte_base,
                COALESCE((
                    SELECT SUM(d.precio_ccdfa * d.cantidad_ccdfa)
                    FROM cxc_deta_factura d
                    INNER JOIN inv_articulo art ON d.ide_inarti = art.ide_inarti
                    WHERE d.ide_cccfa = a.ide_cccfa
                      AND art.nombre_inarti ILIKE 'SERVICIOS LOGISTICOS%'
                      AND d.iva_inarti_ccdfa != 1
                ), 0) AS transporte_tarifa0
            FROM cxc_cabece_factura a
            LEFT JOIN (
                SELECT d.ide_cncre, d.valor_cndre, f.ide_cncim
                FROM con_detall_retenc d
                INNER JOIN con_cabece_impues f ON d.ide_cncim = f.ide_cncim
                WHERE f.ide_cnimp = 1
            ) retRenta ON a.ide_cncre = retRenta.ide_cncre
            LEFT JOIN (
                SELECT d.ide_cncre, d.valor_cndre, f.ide_cncim
                FROM con_detall_retenc d
                INNER JOIN con_cabece_impues f ON d.ide_cncim = f.ide_cncim
                WHERE f.ide_cnimp = 0
            ) retIva ON a.ide_cncre = retIva.ide_cncre
            WHERE a.ide_cccfa = $1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cccfa);
        const doc = await this.dataSource.createSingleQuery(qDoc);
        if (!doc) {
            return { ide_cccfa: dtoIn.ide_cccfa, generado: false, advertencias: ['La factura no existe'] };
        }
        if (doc.ide_cnccc) {
            return {
                ide_cccfa: dtoIn.ide_cccfa,
                ide_cnccc: Number(doc.ide_cnccc),
                generado: false,
                advertencias: ['La factura ya tiene asiento contable'],
            };
        }

        const detallesAsiento: Array<{
            ide_cnlap: number; ide_cndpc: number; valor_cndcc: number; observacion_cndcc: string;
        }> = [];

        let totalRetenciones = 0;
        if (doc.ret_renta != null) {
            const cuenta = await this.buscarCuentaConfig(
                'RETENCION RENTA POR COBRAR',
                { ideCncim: doc.ide_cncim_renta ? Number(doc.ide_cncim_renta) : undefined },
                dtoIn.ideSucu,
            );
            if (!cuenta) advertencias.push('Cuenta RETENCION RENTA POR COBRAR no configurada');
            const valor = Number(Number(doc.ret_renta || 0).toFixed(2));
            totalRetenciones += valor;
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe, ide_cndpc: cuenta ?? 0, valor_cndcc: valor,
                observacion_cndcc: 'RETENCION RENTA POR COBRAR',
            });
        }
        if (doc.ret_iva != null) {
            const cuenta = await this.buscarCuentaConfig(
                'RETENCION IVA POR COBRAR',
                { ideCncim: doc.ide_cncim_iva ? Number(doc.ide_cncim_iva) : undefined },
                dtoIn.ideSucu,
            );
            if (!cuenta) advertencias.push('Cuenta RETENCION IVA POR COBRAR no configurada');
            const valor = Number(Number(doc.ret_iva || 0).toFixed(2));
            totalRetenciones += valor;
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe, ide_cndpc: cuenta ?? 0, valor_cndcc: valor,
                observacion_cndcc: 'RETENCION IVA POR COBRAR',
            });
        }

        const cuentaCxC = await this.getCuentaPersona('CUENTA POR COBRAR', Number(doc.ide_geper), dtoIn.ideEmpr, dtoIn.ideSucu);
        if (!cuentaCxC) advertencias.push('Cuenta por cobrar del cliente no configurada en con_det_conf_asie');
        const valorCxC = Number((Number(doc.total_cccfa || 0) - totalRetenciones).toFixed(2));
        detallesAsiento.push({
            ide_cnlap: this.lugarDebe, ide_cndpc: cuentaCxC ?? 0, valor_cndcc: valorCxC,
            observacion_cndcc: 'CUENTA POR COBRAR',
        });

        const transporteBase = Number(doc.transporte_base || 0);
        const transporteTarifa0 = Number(doc.transporte_tarifa0 || 0);

        const valorVenta12 = Number((Number(doc.base_grabada_cccfa || 0) - transporteBase).toFixed(2));
        if (valorVenta12 > 0) {
            const cuenta = await this.buscarCuentaConfig('VENTAS', { idePorcentaje: 2 }, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta VENTAS (12%) no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuenta ?? 0, valor_cndcc: valorVenta12,
                observacion_cndcc: 'VENTAS',
            });
        }
        if (transporteBase > 0) {
            const cuenta = await this.buscarCuentaConfig('TRANSPORTE EN VENTAS', {}, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta TRANSPORTE EN VENTAS no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuenta ?? 0, valor_cndcc: Number(transporteBase.toFixed(2)),
                observacion_cndcc: 'TRANSPORTE EN VENTAS',
            });
        }

        const valorVenta0 = Number((Number(doc.base_tarifa0_cccfa || 0) - transporteTarifa0).toFixed(2));
        if (valorVenta0 > 0) {
            const cuenta = await this.buscarCuentaConfig('VENTAS', { idePorcentaje: 0 }, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta VENTAS (0%) no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuenta ?? 0, valor_cndcc: valorVenta0,
                observacion_cndcc: 'VENTAS',
            });
        }
        if (transporteTarifa0 > 0) {
            const cuenta = await this.buscarCuentaConfig('TRANSPORTE EN VENTAS', {}, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta TRANSPORTE EN VENTAS no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuenta ?? 0, valor_cndcc: Number(transporteTarifa0.toFixed(2)),
                observacion_cndcc: 'TRANSPORTE EN VENTAS',
            });
        }

        const valorIva = Number(doc.valor_iva_cccfa || 0);
        if (valorIva > 0) {
            const cuenta = await this.buscarCuentaConfig('IVA EN VENTAS', {}, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta IVA EN VENTAS no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuenta ?? 0, valor_cndcc: Number(valorIva.toFixed(2)),
                observacion_cndcc: 'IVA EN VENTAS',
            });
        }

        const saveDto: SaveComprobanteDto = {
            isUpdate: false,
            data: {
                ide_cntcm: IDE_CNTCM_DIARIO,
                ide_geper: Number(doc.ide_geper),
                fecha_trans_cnccc: doc.fecha_emisi_cccfa,
                observacion_cnccc: `V/. FACTURA N.${doc.secuencial_cccfa}`.substring(0, 190),
                automatico_cnccc: true,
            },
            detalles: detallesAsiento,
        } as SaveComprobanteDto;

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = {
                ...dtoIn,
                ...saveDto,
            };
            const result = await this.comprobanteService.saveAutomatico(comprobanteDto);
            const ideCnccc = result.ide_cnccc;

            await this.dataSource.pool.query(
                `UPDATE cxc_cabece_factura SET ide_cnccc = $1 WHERE ide_cccfa = $2`,
                [ideCnccc, dtoIn.ide_cccfa],
            );
            await this.dataSource.pool.query(
                `UPDATE cxc_detall_transa SET ide_cnccc = $1 WHERE ide_cccfa = $2 AND numero_pago_ccdtr = 0`,
                [ideCnccc, dtoIn.ide_cccfa],
            );

            return {
                ide_cccfa: dtoIn.ide_cccfa,
                ide_cnccc: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de factura ide_cccfa=${dtoIn.ide_cccfa}: ${error}`);
            return {
                ide_cccfa: dtoIn.ide_cccfa,
                generado: false,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Genera el asiento contable de una nota de crédito de VENTAS (paridad
     * ServicioComprobanteContabilidad.generarAsientoNotaCreditoDiquimec legacy - la variante
     * que efectivamente usa la pantalla de notas de crédito, no la genérica
     * generarAsientoNotaCredito que reversa a cuentas VENTAS):
     *
     *   CUENTA                          DEBE    HABER
     *   Notas de crédito ventas           X            (base 12% + base 0%)
     *   IVA en ventas                     X            (si aplica)
     *   Cuenta por cobrar (cliente)                X   (total de la nota)
     */
    async generarAsientoNotaCredito(
        dtoIn: GenerarAsientoNotaCreditoDto & HeaderParamsDto,
    ): Promise<AsientoNotaCreditoResult> {
        const advertencias: string[] = [];

        const qNota = new SelectQuery(`
            SELECT a.ide_cpcno, a.ide_geper, a.numero_cpcno, a.fecha_emisi_cpcno,
                   a.total_cpcno, a.base_grabada_cpcno, a.base_tarifa0_cpcno, a.valor_iva_cpcno, a.ide_cnccc
            FROM cxp_cabecera_nota a
            WHERE a.ide_cpcno = $1
        `);
        qNota.addIntParam(1, dtoIn.ide_cpcno);
        const nota = await this.dataSource.createSingleQuery(qNota);
        if (!nota) {
            return { ide_cpcno: dtoIn.ide_cpcno, generado: false, advertencias: ['La nota de crédito no existe'] };
        }
        if (nota.ide_cnccc) {
            return {
                ide_cpcno: dtoIn.ide_cpcno,
                ide_cnccc: Number(nota.ide_cnccc),
                generado: false,
                advertencias: ['La nota de crédito ya tiene asiento contable'],
            };
        }

        const detallesAsiento: Array<{
            ide_cnlap: number; ide_cndpc: number; valor_cndcc: number; observacion_cndcc: string;
        }> = [];

        const cuentaCxC = await this.getCuentaPersona('CUENTA POR COBRAR', Number(nota.ide_geper), dtoIn.ideEmpr, dtoIn.ideSucu);
        if (!cuentaCxC) advertencias.push('Cuenta por cobrar del cliente no configurada en con_det_conf_asie');
        const valorCxC = Number(Number(nota.total_cpcno || 0).toFixed(2));
        detallesAsiento.push({
            ide_cnlap: this.lugarHaber, ide_cndpc: cuentaCxC ?? 0, valor_cndcc: valorCxC,
            observacion_cndcc: 'CUENTA POR COBRAR',
        });

        const totalDev = Number((Number(nota.base_grabada_cpcno || 0) + Number(nota.base_tarifa0_cpcno || 0)).toFixed(2));
        if (totalDev > 0) {
            const cuenta = await this.buscarCuentaConfig('NOTAS DE CREDITO VENTAS', {}, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta NOTAS DE CREDITO VENTAS no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe, ide_cndpc: cuenta ?? 0, valor_cndcc: totalDev,
                observacion_cndcc: 'NOTAS DE CREDITO VENTAS',
            });
        }

        const valorIva = Number(nota.valor_iva_cpcno || 0);
        if (valorIva > 0) {
            const cuenta = await this.buscarCuentaConfig('IVA EN VENTAS', {}, dtoIn.ideSucu);
            if (!cuenta) advertencias.push('Cuenta IVA EN VENTAS no configurada');
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe, ide_cndpc: cuenta ?? 0, valor_cndcc: Number(valorIva.toFixed(2)),
                observacion_cndcc: 'IVA EN VENTAS',
            });
        }

        const saveDto: SaveComprobanteDto = {
            isUpdate: false,
            data: {
                ide_cntcm: IDE_CNTCM_DIARIO,
                ide_geper: Number(nota.ide_geper),
                fecha_trans_cnccc: nota.fecha_emisi_cpcno,
                observacion_cnccc: `V/. NOTA DE CREDITO N..${nota.numero_cpcno}`.substring(0, 190),
                automatico_cnccc: true,
            },
            detalles: detallesAsiento,
        } as SaveComprobanteDto;

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = {
                ...dtoIn,
                ...saveDto,
            };
            const result = await this.comprobanteService.saveAutomatico(comprobanteDto);
            const ideCnccc = result.ide_cnccc;

            await this.dataSource.pool.query(
                `UPDATE cxp_cabecera_nota SET ide_cnccc = $1 WHERE ide_cpcno = $2`,
                [ideCnccc, dtoIn.ide_cpcno],
            );
            // Nota: el legacy además actualiza masivamente TODA fila cxc_detall_transa sin
            // asiento con ide_ccttr=1 (sin acotar por esta nota) - eso es un bug latente
            // documentado en la investigación de migración, no se replica aquí a propósito.

            return {
                ide_cpcno: dtoIn.ide_cpcno,
                ide_cnccc: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de nota de crédito ide_cpcno=${dtoIn.ide_cpcno}: ${error}`);
            return {
                ide_cpcno: dtoIn.ide_cpcno,
                generado: false,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Genera el asiento de COSTO DE VENTA de una factura (paridad
     * ServicioComprobanteContabilidad.generarAsientoCostoDeVenta legacy): un asiento SEPARADO
     * del de venta (columna propia ide_cnccc_costo en cxc_cabece_factura), que traslada del
     * inventario al costo de ventas el costo (PPMP, vía la función SQL f_costo_unitario_ppmp)
     * de cada línea con kardex (hace_kardex_inarti = true) de la factura:
     *
     *   CUENTA                              DEBE    HABER
     *   Costo en Ventas (por artículo)        X            (cantidad * costo_unitario PPMP)
     *   Inventario Producto Terminado                 X    (por artículo)
     *
     * Si la factura no tiene líneas con kardex (servicios, artículos sin control de
     * inventario), no hay nada que trasladar - no se genera asiento (paridad legacy).
     */
    async generarAsientoCostoVenta(
        dtoIn: GenerarAsientoCostoVentaDto & HeaderParamsDto,
    ): Promise<AsientoCostoVentaResult> {
        const advertencias: string[] = [];

        const qDoc = new SelectQuery(`
            SELECT a.ide_cccfa, a.ide_geper, a.secuencial_cccfa, a.fecha_emisi_cccfa, a.ide_cnccc_costo
            FROM cxc_cabece_factura a
            WHERE a.ide_cccfa = $1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cccfa);
        const doc = await this.dataSource.createSingleQuery(qDoc);
        if (!doc) {
            return { ide_cccfa: dtoIn.ide_cccfa, generado: false, advertencias: ['La factura no existe'] };
        }
        if (doc.ide_cnccc_costo) {
            return {
                ide_cccfa: dtoIn.ide_cccfa,
                ide_cnccc_costo: Number(doc.ide_cnccc_costo),
                generado: false,
                advertencias: ['La factura ya tiene asiento de costo'],
            };
        }

        const qDet = new SelectQuery(`
            SELECT b.ide_inarti, c.nombre_inarti, b.cantidad_ccdfa, f.costo_unitario,
                   ROUND((b.cantidad_ccdfa * f.costo_unitario)::numeric, 4) AS costo_total
            FROM cxc_deta_factura b
            INNER JOIN inv_articulo c ON b.ide_inarti = c.ide_inarti
            LEFT JOIN LATERAL f_costo_unitario_ppmp($1, $2, b.ide_inarti, $3) f ON TRUE
            WHERE b.ide_cccfa = $4
              AND c.hace_kardex_inarti = true
        `);
        qDet.addIntParam(1, dtoIn.ideEmpr);
        qDet.addIntParam(2, dtoIn.ideSucu);
        qDet.addStringParam(3, doc.fecha_emisi_cccfa);
        qDet.addIntParam(4, dtoIn.ide_cccfa);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        if (!detalles || detalles.length === 0) {
            return {
                ide_cccfa: dtoIn.ide_cccfa,
                generado: false,
                advertencias: ['La factura no tiene artículos con control de kardex: no aplica asiento de costo'],
            };
        }

        const detallesAsiento: Array<{
            ide_cnlap: number; ide_cndpc: number; valor_cndcc: number; observacion_cndcc: string;
        }> = [];

        for (const linea of detalles) {
            const valorCosto = Number(Number(linea.costo_total || 0).toFixed(2));
            const ideInarti = Number(linea.ide_inarti);

            const cuentaCosto = await this.buscarCuentaProducto('COSTO EN VENTAS', ideInarti, dtoIn.ideSucu);
            if (!cuentaCosto) advertencias.push(`Cuenta COSTO EN VENTAS no configurada para "${linea.nombre_inarti}"`);
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe, ide_cndpc: cuentaCosto ?? 0, valor_cndcc: valorCosto,
                observacion_cndcc: `${linea.nombre_inarti} (${linea.cantidad_ccdfa} x ${linea.costo_unitario})`,
            });

            const cuentaInventario = await this.buscarCuentaProducto('INVENTARIO PRODUCTO TERMINADO', ideInarti, dtoIn.ideSucu);
            if (!cuentaInventario) advertencias.push(`Cuenta INVENTARIO PRODUCTO TERMINADO no configurada para "${linea.nombre_inarti}"`);
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuentaInventario ?? 0, valor_cndcc: valorCosto,
                observacion_cndcc: linea.nombre_inarti,
            });
        }

        const saveDto: SaveComprobanteDto = {
            isUpdate: false,
            data: {
                ide_cntcm: IDE_CNTCM_DIARIO,
                ide_geper: Number(doc.ide_geper),
                fecha_trans_cnccc: doc.fecha_emisi_cccfa,
                observacion_cnccc: `V/. COSTO FACTURA N.${doc.secuencial_cccfa}`.substring(0, 190),
                automatico_cnccc: true,
            },
            detalles: detallesAsiento,
        } as SaveComprobanteDto;

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = { ...dtoIn, ...saveDto };
            const result = await this.comprobanteService.saveAutomatico(comprobanteDto);
            const ideCnccc = result.ide_cnccc;

            await this.dataSource.pool.query(
                `UPDATE cxc_cabece_factura SET ide_cnccc_costo = $1 WHERE ide_cccfa = $2`,
                [ideCnccc, dtoIn.ide_cccfa],
            );

            return {
                ide_cccfa: dtoIn.ide_cccfa,
                ide_cnccc_costo: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de costo ide_cccfa=${dtoIn.ide_cccfa}: ${error}`);
            return {
                ide_cccfa: dtoIn.ide_cccfa,
                generado: false,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Genera el asiento de reverso de COSTO DE VENTA de una nota de crédito (paridad
     * ServicioComprobanteContabilidad.generarAsientoCostoDeVentaNotaCredito legacy): mismo
     * concepto que generarAsientoCostoVenta pero con DEBE/HABER invertidos (el artículo
     * vuelve al inventario, se revierte el costo de venta ya registrado).
     *
     * Desviación deliberada del legacy: el Java calcula el valor a revertir como
     * `cantidad * precio_venta` (usa el PRECIO de venta de la línea, no el costo PPMP) - una
     * inconsistencia que no se replica acá porque mezclaría precio de venta con costo y
     * distorsionaría el costo de ventas neto. Se usa `cantidad * costo_unitario` (mismo
     * criterio que generarAsientoCostoVenta) para que la reversa cuadre con lo generado
     * originalmente.
     */
    async generarAsientoCostoNotaCredito(
        dtoIn: GenerarAsientoCostoNotaCreditoDto & HeaderParamsDto,
    ): Promise<AsientoCostoNotaCreditoResult> {
        const advertencias: string[] = [];

        const qDoc = new SelectQuery(`
            SELECT a.ide_cpcno, a.ide_geper, a.numero_cpcno, a.fecha_emisi_cpcno, a.ide_cnccc_costo
            FROM cxp_cabecera_nota a
            WHERE a.ide_cpcno = $1
        `);
        qDoc.addIntParam(1, dtoIn.ide_cpcno);
        const nota = await this.dataSource.createSingleQuery(qDoc);
        if (!nota) {
            return { ide_cpcno: dtoIn.ide_cpcno, generado: false, advertencias: ['La nota de crédito no existe'] };
        }
        if (nota.ide_cnccc_costo) {
            return {
                ide_cpcno: dtoIn.ide_cpcno,
                ide_cnccc_costo: Number(nota.ide_cnccc_costo),
                generado: false,
                advertencias: ['La nota de crédito ya tiene asiento de costo'],
            };
        }

        const qDet = new SelectQuery(`
            SELECT b.ide_inarti, c.nombre_inarti, b.cantidad_cpdno, f.costo_unitario,
                   ROUND((b.cantidad_cpdno * f.costo_unitario)::numeric, 4) AS costo_total
            FROM cxp_detalle_nota b
            INNER JOIN inv_articulo c ON b.ide_inarti = c.ide_inarti
            LEFT JOIN LATERAL f_costo_unitario_ppmp($1, $2, b.ide_inarti, $3) f ON TRUE
            WHERE b.ide_cpcno = $4
              AND c.hace_kardex_inarti = true
        `);
        qDet.addIntParam(1, dtoIn.ideEmpr);
        qDet.addIntParam(2, dtoIn.ideSucu);
        qDet.addStringParam(3, nota.fecha_emisi_cpcno);
        qDet.addIntParam(4, dtoIn.ide_cpcno);
        const detalles = await this.dataSource.createSelectQuery(qDet);

        if (!detalles || detalles.length === 0) {
            return {
                ide_cpcno: dtoIn.ide_cpcno,
                generado: false,
                advertencias: ['La nota no tiene artículos con control de kardex: no aplica asiento de costo'],
            };
        }

        const detallesAsiento: Array<{
            ide_cnlap: number; ide_cndpc: number; valor_cndcc: number; observacion_cndcc: string;
        }> = [];

        for (const linea of detalles) {
            const valorCosto = Number(Number(linea.costo_total || 0).toFixed(2));
            const ideInarti = Number(linea.ide_inarti);

            const cuentaInventario = await this.buscarCuentaProducto('INVENTARIO PRODUCTO TERMINADO', ideInarti, dtoIn.ideSucu);
            if (!cuentaInventario) advertencias.push(`Cuenta INVENTARIO PRODUCTO TERMINADO no configurada para "${linea.nombre_inarti}"`);
            detallesAsiento.push({
                ide_cnlap: this.lugarDebe, ide_cndpc: cuentaInventario ?? 0, valor_cndcc: valorCosto,
                observacion_cndcc: linea.nombre_inarti,
            });

            const cuentaCosto = await this.buscarCuentaProducto('COSTO EN VENTAS', ideInarti, dtoIn.ideSucu);
            if (!cuentaCosto) advertencias.push(`Cuenta COSTO EN VENTAS no configurada para "${linea.nombre_inarti}"`);
            detallesAsiento.push({
                ide_cnlap: this.lugarHaber, ide_cndpc: cuentaCosto ?? 0, valor_cndcc: valorCosto,
                observacion_cndcc: `${linea.nombre_inarti} (${linea.cantidad_cpdno} x ${linea.costo_unitario})`,
            });
        }

        const saveDto: SaveComprobanteDto = {
            isUpdate: false,
            data: {
                ide_cntcm: IDE_CNTCM_DIARIO,
                ide_geper: Number(nota.ide_geper),
                fecha_trans_cnccc: nota.fecha_emisi_cpcno,
                observacion_cnccc: `V/. COSTO NOTA DE CREDITO N.${nota.numero_cpcno}`.substring(0, 190),
                automatico_cnccc: true,
            },
            detalles: detallesAsiento,
        } as SaveComprobanteDto;

        try {
            const comprobanteDto: SaveComprobanteDto & HeaderParamsDto = { ...dtoIn, ...saveDto };
            const result = await this.comprobanteService.saveAutomatico(comprobanteDto);
            const ideCnccc = result.ide_cnccc;

            await this.dataSource.pool.query(
                `UPDATE cxp_cabecera_nota SET ide_cnccc_costo = $1 WHERE ide_cpcno = $2`,
                [ideCnccc, dtoIn.ide_cpcno],
            );

            return {
                ide_cpcno: dtoIn.ide_cpcno,
                ide_cnccc_costo: ideCnccc,
                numero_cnccc: result.numero_cnccc,
                generado: true,
                advertencias,
            };
        } catch (error) {
            this.logger.warn(`Error al generar asiento de costo ide_cpcno=${dtoIn.ide_cpcno}: ${error}`);
            return {
                ide_cpcno: dtoIn.ide_cpcno,
                generado: false,
                advertencias: [...advertencias, `Error: ${error instanceof Error ? error.message : String(error)}`],
            };
        }
    }

    /**
     * Busca la cuenta contable de un identificador de configuración
     * (con_cab_conf_asie / con_vig_conf_asie / con_det_conf_asie), opcionalmente
     * filtrando por impuesto (ide_cncim) y/o por código de porcentaje de impuesto
     * (ide_cnpim - distingue p.ej. "VENTAS" 12% de "VENTAS" 0% bajo el mismo
     * identificador, paridad cls_contabilidad.buscarCuenta(...porcentajeImpuesto...)).
     */
    private async buscarCuentaConfig(
        identificador: string,
        filtros: { ideCncim?: number; idePorcentaje?: number },
        ideSucu: number,
    ): Promise<number | null> {
        const condicionImpuesto = filtros.ideCncim ? `AND cn_d.ide_cncim = ${Number(filtros.ideCncim)}` : '';
        const condicionPorcentaje = filtros.idePorcentaje !== undefined
            ? `AND cn_d.ide_cnpim = ${Number(filtros.idePorcentaje)}`
            : '';
        const q = new SelectQuery(`
            SELECT cn_d.ide_cndpc
            FROM con_vig_conf_asie cn_v
            JOIN con_det_conf_asie cn_d ON cn_v.ide_cnvca = cn_d.ide_cnvca
            JOIN con_cab_conf_asie cn_c ON cn_v.ide_cncca = cn_c.ide_cncca
            WHERE UPPER(cn_c.nombre_cncca) = UPPER($1)
              AND cn_v.estado_cnvca = true
              AND cn_v.ide_sucu = $2
              ${condicionImpuesto}
              ${condicionPorcentaje}
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
