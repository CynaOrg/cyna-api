import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

describe('ContentController', () => {
  let controller: ContentController;
  let contentClient: { send: jest.Mock };

  beforeEach(async () => {
    contentClient = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [ContentService, { provide: SERVICE_NAMES.CONTENT, useValue: contentClient }],
    }).compile();
    controller = module.get(ContentController);
  });

  it('GET /homepage forwards lang', async () => {
    await controller.getHomepage('fr');
    expect(contentClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.GET_HOMEPAGE, {
      lang: 'fr',
    });
  });

  it('GET /carousel forwards lang', async () => {
    await controller.getCarousel('en');
    expect(contentClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.GET_CAROUSEL, {
      lang: 'en',
    });
  });

  it('GET /top-services forwards limit + lang', async () => {
    await controller.getTopServices(3, 'fr');
    expect(contentClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.GET_TOP_SERVICES, {
      limit: 3,
      lang: 'fr',
    });
  });

  it('GET /top-products forwards limit + lang', async () => {
    await controller.getTopProducts(5, 'en');
    expect(contentClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.GET_TOP_PRODUCTS, {
      limit: 5,
      lang: 'en',
    });
  });

  it('POST /contact forwards dto', async () => {
    const dto = { name: 'T', email: 'a@b.c', message: 'hi' };
    await controller.createContactMessage(dto as never);
    expect(contentClient.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CONTENT.CREATE_CONTACT_MESSAGE,
      dto,
    );
  });
});
