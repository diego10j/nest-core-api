import { IsString, IsNotEmpty, IsDefined, IsObject, IsBoolean, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class SaveObjectDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;

    @IsObject()
    @IsDefined()
    object: object;

    @IsBoolean()
    @IsOptional()
    identity?: boolean;

}