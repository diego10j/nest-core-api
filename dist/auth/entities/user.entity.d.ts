import { Product } from '../../products/entities';
export declare class User {
    id: string;
    email: string;
    password: string;
    fullName: string;
    isActive: boolean;
    roles: string[];
    product: Product;
    checkFieldsBeforeInsert(): void;
    checkFieldsBeforeUpdate(): void;
}
