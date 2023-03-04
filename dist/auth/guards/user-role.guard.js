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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRoleGuard = void 0;
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const role_protected_decorator_1 = require("../decorators/role-protected.decorator");
let UserRoleGuard = class UserRoleGuard {
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const validRoles = this.reflector.get(role_protected_decorator_1.META_ROLES, context.getHandler());
        if (!validRoles)
            return true;
        if (validRoles.length === 0)
            return true;
        const req = context.switchToHttp().getRequest();
        const user = req.user;
        if (!user)
            throw new common_1.BadRequestException('User not found');
        for (const role of user.roles) {
            if (validRoles.includes(role)) {
                return true;
            }
        }
        throw new common_1.ForbiddenException(`User ${user.fullName} need a valid role: [${validRoles}]`);
    }
};
UserRoleGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof core_1.Reflector !== "undefined" && core_1.Reflector) === "function" ? _a : Object])
], UserRoleGuard);
exports.UserRoleGuard = UserRoleGuard;
//# sourceMappingURL=user-role.guard.js.map