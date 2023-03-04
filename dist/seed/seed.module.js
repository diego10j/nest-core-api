"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedModule = void 0;
const common_1 = require("@nestjs/common");
const auth_module_1 = require("./../auth/auth.module");
const products_module_1 = require("./../products/products.module");
const seed_service_1 = require("./seed.service");
const seed_controller_1 = require("./seed.controller");
let SeedModule = class SeedModule {
};
SeedModule = __decorate([
    (0, common_1.Module)({
        controllers: [seed_controller_1.SeedController],
        providers: [seed_service_1.SeedService],
        imports: [
            products_module_1.ProductsModule,
            auth_module_1.AuthModule,
        ]
    })
], SeedModule);
exports.SeedModule = SeedModule;
//# sourceMappingURL=seed.module.js.map