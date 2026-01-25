# CYNA — DTOs & Validation Rules

> **Version:** 1.0  
> **Date:** 21 janvier 2026  
> **Stack:** NestJS + class-validator + class-transformer  
> **Référence:** Data Model v1.4, API Endpoints Map v1.0

---

## 📋 Table des matières

1. [Conventions](#conventions)
2. [Common DTOs](#common-dtos)
3. [Auth Service DTOs](#1-auth-service-dtos)
4. [User Service DTOs](#2-user-service-dtos)
5. [Catalog Service DTOs](#3-catalog-service-dtos)
6. [Order Service DTOs](#4-order-service-dtos)
7. [Payment Service DTOs](#5-payment-service-dtos)
8. [Content Service DTOs](#6-content-service-dtos)
9. [Analytics Service DTOs](#7-analytics-service-dtos)
10. [Response DTOs](#8-response-dtos)

---

## Conventions

### Naming Convention

| Type | Convention | Exemple |
|------|------------|---------|
| Request DTO (création) | `Create{Entity}Dto` | `CreateUserDto` |
| Request DTO (mise à jour) | `Update{Entity}Dto` | `UpdateUserDto` |
| Request DTO (action) | `{Action}{Entity}Dto` | `LoginUserDto` |
| Response DTO | `{Entity}ResponseDto` | `UserResponseDto` |
| Query DTO | `{Entity}QueryDto` | `ProductQueryDto` |

### Validation Decorators (class-validator)

```typescript
import {
  IsString, IsEmail, IsOptional, IsNotEmpty, IsBoolean,
  IsNumber, IsInt, IsPositive, IsEnum, IsUUID, IsUrl,
  IsDateString, IsArray, ArrayMinSize, ArrayMaxSize,
  MinLength, MaxLength, Min, Max, Matches, ValidateNested,
  IsDecimal
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
```

### Password Rules

```typescript
// Minimum 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
@Matches(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  { message: 'validation.password.weak' }
)
```

### Internationalisation (i18n) des messages

Les messages de validation utilisent des **clés i18n** au lieu de textes en dur.

**Configuration NestJS avec nestjs-i18n:**
```typescript
// src/common/i18n/i18n.module.ts
import { I18nModule, AcceptLanguageResolver, HeaderResolver } from 'nestjs-i18n';
import * as path from 'path';

@Module({
  imports: [
    I18nModule.forRoot({
      fallbackLanguage: 'fr',
      loaderOptions: {
        path: path.join(__dirname, '/locales/'),
        watch: true,
      },
      resolvers: [
        new HeaderResolver(['x-lang', 'accept-language']),
        AcceptLanguageResolver,
      ],
    }),
  ],
})
export class I18nConfigModule {}
```

**Structure des fichiers de traduction:**
```
src/common/i18n/locales/
├── fr/
│   └── validation.json
└── en/
    └── validation.json
```

**Fichier de traduction FR (`fr/validation.json`):**
```json
{
  "password": {
    "weak": "Le mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule, un chiffre et un caractère spécial",
    "minLength": "Le mot de passe doit contenir au moins {min} caractères",
    "maxLength": "Le mot de passe ne doit pas dépasser {max} caractères"
  },
  "email": {
    "invalid": "L'adresse email n'est pas valide",
    "required": "L'adresse email est requise",
    "maxLength": "L'adresse email ne doit pas dépasser {max} caractères"
  },
  "string": {
    "required": "Ce champ est requis",
    "minLength": "Ce champ doit contenir au moins {min} caractères",
    "maxLength": "Ce champ ne doit pas dépasser {max} caractères"
  },
  "number": {
    "min": "La valeur doit être supérieure ou égale à {min}",
    "max": "La valeur doit être inférieure ou égale à {max}",
    "positive": "La valeur doit être positive",
    "integer": "La valeur doit être un nombre entier"
  },
  "phone": {
    "invalid": "Le numéro de téléphone n'est pas valide"
  },
  "slug": {
    "invalid": "Le slug doit contenir uniquement des lettres minuscules, des chiffres et des tirets"
  },
  "code2fa": {
    "invalid": "Le code doit contenir exactement 6 chiffres"
  },
  "confirmation": {
    "delete": "La confirmation doit être \"DELETE\""
  },
  "array": {
    "minSize": "Le tableau doit contenir au moins {min} élément(s)",
    "maxSize": "Le tableau ne doit pas contenir plus de {max} élément(s)"
  },
  "uuid": {
    "invalid": "L'identifiant n'est pas valide"
  },
  "enum": {
    "invalid": "La valeur doit être parmi: {values}"
  },
  "date": {
    "invalid": "La date n'est pas valide"
  },
  "url": {
    "invalid": "L'URL n'est pas valide"
  }
}
```

**Fichier de traduction EN (`en/validation.json`):**
```json
{
  "password": {
    "weak": "Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special character",
    "minLength": "Password must be at least {min} characters",
    "maxLength": "Password must not exceed {max} characters"
  },
  "email": {
    "invalid": "Email address is not valid",
    "required": "Email address is required",
    "maxLength": "Email must not exceed {max} characters"
  },
  "string": {
    "required": "This field is required",
    "minLength": "This field must be at least {min} characters",
    "maxLength": "This field must not exceed {max} characters"
  },
  "number": {
    "min": "Value must be greater than or equal to {min}",
    "max": "Value must be less than or equal to {max}",
    "positive": "Value must be positive",
    "integer": "Value must be an integer"
  },
  "phone": {
    "invalid": "Phone number is not valid"
  },
  "slug": {
    "invalid": "Slug must contain only lowercase letters, numbers and hyphens"
  },
  "code2fa": {
    "invalid": "Code must be exactly 6 digits"
  },
  "confirmation": {
    "delete": "Confirmation must be \"DELETE\""
  },
  "array": {
    "minSize": "Array must contain at least {min} element(s)",
    "maxSize": "Array must not contain more than {max} element(s)"
  },
  "uuid": {
    "invalid": "Identifier is not valid"
  },
  "enum": {
    "invalid": "Value must be one of: {values}"
  },
  "date": {
    "invalid": "Date is not valid"
  },
  "url": {
    "invalid": "URL is not valid"
  }
}
```

**Usage dans les DTOs avec clés i18n:**
```typescript
// Exemple avec clé i18n
@IsEmail({}, { message: 'validation.email.invalid' })
@MaxLength(255, { message: 'validation.email.maxLength' })
email: string;

// Avec paramètres dynamiques
@MinLength(8, { message: 'validation.password.minLength' })
@MaxLength(72, { message: 'validation.password.maxLength' })
password: string;
```

### Transformation

```typescript
// Trim whitespace
@Transform(({ value }) => value?.trim())

// Lowercase email
@Transform(({ value }) => value?.toLowerCase().trim())

// Parse boolean from string
@Transform(({ value }) => value === 'true' || value === true)

// Parse int from string
@Type(() => Number)
```

---

## Common DTOs

### PaginationQueryDto

```typescript
// src/common/dto/pagination-query.dto.ts

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

### PaginationResponseDto

```typescript
// src/common/dto/pagination-response.dto.ts

export class PaginationResponseDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
```

### AddressDto

```typescript
// src/common/dto/address.dto.ts

export class AddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  streetLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetLine2?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  city: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  postalCode: string;

  @IsNotEmpty()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => value?.toUpperCase())
  country: string = 'FR';

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-\.]+$/, { message: 'validation.phone.invalid' })
  phone?: string;
}
```

---

## 1. Auth Service DTOs

### 1.1 User Registration

#### CreateUserDto

```typescript
// src/auth/dto/create-user.dto.ts

export class CreateUserDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt max
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    { message: 'validation.password.weak' }
  )
  password: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  companyName?: string;

  @IsOptional()
  @IsEnum(['fr', 'en'])
  preferredLanguage?: 'fr' | 'en' = 'fr';
}
```

### 1.2 User Login

#### LoginUserDto

```typescript
// src/auth/dto/login-user.dto.ts

export class LoginUserDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  rememberMe?: boolean = false;
}
```

### 1.3 Email Verification

#### VerifyEmailDto

```typescript
// src/auth/dto/verify-email.dto.ts

export class VerifyEmailDto {
  @IsNotEmpty()
  @IsString()
  token: string;
}
```

#### ResendVerificationDto

```typescript
// src/auth/dto/resend-verification.dto.ts

export class ResendVerificationDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}
```

### 1.4 Password Reset

#### ForgotPasswordDto

```typescript
// src/auth/dto/forgot-password.dto.ts

export class ForgotPasswordDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;
}
```

#### ResetPasswordDto

```typescript
// src/auth/dto/reset-password.dto.ts

export class ResetPasswordDto {
  @IsNotEmpty()
  @IsString()
  token: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    { message: 'validation.password.weak' }
  )
  newPassword: string;
}
```

### 1.5 Admin Authentication

#### AdminLoginDto

```typescript
// src/auth/dto/admin-login.dto.ts

export class AdminLoginDto {
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}
```

#### Verify2FADto

```typescript
// src/auth/dto/verify-2fa.dto.ts

export class Verify2FADto {
  @IsNotEmpty()
  @IsString()
  tempToken: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'validation.code2fa.invalid' })
  code: string;
}
```

#### Resend2FADto

```typescript
// src/auth/dto/resend-2fa.dto.ts

export class Resend2FADto {
  @IsNotEmpty()
  @IsString()
  tempToken: string;
}
```

---

## 2. User Service DTOs

### 2.1 Profile Management

#### UpdateProfileDto

```typescript
// src/user/dto/update-profile.dto.ts

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  companyName?: string;

  @IsOptional()
  @IsEnum(['fr', 'en'])
  preferredLanguage?: 'fr' | 'en';
}
```

#### UpdateEmailDto

```typescript
// src/user/dto/update-email.dto.ts

export class UpdateEmailDto {
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  newEmail: string;

  @IsNotEmpty()
  @IsString()
  currentPassword: string;
}
```

#### UpdatePasswordDto

```typescript
// src/user/dto/update-password.dto.ts

export class UpdatePasswordDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    { message: 'validation.password.weak' }
  )
  newPassword: string;
}
```

#### DeleteAccountDto

```typescript
// src/user/dto/delete-account.dto.ts

export class DeleteAccountDto {
  @IsNotEmpty()
  @IsString()
  currentPassword: string;

  @IsNotEmpty()
  @IsString()
  @Equals('DELETE', { message: 'validation.confirmation.delete' })
  confirmation: string;
}
```

### 2.2 Address Management

#### CreateAddressDto

```typescript
// src/user/dto/create-address.dto.ts

export class CreateAddressDto extends AddressDto {
  @IsOptional()
  @IsBoolean()
  isDefaultBilling?: boolean = false;

  @IsOptional()
  @IsBoolean()
  isDefaultShipping?: boolean = false;
}
```

#### UpdateAddressDto

```typescript
// src/user/dto/update-address.dto.ts

export class UpdateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetLine1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  streetLine2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Transform(({ value }) => value?.toUpperCase())
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^\+?[0-9\s\-\.]+$/, { message: 'validation.phone.invalid' })
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isDefaultBilling?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefaultShipping?: boolean;
}
```

### 2.3 Admin User Management

#### AdminUserQueryDto

```typescript
// src/user/dto/admin-user-query.dto.ts

export class AdminUserQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsEnum(['createdAt', 'email', 'lastName'])
  sortBy?: 'createdAt' | 'email' | 'lastName' = 'createdAt';
}
```

#### UpdateUserStatusDto

```typescript
// src/user/dto/update-user-status.dto.ts

export class UpdateUserStatusDto {
  @IsNotEmpty()
  @IsBoolean()
  isActive: boolean;
}
```

---

## 3. Catalog Service DTOs

### 3.1 Category DTOs

#### CategoryQueryDto

```typescript
// src/catalog/dto/category-query.dto.ts

export class CategoryQueryDto {
  @IsOptional()
  @IsEnum(['fr', 'en'])
  lang?: 'fr' | 'en';
}
```

#### CreateCategoryDto

```typescript
// src/catalog/dto/create-category.dto.ts

export class CreateCategoryDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  nameFr: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  nameEn: string;

  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
```

#### UpdateCategoryDto

```typescript
// src/catalog/dto/update-category.dto.ts

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

### 3.2 Product DTOs

#### ProductQueryDto

```typescript
// src/catalog/dto/product-query.dto.ts

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @IsOptional()
  @IsEnum(['saas', 'digital', 'physical'])
  productType?: 'saas' | 'digital' | 'physical';

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsEnum(['displayOrder', 'priceMonthly', 'priceUnit', 'createdAt'])
  sortBy?: 'displayOrder' | 'priceMonthly' | 'priceUnit' | 'createdAt' = 'displayOrder';
}
```

#### SearchProductDto

```typescript
// src/catalog/dto/search-product.dto.ts

export class SearchProductDto extends ProductQueryDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  q: string;
}
```

#### ProductCharacteristicDto

```typescript
// src/catalog/dto/product-characteristic.dto.ts

export class ProductCharacteristicDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  keyFr: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  keyEn: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  valueFr: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  valueEn: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}
```

#### CreateProductDto

```typescript
// src/catalog/dto/create-product.dto.ts

export class CreateProductDto {
  @IsNotEmpty()
  @IsUUID()
  categoryId: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  sku: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  nameFr: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  nameEn: string;

  @IsNotEmpty()
  @IsString()
  descriptionFr: string;

  @IsNotEmpty()
  @IsString()
  descriptionEn: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescriptionFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescriptionEn?: string;

  @IsNotEmpty()
  @IsEnum(['saas', 'digital', 'physical'])
  productType: 'saas' | 'digital' | 'physical';

  // SaaS pricing (required if productType === 'saas')
  @ValidateIf(o => o.productType === 'saas')
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceMonthly?: number;

  @ValidateIf(o => o.productType === 'saas')
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceYearly?: number;

  // Unit pricing (required if productType === 'digital' or 'physical')
  @ValidateIf(o => o.productType === 'digital' || o.productType === 'physical')
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceUnit?: number;

  // Stock (required if productType === 'physical')
  @ValidateIf(o => o.productType === 'physical')
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number = 10;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean = true;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCharacteristicDto)
  characteristics?: ProductCharacteristicDto[];
}
```

#### UpdateProductDto

```typescript
// src/catalog/dto/update-product.dto.ts

export class UpdateProductDto {
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescriptionFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescriptionEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceYearly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  priceUnit?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCharacteristicDto)
  characteristics?: ProductCharacteristicDto[];
}
```

#### UpdateStockDto

```typescript
// src/catalog/dto/update-stock.dto.ts

export class UpdateStockDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number;
}
```

#### ReorderImagesDto

```typescript
// src/catalog/dto/reorder-images.dto.ts

export class ReorderImagesDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  imageIds: string[];
}
```

---

## 4. Order Service DTOs

### 4.1 Cart DTOs

#### AddCartItemDto

```typescript
// src/order/dto/add-cart-item.dto.ts

export class AddCartItemDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number = 1;
}
```

#### UpdateCartItemDto

```typescript
// src/order/dto/update-cart-item.dto.ts

export class UpdateCartItemDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity: number;
}
```

#### MergeCartDto

```typescript
// src/order/dto/merge-cart.dto.ts

export class MergeCartDto {
  @IsNotEmpty()
  @IsString()
  guestSessionId: string;
}
```

### 4.2 Checkout DTOs

#### StartCheckoutDto

```typescript
// src/order/dto/start-checkout.dto.ts

export class StartCheckoutDto {
  @ValidateIf(o => !o.isAuthenticated) // Contexte: user non connecté
  @IsNotEmpty()
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  guestEmail?: string;
}
```

#### CheckoutAddressDto

```typescript
// src/order/dto/checkout-address.dto.ts

export class CheckoutAddressDto {
  // Option 1: Utiliser une adresse existante
  @ValidateIf(o => !o.address)
  @IsNotEmpty()
  @IsUUID()
  addressId?: string;

  // Option 2: Nouvelle adresse
  @ValidateIf(o => !o.addressId)
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean = false;
}
```

### 4.3 Subscribe (SaaS Direct) DTOs

#### CreateSubscriptionDto

```typescript
// src/order/dto/create-subscription.dto.ts

export class CreateSubscriptionDto {
  @IsNotEmpty()
  @IsUUID()
  productId: string;

  @IsNotEmpty()
  @IsEnum(['monthly', 'yearly'])
  billingPeriod: 'monthly' | 'yearly';

  // Option 1: Adresse existante
  @ValidateIf(o => !o.billingAddress)
  @IsNotEmpty()
  @IsUUID()
  billingAddressId?: string;

  // Option 2: Nouvelle adresse
  @ValidateIf(o => !o.billingAddressId)
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress?: AddressDto;

  @IsOptional()
  @IsBoolean()
  saveAddress?: boolean = false;
}
```

### 4.4 Order Query DTOs

#### OrderQueryDto

```typescript
// src/order/dto/order-query.dto.ts

export class OrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'])
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}
```

#### AdminOrderQueryDto

```typescript
// src/order/dto/admin-order-query.dto.ts

export class AdminOrderQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded'])
  status?: string;

  @IsOptional()
  @IsEnum(['saas', 'digital', 'physical', 'mixed'])
  orderType?: 'saas' | 'digital' | 'physical' | 'mixed';

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsEnum(['createdAt', 'total', 'orderNumber'])
  sortBy?: 'createdAt' | 'total' | 'orderNumber' = 'createdAt';
}
```

#### UpdateOrderStatusDto

```typescript
// src/order/dto/update-order-status.dto.ts

export class UpdateOrderStatusDto {
  @IsNotEmpty()
  @IsEnum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'])
  status: string;

  @ValidateIf(o => o.status === 'shipped')
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  @ValidateIf(o => o.status === 'shipped')
  @IsOptional()
  @IsUrl()
  @MaxLength(500)
  trackingUrl?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

#### RefundOrderDto

```typescript
// src/order/dto/refund-order.dto.ts

export class RefundOrderDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

---

## 5. Payment Service DTOs

### 5.1 Payment Methods

#### SetDefaultPaymentMethodDto

```typescript
// src/payment/dto/set-default-payment-method.dto.ts

// No body needed, paymentMethodId is in URL param
```

### 5.2 Subscription Management

#### UpdateBillingPeriodDto

```typescript
// src/payment/dto/update-billing-period.dto.ts

export class UpdateBillingPeriodDto {
  @IsNotEmpty()
  @IsEnum(['monthly', 'yearly'])
  billingPeriod: 'monthly' | 'yearly';
}
```

#### CancelSubscriptionDto

```typescript
// src/payment/dto/cancel-subscription.dto.ts

export class CancelSubscriptionDto {
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean = true;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
```

### 5.3 Admin Subscription Management

#### AdminSubscriptionQueryDto

```typescript
// src/payment/dto/admin-subscription-query.dto.ts

export class AdminSubscriptionQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(['active', 'past_due', 'cancelled', 'unpaid', 'paused'])
  status?: 'active' | 'past_due' | 'cancelled' | 'unpaid' | 'paused';

  @IsOptional()
  @IsEnum(['createdAt', 'currentPeriodEnd', 'price'])
  sortBy?: 'createdAt' | 'currentPeriodEnd' | 'price' = 'createdAt';
}
```

#### AdminUpdateSubscriptionDto

```typescript
// src/payment/dto/admin-update-subscription.dto.ts

export class AdminUpdateSubscriptionDto {
  @IsNotEmpty()
  @IsEnum(['pause', 'resume', 'cancel_immediately'])
  action: 'pause' | 'resume' | 'cancel_immediately';
}
```

---

## 6. Content Service DTOs

### 6.1 Carousel DTOs

#### CreateCarouselSlideDto

```typescript
// src/content/dto/create-carousel-slide.dto.ts

export class CreateCarouselSlideDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  titleFr: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  titleEn: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtitleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtitleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  linkTextFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  linkTextEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
```

#### UpdateCarouselSlideDto

```typescript
// src/content/dto/update-carousel-slide.dto.ts

export class UpdateCarouselSlideDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtitleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subtitleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  linkTextFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  linkTextEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

#### ReorderCarouselDto

```typescript
// src/content/dto/reorder-carousel.dto.ts

export class ReorderCarouselDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  slideIds: string[];
}
```

### 6.2 Top Products DTOs

#### UpdateTopProductsDto

```typescript
// src/content/dto/update-top-products.dto.ts

export class UpdateTopProductsDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsUUID('4', { each: true })
  productIds: string[];
}
```

### 6.3 Hero Text DTO

#### UpdateHeroTextDto

```typescript
// src/content/dto/update-hero-text.dto.ts

export class UpdateHeroTextDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  titleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  titleEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subtitleEn?: string;
}
```

### 6.4 Contact DTOs

#### CreateContactMessageDto

```typescript
// src/content/dto/create-contact-message.dto.ts

export class CreateContactMessageDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => value?.trim())
  name: string;

  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => value?.trim())
  subject: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  message: string;
}
```

#### ContactMessageQueryDto

```typescript
// src/content/dto/contact-message-query.dto.ts

export class ContactMessageQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isProcessed?: boolean;

  @IsOptional()
  @IsEnum(['createdAt', 'isRead', 'isProcessed'])
  sortBy?: 'createdAt' | 'isRead' | 'isProcessed' = 'createdAt';
}
```

#### UpdateContactMessageDto

```typescript
// src/content/dto/update-contact-message.dto.ts

export class UpdateContactMessageDto {
  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @IsBoolean()
  isProcessed?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

---

## 7. Analytics Service DTOs

### 7.1 Dashboard Query DTOs

#### DashboardQueryDto

```typescript
// src/analytics/dto/dashboard-query.dto.ts

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(['today', 'week', 'month', 'year'])
  period?: 'today' | 'week' | 'month' | 'year' = 'month';
}
```

#### SalesQueryDto

```typescript
// src/analytics/dto/sales-query.dto.ts

export class SalesQueryDto {
  @IsOptional()
  @IsEnum(['week', 'month', 'quarter', 'year'])
  period?: 'week' | 'month' | 'quarter' | 'year' = 'month';

  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month' = 'day';
}
```

### 7.2 Export DTOs

#### ExportQueryDto

```typescript
// src/analytics/dto/export-query.dto.ts

export class ExportQueryDto {
  @IsNotEmpty()
  @IsDateString()
  dateFrom: string;

  @IsNotEmpty()
  @IsDateString()
  dateTo: string;

  @IsOptional()
  @IsEnum(['csv', 'xlsx'])
  format?: 'csv' | 'xlsx' = 'csv';
}
```

---

## 8. Response DTOs

### 8.1 Auth Response DTOs

#### AuthResponseDto

```typescript
// src/auth/dto/auth-response.dto.ts

export class AuthResponseDto {
  accessToken: string;
  expiresIn: number;
  user: UserResponseDto;
}
```

#### Admin2FAResponseDto

```typescript
// src/auth/dto/admin-2fa-response.dto.ts

export class Admin2FAResponseDto {
  requires2FA: boolean;
  tempToken: string;
  message: string;
}
```

#### AdminAuthResponseDto

```typescript
// src/auth/dto/admin-auth-response.dto.ts

export class AdminAuthResponseDto {
  accessToken: string;
  expiresIn: number;
  admin: AdminResponseDto;
}
```

### 8.2 User Response DTOs

#### UserResponseDto

```typescript
// src/user/dto/user-response.dto.ts

export class UserResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  preferredLanguage: 'fr' | 'en';
  isVerified: boolean;
  createdAt: Date;
}
```

#### AdminResponseDto

```typescript
// src/user/dto/admin-response.dto.ts

export class AdminResponseDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'super_admin' | 'commercial';
}
```

#### AddressResponseDto

```typescript
// src/user/dto/address-response.dto.ts

export class AddressResponseDto {
  id: string;
  label?: string;
  firstName: string;
  lastName: string;
  company?: string;
  streetLine1: string;
  streetLine2?: string;
  city: string;
  postalCode: string;
  country: string;
  phone?: string;
  isDefaultBilling: boolean;
  isDefaultShipping: boolean;
}
```

### 8.3 Catalog Response DTOs

#### CategoryResponseDto

```typescript
// src/catalog/dto/category-response.dto.ts

export class CategoryResponseDto {
  id: string;
  slug: string;
  name: string; // Localized
  description?: string; // Localized
  imageUrl?: string;
  displayOrder: number;
  productCount?: number;
}
```

#### ProductListResponseDto

```typescript
// src/catalog/dto/product-list-response.dto.ts

export class ProductListResponseDto {
  id: string;
  slug: string;
  sku: string;
  name: string; // Localized
  shortDescription?: string; // Localized
  productType: 'saas' | 'digital' | 'physical';
  priceMonthly?: number;
  priceYearly?: number;
  priceUnit?: number;
  isAvailable: boolean;
  isFeatured: boolean;
  primaryImage?: {
    url: string;
    altText?: string;
  };
  category: {
    id: string;
    slug: string;
    name: string;
  };
}
```

#### ProductDetailResponseDto

```typescript
// src/catalog/dto/product-detail-response.dto.ts

export class ProductDetailResponseDto extends ProductListResponseDto {
  description: string; // Localized
  stockQuantity?: number; // Only for physical
  images: {
    id: string;
    url: string;
    altText?: string;
    isPrimary: boolean;
    displayOrder: number;
  }[];
  characteristics: {
    key: string; // Localized
    value: string; // Localized
  }[];
  relatedProducts?: ProductListResponseDto[];
}
```

#### StockResponseDto

```typescript
// src/catalog/dto/stock-response.dto.ts

export class StockResponseDto {
  productId: string;
  productType: 'physical';
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  isAvailable: boolean;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}
```

### 8.4 Order Response DTOs

#### CartResponseDto

```typescript
// src/order/dto/cart-response.dto.ts

export class CartItemResponseDto {
  id: string;
  product: ProductListResponseDto;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export class CartResponseDto {
  id: string;
  items: CartItemResponseDto[];
  subtotal: number;
  itemCount: number;
  hasPhysicalProducts: boolean;
  hasDigitalProducts: boolean;
}
```

#### CheckoutResponseDto

```typescript
// src/order/dto/checkout-response.dto.ts

export class CheckoutResponseDto {
  checkoutId: string;
  expiresAt: Date;
  cart: CartResponseDto;
  stockReservations: {
    productId: string;
    quantity: number;
    expiresAt: Date;
  }[];
}
```

#### OrderListResponseDto

```typescript
// src/order/dto/order-list-response.dto.ts

export class OrderListResponseDto {
  id: string;
  orderNumber: string;
  status: string;
  orderType: 'saas' | 'digital' | 'physical' | 'mixed';
  total: number;
  currency: string;
  itemCount: number;
  createdAt: Date;
  paidAt?: Date;
  deliveredAt?: Date;
}
```

#### OrderDetailResponseDto

```typescript
// src/order/dto/order-detail-response.dto.ts

export class OrderItemResponseDto {
  id: string;
  productSnapshot: {
    name: string;
    sku: string;
  };
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  billingPeriod: 'monthly' | 'yearly' | 'one_time';
}

export class OrderDetailResponseDto {
  id: string;
  orderNumber: string;
  status: string;
  orderType: 'saas' | 'digital' | 'physical' | 'mixed';
  subtotal: number;
  taxAmount: number;
  shippingAmount: number;
  discountAmount: number;
  total: number;
  currency: string;
  items: OrderItemResponseDto[];
  billingAddress: AddressResponseDto;
  shippingAddress?: AddressResponseDto;
  trackingNumber?: string;
  trackingUrl?: string;
  createdAt: Date;
  paidAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
}
```

### 8.5 Subscription Response DTOs

#### SubscriptionResponseDto

```typescript
// src/payment/dto/subscription-response.dto.ts

export class SubscriptionResponseDto {
  id: string;
  product: {
    id: string;
    name: string;
    slug: string;
  };
  status: 'active' | 'past_due' | 'cancelled' | 'unpaid' | 'paused';
  billingPeriod: 'monthly' | 'yearly';
  price: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}
```

---

## 📋 Validation Rules Summary

### Password Requirements

| Rule | Requirement |
|------|-------------|
| Minimum length | 8 characters |
| Maximum length | 72 characters (bcrypt limit) |
| Uppercase | At least 1 |
| Lowercase | At least 1 |
| Number | At least 1 |
| Special character | At least 1 (`@$!%*?&`) |

### String Lengths

| Field | Min | Max |
|-------|-----|-----|
| Email | - | 255 |
| First/Last Name | - | 100 |
| Company Name | - | 255 |
| Product Name | - | 200 |
| Product Description | - | No limit |
| Short Description | - | 300 |
| SKU | - | 50 |
| Slug | - | 150 |
| Phone | - | 20 |
| Postal Code | - | 20 |
| Contact Message | 10 | 5000 |

### Numeric Constraints

| Field | Min | Max | Decimals |
|-------|-----|-----|----------|
| Page | 1 | - | 0 |
| Limit | 1 | 100 | 0 |
| Quantity | 1 | 99 | 0 |
| Price | 0.01 | - | 2 |
| Stock | 0 | - | 0 |
| Display Order | 0 | - | 0 |

### Country Codes

- Format: ISO 3166-1 alpha-2 (2 uppercase letters)
- Default: `FR`

### Slugs

- Format: lowercase alphanumeric with hyphens
- Regex: `/^[a-z0-9\-]+$/`

---

## 📋 Changelog

### v1.0 (21 janvier 2026)
- Version initiale
- DTOs pour 7 microservices
- Règles de validation complètes
- Response DTOs inclus
