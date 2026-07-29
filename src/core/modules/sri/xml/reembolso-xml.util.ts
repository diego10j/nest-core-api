import { ReembolsoLineaDto } from './dto/reembolso-linea.dto';
import { formatFechaSri } from './fecha-sri.util';
import { fNumero } from './numero-sri.util';

/**
 * Bloque XML de reembolso de gastos (Anexo 17 SRI, Liquidación de Compra):
 * `<codDocReemb>`/totales dentro de infoLiquidacionCompra, y `<reembolsos>`
 * a nivel de comprobante.
 */
export function buildReembolsosXml(reembolsos: ReembolsoLineaDto[]): { codDocReembXml: string; reembolsosXml: string } {
  if (reembolsos.length === 0) {
    return { codDocReembXml: '', reembolsosXml: '' };
  }

  let totalBaseImponibleReembolso = 0;
  let totalImpuestoReembolso = 0;
  let reembolsoDetalles = '';
  for (const r of reembolsos) {
    let detalleImpuestosXml = '';
    for (const di of r.detalleImpuestos) {
      totalBaseImponibleReembolso += di.baseImponibleReembolso;
      totalImpuestoReembolso += di.impuestoReembolso;
      detalleImpuestosXml += `					<detalleImpuesto>
						<codigo>${di.codigo}</codigo>
						<codigoPorcentaje>${di.codigoPorcentaje}</codigoPorcentaje>
						<tarifa>${fNumero(di.tarifa)}</tarifa>
						<baseImponibleReembolso>${fNumero(di.baseImponibleReembolso)}</baseImponibleReembolso>
						<impuestoReembolso>${fNumero(di.impuestoReembolso)}</impuestoReembolso>
					</detalleImpuesto>
`;
    }
    reembolsoDetalles += `			<reembolsoDetalle>
				<tipoIdentificacionProveedorReembolso>${r.tipoIdentificacionProveedorReembolso}</tipoIdentificacionProveedorReembolso>
				<identificacionProveedorReembolso>${r.identificacionProveedorReembolso}</identificacionProveedorReembolso>
				<codPaisPagoProveedorReembolso>${r.codPaisPagoProveedorReembolso}</codPaisPagoProveedorReembolso>
				<tipoProveedorReembolso>${r.tipoProveedorReembolso}</tipoProveedorReembolso>
				<codDocReembolso>${r.codDocReembolso}</codDocReembolso>
				<estabDocReembolso>${r.estabDocReembolso}</estabDocReembolso>
				<ptoEmiDocReembolso>${r.ptoEmiDocReembolso}</ptoEmiDocReembolso>
				<secuencialDocReembolso>${r.secuencialDocReembolso}</secuencialDocReembolso>
				<fechaEmisionDocReembolso>${formatFechaSri(r.fechaEmisionDocReembolso)}</fechaEmisionDocReembolso>
				<numeroautorizacionDocReemb>${r.numeroautorizacionDocReemb}</numeroautorizacionDocReemb>
				<detalleImpuestos>
${detalleImpuestosXml}				</detalleImpuestos>
			</reembolsoDetalle>
`;
  }
  const totalComprobantesReembolso = totalBaseImponibleReembolso + totalImpuestoReembolso;
  const codDocReembXml = `			<codDocReemb>41</codDocReemb>
			<totalComprobantesReembolso>${fNumero(totalComprobantesReembolso)}</totalComprobantesReembolso>
			<totalBaseImponibleReembolso>${fNumero(totalBaseImponibleReembolso)}</totalBaseImponibleReembolso>
			<totalImpuestoReembolso>${fNumero(totalImpuestoReembolso)}</totalImpuestoReembolso>
`;
  const reembolsosXml = `		<reembolsos>
${reembolsoDetalles}		</reembolsos>
`;
  return { codDocReembXml, reembolsosXml };
}
