import { MODULOS } from '../modulos';

export const CUENTAS_POR_PAGAR_VARS = [
  {
    ide_modu: MODULOS.CUENTAS_POR_PAGAR.ID,
    nom_para: 'p_cxp_estado_factura_normal',
    descripcion_para: 'Indica el estado de la factura (Normal) ',
    valor_para: '0',
    tabla_para: 'cxp_estado_factur',
    campo_codigo_para: 'ide_cpefa',
    campo_nombre_para: 'nombre_cpefa',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.CUENTAS_POR_PAGAR.ID,
    nom_para: 'p_cxp_articulo_servicios_logisticos',
    descripcion_para: 'Artículo por defecto (COMPRAS SERVICIOS LOGISTICOS) para crear el documento por pagar del flete al cargar el XML desde el Reporte de Envío de Facturas ',
    valor_para: '4751',
    tabla_para: 'inv_articulo',
    campo_codigo_para: 'ide_inarti',
    campo_nombre_para: 'nombre_inarti',
    activo_para: true,
    es_empr_para: false,
  },
];
