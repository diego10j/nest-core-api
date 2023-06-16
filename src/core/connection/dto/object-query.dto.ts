import { IsString, IsNotEmpty, IsDefined, IsObject, IsIn } from 'class-validator';

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

    //   @IsBoolean()
    //   @IsOptional()
    //   identity?: boolean = false;

}