import {  IsInt } from 'class-validator';

export class EnviarCampaniaDto {

 
    @IsInt()
    ide_whcenv: number;   



}
