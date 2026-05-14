import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS, BillingPeriod } from '@cyna-api/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { AddCartItemDto, UpdateCartItemDto } from './dto';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

describe('CartController', () => {
  let controller: CartController;
  let orderClient: { send: jest.Mock };
  let service: CartService;

  beforeEach(async () => {
    orderClient = { send: jest.fn().mockReturnValue(of({ items: [] })) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CartController],
      providers: [CartService, { provide: SERVICE_NAMES.ORDER, useValue: orderClient }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CartController);
    service = module.get(CartService);
  });

  describe('getCart', () => {
    it('returns cart for authenticated user', async () => {
      orderClient.send.mockReturnValue(of({ items: [{ productId: 'p1' }] }));
      const result = await controller.getCart('user-1', undefined);
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.GET_CART, {
        userId: 'user-1',
        sessionId: undefined,
      });
      expect(result).toEqual({ items: [{ productId: 'p1' }] });
    });

    it('returns cart for guest with valid session UUID', async () => {
      orderClient.send.mockReturnValue(of({ items: [] }));
      await controller.getCart(undefined, VALID_UUID);
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.GET_CART, {
        userId: undefined,
        sessionId: VALID_UUID,
      });
    });

    it('throws BadRequestException when neither user nor session provided', async () => {
      await expect(controller.getCart(undefined, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(orderClient.send).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when sessionId is not a valid UUID', async () => {
      await expect(controller.getCart(undefined, 'not-a-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('addItem', () => {
    it('forwards add item request', async () => {
      const dto: AddCartItemDto = { productId: 'p1', quantity: 2 } as AddCartItemDto;
      await controller.addItem(dto, 'u1');
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.ADD_CART_ITEM, {
        userId: 'u1',
        sessionId: undefined,
        dto,
      });
    });

    it('rejects when no user / sessionId', async () => {
      await expect(
        controller.addItem({ productId: 'p1', quantity: 1 } as AddCartItemDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateItem', () => {
    it('forwards productId, dto and billingPeriod', async () => {
      const dto: UpdateCartItemDto = { quantity: 3 } as UpdateCartItemDto;
      await controller.updateItem('product-1', dto, BillingPeriod.MONTHLY, 'u1', undefined);
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.UPDATE_CART_ITEM, {
        userId: 'u1',
        sessionId: undefined,
        productId: 'product-1',
        dto,
        billingPeriod: BillingPeriod.MONTHLY,
      });
    });
  });

  describe('removeItem', () => {
    it('forwards productId and billingPeriod', async () => {
      await controller.removeItem('product-1', BillingPeriod.YEARLY, undefined, VALID_UUID);
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.REMOVE_CART_ITEM, {
        userId: undefined,
        sessionId: VALID_UUID,
        productId: 'product-1',
        billingPeriod: BillingPeriod.YEARLY,
      });
    });
  });

  describe('clearCart', () => {
    it('clears cart for authenticated user', async () => {
      await controller.clearCart('u1');
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.CLEAR_CART, {
        userId: 'u1',
        sessionId: undefined,
      });
    });

    it('throws when no auth/session', async () => {
      await expect(controller.clearCart(undefined, undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('mergeGuestCart', () => {
    it('merges with valid sessionId', async () => {
      await controller.mergeGuestCart('u1', VALID_UUID);
      expect(orderClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ORDER.MERGE_GUEST_CART, {
        userId: 'u1',
        sessionId: VALID_UUID,
      });
    });

    it('throws BadRequestException when sessionId is missing', async () => {
      await expect(controller.mergeGuestCart('u1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws BadRequestException when sessionId is not a valid UUID', async () => {
      await expect(controller.mergeGuestCart('u1', 'not-uuid')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('service is wired', () => {
    expect(service).toBeDefined();
  });
});
