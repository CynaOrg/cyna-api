import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { LicenseKeyStatus } from '@cyna-api/common';
import { LicenseKey } from '../entities/license-key.entity';

export interface OrderItemWithProduct {
  productId: string;
  productType: string;
  quantity: number;
  email: string;
  userId?: string;
}

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    @InjectRepository(LicenseKey)
    private readonly licenseKeyRepository: Repository<LicenseKey>,
  ) {}

  generateKey(): string {
    // Format: CYNA-XXXX-XXXX-XXXX-XXXX
    const bytes = randomBytes(8);
    const hex = bytes.toString('hex').toUpperCase();
    return `CYNA-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
  }

  async generateForOrder(orderId: string, items: OrderItemWithProduct[]): Promise<LicenseKey[]> {
    const licenseKeys: LicenseKey[] = [];

    for (const item of items) {
      if (item.productType !== 'license') continue;

      for (let i = 0; i < item.quantity; i++) {
        const key = this.licenseKeyRepository.create({
          orderId,
          productId: item.productId,
          userId: item.userId || null,
          licenseKey: this.generateKey(),
          email: item.email,
          status: LicenseKeyStatus.ACTIVE,
          activatedAt: new Date(),
        });
        licenseKeys.push(key);
      }
    }

    if (licenseKeys.length > 0) {
      await this.licenseKeyRepository.save(licenseKeys);
      this.logger.log(`Generated ${licenseKeys.length} license keys for order ${orderId}`);
    }

    return licenseKeys;
  }

  async findByOrderId(orderId: string): Promise<LicenseKey[]> {
    return this.licenseKeyRepository.find({ where: { orderId } });
  }

  async findByUserId(userId: string): Promise<LicenseKey[]> {
    return this.licenseKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findByEmail(email: string): Promise<LicenseKey[]> {
    return this.licenseKeyRepository.find({
      where: { email },
      order: { createdAt: 'DESC' },
    });
  }

  async revokeByOrderId(orderId: string): Promise<void> {
    await this.licenseKeyRepository.update({ orderId }, { status: LicenseKeyStatus.REVOKED });
    this.logger.log(`Revoked all license keys for order ${orderId}`);
  }
}
