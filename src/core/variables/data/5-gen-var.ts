import { MODULOS } from "../modulos";

export const GENERAL_VARS = [
    {
        "ide_modu": MODULOS.GENERAL.ID,
        "nom_para": "p_gen_tipo_identificacion_ruc",
        "descripcion_para": "Indica el tipo de identificacion que sea RUC ",
        "valor_para": "1",
        "tabla_para": "gen_tipo_identifi",
        "campo_codigo_para": "ide_getid",
        "campo_nombre_para": "nombre_getid",
        "activo_para": true,
        "es_empr_para": false
    },
    {
        "ide_modu": MODULOS.GENERAL.ID,
        "nom_para": "p_gen_tipo_identificacion_cedula",
        "descripcion_para": "Indica el tipo de identificacion que sea CEDULA ",
        "valor_para": "0",
        "tabla_para": "gen_tipo_identifi",
        "campo_codigo_para": "ide_getid",
        "campo_nombre_para": "nombre_getid",
        "activo_para": true,
        "es_empr_para": false
    },

]