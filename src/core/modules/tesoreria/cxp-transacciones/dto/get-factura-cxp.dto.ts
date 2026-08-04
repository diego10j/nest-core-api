import { IsInt, IsNotEmpty } from 'class-validator';

export class GetFacturaCxPDto {
    @IsInt()
    @IsNotEmpty()
    ideCpcfa: number;
}
