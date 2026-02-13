import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';

// Mock @aws-sdk/s3-request-presigner
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const mockedGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: string) => {
    const config: Record<string, string> = {
      R2_BUCKET_NAME: 'cyna-product-images',
      R2_PUBLIC_URL: 'https://pub-abc123.r2.dev',
    };
    return config[key] ?? defaultValue ?? '';
  }),
};

const mockS3Client = {
  send: jest.fn(),
};

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: S3Client, useValue: mockS3Client },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePresignedPutUrl', () => {
    it('should return URL with correct expiry', async () => {
      // Arrange
      const fakeUrl = 'https://account.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abc';
      mockedGetSignedUrl.mockResolvedValue(fakeUrl);
      const beforeTime = Date.now();

      // Act
      const result = await service.generatePresignedPutUrl(
        'products/123/image.jpg',
        'image/jpeg',
        900,
      );

      // Assert
      expect(result.url).toBe(fakeUrl);
      expect(result.expiresAt).toBeInstanceOf(Date);
      const expectedExpiry = beforeTime + 900 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiry + 1000);
      expect(mockedGetSignedUrl).toHaveBeenCalledWith(mockS3Client, expect.any(Object), {
        expiresIn: 900,
      });
    });

    it('should throw when S3 client returns an error', async () => {
      // Arrange
      mockedGetSignedUrl.mockRejectedValue(new Error('S3 connection failed'));

      // Act & Assert
      await expect(
        service.generatePresignedPutUrl('products/123/image.jpg', 'image/jpeg'),
      ).rejects.toThrow('S3 connection failed');
    });
  });

  describe('deleteObject', () => {
    it('should call S3Client send with DeleteObjectCommand', async () => {
      // Arrange
      mockS3Client.send.mockResolvedValue({});

      // Act
      await service.deleteObject('products/123/image.jpg');

      // Assert
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      const command = mockS3Client.send.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toEqual({
        Bucket: 'cyna-product-images',
        Key: 'products/123/image.jpg',
      });
    });

    it('should not throw when object does not exist (no-op)', async () => {
      // Arrange - S3 returns success even for non-existent keys
      mockS3Client.send.mockResolvedValue({});

      // Act & Assert
      await expect(service.deleteObject('non-existent-key')).resolves.toBeUndefined();
    });
  });

  describe('getPublicUrl', () => {
    it('should return R2_PUBLIC_URL/key', () => {
      // Act
      const result = service.getPublicUrl('products/123/image.jpg');

      // Assert
      expect(result).toBe('https://pub-abc123.r2.dev/products/123/image.jpg');
    });
  });
});
