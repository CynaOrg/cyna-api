import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { ContentAdminController } from './content-admin.controller';
import { ContentService } from './content.service';
import { JwtAdminAuthGuard, SuperAdminGuard } from '../auth/guards';

describe('ContentAdminController', () => {
  let controller: ContentAdminController;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentAdminController],
      providers: [ContentService, { provide: SERVICE_NAMES.CONTENT, useValue: client }],
    })
      .overrideGuard(JwtAdminAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ContentAdminController);
  });

  it('GET /carousel uses ADMIN_GET_CAROUSEL', async () => {
    await controller.getCarousel();
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CAROUSEL, {});
  });

  it('POST /carousel creates a slide', async () => {
    await controller.createSlide({ title: 'A' } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_CREATE_SLIDE, {
      title: 'A',
    });
  });

  it('PATCH /carousel/reorder forwards slideIds', async () => {
    await controller.reorderCarousel({ slideIds: ['a'] } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_REORDER_CAROUSEL, {
      slideIds: ['a'],
    });
  });

  it('POST /carousel/upload-url forwards dto', async () => {
    await controller.requestCarouselUploadUrl({ fileName: 'x.png' } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.CAROUSEL_REQUEST_UPLOAD_URL, {
      fileName: 'x.png',
    });
  });

  it('PATCH /carousel/:id updates a slide', async () => {
    await controller.updateSlide('sid', { title: 'B' } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_SLIDE, {
      id: 'sid',
      dto: { title: 'B' },
    });
  });

  it('DELETE /carousel/:id deletes a slide', async () => {
    await controller.deleteSlide('sid');
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_SLIDE, {
      id: 'sid',
    });
  });

  it('GET /hero-text uses ADMIN_GET_HERO_TEXT', async () => {
    await controller.getHeroText();
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_HERO_TEXT, {});
  });

  it('PATCH /hero-text forwards dto', async () => {
    await controller.updateHeroText({ title: 'New' } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_HERO_TEXT, {
      title: 'New',
    });
  });

  it('GET /top-services uses ADMIN_GET_TOP_SERVICES', async () => {
    await controller.getTopServices();
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_TOP_SERVICES, {});
  });

  it('PATCH /top-services forwards productIds', async () => {
    await controller.updateTopServices({ productIds: ['p1', 'p2'] } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_SERVICES, {
      productIds: ['p1', 'p2'],
    });
  });

  it('GET /top-products uses ADMIN_GET_TOP_PRODUCTS', async () => {
    await controller.getTopProducts();
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_TOP_PRODUCTS, {});
  });

  it('PATCH /top-products forwards productIds', async () => {
    await controller.updateTopProducts({ productIds: ['p'] } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_PRODUCTS, {
      productIds: ['p'],
    });
  });

  it('GET /top-licenses uses ADMIN_GET_TOP_LICENSES', async () => {
    await controller.getTopLicenses();
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_TOP_LICENSES, {});
  });

  it('PATCH /top-licenses forwards productIds', async () => {
    await controller.updateTopLicenses({ productIds: ['l1'] } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_TOP_LICENSES, {
      productIds: ['l1'],
    });
  });

  it('GET /contact-messages forwards query', async () => {
    await controller.getContactMessages({ page: 1 } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.CONTENT.ADMIN_GET_CONTACT_MESSAGES, {
      page: 1,
    });
  });

  it('PATCH /contact-messages/:id updates message', async () => {
    await controller.updateContactMessage('mid', { status: 'HANDLED' } as never);
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CONTENT.ADMIN_UPDATE_CONTACT_MESSAGE,
      { id: 'mid', dto: { status: 'HANDLED' } },
    );
  });

  it('DELETE /contact-messages/:id deletes message', async () => {
    await controller.deleteContactMessage('mid');
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.CONTENT.ADMIN_DELETE_CONTACT_MESSAGE,
      { id: 'mid' },
    );
  });
});
