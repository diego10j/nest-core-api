import { IsString, IsNotEmpty, IsDefined, IsObject, IsIn, IsOptional, Matches } from 'class-validator';

export class ObjectQueryDto {

    @IsString()
    @IsIn(["insert", "update", "delete"])
    @IsNotEmpty()
    operation: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsObject()
    @IsDefined()
    object: object;

    @IsString()
    @IsOptional()
    condition?: string;
}
