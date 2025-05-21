import { IsInt ,IsString, MinLength } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';


export class HorarioLoginDto extends PartialType(QueryOptionsDto) {
    
    @IsInt()
    ide_usua: number;

    @IsInt()
    ide_perf: number;

    @IsString()
    @MinLength(4)
    nom_perf: string;

}