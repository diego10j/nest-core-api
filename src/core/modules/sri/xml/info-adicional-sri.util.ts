import { ComprobanteDto } from '../cel/dto/comprobante.dto';

export function isCorreoValido(correo: string | undefined | null): boolean {
    if (!correo) return false;
    return /^[_A-Za-z0-9-+]+(\.[_A-Za-z0-9-]+)*@[A-Za-z0-9-]+(\.[A-Za-z0-9]+)*(\.[A-Za-z]{2,})$/.test(correo);
}

/**
 * Bloque <infoAdicional> común a factura, nota de crédito y liquidación de compra
 * (EMAIL/TELEFONO/DIRECCION/ORDEN DE COMPRA/VENDEDOR/FORMA DE PAGO/OBSERVACION/AGENTE DE RETENCION).
 * Puerto fiel del bloque repetido en FacturaServiceImp/NotaCreditoServiceImp/LiquidacionCompraServiceImp.
 */
export function buildInfoAdicionalComprobante(comprobante: ComprobanteDto, correoPorDefecto?: string): string {
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
    xml += '		</infoAdicional> \n';
    return xml;
}
