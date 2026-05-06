import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AdminRole } from '@cyna-api/common';
import { Admin } from '../entities';
import { PasswordService } from '../services/password.service';

@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly passwordService: PasswordService,
  ) {}

  async onModuleInit(): Promise<void> {
    const seedEnabled = process.env.ADMIN_SEED_ENABLED === 'true';

    if (!seedEnabled) {
      this.logger.log('Admin seed is disabled (ADMIN_SEED_ENABLED !== "true")');
      return;
    }

    await this.seed();
  }

  private async seed(): Promise<void> {
    const email = process.env.ADMIN_SEED_EMAIL;
    const password = process.env.ADMIN_SEED_PASSWORD;
    const firstName = process.env.ADMIN_SEED_FIRSTNAME ?? '';
    const lastName = process.env.ADMIN_SEED_LASTNAME ?? '';

    if (!email || !password) {
      const message =
        'ADMIN_SEED_ENABLED is true but ADMIN_SEED_EMAIL and/or ADMIN_SEED_PASSWORD are not set. Refusing to seed.';
      this.logger.fatal(message);
      throw new Error(message);
    }

    const existingAdmin = await this.adminRepository.findOne({
      where: { role: AdminRole.SUPER_ADMIN },
    });

    if (existingAdmin) {
      this.logger.log('Super admin already exists, skipping seed');
      return;
    }

    const passwordHash = await this.passwordService.hash(password);

    const admin = this.adminRepository.create({
      email,
      passwordHash,
      firstName,
      lastName,
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
    });

    const savedAdmin = await this.adminRepository.save(admin);
    this.logger.log(`Super admin seeded successfully (id: ${savedAdmin.id})`);
  }
}
