import { IsDateString, IsInt, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class LibroMayorDto extends QueryOptionsDto {
    @IsInt()
    @IsNotEmpty()
    @Type(() => Number)
    ideCndpc: number; // ID de la cuenta del plan de cuentas

    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;
}
