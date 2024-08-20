import { ArrayNotEmpty, IsArray, IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class DeleteDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsOptional()
    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    values: any[];

}
