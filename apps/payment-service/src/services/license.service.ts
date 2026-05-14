import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { LicenseKeyStatus } from '@cyna-api/common';
import { LicenseKey, ProductSnapshot } from '../entities/license-key.entity';

export interface OrderItemWithProduct {
  productId: string;
  productType: string;
  quantity: number;
  email: string;
  userId?: string;
  productSnapshot: ProductSnapshot;
}

export interface IssuedLicense {
  license: LicenseKey;
  activationToken: string;
}

const ACTIVATION_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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

  private generateActivationToken(): { token: string; hash: string; expiresAt: Date } {
    // URL-safe base64 of 32 random bytes (43 chars). Never stored raw: we keep
    // only the SHA-256 hash so a DB dump cannot activate licenses.
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + ACTIVATION_TOKEN_TTL_MS);
    return { token, hash, expiresAt };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async generateForOrder(orderId: string, items: OrderItemWithProduct[]): Promise<IssuedLicense[]> {
    const issued: IssuedLicense[] = [];

    for (const item of items) {
      if (item.productType !== 'license') continue;

      for (let i = 0; i < item.quantity; i++) {
        const activation = this.generateActivationToken();
        const license = this.licenseKeyRepository.create({
          orderId,
          productId: item.productId,
          userId: item.userId || null,
          licenseKey: this.generateKey(),
          email: item.email,
          productSnapshot: item.productSnapshot,
          status: LicenseKeyStatus.ACTIVE,
          activatedAt: null,
          activationTokenHash: activation.hash,
          activationTokenExpiresAt: activation.expiresAt,
        });
        issued.push({ license, activationToken: activation.token });
      }
    }

    if (issued.length > 0) {
      await this.licenseKeyRepository.save(issued.map((i) => i.license));
      this.logger.log(`Generated ${issued.length} license keys for order ${orderId}`);
    }

    return issued;
  }

  async activate(token: string): Promise<LicenseKey> {
    const hash = this.hashToken(token);
    const license = await this.licenseKeyRepository.findOne({
      where: { activationTokenHash: hash },
    });

    if (!license) {
      // Token unknown, consumed, or never existed. Return a uniform 404 so
      // callers cannot distinguish "already activated" from "invalid token"
      // via timing — mild defense against token enumeration.
      throw new RpcException({
        statusCode: 404,
        message: 'errors.license.invalidActivationLink',
        code: 'LICENSE_ACTIVATION_INVALID',
      });
    }

    if (
      license.activationTokenExpiresAt &&
      license.activationTokenExpiresAt.getTime() < Date.now()
    ) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.license.invalidActivationLink',
        code: 'LICENSE_ACTIVATION_INVALID',
      });
    }

    license.activatedAt = new Date();
    license.activationTokenHash = null;
    license.activationTokenExpiresAt = null;
    await this.licenseKeyRepository.save(license);
    this.logger.log(`License ${license.id} activated`);
    return license;
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

  async findByIdForUser(licenseId: string, userId: string): Promise<LicenseKey> {
    const license = await this.licenseKeyRepository.findOne({
      where: { id: licenseId, userId },
    });
    if (!license) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.license.notFound',
        code: 'LICENSE_NOT_FOUND',
      });
    }
    return license;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.licenseKeyRepository.update(
      { userId, status: LicenseKeyStatus.ACTIVE },
      { status: LicenseKeyStatus.REVOKED },
    );
    const affected = result.affected ?? 0;
    this.logger.log(`Revoked ${affected} active licenses for user ${userId}`);
    return affected;
  }

  async revokeByOrderId(orderId: string): Promise<void> {
    await this.licenseKeyRepository.update({ orderId }, { status: LicenseKeyStatus.REVOKED });
    this.logger.log(`Revoked all license keys for order ${orderId}`);
  }
}
