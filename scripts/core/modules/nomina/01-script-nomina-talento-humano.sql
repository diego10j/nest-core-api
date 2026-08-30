-- Módulo: Nómina / Talento Humano
-- Script idempotente para crear las tablas nuevas que necesita el módulo y que no
-- existen hoy en sigafi_dbo (verificado contra information_schema y contra el vault
-- erp-knowledge/_Schema-Completo el 2026-08-28).
--
-- Diseño de nrh_detalle_rol, asi_vacacion, asi_detalle_vacacion y
-- asi_permisos_vacacion_hext tomado 1:1 de las entidades JPA del proyecto original
-- (github.com/diego10j/sampudj) del que deriva el esquema gth_/nrh_/asi_ actual.
-- nrh_solicitud_mensualizacion y nrh_hora_extra_candidata son diseño nuevo.
--
-- IMPORTANTE antes de correr en producción:
--   1) Volver a verificar con \dt en psql (o information_schema.tables) que ninguna
--      de estas tablas exista ya con otro nombre.
--   2) Revisar qué catálogos ya tiene poblados gen_partida_grupo_cargo/gen_grupo_cargo
--      antes de insertar el primer gen_empleados_departamento_par de un empleado.
--   3) Los IDs se generan con get_seq_table('<tabla>', '<pk>') desde el backend
--      (scripts/core/get_seq_table.sql), igual que el resto del sistema — por eso las
--      PK aquí son INT/INT8 planas, sin serial/identity.

-- 0) gth_empleado.ide_geper — gth_empleado hoy NO está asociado a gen_persona (tiene sus
--    propios campos de nombre/documento, redundantes con gen_persona). El usuario pidió
--    explícitamente esta asociación para poder relacionar la ficha del empleado con el
--    resto del ERP (clientes/proveedores/contactos ya comparten gen_persona).
ALTER TABLE public.gth_empleado
    ADD COLUMN IF NOT EXISTS ide_geper int REFERENCES public.gen_persona(ide_geper);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gth_empleado_geper ON public.gth_empleado(ide_geper)
    WHERE ide_geper IS NOT NULL;

-- gen_empleados_departamento_par.ide_gtcar — esta tabla (la asignación puesto+salario
-- real, ancla de todo nrh_*) no tiene ninguna columna que apunte a gth_cargo (el
-- catálogo de puestos). Se agrega para poder registrar el puesto del punto 3 del
-- alcance ("Definición de puestos, salarios").
ALTER TABLE public.gen_empleados_departamento_par
    ADD COLUMN IF NOT EXISTS ide_gtcar int REFERENCES public.gth_cargo(ide_gtcar);

-- gth_empleado.foto_gtemp / firma_gtemp — columnas de nombre de archivo (mismo patrón
-- que gen_persona.foto_geper: string + servidas por /api/sistema/files/image/{archivo}),
-- NO bytea. Las columnas existentes path_foto_gtemp/path_firma_gtemp (bytea) quedan sin
-- usar por decisión del usuario — no se tocan ni se borran, simplemente no se leen/escriben.
ALTER TABLE public.gth_empleado
    ADD COLUMN IF NOT EXISTS foto_gtemp varchar(255),
    ADD COLUMN IF NOT EXISTS firma_gtemp varchar(255);

-- gth_empleado.ide_gedip (lugar de origen) apuntaba a gen_division_politica, un catálogo
-- que en esta empresa nunca se pobló/usó. Se reemplaza el concepto por Provincia/Cantón
-- de nacimiento, reutilizando gen_provincia/gen_canton (mismo patrón que ya usa
-- gen_persona.ide_geprov/ide_gecant en otros formularios del ERP). ide_gedip se deja
-- nullable en vez de borrarla: registros ya cargados no se tocan, solo deja de ser
-- obligatoria y de usarse en la ficha nueva.
ALTER TABLE public.gth_empleado
    ALTER COLUMN ide_gedip DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS ide_geprov int REFERENCES public.gen_provincia(ide_geprov),
    ADD COLUMN IF NOT EXISTS ide_gecant int REFERENCES public.gen_canton(ide_gecant);

-- 1) nrh_detalle_rol — línea calculada y congelada por empleado+rubro+rol
CREATE TABLE IF NOT EXISTS public.nrh_detalle_rol (
    ide_nrdro           int PRIMARY KEY,
    ide_nrrol           int NOT NULL REFERENCES public.nrh_rol(ide_nrrol),
    ide_nrder           int NOT NULL REFERENCES public.nrh_detalle_rubro(ide_nrder),
    ide_geedp           int NOT NULL REFERENCES public.gen_empleados_departamento_par(ide_geedp),
    valor_nrdro         numeric(12,2) NOT NULL,
    orden_calculo_nrdro int,
    usuario_ingre       varchar(50),
    fecha_ingre         date,
    hora_ingre          time,
    usuario_actua       varchar(50),
    fecha_actua         date,
    hora_actua          time
);
CREATE INDEX IF NOT EXISTS ix_nrh_detalle_rol_rol   ON public.nrh_detalle_rol(ide_nrrol);
CREATE INDEX IF NOT EXISTS ix_nrh_detalle_rol_geedp ON public.nrh_detalle_rol(ide_geedp);

-- 2) asi_vacacion — cabecera de vacaciones por empleado
CREATE TABLE IF NOT EXISTS public.asi_vacacion (
    ide_asvac              int PRIMARY KEY,
    ide_gtemp              int REFERENCES public.gth_empleado(ide_gtemp),
    fecha_ingreso_asvac    date,
    fecha_finiquito_asvac  date,
    obervacion_asvac       varchar(4000),
    activo_asvac           boolean DEFAULT true,
    usuario_ingre          varchar(50),
    fecha_ingre            date,
    hora_ingre             time,
    usuario_actua          varchar(50),
    fecha_actua            date,
    hora_actua             time
);

-- 3) asi_permisos_vacacion_hext — permisos por horas / con cargo a vacaciones
--    (creada antes que asi_detalle_vacacion porque esta última la referencia)
CREATE TABLE IF NOT EXISTS public.asi_permisos_vacacion_hext (
    ide_aspvh               int PRIMARY KEY,
    ide_gtemp               int REFERENCES public.gth_empleado(ide_gtemp),
    ide_sucu                int REFERENCES public.sis_sucursal(ide_sucu),
    fecha_solicitud_aspvh   date,
    fecha_desde_aspvh       date,
    fecha_hasta_aspvh       date,
    hora_desde_aspvh        time,
    hora_hasta_aspvh        time,
    detalle_aspvh           varchar(4000),
    nro_dias_aspvh          int,
    nro_horas_aspvh         numeric(12,2),
    tipo_aspvh              int, -- 1=permiso normal, 2=cargo a vacaciones, 3=horas extra (catálogo a definir en implementación)
    nro_documento_aspvh     varchar(50),
    razon_anula_aspvh       varchar(1000),
    documento_anula_aspvh   varchar(50),
    fecha_anula_aspvh       date,
    activo_aspvh            boolean DEFAULT true,
    usuario_ingre           varchar(50),
    fecha_ingre             date,
    hora_ingre              time,
    usuario_actua           varchar(50),
    fecha_actua             date,
    hora_actua              time
);

-- 4) asi_detalle_vacacion — movimientos de saldo de vacaciones
CREATE TABLE IF NOT EXISTS public.asi_detalle_vacacion (
    ide_asdev             int8 PRIMARY KEY,
    ide_asvac             int REFERENCES public.asi_vacacion(ide_asvac),
    ide_aspvh             int REFERENCES public.asi_permisos_vacacion_hext(ide_aspvh),
    fecha_novedad_asdev   date,
    dia_solicitado_asdev  int,
    dia_acumulado_asdev   numeric(10,3),
    dia_adicional_asdev   numeric(10,3),
    dia_descontado_asdev  numeric(10,3),
    observacion_asdev     text,
    anulado_asdev         boolean DEFAULT false,
    activo_asdev          boolean DEFAULT true,
    usuario_ingre         varchar(50),
    fecha_ingre           date,
    hora_ingre            time,
    usuario_actua         varchar(50),
    fecha_actua           date,
    hora_actua            time
);
CREATE INDEX IF NOT EXISTS ix_asi_detalle_vacacion_asvac ON public.asi_detalle_vacacion(ide_asvac);

-- 5) nrh_hora_extra_candidata — candidatas a hora extra detectadas desde asi_marcaciones,
--    pendientes de aprobación manual antes de entrar al rol. `sugerencia_nrhec` es una
--    ayuda automática (Art. 55 del Código de Trabajo: domingo/feriado -> extraordinaria
--    100%, resto -> suplementaria 50%) pero quien aprueba decide `tipo_nrhec` y escribe
--    `justificacion_nrhec` — la clasificación final no es automática.
CREATE TABLE IF NOT EXISTS public.nrh_hora_extra_candidata (
    ide_nrhec               int PRIMARY KEY,
    ide_geedp               int NOT NULL REFERENCES public.gen_empleados_departamento_par(ide_geedp),
    fecha_nrhec              date NOT NULL,
    horas_detectadas_nrhec   numeric(6,2) NOT NULL,
    sugerencia_nrhec         varchar(20), -- sugerencia automática: suplementaria | extraordinaria
    tipo_nrhec               varchar(20), -- decidido al aprobar: suplementaria (50%) | extraordinaria (100%)
    justificacion_nrhec      varchar(500), -- por qué se trabajó, la escribe quien aprueba
    origen_nrhec             varchar(30) DEFAULT 'asi_marcaciones',
    estado_nrhec             varchar(20) NOT NULL DEFAULT 'pendiente', -- pendiente | aprobada | rechazada
    ide_usua_aprobador       int REFERENCES public.sis_usuario(ide_usua),
    fecha_aprobacion_nrhec   date,
    ide_nrrol                int REFERENCES public.nrh_rol(ide_nrrol), -- rol que ya consumió estas horas (evita duplicarlas en el siguiente rol)
    usuario_ingre            varchar(50),
    fecha_ingre              date,
    hora_ingre               time
);
CREATE INDEX IF NOT EXISTS ix_nrh_hora_extra_candidata_geedp ON public.nrh_hora_extra_candidata(ide_geedp);

-- 5b) nrh_feriado — feriados de Ecuador (fijos y móviles), para que la detección de
--     horas extra sepa qué días no son laborables sin depender solo de sábado/domingo.
--     Se mantiene manualmente (Nómina > Catálogos > Feriados); no hay tabla equivalente
--     en el esquema actual.
CREATE TABLE IF NOT EXISTS public.nrh_feriado (
    ide_nrfer       int PRIMARY KEY,
    fecha_nrfer     date NOT NULL,
    detalle_nrfer   varchar(200),
    activo_nrfer    boolean DEFAULT true,
    usuario_ingre   varchar(50),
    fecha_ingre     date
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_nrh_feriado_fecha ON public.nrh_feriado(fecha_nrfer) WHERE activo_nrfer = true;

-- 6) nrh_solicitud_mensualizacion — mensualizar vs. acumular décimos/fondos de reserva
--    por empleado (solicitud formal, no un flag suelto)
CREATE TABLE IF NOT EXISTS public.nrh_solicitud_mensualizacion (
    ide_nrsom                int PRIMARY KEY,
    ide_geedp                int NOT NULL REFERENCES public.gen_empleados_departamento_par(ide_geedp),
    ide_nrrub                int NOT NULL REFERENCES public.nrh_rubro(ide_nrrub), -- décimo 3 / décimo 4 / fondos de reserva
    mensualizado_nrsom       boolean NOT NULL DEFAULT false,
    fecha_solicitud_nrsom    date,
    ide_usua_aprobador       int REFERENCES public.sis_usuario(ide_usua),
    fecha_aprobacion_nrsom   date,
    activo_nrsom             boolean DEFAULT true,
    usuario_ingre            varchar(50),
    fecha_ingre              date
);
CREATE INDEX IF NOT EXISTS ix_nrh_solicitud_mensualizacion_geedp ON public.nrh_solicitud_mensualizacion(ide_geedp);

-- 7) Módulo "Nómina" (sis_modulo, ide_modu=6) YA EXISTE en la BD real (confirmado por
--    el usuario) — no se inserta acá. Los parámetros p_nrh_* usan ese ide_modu.
--    Se definen en src/core/variables/data/6-nrh-var.ts (con tabla_para/
--    campo_codigo_para/campo_nombre_para para que la pantalla de Variables los
--    resuelva) y se crean en BD llamando a POST /api/sistema/variables/updateVariables
--    (variables.service.ts#updateVariables) — el mismo mecanismo que usa el resto de
--    módulos. No hace falta SQL manual para esto.

-- 7b) nrh_estado_rol está vacía en la BD real (confirmado) — el Java legado nunca la
--     pobló para DIQUIMEC. Se crea un seed mínimo (tabla vacía, IDs 1-4 seguros).
INSERT INTO public.nrh_estado_rol (ide_nresr, detalle_nresr, activo_nresr)
SELECT v.id, v.detalle, true
FROM (VALUES (1, 'Generado'), (2, 'Aprobado'), (3, 'Cerrado'), (4, 'Anulado')) AS v(id, detalle)
WHERE NOT EXISTS (SELECT 1 FROM public.nrh_estado_rol);

-- 8) nrh_rubro_cuenta — mapeo rubro -> cuenta contable (con_det_plan_cuen, el motor
--    contable REAL en uso; nrh_rubro_asiento/gen_cuenta_contable son de un esquema
--    anterior y no se usan). El lado DEBE/HABER del asiento se deriva de
--    nrh_tipo_rubro.signo_nrtir (positivo=ingreso=DEBE gasto, negativo=descuento=HABER
--    pasivo), no hace falta guardarlo aquí.
CREATE TABLE IF NOT EXISTS public.nrh_rubro_cuenta (
    ide_nrrucu      int PRIMARY KEY,
    ide_nrrub       int NOT NULL REFERENCES public.nrh_rubro(ide_nrrub),
    ide_cndpc       int8 NOT NULL REFERENCES public.con_det_plan_cuen(ide_cndpc),
    activo_nrrucu   boolean DEFAULT true,
    usuario_ingre   varchar(50),
    fecha_ingre     date,
    hora_ingre      time
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_nrh_rubro_cuenta_rubro ON public.nrh_rubro_cuenta(ide_nrrub) WHERE activo_nrrucu = true;
