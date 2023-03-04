import { ProductImage } from './';
export declare class Product {
    id: string;
    title: string;
    price: number;
    description: string;
    slug: string;
    stock: number;
    sizes: string[];
    gender: string;
    tags: string[];
    images?: ProductImage[];
    checkSlugInsert(): void;
    checkSlugUpdate(): void;
}
