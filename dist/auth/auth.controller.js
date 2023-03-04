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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const http_1 = require("http");
const columnas_tabla_dto_1 = require("../core/connection/dto/columnas-tabla.dto");
const auth_service_1 = require("./auth.service");
const decorators_1 = require("./decorators");
const role_protected_decorator_1 = require("./decorators/role-protected.decorator");
const dto_1 = require("./dto");
const user_entity_1 = require("./entities/user.entity");
const user_role_guard_1 = require("./guards/user-role.guard");
const interfaces_1 = require("./interfaces");
let AuthController = class AuthController {
    constructor(authService) {
        this.authService = authService;
    }
    test(dto) {
        return this.authService.test(dto);
    }
    createUser(createUserDto) {
        return this.authService.create(createUserDto);
    }
    loginUser(loginUserDto) {
        return this.authService.login(loginUserDto);
    }
    checkAuthStatus(user) {
        return this.authService.checkAuthStatus(user);
    }
    testingPrivateRoute(request, user, userEmail, rawHeaders, headers) {
        return {
            ok: true,
            message: 'Hola Mundo Private',
            user,
            userEmail,
            rawHeaders,
            headers
        };
    }
    privateRoute2(user) {
        return {
            ok: true,
            user
        };
    }
    privateRoute3(user) {
        return {
            ok: true,
            user
        };
    }
};
__decorate([
    (0, common_1.Post)('test'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [columnas_tabla_dto_1.ColumnasTablaDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "test", null);
__decorate([
    (0, common_1.Post)('register'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.CreateUserDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "createUser", null);
__decorate([
    (0, common_1.Post)('login'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [dto_1.LoginUserDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "loginUser", null);
__decorate([
    (0, common_1.Get)('check-status'),
    (0, decorators_1.Auth)(),
    __param(0, (0, decorators_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "checkAuthStatus", null);
__decorate([
    (0, common_1.Get)('private'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)()),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, decorators_1.GetUser)()),
    __param(2, (0, decorators_1.GetUser)('email')),
    __param(3, (0, decorators_1.RawHeaders)()),
    __param(4, (0, common_1.Headers)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof Express !== "undefined" && Express.Request) === "function" ? _a : Object, user_entity_1.User, String, Array, typeof (_b = typeof http_1.IncomingHttpHeaders !== "undefined" && http_1.IncomingHttpHeaders) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "testingPrivateRoute", null);
__decorate([
    (0, common_1.Get)('private2'),
    (0, role_protected_decorator_1.RoleProtected)(interfaces_1.ValidRoles.superUser, interfaces_1.ValidRoles.admin),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)(), user_role_guard_1.UserRoleGuard),
    __param(0, (0, decorators_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "privateRoute2", null);
__decorate([
    (0, common_1.Get)('private3'),
    (0, decorators_1.Auth)(interfaces_1.ValidRoles.admin),
    __param(0, (0, decorators_1.GetUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [user_entity_1.User]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "privateRoute3", null);
AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
exports.AuthController = AuthController;
//# sourceMappingURL=auth.controller.js.map