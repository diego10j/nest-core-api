
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsInt, IsString, Matches, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class SearchTableDto extends ServiceDto {

    @IsString()
    value: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'module no debe contener espacios' })
    module: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;


    @ArrayNotEmpty()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @IsArray()
    columnsReturn: string[]

    @ArrayNotEmpty()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @IsArray()
    columnsSearch: string[]

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'columnOrder no debe contener espacios' })
    columnOrder: string;
    
    
    @IsString()
    @IsOptional()
    condition?: string;


    @IsInt()
    @IsOptional()
    limit?: number = 25;

}
