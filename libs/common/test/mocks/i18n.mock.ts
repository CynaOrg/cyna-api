export const createMockI18nService = () => ({
  t: jest.fn((key: string, options?: { args?: Record<string, unknown>; lang?: string }) => {
    if (options?.args) {
      let result = key;
      for (const [k, v] of Object.entries(options.args)) {
        result = result.replace(`{${k}}`, String(v));
      }
      return result;
    }
    return key;
  }),
  translate: jest.fn((key: string, options?: { args?: Record<string, unknown>; lang?: string }) => {
    if (options?.args) {
      let result = key;
      for (const [k, v] of Object.entries(options.args)) {
        result = result.replace(`{${k}}`, String(v));
      }
      return result;
    }
    return key;
  }),
  getSupportedLanguages: jest.fn(() => ['fr', 'en']),
  resolveLanguage: jest.fn(() => 'fr'),
});

export type MockI18nService = ReturnType<typeof createMockI18nService>;
