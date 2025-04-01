import { IsString, IsOptional, IsNotEmpty, Matches, IsInt } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ListDataValuesDto extends ServiceDto {

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

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'columnLabel no debe contener espacios' })
    columnLabel: string;

    @IsOptional()
    @IsString()
    condition?: string

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'columnOrder no debe contener espacios' })
    columnOrder?: string;

}
