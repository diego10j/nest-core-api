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
exports.SeedService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const typeorm_2 = require("@nestjs/typeorm");
const products_service_1 = require("./../products/products.service");
const seed_data_1 = require("./data/seed-data");
const user_entity_1 = require("../auth/entities/user.entity");
let SeedService = class SeedService {
    constructor(productsService, userRepository) {
        this.productsService = productsService;
        this.userRepository = userRepository;
    }
    async runSeed() {
        await this.deleteTables();
        const adminUser = await this.insertUsers();
        await this.insertNewProducts(adminUser);
        return 'SEED EXECUTED';
    }
    async deleteTables() {
        await this.productsService.deleteAllProducts();
        const queryBuilder = this.userRepository.createQueryBuilder();
        await queryBuilder
            .delete()
            .where({})
            .execute();
    }
    async insertUsers() {
        const seedUsers = seed_data_1.initialData.users;
        const users = [];
        seedUsers.forEach(user => {
            users.push(this.userRepository.create(user));
        });
        const dbUsers = await this.userRepository.save(seedUsers);
        return dbUsers[0];
    }
    async insertNewProducts(user) {
        await this.productsService.deleteAllProducts();
        const products = seed_data_1.initialData.products;
        const insertPromises = [];
        products.forEach(product => {
            insertPromises.push(this.productsService.create(product, user));
        });
        await Promise.all(insertPromises);
        return true;
    }
};
SeedService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, typeorm_2.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [products_service_1.ProductsService,
        typeorm_1.Repository])
], SeedService);
exports.SeedService = SeedService;
//# sourceMappingURL=seed.service.js.map