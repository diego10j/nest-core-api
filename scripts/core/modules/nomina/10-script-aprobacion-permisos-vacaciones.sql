-- Agrega el estado de aprobación a las solicitudes de permiso/vacaciones/justificación
-- (asi_permisos_vacacion_hext, tipo_aspvh 1=permiso, 2=cargo a vacaciones, 4=justificación
-- de marcación). NULL = pendiente de revisión del coordinador, TRUE = aprobada.
-- El "rechazo" reutiliza el mecanismo ya existente de anular (activo_aspvh=false) —
-- no hace falta un tercer estado: una solicitud rechazada simplemente queda anulada.
ALTER TABLE public.asi_permisos_vacacion_hext
    ADD COLUMN IF NOT EXISTS aprobado_aspvh boolean;
