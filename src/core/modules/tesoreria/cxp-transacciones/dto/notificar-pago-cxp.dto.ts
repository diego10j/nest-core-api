import { ArrayNotEmpty, IsArray, IsEmail, IsInt, IsNotEmpty } from 'class-validator';

/**
 * Envío (o reenvío) de la notificación por correo de un pago directo a proveedor.
 * El comprobante se resuelve por `ide_teclb` desde tes_info_comprobante_banco,
 * por lo que NO se acepta una ruta/nombre de archivo arbitrario del cliente.
 */
export class NotificarPagoCxPDto {
    /** FK → tes_cab_libr_banc (movimiento de tesorería generado por savePagoCxP) */
    @IsInt()
    @IsNotEmpty()
    ide_teclb: number;

    /** Correos de destino (1..n), validados como email */
    @IsArray()
    @ArrayNotEmpty()
    @IsEmail({}, { each: true })
    correos: string[];
}
