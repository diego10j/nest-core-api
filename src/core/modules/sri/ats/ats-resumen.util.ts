import { AtsAnexoDto } from './dto/ats.dto';

/**
 * Desglose de compras por tipo de comprobante (con_tipo_document.alter_tribu_cntdo/nombre_cntdo),
 * paridad con la tabla "COMPRAS" del Talón Resumen de Anexo Transaccional que emite el
 * validador del SRI: agrupa por código de transacción y desglosa BI tarifa 0%, BI tarifa
 * diferente de 0%, BI No Objeto de IVA y Valor IVA. "baseGravada" NO asume una tarifa fija (la
 * tarifa de IVA es configurable por comprobante, hoy 15% — antes 12%): es la suma de la base
 * gravada de cada documento, a la tarifa que corresponda en cada caso (paridad con la columna
 * "BI tarifa diferente 0%" del talón oficial, que tampoco fija un porcentaje).
 */
export interface AtsResumenCompraDetalleDto {
    codigo: string;
    nombre: string;
    numeroComprobantes: number;
    base0: number;
    baseGravada: number;
    baseNoGraIva: number;
    montoIva: number;
}

/** Desglose de ventas por tipo de comprobante, paridad con la tabla "VENTAS" del Talón Resumen. */
export interface AtsResumenVentaDetalleDto {
    codigo: string;
    nombre: string;
    numeroComprobantes: number;
    base0: number;
    baseGravada: number;
    baseNoGraIva: number;
    montoIva: number;
}

/**
 * Desglose de retenciones de Impuesto a la Renta por concepto (con_cabece_impues.casillero_cncim/
 * nombre_cncim), paridad con la tabla "RESUMEN DE RETENCIONES - AGENTE DE RETENCIÓN" del Talón
 * Resumen del SRI. Se arma a partir de `AtsCompraDto.air[]` — el mismo detalle que ya viaja en
 * el XML del ATS bajo `<air>`, no una consulta nueva.
 */
export interface AtsResumenRetencionDetalleDto {
    codigo: string;
    nombre: string;
    numeroComprobantes: number;
    baseImponible: number;
    valorRetenido: number;
}

/**
 * Resumen del Anexo Transaccional Simplificado (ATS), equivalente al panel de totales que
 * muestra el validador/DIMM Anexos del SRI antes de subir el XML — pensado para que el
 * contador revise las cifras del período sin tener que abrir/leer el XML.
 */
export interface AtsResumenDto {
    periodo: string;
    ruc: string;
    razonSocial: string;
    compras: {
        numeroComprobantes: number;
        baseImponible: number;
        baseNoGraIva: number;
        baseImpExe: number;
        montoIva: number;
        montoIce: number;
        retencionIva: number;
        retencionRenta: number;
        total: number;
        detalle: AtsResumenCompraDetalleDto[];
        retenciones: AtsResumenRetencionDetalleDto[];
    };
    ventas: {
        numeroComprobantes: number;
        baseImponible: number;
        montoIva: number;
        montoIce: number;
        retencionIva: number;
        retencionRenta: number;
        total: number;
        detalle: AtsResumenVentaDetalleDto[];
    };
    anulados: number;
    establecimientos: number;
}

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Nombres de referencia para los códigos de tipo de comprobante de venta (paridad con el talón del SRI). */
const NOMBRE_TIPO_VENTA: Record<string, string> = {
    '04': 'Notas de Crédito',
    '18': 'Documentos Autorizados en Ventas Excepto NC',
};

/** Arma el resumen de totales del anexo a partir del mismo AtsAnexoDto usado para construir el XML. */
export function buildAtsResumen(anexo: AtsAnexoDto): AtsResumenDto {
    const mesIndex = Number(anexo.mes) - 1;
    const nombreMes = MESES[mesIndex] ?? anexo.mes;

    const compras = anexo.compras.reduce(
        (acc, c) => {
            acc.numeroComprobantes += 1;
            acc.baseImponible += Number(c.baseImponible ?? 0) + Number(c.baseImpGrav ?? 0);
            acc.baseNoGraIva += Number(c.baseNoGraIva ?? 0);
            acc.baseImpExe += Number(c.baseImpExe ?? 0);
            acc.montoIva += Number(c.montoIva ?? 0);
            acc.montoIce += Number(c.montoIce ?? 0);
            // Retención de IVA (30%/70%/100% del IVA pagado) — distinta de la retención de Renta.
            acc.retencionIva += Number(c.valorRetBienes ?? 0) + Number(c.valorRetServicios ?? 0) + Number(c.valRetServ100 ?? 0);
            // Retención de Renta: viaja en el detalle `air[]` de cada compra, no en valorRetBienes/etc.
            acc.retencionRenta += c.air.reduce((s, a) => s + Number(a.valRetAir ?? 0), 0);
            return acc;
        },
        {
            numeroComprobantes: 0, baseImponible: 0, baseNoGraIva: 0, baseImpExe: 0,
            montoIva: 0, montoIce: 0, retencionIva: 0, retencionRenta: 0,
        },
    );

    const detallePorTipo = new Map<string, AtsResumenCompraDetalleDto>();
    const retencionesPorCodigo = new Map<string, AtsResumenRetencionDetalleDto>();
    for (const c of anexo.compras) {
        const codigo = c.tipoComprobante || '---';
        const fila = detallePorTipo.get(codigo) ?? {
            codigo,
            nombre: c.nombreTipoComprobante || codigo,
            numeroComprobantes: 0,
            base0: 0,
            baseGravada: 0,
            baseNoGraIva: 0,
            montoIva: 0,
        };
        fila.numeroComprobantes += 1;
        fila.base0 += Number(c.baseImponible ?? 0);
        fila.baseGravada += Number(c.baseImpGrav ?? 0);
        fila.baseNoGraIva += Number(c.baseNoGraIva ?? 0);
        fila.montoIva += Number(c.montoIva ?? 0);
        detallePorTipo.set(codigo, fila);

        for (const ret of c.air) {
            const codigoRet = ret.codRetAir || '---';
            const filaRet = retencionesPorCodigo.get(codigoRet) ?? {
                codigo: codigoRet,
                nombre: ret.nombreConcepto || codigoRet,
                numeroComprobantes: 0,
                baseImponible: 0,
                valorRetenido: 0,
            };
            filaRet.numeroComprobantes += 1;
            filaRet.baseImponible += Number(ret.baseImpAir ?? 0);
            filaRet.valorRetenido += Number(ret.valRetAir ?? 0);
            retencionesPorCodigo.set(codigoRet, filaRet);
        }
    }
    const detalle = [...detallePorTipo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
    const retenciones = [...retencionesPorCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));

    const ventas = anexo.ventas.reduce(
        (acc, v) => {
            acc.numeroComprobantes += Number(v.numeroComprobantes ?? 0);
            acc.baseImponible += Number(v.baseImponible ?? 0) + Number(v.baseImpGrav ?? 0);
            acc.montoIva += Number(v.montoIva ?? 0);
            acc.montoIce += Number(v.montoIce ?? 0);
            acc.retencionIva += Number(v.valorRetIva ?? 0);
            acc.retencionRenta += Number(v.valorRetRenta ?? 0);
            return acc;
        },
        { numeroComprobantes: 0, baseImponible: 0, montoIva: 0, montoIce: 0, retencionIva: 0, retencionRenta: 0 },
    );

    const ventasDetallePorTipo = new Map<string, AtsResumenVentaDetalleDto>();
    for (const v of anexo.ventas) {
        const codigo = v.tipoComprobante || '---';
        const fila = ventasDetallePorTipo.get(codigo) ?? {
            codigo,
            nombre: NOMBRE_TIPO_VENTA[codigo] || codigo,
            numeroComprobantes: 0,
            base0: 0,
            baseGravada: 0,
            baseNoGraIva: 0,
            montoIva: 0,
        };
        fila.numeroComprobantes += Number(v.numeroComprobantes ?? 0);
        fila.base0 += Number(v.baseImponible ?? 0);
        fila.baseGravada += Number(v.baseImpGrav ?? 0);
        fila.baseNoGraIva += Number(v.baseNoGraIva ?? 0);
        fila.montoIva += Number(v.montoIva ?? 0);
        ventasDetallePorTipo.set(codigo, fila);
    }
    const ventasDetalle = [...ventasDetallePorTipo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));

    return {
        periodo: `${nombreMes} ${anexo.anio}`,
        ruc: anexo.ruc,
        razonSocial: anexo.razonSocial,
        compras: {
            ...compras,
            total: compras.baseImponible + compras.baseNoGraIva + compras.baseImpExe + compras.montoIva + compras.montoIce,
            detalle,
            retenciones,
        },
        ventas: {
            ...ventas,
            total: ventas.baseImponible + ventas.montoIva + ventas.montoIce,
            detalle: ventasDetalle,
        },
        anulados: anexo.anulados.length,
        establecimientos: anexo.ventasEstablecimiento.length,
    };
}
