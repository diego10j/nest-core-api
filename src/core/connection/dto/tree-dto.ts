import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';



export class TreeDto extends QueryOptionsDto {

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
    @Matches(/^\S*$/, { message: 'columnName no debe contener espacios' })
    columnName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'columnNode no debe contener espacios' })
    columnNode: string;


    @IsString()
    @IsOptional()
    condition?: string;



}