import { Test, TestingModule } from '@nestjs/testing';
import { ContentController } from './content.controller';
import {
  CarouselService,
  HeroTextService,
  TopProductsService,
  ContactMessageService,
  ContentImageService,
} from '../services';
import { ContentEventsPublisher } from '../events';

describe('ContentController', () => {
  let controller: ContentController;
  let carouselService: jest.Mocked<CarouselService>;
  let heroTextService: jest.Mocked<HeroTextService>;
  let topProductsService: jest.Mocked<TopProductsService>;
  let contactMessageService: jest.Mocked<ContactMessageService>;
  let contentImageService: jest.Mocked<ContentImageService>;
  let eventsPublisher: jest.Mocked<ContentEventsPublisher>;

  beforeEach(async () => {
    carouselService = {
      findAllPublic: jest.fn().mockResolvedValue([]),
      findAllAdmin: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      reorder: jest.fn(),
    } as unknown as jest.Mocked<CarouselService>;
    heroTextService = {
      get: jest.fn().mockResolvedValue({}),
      update: jest.fn(),
    } as unknown as jest.Mocked<HeroTextService>;
    topProductsService = {
      getTopServicesWithDetails: jest.fn().mockResolvedValue({ products: [] }),
      getTopProductsWithDetails: jest.fn().mockResolvedValue({ products: [] }),
      getTopLicensesWithDetails: jest.fn().mockResolvedValue({ products: [] }),
      getTopServices: jest.fn(),
      getTopProducts: jest.fn(),
      getTopLicenses: jest.fn(),
      updateTopServices: jest.fn(),
      updateTopProducts: jest.fn(),
      updateTopLicenses: jest.fn(),
      toggleFeatured: jest.fn(),
      getFullSyncSnapshot: jest.fn(),
    } as unknown as jest.Mocked<TopProductsService>;
    contactMessageService = {
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<ContactMessageService>;
    contentImageService = {
      requestCarouselUploadUrl: jest.fn(),
    } as unknown as jest.Mocked<ContentImageService>;
    eventsPublisher = {
      emitContactMessageReceived: jest.fn(),
      emitTopProductsUpdated: jest.fn(),
    } as unknown as jest.Mocked<ContentEventsPublisher>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        { provide: CarouselService, useValue: carouselService },
        { provide: HeroTextService, useValue: heroTextService },
        { provide: TopProductsService, useValue: topProductsService },
        { provide: ContactMessageService, useValue: contactMessageService },
        { provide: ContentImageService, useValue: contentImageService },
        { provide: ContentEventsPublisher, useValue: eventsPublisher },
      ],
    }).compile();
    controller = module.get(ContentController);
  });

  it('getHomepage aggregates all sections', async () => {
    carouselService.findAllPublic.mockResolvedValue([{ id: 's1' }] as never);
    heroTextService.get.mockResolvedValue({ titleFr: 'a' } as never);
    topProductsService.getTopServicesWithDetails.mockResolvedValue({
      products: [{ id: 'p1' }],
    } as never);
    topProductsService.getTopProductsWithDetails.mockResolvedValue({
      products: [{ id: 'p2' }],
    } as never);
    topProductsService.getTopLicensesWithDetails.mockResolvedValue({
      products: [{ id: 'p3' }],
    } as never);
    const r = await controller.getHomepage({ lang: 'fr' });
    expect(r.carousel).toEqual([{ id: 's1' }]);
    expect(r.heroText).toEqual({ titleFr: 'a' });
    expect(r.topServices).toEqual([{ id: 'p1' }]);
    expect(r.topProducts).toEqual([{ id: 'p2' }]);
    expect(r.topLicenses).toEqual([{ id: 'p3' }]);
  });

  it('getHomepage works without lang', async () => {
    await controller.getHomepage();
    expect(topProductsService.getTopServicesWithDetails).toHaveBeenCalledWith(undefined);
  });

  it('getCarousel delegates', async () => {
    await controller.getCarousel();
    expect(carouselService.findAllPublic).toHaveBeenCalled();
  });

  it('getTopServices delegates with lang', async () => {
    await controller.getTopServices({ lang: 'en' });
    expect(topProductsService.getTopServicesWithDetails).toHaveBeenCalledWith('en');
  });

  it('getTopProducts delegates', async () => {
    await controller.getTopProducts({ lang: 'fr' });
    expect(topProductsService.getTopProductsWithDetails).toHaveBeenCalledWith('fr');
  });

  it('getTopLicenses delegates', async () => {
    await controller.getTopLicenses();
    expect(topProductsService.getTopLicensesWithDetails).toHaveBeenCalledWith(undefined);
  });

  it('createContactMessage emits event and returns message', async () => {
    contactMessageService.create.mockResolvedValue({
      id: 'm1',
      name: 'n',
      email: 'e',
      subject: 's',
    } as never);
    const r = await controller.createContactMessage({} as never);
    expect(eventsPublisher.emitContactMessageReceived).toHaveBeenCalledWith({
      messageId: 'm1',
      name: 'n',
      email: 'e',
      subject: 's',
    });
    expect(r).toMatchObject({ id: 'm1' });
  });

  it('adminGetCarousel delegates', async () => {
    await controller.adminGetCarousel();
    expect(carouselService.findAllAdmin).toHaveBeenCalled();
  });

  it('adminCreateSlide delegates', async () => {
    await controller.adminCreateSlide({} as never);
    expect(carouselService.create).toHaveBeenCalled();
  });

  it('adminUpdateSlide delegates with id+dto', async () => {
    await controller.adminUpdateSlide({ id: 'a', dto: {} as never });
    expect(carouselService.update).toHaveBeenCalledWith('a', expect.any(Object));
  });

  it('adminDeleteSlide returns success', async () => {
    const r = await controller.adminDeleteSlide({ id: 'a' });
    expect(carouselService.delete).toHaveBeenCalledWith('a');
    expect(r).toEqual({ success: true });
  });

  it('adminReorderCarousel forwards slideIds', async () => {
    await controller.adminReorderCarousel({ slideIds: ['a', 'b'] } as never);
    expect(carouselService.reorder).toHaveBeenCalledWith(['a', 'b']);
  });

  it('adminCarouselRequestUploadUrl delegates', async () => {
    await controller.adminCarouselRequestUploadUrl({} as never);
    expect(contentImageService.requestCarouselUploadUrl).toHaveBeenCalled();
  });

  it('adminGetHeroText delegates', async () => {
    await controller.adminGetHeroText();
    expect(heroTextService.get).toHaveBeenCalled();
  });

  it('adminUpdateHeroText delegates', async () => {
    await controller.adminUpdateHeroText({} as never);
    expect(heroTextService.update).toHaveBeenCalled();
  });

  it.each([
    ['adminGetTopServices', 'getTopServices'],
    ['adminGetTopProducts', 'getTopProducts'],
    ['adminGetTopLicenses', 'getTopLicenses'],
  ])('%s delegates to %s', async (method, target) => {
    await (controller as unknown as Record<string, () => Promise<unknown>>)[method]();
    expect((topProductsService as unknown as Record<string, jest.Mock>)[target]).toHaveBeenCalled();
  });

  it.each([
    ['adminUpdateTopServices', 'updateTopServices'],
    ['adminUpdateTopProducts', 'updateTopProducts'],
    ['adminUpdateTopLicenses', 'updateTopLicenses'],
  ])('%s delegates to %s', async (method, target) => {
    await (controller as unknown as Record<string, (d: unknown) => Promise<unknown>>)[method]({});
    expect((topProductsService as unknown as Record<string, jest.Mock>)[target]).toHaveBeenCalled();
  });

  it('adminToggleFeatured delegates', async () => {
    await controller.adminToggleFeatured({} as never);
    expect(topProductsService.toggleFeatured).toHaveBeenCalled();
  });

  it('getTopProductsFullSync delegates', async () => {
    topProductsService.getFullSyncSnapshot.mockResolvedValue({
      saasIds: [],
      physicalIds: [],
      licenseIds: [],
    });
    await controller.getTopProductsFullSync();
    expect(topProductsService.getFullSyncSnapshot).toHaveBeenCalled();
  });

  it('adminGetContactMessages delegates', async () => {
    await controller.adminGetContactMessages({} as never);
    expect(contactMessageService.findAll).toHaveBeenCalled();
  });

  it('adminUpdateContactMessage delegates with id+dto', async () => {
    await controller.adminUpdateContactMessage({ id: 'a', dto: {} as never });
    expect(contactMessageService.update).toHaveBeenCalledWith('a', expect.any(Object));
  });

  it('adminDeleteContactMessage returns success', async () => {
    const r = await controller.adminDeleteContactMessage({ id: 'a' });
    expect(contactMessageService.delete).toHaveBeenCalledWith('a');
    expect(r).toEqual({ success: true });
  });
});
