import { IsString, IsNotEmpty, IsDefined, IsOptional, IsArray } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class UniqueDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;


    @IsDefined()
    @IsArray()
    columns: { columnName: string, value: any }[];

    @IsOptional()
    @IsString()
    id?: string;

}
