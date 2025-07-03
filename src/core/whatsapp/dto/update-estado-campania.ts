import {  IsInt } from 'class-validator';

export class UpdateEstadoCampaniaDto {

 
    @IsInt()
    ide_whcenv: number;   

 
    @IsInt()
    ide_whesce: number;   

}
