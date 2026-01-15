import { IsNotEmpty, IsNumber } from 'class-validator';

export class ResetPasswordDto {
    @IsNumber({}, { message: 'El identificador de usuario debe ser un número' })
    @IsNotEmpty({ message: 'El identificador de usuario es obligatorio' })
    ide_usua: number;
}
