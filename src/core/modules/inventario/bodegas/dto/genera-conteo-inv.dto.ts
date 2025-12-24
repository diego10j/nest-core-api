import { IsBoolean, IsDateString, IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GeneraConteoInvDto extends QueryOptionsDto {

    @IsDateString()
    fechaInicioCorte: string;

    @IsDateString()
    fechaCorte: string;

    @IsInt()
    @IsPositive()
    ide_inbod: number;


    @IsInt()
    @IsPositive()
    ide_usua: number;

    @IsOptional()
    @IsString()
    @MaxLength(500)
    @IsOptional()
    observacion?: string;


    @IsOptional()
    @IsBoolean()
    excluirCeros?: boolean = true;


}
