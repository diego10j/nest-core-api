import {
    IsString, IsArray, ArrayNotEmpty, IsNotEmpty, Matches, IsInt, IsOptional
} from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { Column } from '../interfaces/column';


export class UpdateColumnsDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'queryName no debe contener espacios' })
    queryName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    columns: Column[]

    @IsInt()
    @IsOptional()
    ide_opci?: number;

}
