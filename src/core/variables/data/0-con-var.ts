import { MODULOS } from '../modulos';

export const CONTABILIDAD_VARS = [
  {
    ide_modu: MODULOS.CONTABILIDAD.ID,
    nom_para: 'p_con_tipo_documento_factura',
    descripcion_para: 'Indica el tipo de documento (Factura)',
    valor_para: '3',
    tabla_para: 'con_tipo_document',
    campo_codigo_para: 'ide_cntdo',
    campo_nombre_para: 'nombre_cntdo',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.CONTABILIDAD.ID,
    nom_para: 'p_con_cuenta_clientes_cxc',
    descripcion_para: 'Cuenta contable "Clientes" (con_det_plan_cuen) usada para conciliar contra Cuentas por Cobrar',
    valor_para: '10013',
    tabla_para: 'con_det_plan_cuen',
    campo_codigo_para: 'ide_cndpc',
    campo_nombre_para: 'nombre_cndpc',
    activo_para: true,
    es_empr_para: false,
  },
];
