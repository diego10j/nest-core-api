"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const uuid_1 = require("uuid");
const entities_1 = require("./entities");
let ProductsService = class ProductsService {
    constructor(productRepository, productImageRepository, dataSource) {
        this.productRepository = productRepository;
        this.productImageRepository = productImageRepository;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger('ProductsService');
    }
    async create(createProductDto, user) {
        try {
            const { images = [], ...productDetails } = createProductDto;
            const product = this.productRepository.create({
                ...productDetails,
                images: images.map(image => this.productImageRepository.create({ url: image }))
            });
            await this.productRepository.save(product);
            return { ...product, images };
        }
        catch (error) {
            this.handleDBExceptions(error);
        }
    }
    async findAll(paginationDto) {
        const { limit = 10, offset = 0 } = paginationDto;
        const products = await this.productRepository.find({
            take: limit,
            skip: offset,
            relations: {
                images: true,
            }
        });
        return products.map((product) => ({
            ...product,
            images: product.images.map(img => img.url)
        }));
    }
    async findOne(term) {
        let product;
        if ((0, uuid_1.validate)(term)) {
            product = await this.productRepository.findOneBy({ id: term });
        }
        else {
            const queryBuilder = this.productRepository.createQueryBuilder('prod');
            product = await queryBuilder
                .where('UPPER(title) =:title or slug =:slug', {
                title: term.toUpperCase(),
                slug: term.toLowerCase(),
            })
                .leftJoinAndSelect('prod.images', 'prodImages')
                .getOne();
        }
        if (!product)
            throw new common_1.NotFoundException(`Product with ${term} not found`);
        return product;
    }
    async findOnePlain(term) {
        const { images = [], ...rest } = await this.findOne(term);
        return {
            ...rest,
            images: images.map(image => image.url)
        };
    }
    async update(id, updateProductDto, user) {
        const { images, ...toUpdate } = updateProductDto;
        const product = await this.productRepository.preload({ id, ...toUpdate });
        if (!product)
            throw new common_1.NotFoundException(`Product with id: ${id} not found`);
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();
        try {
            if (images) {
                await queryRunner.manager.delete(entities_1.ProductImage, { product: { id } });
                product.images = images.map(image => this.productImageRepository.create({ url: image }));
            }
            await queryRunner.manager.save(product);
            await queryRunner.commitTransaction();
            await queryRunner.release();
            return this.findOnePlain(id);
        }
        catch (error) {
            await queryRunner.rollbackTransaction();
            await queryRunner.release();
            this.handleDBExceptions(error);
        }
    }
    async remove(id) {
        const product = await this.findOne(id);
        await this.productRepository.remove(product);
    }
    handleDBExceptions(error) {
        if (error.code === '23505')
            throw new common_1.BadRequestException(error.detail);
        this.logger.error(error);
        throw new common_1.InternalServerErrorException('Unexpected error, check server logs');
    }
    async deleteAllProducts() {
        const query = this.productRepository.createQueryBuilder('product');
        try {
            return await query
                .delete()
                .where({})
                .execute();
        }
        catch (error) {
            this.handleDBExceptions(error);
        }
    }
};
ProductsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(entities_1.Product)),
    __param(1, (0, typeorm_1.InjectRepository)(entities_1.ProductImage)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.DataSource])
], ProductsService);
exports.ProductsService = ProductsService;
//# sourceMappingURL=products.service.js.map