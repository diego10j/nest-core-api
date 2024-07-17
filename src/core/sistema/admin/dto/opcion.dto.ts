import { IsInt, IsPositive, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class OpcionDto extends ServiceDto {

    @IsInt()
    @IsPositive()
    ide_sist: number;


    @IsInt()
    @IsOptional()
    sis_ide_opci?: number;

}