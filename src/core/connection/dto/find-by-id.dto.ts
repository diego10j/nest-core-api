import { IsString, IsNotEmpty, IsInt, IsOptional, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class FindByIdDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'module no debe contener espacios' })
    module: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsInt()
    value: number;

    @IsString()
    @IsOptional()
    columns?: string;


}
