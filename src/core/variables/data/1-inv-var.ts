import { MODULOS } from "../modulos";



export const INVENTARIO_VARS =[
    {
        "ide_modu": MODULOS.INVENTARIO.ID,
        "nom_para": "p_inv_estado_normal",
        "descripcion_para": "Indica el estado normal de comprobante de inventario ",
        "valor_para": "1",
        "tabla_para": "inv_est_prev_inve",
        "campo_codigo_para": "ide_inepi",
        "campo_nombre_para": "nombre_inepi",
        "activo_para": true,
        "es_empr_para": false
    },
    {
        "ide_modu": MODULOS.INVENTARIO.ID,
        "nom_para": "p_inv_estado_pendiente",
        "descripcion_para": "Indica el estado pendiente de comprobante de inventario ",
        "valor_para": "2",
        "tabla_para": "inv_est_prev_inve",
        "campo_codigo_para": "ide_inepi",
        "campo_nombre_para": "nombre_inepi",
        "activo_para": true,
        "es_empr_para": false
    }

]