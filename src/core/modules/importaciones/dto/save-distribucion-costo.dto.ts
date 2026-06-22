import { IsInt, IsNotEmpty } from 'class-validator';

export class SaveDistribucionCostoDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcaim: number;
}
