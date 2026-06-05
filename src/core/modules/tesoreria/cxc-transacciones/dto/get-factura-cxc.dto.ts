import { IsInt, IsNotEmpty } from 'class-validator';

export class GetFacturaCxCDto {
    @IsInt()
    @IsNotEmpty()
    ideCccfa: number;
}
