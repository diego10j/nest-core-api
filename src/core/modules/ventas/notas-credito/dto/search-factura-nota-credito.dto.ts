import { SearchDto } from 'src/common/dto/search.dto';

/**
 * Búsqueda de facturas para crear una nota de crédito — a diferencia de
 * SearchDocumentoCxCDto (usado en "Editar Transacciones CxC"), esta NO está acotada a
 * un cliente: se busca directamente por número de factura o nombre/identificación del
 * cliente, y al seleccionar se auto-completan cliente + datos de cabecera en el
 * formulario de NC.
 */
export class SearchFacturaNotaCreditoDto extends SearchDto {}
