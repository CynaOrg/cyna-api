import { ApiProperty } from '@nestjs/swagger';
import { LicenseKeyStatus } from '@cyna-api/common';

export class ProductSnapshotDto {
  @ApiProperty()
  nameFr: string;

  @ApiProperty()
  nameEn: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ required: false, nullable: true, type: String })
  image?: string | null;

  @ApiProperty({ required: false, type: String })
  productType?: string;
}

export class LicenseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  licenseKey: string;

  @ApiProperty({ type: ProductSnapshotDto })
  productSnapshot: ProductSnapshotDto;

  @ApiProperty()
  orderId: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({ enum: LicenseKeyStatus })
  status: LicenseKeyStatus;

  @ApiProperty({ nullable: true, type: Date })
  activatedAt: Date | null;

  @ApiProperty({ nullable: true, type: Date })
  expiresAt: Date | null;

  @ApiProperty()
  email: string;

  @ApiProperty()
  createdAt: Date;
}
