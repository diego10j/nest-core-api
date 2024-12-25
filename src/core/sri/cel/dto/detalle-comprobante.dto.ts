
export class DetalleComprobanteDto {
    codigoprincipal: string;
    codigoauxiliar?: string;
    descripciondet: string;
    cantidad: number;
    preciounitario: number;
    descuento: number;
    preciototalsinimpuesto: number;
    porcentajeiva: number;
}