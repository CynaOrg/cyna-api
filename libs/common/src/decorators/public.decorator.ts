import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * @Public() decorator
 * Marks a route as public (no authentication required)
 *
 * Usage:
 * @Public()
 * @Get('categories')
 * getCategories() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
