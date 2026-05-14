export const createMockLogger = () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  fatal: jest.fn(),
  setContext: jest.fn(),
});

export type MockLogger = ReturnType<typeof createMockLogger>;
