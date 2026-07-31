import { AtsAnexoDto } from './dto/ats.dto';

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
        retencionRenta: number;
        total: number;
    };
    ventas: {
        numeroComprobantes: number;
        baseImponible: number;
        montoIva: number;
        montoIce: number;
        retencionIva: number;
        retencionRenta: number;
        total: number;
    };
    anulados: number;
    establecimientos: number;
}

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

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
            acc.retencionRenta += Number(c.valorRetBienes ?? 0) + Number(c.valorRetServicios ?? 0) + Number(c.valRetServ100 ?? 0);
            return acc;
        },
        {
            numeroComprobantes: 0, baseImponible: 0, baseNoGraIva: 0, baseImpExe: 0,
            montoIva: 0, montoIce: 0, retencionRenta: 0,
        },
    );

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

    return {
        periodo: `${nombreMes} ${anexo.anio}`,
        ruc: anexo.ruc,
        razonSocial: anexo.razonSocial,
        compras: {
            ...compras,
            total: compras.baseImponible + compras.baseNoGraIva + compras.baseImpExe + compras.montoIva + compras.montoIce,
        },
        ventas: {
            ...ventas,
            total: ventas.baseImponible + ventas.montoIva + ventas.montoIce,
        },
        anulados: anexo.anulados.length,
        establecimientos: anexo.ventasEstablecimiento.length,
    };
}
