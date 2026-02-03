import { Email } from '../value-objects/email.vo';
import { UserId } from '../value-objects/user-id.vo';

/**
 * Entidad de Dominio: User
 * Representa un usuario del sistema con sus reglas de negocio
 */
export class User {
    private constructor(
        private readonly _id: UserId,
        private readonly _ideUsua: number,
        private readonly _email: Email,
        private readonly _displayName: string,
        private readonly _login: string,
        private readonly _isBlocked: boolean,
        private readonly _isSuperUser: boolean,
        private readonly _requirePasswordChange: boolean,
        private readonly _photoURL: string,
    ) { }

    static create(data: {
        id: string;
        ideUsua: number;
        email: string;
        displayName: string;
        login: string;
        isBlocked: boolean;
        isSuperUser: boolean;
        requirePasswordChange: boolean;
        photoURL: string;
    }): User {
        const userId = UserId.create(data.id);
        const email = Email.create(data.email);

        return new User(
            userId,
            data.ideUsua,
            email,
            data.displayName,
            data.login,
            data.isBlocked,
            data.isSuperUser,
            data.requirePasswordChange,
            data.photoURL,
        );
    }

    // Reglas de negocio
    canLogin(): boolean {
        return !this._isBlocked;
    }

    mustChangePassword(): boolean {
        return this._requirePasswordChange;
    }

    // Getters
    get id(): UserId {
        return this._id;
    }

    get ideUsua(): number {
        return this._ideUsua;
    }

    get email(): Email {
        return this._email;
    }

    get displayName(): string {
        return this._displayName;
    }

    get login(): string {
        return this._login;
    }

    get isBlocked(): boolean {
        return this._isBlocked;
    }

    get isSuperUser(): boolean {
        return this._isSuperUser;
    }

    get requirePasswordChange(): boolean {
        return this._requirePasswordChange;
    }

    get photoURL(): string {
        return this._photoURL;
    }
}
