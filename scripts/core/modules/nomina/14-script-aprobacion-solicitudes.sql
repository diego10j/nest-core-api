-- Agrega el rastro de auditoría de la aprobación/rechazo de solicitudes
-- (permisos, vacaciones, justificaciones de marcación) para la pantalla
-- "Aprobar Solicitudes" de Nómina > Vacaciones y Permisos: quién aprobó,
-- fecha/hora de aprobación y una observación del aprobador. La columna
-- documento_anula_aspvh (usuario) y fecha_anula_aspvh ya existían para el
-- rechazo; solo se agrega hora_anula_aspvh para completar el rastro ahí
-- también (razon_anula_aspvh ya sirve de observación de rechazo).
ALTER TABLE public.asi_permisos_vacacion_hext
  ADD COLUMN IF NOT EXISTS ide_usua_aprobador integer REFERENCES public.sis_usuario(ide_usua),
  ADD COLUMN IF NOT EXISTS fecha_aprobacion_aspvh date,
  ADD COLUMN IF NOT EXISTS hora_aprobacion_aspvh time,
  ADD COLUMN IF NOT EXISTS observacion_aprobacion_aspvh varchar(1000),
  ADD COLUMN IF NOT EXISTS hora_anula_aspvh time;
