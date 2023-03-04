import { DataSource, Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { ProductImage, Product } from './entities';
export declare class ProductsService {
    private readonly productRepository;
    private readonly productImageRepository;
    private readonly dataSource;
    private readonly logger;
    constructor(productRepository: Repository<Product>, productImageRepository: Repository<ProductImage>, dataSource: DataSource);
    create(createProductDto: CreateProductDto, user: any): Promise<{
        images: string[];
        id: string;
        title: string;
        price: number;
        description: string;
        slug: string;
        stock: number;
        sizes: string[];
        gender: string;
        tags: string[];
    }>;
    findAll(paginationDto: PaginationDto): Promise<{
        images: string[];
        id: string;
        title: string;
        price: number;
        description: string;
        slug: string;
        stock: number;
        sizes: string[];
        gender: string;
        tags: string[];
    }[]>;
    findOne(term: string): Promise<Product>;
    findOnePlain(term: string): Promise<{
        images: string[];
        id: string;
        title: string;
        price: number;
        description: string;
        slug: string;
        stock: number;
        sizes: string[];
        gender: string;
        tags: string[];
    }>;
    update(id: string, updateProductDto: UpdateProductDto, user: any): Promise<{
        images: string[];
        id: string;
        title: string;
        price: number;
        description: string;
        slug: string;
        stock: number;
        sizes: string[];
        gender: string;
        tags: string[];
    }>;
    remove(id: string): Promise<void>;
    private handleDBExceptions;
    deleteAllProducts(): Promise<import("typeorm").DeleteResult>;
}
