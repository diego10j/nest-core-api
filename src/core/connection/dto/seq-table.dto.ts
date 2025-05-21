import { IsString, IsNotEmpty, IsPositive, IsInt, Matches } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';


export class SeqTableDto extends PartialType(QueryOptionsDto) {

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
    @IsPositive()
    numberRowsAdded: number

}
