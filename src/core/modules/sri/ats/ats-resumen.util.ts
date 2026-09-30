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
 * Retención reportada por operación (COMPRA/VENTA) y concepto, paridad con las tablas
 * "RETENCIÓN EN LA FUENTE DE IVA" y "RESUMEN DE RETENCIONES QUE LE EFECTUARON EN EL PERIODO"
 * del Talón Resumen del SRI.
 */
export interface AtsResumenRetencionOperacionDto {
    operacion: 'COMPRA' | 'VENTA';
    concepto: string;
    valor: number;
}

/**
 * Resumen del Anexo Transaccional Simplificado (ATS), equivalente al panel de totales que
 * muestra el validador/DIMM Anexos del SRI antes de subir el XML — pensado para que el
 * contador revise las cifras del período sin tener que abrir/leer el XML.
 */
export interface AtsResumenDto {
    /** Formato legible, ej. "Marzo 2026". */
    periodo: string;
    /** Año calendario, ej. "2026" — paridad con el "Periodo: MM-YYYY" del talón oficial del SRI. */
    anio: string;
    /** Mes calendario de 2 dígitos, ej. "03". */
    mes: string;
    ruc: string;
    razonSocial: string;
    compras: {
        numeroComprobantes: number;
        /** Neto del período (BI tarifa 0% + BI tarifa diferente 0%), notas de crédito restadas. */
        baseImponible: number;
        /** BI tarifa 0% neta del período — columna "BI tarifa 0%" del talón. */
        base0: number;
        /** BI tarifa diferente de 0% neta del período — columna "BI tarifa diferente 0%" del talón. */
        baseGravada: number;
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
        base0: number;
        baseGravada: number;
        montoIva: number;
        montoIce: number;
        retencionIva: number;
        retencionRenta: number;
        total: number;
        detalle: AtsResumenVentaDetalleDto[];
    };
    anulados: number;
    establecimientos: number;
    /** Tabla "RETENCIÓN EN LA FUENTE DE IVA" del talón — retenciones de IVA aplicadas en compras, por porcentaje/concepto. */
    retencionIvaCompras: AtsResumenRetencionOperacionDto[];
    /** Tabla "RESUMEN DE RETENCIONES QUE LE EFECTUARON EN EL PERIODO" del talón — IVA y Renta que le retuvieron en ventas. */
    retencionesRecibidas: AtsResumenRetencionOperacionDto[];
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

/**
 * Código de tipo de comprobante "Notas de Crédito" (con_tipo_document.alter_tribu_cntdo). El
 * Talón Resumen del SRI muestra estas filas con magnitud positiva en el detalle, pero las RESTA
 * del TOTAL de la sección (compras/ventas netas del período) — no las suma como un documento más.
 */
const CODIGO_NOTA_CREDITO = '04';

/** Arma el resumen de totales del anexo a partir del mismo AtsAnexoDto usado para construir el XML. */
export function buildAtsResumen(anexo: AtsAnexoDto): AtsResumenDto {
    const mesIndex = Number(anexo.mes) - 1;
    const nombreMes = MESES[mesIndex] ?? anexo.mes;

    const compras = anexo.compras.reduce(
        (acc, c) => {
            // Las notas de crédito de compra reducen las compras netas del período (paridad con
            // el TOTAL del talón oficial), aunque su fila propia en el detalle se muestre positiva.
            const signo = c.tipoComprobante === CODIGO_NOTA_CREDITO ? -1 : 1;
            acc.numeroComprobantes += 1;
            acc.base0 += signo * Number(c.baseImponible ?? 0);
            acc.baseGravada += signo * Number(c.baseImpGrav ?? 0);
            acc.baseNoGraIva += signo * Number(c.baseNoGraIva ?? 0);
            acc.baseImpExe += signo * Number(c.baseImpExe ?? 0);
            acc.montoIva += signo * Number(c.montoIva ?? 0);
            acc.montoIce += signo * Number(c.montoIce ?? 0);
            // Retención de IVA (30%/70%/100% del IVA pagado) — distinta de la retención de Renta.
            acc.retencionIva += Number(c.valorRetBienes ?? 0) + Number(c.valorRetServicios ?? 0) + Number(c.valRetServ100 ?? 0);
            // Retención de Renta: viaja en el detalle `air[]` de cada compra, no en valorRetBienes/etc.
            acc.retencionRenta += c.air.reduce((s, a) => s + Number(a.valRetAir ?? 0), 0);
            return acc;
        },
        {
            numeroComprobantes: 0, base0: 0, baseGravada: 0, baseNoGraIva: 0, baseImpExe: 0,
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
            // Mismo criterio que en compras: las notas de crédito de venta restan del neto del período.
            const signo = v.tipoComprobante === CODIGO_NOTA_CREDITO ? -1 : 1;
            // "No. Registros" del talón cuenta filas del XML (una por cliente agregado), no la
            // suma del campo numeroComprobantes de cada fila (que es el total de facturas
            // individuales agrupadas bajo ese cliente) — paridad con el conteo que hace el
            // validador/DIMM del SRI.
            acc.numeroComprobantes += 1;
            acc.base0 += signo * Number(v.baseImponible ?? 0);
            acc.baseGravada += signo * Number(v.baseImpGrav ?? 0);
            acc.montoIva += signo * Number(v.montoIva ?? 0);
            acc.montoIce += signo * Number(v.montoIce ?? 0);
            acc.retencionIva += Number(v.valorRetIva ?? 0);
            acc.retencionRenta += Number(v.valorRetRenta ?? 0);
            return acc;
        },
        { numeroComprobantes: 0, base0: 0, baseGravada: 0, montoIva: 0, montoIce: 0, retencionIva: 0, retencionRenta: 0 },
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
        fila.numeroComprobantes += 1;
        fila.base0 += Number(v.baseImponible ?? 0);
        fila.baseGravada += Number(v.baseImpGrav ?? 0);
        fila.baseNoGraIva += Number(v.baseNoGraIva ?? 0);
        fila.montoIva += Number(v.montoIva ?? 0);
        ventasDetallePorTipo.set(codigo, fila);
    }
    const ventasDetalle = [...ventasDetallePorTipo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));

    const retencionIvaCompras: AtsResumenRetencionOperacionDto[] = anexo.retencionIvaCompras.map((r) => ({
        operacion: 'COMPRA',
        concepto: r.nombre || r.codigo,
        valor: r.valor,
    }));

    const retencionesRecibidas: AtsResumenRetencionOperacionDto[] = [
        { operacion: 'VENTA', concepto: 'Valor de IVA que le han retenido', valor: ventas.retencionIva },
        { operacion: 'VENTA', concepto: 'Valor de Renta que le han retenido', valor: ventas.retencionRenta },
    ];

    return {
        periodo: `${nombreMes} ${anexo.anio}`,
        anio: anexo.anio,
        mes: anexo.mes,
        ruc: anexo.ruc,
        razonSocial: anexo.razonSocial,
        compras: {
            ...compras,
            baseImponible: compras.base0 + compras.baseGravada,
            total: compras.base0 + compras.baseGravada + compras.baseNoGraIva + compras.baseImpExe + compras.montoIva + compras.montoIce,
            detalle,
            retenciones,
        },
        ventas: {
            ...ventas,
            baseImponible: ventas.base0 + ventas.baseGravada,
            total: ventas.base0 + ventas.baseGravada + ventas.montoIva + ventas.montoIce,
            detalle: ventasDetalle,
        },
        anulados: anexo.anulados.length,
        establecimientos: anexo.ventasEstablecimiento.length,
        retencionIvaCompras,
        retencionesRecibidas,
    };
}
