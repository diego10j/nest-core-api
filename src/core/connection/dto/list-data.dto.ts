import {
    IsString, IsOptional, IsArray, ArrayNotEmpty, IsNotEmpty
} from 'class-validator';


export class SelectDataValuesDto {

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
    where?: string

}
