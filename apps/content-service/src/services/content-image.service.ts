import { Injectable } from '@nestjs/common';
import { CynaLoggerService } from '@cyna-api/common';
import { S3Service } from '@cyna-api/s3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import {
  ContentPresignedUploadResponseDto,
  RequestContentUploadUrlDto,
} from '../dto/carousel/request-content-upload-url.dto';

@Injectable()
export class ContentImageService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly logger: CynaLoggerService,
  ) {}

  async requestCarouselUploadUrl(
    dto: RequestContentUploadUrlDto,
  ): Promise<ContentPresignedUploadResponseDto> {
    const extension =
      path.extname(dto.fileName).toLowerCase() || this.getExtensionFromMime(dto.contentType);
    const storageKey = `content/carousel/${uuidv4()}${extension}`;

    const { url, expiresAt } = await this.s3Service.generatePresignedPutUrl(
      storageKey,
      dto.contentType,
      900, // 15 minutes
    );

    const publicUrl = this.s3Service.getPublicUrl(storageKey);

    this.logger.log(`Presigned upload URL generated for carousel: ${storageKey}`);

    return {
      uploadUrl: url,
      storageKey,
      publicUrl,
      expiresAt,
    };
  }

  private getExtensionFromMime(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    return map[mimeType] || '.jpg';
  }
}
