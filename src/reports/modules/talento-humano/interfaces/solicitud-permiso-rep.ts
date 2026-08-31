export interface SolicitudPermisoRep {
    ide_aspvh: number;
    tipoLabel: string;
    empleado: string;
    identificacion: string;
    cargo: string | null;
    fecha_solicitud_aspvh: string;
    fecha_desde_aspvh: string;
    fecha_hasta_aspvh: string;
    hora_desde_aspvh: string | null;
    hora_hasta_aspvh: string | null;
    nro_dias_aspvh: number | null;
    nro_horas_aspvh: number | null;
    detalle_aspvh: string | null;
    ide_empr: number;
}
