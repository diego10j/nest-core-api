import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CifrarClaveDto {
    @IsString()
    @IsNotEmpty()
    @MaxLength(500)
    password: string;
}
