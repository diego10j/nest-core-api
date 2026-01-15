import { BadRequestException } from '@nestjs/common';

/**
 * Value Object para Email
 * Inmutable y con validación de dominio
 */
export class Email {
    private readonly _value: string;

    private constructor(value: string) {
        this._value = value;
    }

    static create(email: string): Email {
        if (!email) {
            throw new BadRequestException('El email es requerido');
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new BadRequestException('Formato de email inválido');
        }

        return new Email(email.toLowerCase().trim());
    }

    get value(): string {
        return this._value;
    }

    equals(other: Email): boolean {
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }
}
