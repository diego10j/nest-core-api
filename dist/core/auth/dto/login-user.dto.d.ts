import { ServiceDto } from 'src/common/dto/service.dto';
declare const LoginUserDto_base: import("@nestjs/mapped-types").MappedType<Partial<ServiceDto>>;
export declare class LoginUserDto extends LoginUserDto_base {
    userName: string;
    password: string;
}
export {};
