import { IsInt, IsPositive, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class GetFilesDto extends PartialType(ServiceDto) {


    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_archi?: number;

}
