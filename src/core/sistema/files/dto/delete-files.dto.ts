import { ArrayNotEmpty, IsArray, IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class DeleteFilesDto extends PartialType(ServiceDto) {


    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    values: string[];

    @IsBoolean()
    @IsOptional()
    trash?: boolean = true;
}
