import { IsString, IsNotEmpty, IsDefined, IsObject, IsIn, IsOptional } from 'class-validator';

export class ObjectQueryDto {


    @IsString()
    @IsIn(["insert", "update", "delete"])
    @IsNotEmpty()
    operation: string;

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;

    @IsObject()
    @IsDefined()
    object: object;

    @IsString()
    @IsOptional()
    condition?: string;



}