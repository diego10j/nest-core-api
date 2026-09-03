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
  {
    ide_modu: MODULOS.CUENTAS_POR_PAGAR.ID,
    nom_para: 'p_con_tipo_contribuyente_nota_venta',
    descripcion_para: 'Tipo de Contribuyente habilitado para que un proveedor emita Nota de Venta (normativamente RIMPE Negocio Popular) - filtra el combo de proveedores al crear este tipo de documento en Compras. DEBE configurarse manualmente: no trae un valor válido por defecto.',
    valor_para: '',
    tabla_para: 'con_tipo_contribu',
    campo_codigo_para: 'ide_cntco',
    campo_nombre_para: 'nombre_cntco',
    activo_para: true,
    es_empr_para: false,
  },
];
