import { IsString, MinLength } from 'class-validator';



export class RucDto {

    @IsString()
    @MinLength(13)
    ruc: string;

}