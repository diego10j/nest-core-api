import { IsInt, IsNotEmpty } from 'class-validator';

export class DeleteCostoDto {
    @IsInt()
    @IsNotEmpty()
    ide_imcoim: number;
}
