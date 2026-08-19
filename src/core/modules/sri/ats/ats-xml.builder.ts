import { formatFechaSri } from '../xml/fecha-sri.util';
import { fNumero } from '../xml/numero-sri.util';

import { AtsAnexoDto, AtsCompraDto, AtsVentaDto } from './dto/ats.dto';

/** Puerto fiel de cls_anexo_transaccional_electronicos.AnexoTransaccional (armado del XML) del legacy sigafi-ceo. */
export function buildAtsXml(anexo: AtsAnexoDto): string {
    const incluyeCompras = anexo.opcionAnexo === '1' || anexo.opcionAnexo === '2';
    const incluyeVentas = anexo.opcionAnexo === '1' || anexo.opcionAnexo === '3';

    let comprasXml = '';
    if (incluyeCompras) {
        comprasXml = `\t<compras>\n${anexo.compras.map(buildDetalleCompra).join('')}\t</compras>\n`;
    }

    let ventasXml = '';
    if (incluyeVentas) {
        const ventasEstabXml = anexo.ventasEstablecimiento.map((v) => `\t\t<ventaEst>
\t\t\t<codEstab>${tag(v.codEstab)}</codEstab>
\t\t\t<ventasEstab>${fNumero(v.ventasEstab)}</ventasEstab>
\t\t\t<ivaComp>${fNumero(v.ivaComp)}</ivaComp>
\t\t</ventaEst>\n`).join('');
        ventasXml = `\t<ventas>\n${anexo.ventas.map(buildDetalleVenta).join('')}\t</ventas>\n`
            + `\t<ventasEstablecimiento>\n${ventasEstabXml}\t</ventasEstablecimiento>\n`;
    }

    // totalVentas = suma de baseNoGraIva + baseImponible + baseImpGrav de TODOS los
    // <detalleVentas> (facturas + notas de crédito de venta, ver getNotasCreditoVenta) -
    // exigido por la ficha técnica del ATS. Antes era el literal fijo 0, sin relación con las
    // ventas reales del anexo.
    const totalVentas = incluyeVentas
        ? anexo.ventas.reduce((sum, v) => sum + v.baseNoGraIva + v.baseImponible + v.baseImpGrav, 0)
        : 0;

    const anuladosXml = `\t<anulados>\n${anexo.anulados.map((a) => `\t\t<detalleAnulados>
\t\t\t<tipoComprobante>${tag(a.tipoComprobante)}</tipoComprobante>
\t\t\t<establecimiento>${tag(a.establecimiento)}</establecimiento>
\t\t\t<puntoEmision>${tag(a.puntoEmision)}</puntoEmision>
\t\t\t<secuencialInicio>${tag(a.secuencialInicio)}</secuencialInicio>
\t\t\t<secuencialFin>${tag(a.secuencialFin)}</secuencialFin>
\t\t\t<autorizacion>${tag(a.autorizacion)}</autorizacion>
\t\t</detalleAnulados>\n`).join('')}\t</anulados>\n`;

    return `<?xml version="1.0" standalone="yes"?>
<iva>
\t<TipoIDInformante>R</TipoIDInformante>
\t<IdInformante>${tag(anexo.ruc)}</IdInformante>
\t<razonSocial>${tag(anexo.razonSocial)}</razonSocial>
\t<Anio>${tag(anexo.anio)}</Anio>
\t<Mes>${tag(anexo.mes)}</Mes>
\t<numEstabRuc>${tag(anexo.numEstabRuc)}</numEstabRuc>
\t<totalVentas>${fNumero(totalVentas)}</totalVentas>
\t<codigoOperativo>IVA</codigoOperativo>
${comprasXml}${ventasXml}${anuladosXml}</iva>`;
}

function buildDetalleCompra(c: AtsCompraDto): string {
    let xml = `\t\t<detalleCompras>
\t\t\t<codSustento>${tag(c.codSustento)}</codSustento>
\t\t\t<tpIdProv>${tag(c.tpIdProv)}</tpIdProv>
\t\t\t<idProv>${tag(c.idProv)}</idProv>
\t\t\t<tipoComprobante>${tag(c.tipoComprobante)}</tipoComprobante>
\t\t\t<parteRel>${tag(c.parteRel)}</parteRel>
\t\t\t<fechaRegistro>${formatFechaSri(c.fechaRegistro)}</fechaRegistro>
\t\t\t<establecimiento>${tag(c.establecimiento)}</establecimiento>
\t\t\t<puntoEmision>${tag(c.puntoEmision)}</puntoEmision>
\t\t\t<secuencial>${tag(c.secuencial)}</secuencial>
\t\t\t<fechaEmision>${formatFechaSri(c.fechaEmision)}</fechaEmision>
\t\t\t<autorizacion>${tag(c.autorizacion)}</autorizacion>
\t\t\t<baseNoGraIva>${fNumero(c.baseNoGraIva)}</baseNoGraIva>
\t\t\t<baseImponible>${fNumero(c.baseImponible)}</baseImponible>
\t\t\t<baseImpGrav>${fNumero(c.baseImpGrav)}</baseImpGrav>
\t\t\t<baseImpExe>${fNumero(c.baseImpExe)}</baseImpExe>
\t\t\t<montoIce>${fNumero(c.montoIce)}</montoIce>
\t\t\t<montoIva>${fNumero(c.montoIva)}</montoIva>
\t\t\t<valRetBien10>0.00</valRetBien10>
\t\t\t<valRetServ20>0.00</valRetServ20>
\t\t\t<valorRetBienes>${fNumero(c.valorRetBienes)}</valorRetBienes>
\t\t\t<valRetServ50>0.00</valRetServ50>
\t\t\t<valorRetServicios>${fNumero(c.valorRetServicios)}</valorRetServicios>
\t\t\t<valRetServ100>${fNumero(c.valRetServ100)}</valRetServ100>
\t\t\t<totbasesImpReemb>${fNumero(c.totBasesImpReemb)}</totbasesImpReemb>
\t\t\t<pagoExterior>
\t\t\t\t<pagoLocExt>${tag(c.pagoExterior.pagoLocExt)}</pagoLocExt>
\t\t\t\t<paisEfecPago>${tag(c.pagoExterior.paisEfecPago)}</paisEfecPago>
\t\t\t\t<aplicConvDobTrib>${tag(c.pagoExterior.aplicConvDobTrib)}</aplicConvDobTrib>
\t\t\t\t<pagExtSujRetNorLeg>${tag(c.pagoExterior.pagExtSujRetNorLeg)}</pagExtSujRetNorLeg>
\t\t\t</pagoExterior>\n`;

    if (c.formaPago) {
        xml += `\t\t\t<formasDePago>
\t\t\t\t<formaPago>${tag(c.formaPago)}</formaPago>
\t\t\t</formasDePago>\n`;
    }

    if (c.esReembolso) {
        if (c.retencionAsociada) {
            const r = c.retencionAsociada;
            xml += `\t\t\t<estabRetencion1>${tag(r.estabRetencion1)}</estabRetencion1>
\t\t\t<ptoEmiRetencion1>${tag(r.ptoEmiRetencion1)}</ptoEmiRetencion1>
\t\t\t<secRetencion1>${tag(r.secRetencion1)}</secRetencion1>
\t\t\t<autRetencion1>${tag(r.autRetencion1)}</autRetencion1>
\t\t\t<fechaEmiRet1>${formatFechaSri(r.fechaEmiRet1)}</fechaEmiRet1>\n`;
        }
        if (c.reembolsos.length > 0) {
            xml += `\t\t\t<reembolsos>\n${c.reembolsos.map((r) => `\t\t\t\t<reembolso>
\t\t\t\t\t<tipoComprobanteReemb>${tag(r.tipoComprobanteReemb)}</tipoComprobanteReemb>
\t\t\t\t\t<tpIdProvReemb>${tag(r.tpIdProvReemb)}</tpIdProvReemb>
\t\t\t\t\t<idProvReemb>${tag(r.idProvReemb)}</idProvReemb>
\t\t\t\t\t<establecimientoReemb>${tag(r.establecimientoReemb)}</establecimientoReemb>
\t\t\t\t\t<puntoEmisionReemb>${tag(r.puntoEmisionReemb)}</puntoEmisionReemb>
\t\t\t\t\t<secuencialReemb>${tag(r.secuencialReemb)}</secuencialReemb>
\t\t\t\t\t<fechaEmisionReemb>${formatFechaSri(r.fechaEmisionReemb)}</fechaEmisionReemb>
\t\t\t\t\t<autorizacionReemb>${tag(r.autorizacionReemb)}</autorizacionReemb>
\t\t\t\t\t<baseImponibleReemb>${fNumero(r.baseImponibleReemb)}</baseImponibleReemb>
\t\t\t\t\t<baseImpGravReemb>${fNumero(r.baseImpGravReemb)}</baseImpGravReemb>
\t\t\t\t\t<baseNoGraIvaReemb>${fNumero(r.baseNoGraIvaReemb)}</baseNoGraIvaReemb>
\t\t\t\t\t<baseImpExeReemb>${fNumero(r.baseImpExeReemb)}</baseImpExeReemb>
\t\t\t\t\t<montoIceRemb>${fNumero(r.montoIceRemb)}</montoIceRemb>
\t\t\t\t\t<montoIvaRemb>${fNumero(r.montoIvaRemb)}</montoIvaRemb>
\t\t\t\t</reembolso>\n`).join('')}\t\t\t</reembolsos>\n`;
        }
    } else {
        xml += `\t\t\t<air>\n${c.air.map((a) => `\t\t\t\t<detalleAir>
\t\t\t\t\t<codRetAir>${tag(a.codRetAir)}</codRetAir>
\t\t\t\t\t<baseImpAir>${fNumero(a.baseImpAir)}</baseImpAir>
\t\t\t\t\t<porcentajeAir>${fNumero(a.porcentajeAir)}</porcentajeAir>
\t\t\t\t\t<valRetAir>${fNumero(a.valRetAir)}</valRetAir>
\t\t\t\t</detalleAir>\n`).join('')}\t\t\t</air>\n`;
    }

    if (c.docModificado) {
        const d = c.docModificado;
        xml += `\t\t\t<docModificado>${tag(d.docModificado)}</docModificado>
\t\t\t<estabModificado>${tag(d.estabModificado)}</estabModificado>
\t\t\t<ptoEmiModificado>${tag(d.ptoEmiModificado)}</ptoEmiModificado>
\t\t\t<secModificado>${tag(d.secModificado)}</secModificado>
\t\t\t<autModificado>${tag(d.autModificado)}</autModificado>\n`;
    }

    xml += '\t\t</detalleCompras>\n';
    return xml;
}

function buildDetalleVenta(v: AtsVentaDto): string {
    let xml = `\t\t<detalleVentas>
\t\t\t<tpIdCliente>${tag(v.tpIdCliente)}</tpIdCliente>
\t\t\t<idCliente>${tag(v.idCliente)}</idCliente>\n`;
    if (v.parteRelVtas) {
        xml += `\t\t\t<parteRelVtas>${tag(v.parteRelVtas)}</parteRelVtas>\n`;
    }
    if (v.tipoCliente) {
        xml += `\t\t\t<tipoCliente>${tag(v.tipoCliente)}</tipoCliente>
\t\t\t<denoCli>${tag(v.denoCli)}</denoCli>\n`;
    }
    xml += `\t\t\t<tipoComprobante>${tag(v.tipoComprobante)}</tipoComprobante>
\t\t\t<tipoEmision>${tag(v.tipoEmision)}</tipoEmision>
\t\t\t<numeroComprobantes>${v.numeroComprobantes}</numeroComprobantes>
\t\t\t<baseNoGraIva>${fNumero(v.baseNoGraIva)}</baseNoGraIva>
\t\t\t<baseImponible>${fNumero(v.baseImponible)}</baseImponible>
\t\t\t<baseImpGrav>${fNumero(v.baseImpGrav)}</baseImpGrav>
\t\t\t<montoIva>${fNumero(v.montoIva)}</montoIva>
\t\t\t<montoIce>${fNumero(v.montoIce)}</montoIce>
\t\t\t<valorRetIva>${fNumero(v.valorRetIva)}</valorRetIva>
\t\t\t<valorRetRenta>${fNumero(v.valorRetRenta)}</valorRetRenta>\n`;
    if (v.formaPago && v.formaPago.length > 0) {
        xml += `\t\t\t<formasDePago>\n${v.formaPago.map((fp) => `\t\t\t\t<formaPago>${tag(fp)}</formaPago>\n`).join('')}\t\t\t</formasDePago>\n`;
    }
    xml += '\t\t</detalleVentas>\n';
    return xml;
}

/** Texto de nodo XML, escapando los caracteres reservados (paridad con Document.createTextNode del legacy). */
function tag(valor: string | number | null | undefined): string {
    if (valor === null || valor === undefined) return '';
    return String(valor)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
