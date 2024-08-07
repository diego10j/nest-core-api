import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class ListDataValuesDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;

    @IsString()
    @IsNotEmpty()
    columnLabel: string;


    @IsOptional()
    @IsString()
    orderBy?: string


    @IsOptional()
    @IsString()
    condition?: string

}
