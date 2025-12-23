import { ArrayNotEmpty, IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetConteosInventarioDto extends QueryOptionsDto {
    @IsDateString()
    fechaInicio: string;

    @IsDateString()
    fechaFin: string;

    @IsInt()
    @IsOptional()
    ide_inbod?: number;

    @IsOptional()
    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    ide_inec?: number[];  // Ahora es un array de IDs (ide_inec)

    @IsInt()
    @IsOptional()
    ide_usua?: number;

}
