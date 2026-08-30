export interface RolPagosRepCabecera {
    ide_nrrol: number;
    fecha_nrrol: string;
    tipo_nomina: string;
    estado: string;
    ide_empr: number;
}

export interface RolPagosRepEmpleado {
    ide_geedp: number;
    empleado: string;
    identificacion: string;
    cargo: string | null;
    sueldo: number;
    horasExtra: number;
    decimoTercero: number;
    decimoCuarto: number;
    fondosReserva: number;
    totalIngresos: number;
    iess: number;
    prestamos: number;
    totalDescuentos: number;
    liquido: number;
}

export interface RolPagosRep {
    cabecera: RolPagosRepCabecera;
    empleados: RolPagosRepEmpleado[];
}
