import { IsInt, IsNotEmpty } from 'class-validator';

export class IdeCcctrDto {
    @IsInt()
    @IsNotEmpty()
    ide_ccctr: number;
}
