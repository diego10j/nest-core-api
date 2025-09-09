import { MODULOS } from '../modulos';

export const CUENTAS_POR_COBRAR_VARS = [
  {
    ide_modu: MODULOS.CUENTAS_POR_COBRAR.ID,
    nom_para: 'p_cxc_estado_factura_normal',
    descripcion_para: 'Indica el estado de la factura (Normal) ',
    valor_para: '0',
    tabla_para: 'cxc_estado_factura',
    campo_codigo_para: 'ide_ccefa',
    campo_nombre_para: 'nombre_ccefa',
    activo_para: true,
    es_empr_para: false,
  },
];
