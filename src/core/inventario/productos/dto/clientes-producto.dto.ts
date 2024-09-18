import { IsInt, IsIn } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { Type } from 'class-transformer';

export class ClientesProductoDto extends ServiceDto {

    @IsInt()
    ide_inarti: number;

    @IsInt()
    @IsIn([1, 2], { message: 'Modo solo puede ser 1 o 2' })
    @Type(() => Number) // Se asegura que el valor sea tratado como número.
    modo: number = 1;  // Valor por defecto de 1

}
