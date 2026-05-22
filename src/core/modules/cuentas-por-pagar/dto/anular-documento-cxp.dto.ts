import { IsInt, IsOptional, IsString } from 'class-validator';

export class AnularDocumentoCxPDto {

    @IsInt()
    ide_cpcfa: number;
}
