import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class ReenviarComprobanteDto {
    /** Clave de acceso (49 dígitos) del comprobante ya autorizado por el SRI */
    @IsString()
    @IsNotEmpty()
    claveAcceso: string;

    /** Correo destino del reenvío (puede ser distinto al correo original del cliente/proveedor) */
    @IsEmail()
    @IsNotEmpty()
    correo: string;
}
