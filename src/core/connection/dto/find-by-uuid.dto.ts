import { IsString, IsNotEmpty, IsUUID, IsOptional, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class FindByUuidDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsUUID(4, { each: true })
    uuid: string;

    @IsString()
    @IsOptional()
    columns?: string;


}
