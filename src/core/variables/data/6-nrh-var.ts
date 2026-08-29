import { MODULOS } from '../modulos';

// Valores confirmados contra la BD real de DIQUIMEC (2026-08-29):
// - p_nrh_estado_* : IDs 1-4 del seed de nrh_estado_rol en script-nomina-talento-humano.sql.
// - p_nrh_rubro_sueldo = 24 (nrh_rubro "REMUNERACION UNIFICADA").
// - p_nrh_cuenta_liquido_pagar = 10075 (con_det_plan_cuen "Sueldos por pagar",
//   2.1.5.01 — jerarquía nueva, confirmada por movimientos reales en con_det_comp_cont
//   frente a la cuenta vieja 1199/2.1.03.0.1 que no tiene ninguno).
// - p_nrh_tipo_comprobante_rol = 0 (con_tipo_comproba "DIARIO").
// p_nrh_rubro_horas_supl / p_nrh_rubro_horas_extra quedan vacíos: cada uno debe apuntar
// a un rubro nrh_rubro "input" (recibe la SUMA de horas ya aprobadas manualmente de ese
// tipo — ver HorasExtraService.aprobar, la clasificación 50%/100% la decide quien
// aprueba, no el sistema). DIQUIMEC ya tiene varios rubros de horas extra (17, 237,
// 245, 258, 267, 331, 332, 336) pero no quedó claro cuál es el "conteo de horas" a
// usar como input vs. cuál es el valor en dólares ya calculado — definir y configurar
// desde Sistema > Variables.
// es_empr_para=false (global, un solo valor para todo el sistema) porque nrh_rubro y
// nrh_estado_rol no tienen columna ide_sucu — el picker de "tabla de referencia" de
// Variables (getConfiguracionTablaVariable) filtra por ide_sucu cuando es_empr_para=true,
// y fallaría contra esas tablas. Si en el futuro se necesita un valor distinto por
// sucursal, hay que agregar ide_sucu a esas tablas primero (o usar prefijo "pe_nrh_").
export const NOMINA_VARS = [
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_rubro_sueldo',
    descripcion_para: 'ide_nrrub del rubro Sueldo/Salario base — el generador de rol inyecta rmu_geedp ahí en vez de evaluar fórmula',
    valor_para: '24',
    tabla_para: 'nrh_rubro',
    campo_codigo_para: 'ide_nrrub',
    campo_nombre_para: 'detalle_nrrub',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_rubro_horas_supl',
    descripcion_para: 'ide_nrrub del rubro "input" de horas suplementarias (50%) — recibe la suma de horas aprobadas con tipo_nrhec=suplementaria',
    valor_para: '',
    tabla_para: 'nrh_rubro',
    campo_codigo_para: 'ide_nrrub',
    campo_nombre_para: 'detalle_nrrub',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_rubro_horas_extra',
    descripcion_para: 'ide_nrrub del rubro "input" de horas extraordinarias (100%) — recibe la suma de horas aprobadas con tipo_nrhec=extraordinaria',
    valor_para: '',
    tabla_para: 'nrh_rubro',
    campo_codigo_para: 'ide_nrrub',
    campo_nombre_para: 'detalle_nrrub',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_estado_pre_nomina',
    descripcion_para: 'ide_nresr de nrh_estado_rol para un rol recién generado (borrador/calculado)',
    valor_para: '1',
    tabla_para: 'nrh_estado_rol',
    campo_codigo_para: 'ide_nresr',
    campo_nombre_para: 'detalle_nresr',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_estado_nomina_aprobada',
    descripcion_para: 'ide_nresr de nrh_estado_rol para un rol aprobado (bloqueado, ya no se puede recalcular)',
    valor_para: '2',
    tabla_para: 'nrh_estado_rol',
    campo_codigo_para: 'ide_nresr',
    campo_nombre_para: 'detalle_nresr',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_estado_nomina_cerrada',
    descripcion_para: 'ide_nresr de nrh_estado_rol para un rol cerrado (ya generó asiento contable + CxP)',
    valor_para: '3',
    tabla_para: 'nrh_estado_rol',
    campo_codigo_para: 'ide_nresr',
    campo_nombre_para: 'detalle_nresr',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_estado_nomina_anulada',
    descripcion_para: 'ide_nresr de nrh_estado_rol para un rol anulado',
    valor_para: '4',
    tabla_para: 'nrh_estado_rol',
    campo_codigo_para: 'ide_nresr',
    campo_nombre_para: 'detalle_nresr',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_cuenta_liquido_pagar',
    descripcion_para: 'ide_cndpc (con_det_plan_cuen) de la cuenta "Sueldos por Pagar" — se acredita con el líquido total al cerrar el rol',
    valor_para: '10075',
    tabla_para: 'con_det_plan_cuen',
    campo_codigo_para: 'ide_cndpc',
    campo_nombre_para: 'nombre_cndpc',
    activo_para: true,
    es_empr_para: false,
  },
  {
    ide_modu: MODULOS.NOMINA.ID,
    nom_para: 'p_nrh_tipo_comprobante_rol',
    descripcion_para: 'ide_cntcm (con_tipo_comproba) a usar para el asiento automático generado al cerrar un rol',
    valor_para: '0',
    tabla_para: 'con_tipo_comproba',
    campo_codigo_para: 'ide_cntcm',
    campo_nombre_para: 'nombre_cntcm',
    activo_para: true,
    es_empr_para: false,
  },
];
