import { MODULOS } from '../modulos';

export const INVENTARIO_VARS = [
  {
    ide_modu: MODULOS.INVENTARIO.ID,
    nom_para: 'p_inv_estado_normal',
    descripcion_para: 'Indica el estado normal de comprobante de inventario ',
    valor_para: '1',
    tabla_para: 'inv_est_prev_inve',
    campo_codigo_para: 'ide_inepi',
    campo_nombre_para: 'nombre_inepi',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.INVENTARIO.ID,
    nom_para: 'p_inv_estado_anulado',
    descripcion_para: 'Indica el estado anulado de comprobante de inventario ',
    valor_para: '0',
    tabla_para: 'inv_est_prev_inve',
    campo_codigo_para: 'ide_inepi',
    campo_nombre_para: 'nombre_inepi',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.INVENTARIO.ID,
    nom_para: 'p_inv_tipo_transaccion_devolucion_venta',
    descripcion_para: 'Tipo de transacción de inventario (inv_tip_tran_inve) para el kardex de entrada generado por una Nota de Crédito de venta',
    valor_para: '38',
    tabla_para: 'inv_tip_tran_inve',
    campo_codigo_para: 'ide_intti',
    campo_nombre_para: 'nombre_intti',
    activo_para: true,
    es_empr_para: false,
  },
];
