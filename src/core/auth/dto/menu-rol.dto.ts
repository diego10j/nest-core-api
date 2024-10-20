import { IsInt } from 'class-validator';


export class MenuRolDto {

    @IsInt()
    ide_perf: number;

}