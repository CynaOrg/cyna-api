import { Test, TestingModule } from '@nestjs/testing';
import { CynaLoggerService } from '@cyna-api/common';
import { S3Service } from '@cyna-api/s3';
import { ContentImageService } from './content-image.service';

describe('ContentImageService', () => {
  let service: ContentImageService;
  let s3: { generatePresignedPutUrl: jest.Mock; getPublicUrl: jest.Mock };
  let logger: { log: jest.Mock };

  beforeEach(async () => {
    s3 = {
      generatePresignedPutUrl: jest
        .fn()
        .mockResolvedValue({ url: 'https://up', expiresAt: '2030-01-01' }),
      getPublicUrl: jest.fn().mockReturnValue('https://pub'),
    };
    logger = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentImageService,
        { provide: S3Service, useValue: s3 },
        { provide: CynaLoggerService, useValue: logger },
      ],
    }).compile();
    service = module.get(ContentImageService);
  });

  it('requestCarouselUploadUrl uses fileName extension', async () => {
    const r = await service.requestCarouselUploadUrl({
      fileName: 'banner.PNG',
      contentType: 'image/png',
    } as never);
    expect(s3.generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.stringMatching(/content\/carousel\/.*\.png$/),
      'image/png',
      900,
    );
    expect(r.uploadUrl).toBe('https://up');
    expect(r.publicUrl).toBe('https://pub');
  });

  it('falls back to mime type extension when fileName has no extension', async () => {
    await service.requestCarouselUploadUrl({
      fileName: 'banner',
      contentType: 'image/jpeg',
    } as never);
    expect(s3.generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.stringMatching(/\.jpg$/),
      'image/jpeg',
      900,
    );
  });

  it('defaults to .jpg for unknown mime type', async () => {
    await service.requestCarouselUploadUrl({
      fileName: 'banner',
      contentType: 'application/octet-stream',
    } as never);
    expect(s3.generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.stringMatching(/\.jpg$/),
      'application/octet-stream',
      900,
    );
  });

  it('supports webp mime type', async () => {
    await service.requestCarouselUploadUrl({
      fileName: 'banner',
      contentType: 'image/webp',
    } as never);
    expect(s3.generatePresignedPutUrl).toHaveBeenCalledWith(
      expect.stringMatching(/\.webp$/),
      'image/webp',
      900,
    );
  });
});
