import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { UserAddressController } from './user-address.controller';
import { JwtAuthGuard } from '../auth/guards';

describe('Gateway UserAddressController', () => {
  let controller: UserAddressController;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn().mockReturnValue(of([])) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserAddressController],
      providers: [{ provide: SERVICE_NAMES.USER, useValue: client }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(UserAddressController);
  });

  it('GET list sends user.get_addresses with userId from JWT', async () => {
    await controller.list('u1');
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.GET_ADDRESSES, { userId: 'u1' });
  });

  it('POST create sends user.create_address with merged payload', async () => {
    client.send.mockReturnValue(of({ id: 'a1' }));
    await controller.create('u1', { label: 'L' } as any);
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.USER.CREATE_ADDRESS,
      expect.objectContaining({ userId: 'u1', label: 'L' }),
    );
  });

  it('PATCH update merges userId, id, and body', async () => {
    client.send.mockReturnValue(of({ id: 'a1' }));
    await controller.update('u1', 'a1', { label: 'X' } as any);
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.USER.UPDATE_ADDRESS,
      expect.objectContaining({ userId: 'u1', id: 'a1', label: 'X' }),
    );
  });

  it('DELETE sends user.delete_address', async () => {
    client.send.mockReturnValue(of(undefined));
    await controller.delete('u1', 'a1');
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.DELETE_ADDRESS, {
      userId: 'u1',
      id: 'a1',
    });
  });
});
