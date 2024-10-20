import { IsInt ,IsString, MinLength } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class HorarioLoginDto extends PartialType(ServiceDto) {
    
    @IsInt()
    ide_usua: number;

    @IsInt()
    ide_perf: number;

    @IsString()
    @MinLength(4)
    nom_perf: string;

}