import { BadRequestException } from '@nestjs/common';

/**
 * Value Object para Password
 * Valida reglas de negocio de contraseñas
 */
export class Password {
    private readonly _value: string;
    private static readonly MIN_LENGTH = 4;
    private static readonly MAX_LENGTH = 50;

    private constructor(value: string) {
        this._value = value;
    }

    static create(password: string): Password {
        if (!password) {
            throw new BadRequestException('La contraseña es requerida');
        }

        if (password.length < Password.MIN_LENGTH) {
            throw new BadRequestException(`La contraseña debe tener al menos ${Password.MIN_LENGTH} caracteres`);
        }

        if (password.length > Password.MAX_LENGTH) {
            throw new BadRequestException(`La contraseña no puede exceder ${Password.MAX_LENGTH} caracteres`);
        }

        return new Password(password);
    }

    get value(): string {
        return this._value;
    }

    equals(other: Password): boolean {
        return this._value === other._value;
    }
}
