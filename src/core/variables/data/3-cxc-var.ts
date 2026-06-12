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
  {
    ide_modu: MODULOS.CUENTAS_POR_COBRAR.ID,
    nom_para: 'pe_cxc_observacion_proforma',
    descripcion_para: 'Almacena observaciones por defecto para las proformas, se guardan valores separados por comas',
    valor_para: 'Puesto en Quito hasta agotar stock, No se aceptan cambios ni devoluciones, Oferta válida hasta agotar stock',
    activo_para: true,
    es_empr_para: true,
  },
  {
    ide_modu: MODULOS.CUENTAS_POR_COBRAR.ID,
    nom_para: 'p_cxc_tipo_trans_sobrepago',
    descripcion_para: 'Indica que el tipo de transaccion es (Sobrepago) ',
    valor_para: '20',
    tabla_para: 'cxc_tipo_transacc',
    campo_codigo_para: 'ide_ccttr',
    campo_nombre_para: 'nombre_ccttr',
    activo_para: true,
    es_empr_para: false,
  },
];
