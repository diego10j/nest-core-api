import { BadRequestException } from '@nestjs/common';

/**
 * Value Object para ID de Usuario
 * Representa el UUID del usuario
 */
export class UserId {
    private readonly _value: string;

    private constructor(value: string) {
        this._value = value;
    }

    static create(id: string): UserId {
        if (!id || id.trim().length === 0) {
            throw new BadRequestException('El ID de usuario es requerido');
        }

        // Validación básica de UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(id)) {
            throw new BadRequestException('Formato de UUID inválido');
        }

        return new UserId(id);
    }

    get value(): string {
        return this._value;
    }

    equals(other: UserId): boolean {
        return this._value === other._value;
    }

    toString(): string {
        return this._value;
    }
}
