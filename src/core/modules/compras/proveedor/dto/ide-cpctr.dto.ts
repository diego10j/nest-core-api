import { IsInt, IsNotEmpty } from 'class-validator';

export class IdeCpctrDto {
    @IsInt()
    @IsNotEmpty()
    ide_cpctr: number;
}
