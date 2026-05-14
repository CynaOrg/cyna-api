import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { ContentService } from './content.service';

describe('Gateway ContentService', () => {
  let service: ContentService;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContentService, { provide: SERVICE_NAMES.CONTENT, useValue: client }],
    }).compile();
    service = module.get(ContentService);
  });

  it('getTopLicenses forwards limit + lang', async () => {
    await service.getTopLicenses(2, 'fr');
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.GET_TOP_LICENSES, {
      limit: 2,
      lang: 'fr',
    });
  });

  describe('errors', () => {
    it('maps RPC error to HttpException', async () => {
      client.send.mockReturnValueOnce(throwError(() => ({ statusCode: 404, message: 'No' })));
      try {
        await service.getCarousel('fr');
        fail('should throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(404);
      }
    });

    it('maps TimeoutError to 503', async () => {
      const e = new Error('Timeout');
      e.name = 'TimeoutError';
      client.send.mockReturnValueOnce(throwError(() => e));
      await expect(service.getCarousel('fr')).rejects.toBeInstanceOf(HttpException);
    });

    it('rethrows unknown error', async () => {
      const e = new Error('Generic');
      client.send.mockReturnValueOnce(throwError(() => e));
      await expect(service.getCarousel('fr')).rejects.toBe(e);
    });
  });
});
