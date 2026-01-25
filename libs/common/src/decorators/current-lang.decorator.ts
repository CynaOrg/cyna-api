import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

/**
 * @CurrentLang() decorator
 * Gets the current language from the request
 *
 * Usage:
 * @Get('products')
 * getProducts(@CurrentLang() lang: string) { ... }
 */
export const CurrentLang = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const i18nContext = I18nContext.current(ctx);
    return i18nContext?.lang || 'fr';
  },
);
