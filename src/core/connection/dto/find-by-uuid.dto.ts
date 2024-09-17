import { IsString, IsNotEmpty, IsUUID, IsOptional, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class FindByUuidDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsUUID(4, { each: true })
    @IsOptional()
    uuid?: string;

    @IsString()
    @IsOptional()
    columns?: string;


}
