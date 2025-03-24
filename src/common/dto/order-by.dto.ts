import { IsIn, IsOptional, IsString } from 'class-validator';

export class OrderByDto {
    @IsString()
    column: string;

    @IsOptional()
    @IsString()
    direction?: 'ASC' | 'DESC' = 'ASC';
}