import { IsInt,  IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';



export class OpcionDto extends QueryOptionsDto {

    @IsInt()
    ide_sist: number;


    @IsInt()
    @IsOptional()
    sis_ide_opci?: number;

}