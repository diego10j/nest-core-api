import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO compartido para validar el número de teléfono en WhatsApp Cloud API.
 * Formato aceptado: solo dígitos (con o sin código de país).
 * Ejemplos válidos: 0983113543, 593983113543, 15551234567
 */
export class TelefonoDto {
    @IsString()
    @IsNotEmpty()
    telefono: string;
}
