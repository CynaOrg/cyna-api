import { of } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';

export type MockClientProxy = {
  send: jest.Mock;
  emit: jest.Mock;
  connect: jest.Mock;
  close: jest.Mock;
};

export const createMockClientProxy = (defaultResponse: unknown = null): MockClientProxy => ({
  send: jest.fn(() => of(defaultResponse)),
  emit: jest.fn(() => of(undefined)),
  connect: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
});

export const asClientProxy = (mock: MockClientProxy): ClientProxy => mock as unknown as ClientProxy;
