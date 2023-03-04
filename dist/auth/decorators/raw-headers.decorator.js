"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RawHeaders = void 0;
const common_1 = require("@nestjs/common");
exports.RawHeaders = (0, common_1.createParamDecorator)((data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    return req.rawHeaders;
});
//# sourceMappingURL=raw-headers.decorator.js.map