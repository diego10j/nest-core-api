import { ArrayNotEmpty, IsArray, IsString, IsNotEmpty, IsOptional, IsDefined } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class DeleteDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;

    @IsOptional()
    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    values: any[];

}
