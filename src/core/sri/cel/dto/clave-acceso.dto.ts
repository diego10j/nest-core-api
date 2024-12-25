
import { IsString, Length, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ClaveAccesoDto extends ServiceDto {
    @IsString()
    @Length(49, 49, { message: 'La clave de acceso debe tener 49 caracteres' })
    @Matches(/^\d{49}$/, { message: 'La clave de acceso debe ser numérica y tener exactamente 49 dígitos' })
    claveAcceso: string;
}
