import { IsInt, IsNotEmpty } from 'class-validator';

export class MarcarSeguidorDto {

    @IsInt()
    @IsNotEmpty()
    ide_geper: number;
}
