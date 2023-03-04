import {
    IsString,  IsOptional, IsArray, ArrayNotEmpty, IsNotEmpty
} from 'class-validator';


export class ColumnsTableDto  {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsOptional()
    @ArrayNotEmpty()
    @IsString({ each: true })
    @IsNotEmpty({ each: true })
    @IsArray()
    columns?: string[]

}
