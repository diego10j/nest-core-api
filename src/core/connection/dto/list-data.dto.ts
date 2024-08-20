import { IsString, IsOptional, IsNotEmpty, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class ListDataValuesDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'columnLabel no debe contener espacios' })
    columnLabel: string;


    @IsOptional()
    @IsString()
    orderBy?: string


    @IsOptional()
    @IsString()
    condition?: string

}
