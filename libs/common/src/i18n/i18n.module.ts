import { Module, Global } from '@nestjs/common';
import {
  I18nModule as NestI18nModule,
  AcceptLanguageResolver,
  HeaderResolver,
  QueryResolver,
} from 'nestjs-i18n';
import * as path from 'path';

/**
 * Get i18n locales path
 * In development, use the source path
 * In production, use the dist path
 */
function getLocalesPath(): string {
  const sourcePath = path.join(process.cwd(), 'libs', 'common', 'src', 'i18n', 'locales');

  // Always prefer source locales if available (works in dev and monorepo deploys)
  if (require('fs').existsSync(sourcePath)) {
    return sourcePath;
  }

  // Fallback to dist paths for production builds
  const distPaths = [
    path.join(process.cwd(), 'dist', 'locales'),
    path.join(process.cwd(), 'dist', 'apps', 'api-gateway', 'locales'),
  ];

  for (const p of distPaths) {
    if (require('fs').existsSync(p)) {
      return p;
    }
  }

  return sourcePath;
}

/**
 * i18n Module
 * Provides internationalization support for FR/EN
 */
@Global()
@Module({
  imports: [
    NestI18nModule.forRoot({
      fallbackLanguage: 'fr',
      loaderOptions: {
        path: getLocalesPath(),
        watch: process.env.NODE_ENV === 'development',
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        { use: HeaderResolver, options: ['x-lang', 'accept-language'] },
        AcceptLanguageResolver,
      ],
    }),
  ],
  exports: [NestI18nModule],
})
export class CynaI18nModule {}

/**
 * Supported languages
 */
export const SUPPORTED_LANGUAGES = ['fr', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/**
 * Check if a language is supported
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage);
}
