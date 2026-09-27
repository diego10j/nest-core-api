import { VariablesService } from 'src/core/variables/variables.service';

import { ComprobanteDto } from '../cel/dto/comprobante.dto';

/** Variable del sistema (sis_parametros) con el RUC que exige el SRI en Información Adicional. */
export const VAR_RUC_PROVEEDOR_SRI = 'p_gen_ruc_proveedor_sri';
/** Nombre del campoAdicional en el XML y etiqueta en el RIDE. */
export const NOMBRE_CAMPO_RUC_PROVEEDOR = 'RUC Proveedor';

/**
 * Lee p_gen_ruc_proveedor_sri (caché Redis de VariablesService, que se invalida al editar la
 * variable). Si no está importada/configurada retorna undefined y el campo simplemente no se
 * agrega: no se bloquea la emisión de comprobantes por esto.
 */
export async function getRucProveedorSri(variables: VariablesService): Promise<string | undefined> {
    const valores = await variables.getVariables([VAR_RUC_PROVEEDOR_SRI]);
    return valores.get(VAR_RUC_PROVEEDOR_SRI)?.trim() || undefined;
}

/**
 * `<campoAdicional nombre="RUC Proveedor">` — va AL FINAL del bloque <infoAdicional> de todos los
 * comprobantes (factura, NC, liquidación, retención, guía). Vacío si la variable no está configurada.
 */
export function buildCampoRucProveedor(rucProveedor: string | undefined | null): string {
    const ruc = rucProveedor?.trim();
    return ruc ? `      		<campoAdicional nombre="${NOMBRE_CAMPO_RUC_PROVEEDOR}">${ruc}</campoAdicional> \n` : '';
}

export function isCorreoValido(correo: string | undefined | null): boolean {
    if (!correo) return false;
    return /^[_A-Za-z0-9-+]+(\.[_A-Za-z0-9-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9]+)*(\.[A-Za-z]{2,})$/.test(correo);
}

/**
 * Bloque <infoAdicional> común a factura, nota de crédito y liquidación de compra
 * (EMAIL/TELEFONO/DIRECCION/ORDEN DE COMPRA/VENDEDOR/FORMA DE PAGO/OBSERVACION/AGENTE DE RETENCION).
 * Puerto fiel del bloque repetido en FacturaServiceImp/NotaCreditoServiceImp/LiquidacionCompraServiceImp.
 */
export function buildInfoAdicionalComprobante(comprobante: ComprobanteDto, correoPorDefecto?: string, rucProveedor?: string): string {
    let xml = '		<infoAdicional> \n';
    const correo = comprobante.cliente?.correo;
    if (isCorreoValido(correo)) {
        xml += `      		<campoAdicional nombre="EMAIL">${correo}</campoAdicional> \n`;
    } else if (correoPorDefecto) {
        xml += `      		<campoAdicional nombre="EMAIL">${correoPorDefecto}</campoAdicional> \n`;
    }
    if (comprobante.cliente?.telefono) {
        xml += `      		<campoAdicional nombre="TELEFONO">${comprobante.cliente.telefono}</campoAdicional> \n`;
    }
    if (comprobante.cliente?.direccion) {
        xml += `      		<campoAdicional nombre="DIRECCION">${comprobante.cliente.direccion}</campoAdicional> \n`;
    }
    if (comprobante.numOrdenCompra) {
        xml += `      		<campoAdicional nombre="ORDEN DE COMPRA">${comprobante.numOrdenCompra}</campoAdicional> \n`;
    }
    if (comprobante.infoAdicional1) {
        xml += `      		<campoAdicional nombre="VENDEDOR">${comprobante.infoAdicional1}</campoAdicional> \n`;
    }
    if (comprobante.infoAdicional2) {
        xml += `      		<campoAdicional nombre="FORMA DE PAGO">${comprobante.infoAdicional2}</campoAdicional> \n`;
    }
    if (comprobante.infoAdicional3) {
        xml += `      		<campoAdicional nombre="OBSERVACION">${comprobante.infoAdicional3}</campoAdicional> \n`;
    }
    if (comprobante.agenteRetencion) {
        xml += `      		<campoAdicional nombre="AGENTE DE RETENCION">${comprobante.agenteRetencion}</campoAdicional> \n`;
    }
    xml += buildCampoRucProveedor(rucProveedor);
    xml += '		</infoAdicional> \n';
    return xml;
}
