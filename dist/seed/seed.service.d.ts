import { Repository } from 'typeorm';
import { ProductsService } from './../products/products.service';
import { User } from '../auth/entities/user.entity';
export declare class SeedService {
    private readonly productsService;
    private readonly userRepository;
    constructor(productsService: ProductsService, userRepository: Repository<User>);
    runSeed(): Promise<string>;
    private deleteTables;
    private insertUsers;
    private insertNewProducts;
}
