# User Service Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the user domain out of `auth-service` into a dedicated `user-service` microservice, aligned with the existing logical-microservices pattern (shared Postgres, isolated entities per service, cross-service via RabbitMQ).

**Architecture:** `user-service` becomes the sole owner of the `User` TypeORM entity. `auth-service` keeps credentials/session primitives (tokens, JWT, bcrypt) and calls `user-service` over RMQ for every read/write on `users`. API Gateway and payment-service switch their injection target from `AUTH_SERVICE` to `USER_SERVICE` for user-related patterns. Cross-service token invalidation uses `EVENT_PATTERNS.USER.*` events (fire-and-forget).

**Tech Stack:** NestJS 11, `@nestjs/microservices` (RabbitMQ transport), TypeORM, PostgreSQL 16, Jest, bcrypt, Railway.

**Source spec:** `docs/superpowers/specs/2026-04-23-user-service-extraction-design.md`

**Related files to keep open while working:**

- `apps/auth-service/src/services/auth.service.ts` (source of extracted logic)
- `apps/auth-service/src/services/admin-auth.service.ts` (source of admin user management)
- `apps/auth-service/src/main.ts` (template for `user-service/src/main.ts`)
- `apps/catalog-service/src/main.ts` (cross-reference)
- `libs/common/src/rabbitmq/patterns.ts` (patterns + events)

---

## Task 1: Scaffold `user-service` project structure

**Files:**

- Create: `apps/user-service/tsconfig.app.json`
- Create: `apps/user-service/src/main.ts`
- Create: `apps/user-service/src/user.module.ts`
- Modify: `nest-cli.json`
- Modify: `package.json`
- Modify: `docker-compose.yml`

- [ ] **Step 1.1: Create `apps/user-service/tsconfig.app.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "declaration": false,
    "outDir": "../../dist/apps/user-service"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

- [ ] **Step 1.2: Create `apps/user-service/src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ValidationPipe, Logger } from '@nestjs/common';
import { UserModule } from './user.module';

const logger = new Logger('UserService');

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(UserModule, {
    transport: Transport.RMQ,
    options: {
      urls: [rabbitmqUrl],
      queue: 'user.queue',
      queueOptions: {
        durable: true,
      },
      prefetchCount: 10,
      noAck: true,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  await app.listen();
  logger.log('User Service is listening on user.queue');
}

bootstrap();
```

- [ ] **Step 1.3: Create empty `apps/user-service/src/user.module.ts`**

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class UserModule {}
```

- [ ] **Step 1.4: Add `user-service` entry in `nest-cli.json`**

In the `projects` object, add after the existing `auth-service` entry:

```json
"user-service": {
  "type": "application",
  "root": "apps/user-service",
  "entryFile": "main",
  "sourceRoot": "apps/user-service/src",
  "compilerOptions": {
    "tsConfigPath": "apps/user-service/tsconfig.app.json"
  }
}
```

- [ ] **Step 1.5: Add `start:dev:user` script in `package.json`**

In the `scripts` object, add after `start:dev:auth`:

```json
"start:dev:user": "nest start user-service --watch",
```

Also update `start:dev:all` to include the user service. The new value:

```json
"start:dev:all": "concurrently -n gateway,auth,user,catalog,order,payment,notification,content,analytics -c blue,green,lightgreen,cyan,magenta,red,yellow,white,gray \"npm run start:dev:gateway\" \"npm run start:dev:auth\" \"npm run start:dev:user\" \"npm run start:dev:catalog\" \"npm run start:dev:order\" \"npm run start:dev:payment\" \"npm run start:dev:notification\" \"npm run start:dev:content\" \"npm run start:dev:analytics\"",
```

- [ ] **Step 1.6: Verify build compiles**

Run: `cd cyna-api && npm run build user-service`
Expected: build succeeds, `dist/apps/user-service/main.js` exists.

Run: `ls -la dist/apps/user-service/main.js`
Expected: file exists.

- [ ] **Step 1.7: Verify runtime bootstrap (RabbitMQ must be up)**

Run: `cd cyna-api && docker-compose up -d rabbitmq postgres redis`
Wait ~5 seconds for RabbitMQ to be healthy.
Run: `cd cyna-api && npm run start:dev:user`
Expected log line: `User Service is listening on user.queue`
Stop with Ctrl+C.

- [ ] **Step 1.8: Commit**

```bash
git add apps/user-service/tsconfig.app.json apps/user-service/src/main.ts apps/user-service/src/user.module.ts nest-cli.json package.json
git commit -m "feat(user-service): scaffold new user microservice

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Update MESSAGE_PATTERNS and move User entity

**Files:**

- Modify: `libs/common/src/rabbitmq/patterns.ts`
- Create: `apps/user-service/src/entities/user.entity.ts`
- Create: `apps/user-service/src/entities/index.ts`
- Modify: `apps/auth-service/src/entities/refresh-token.entity.ts` (remove ManyToOne User)
- Modify: `apps/auth-service/src/entities/email-verification-token.entity.ts` (remove ManyToOne User)
- Modify: `apps/auth-service/src/entities/password-reset-token.entity.ts` (remove ManyToOne User)
- Delete: `apps/auth-service/src/entities/user.entity.ts`
- Modify: `apps/auth-service/src/entities/index.ts` (remove user export)
- Modify: `apps/auth-service/src/auth.module.ts` (remove User from entities list)

- [ ] **Step 2.1: Update `libs/common/src/rabbitmq/patterns.ts` — add new USER patterns, remove user-related AUTH patterns**

In `MESSAGE_PATTERNS.AUTH`, **remove** these four lines:

```typescript
GET_USER_BY_ID: { cmd: 'auth.get_user_by_id' },
ADMIN_GET_USERS: { cmd: 'auth.admin_get_users' },
ADMIN_GET_USER: { cmd: 'auth.admin_get_user' },
ADMIN_UPDATE_USER_STATUS: { cmd: 'auth.admin_update_user_status' },
```

In `MESSAGE_PATTERNS.USER`, the existing block should become:

```typescript
USER: {
  GET_PROFILE: { cmd: 'user.get_profile' },
  UPDATE_PROFILE: { cmd: 'user.update_profile' },
  UPDATE_EMAIL: { cmd: 'user.update_email' },
  UPDATE_PASSWORD: { cmd: 'user.update_password' },
  UPDATE_LANGUAGE: { cmd: 'user.update_language' },
  DELETE_ACCOUNT: { cmd: 'user.delete_account' },
  GET_ADDRESSES: { cmd: 'user.get_addresses' },
  CREATE_ADDRESS: { cmd: 'user.create_address' },
  UPDATE_ADDRESS: { cmd: 'user.update_address' },
  DELETE_ADDRESS: { cmd: 'user.delete_address' },
  GET_SUBSCRIPTIONS: { cmd: 'user.get_subscriptions' },
  // Added for user-service extraction
  CREATE: { cmd: 'user.create' },
  FIND_BY_EMAIL: { cmd: 'user.find_by_email' },
  GET_BY_ID: { cmd: 'user.get_by_id' },
  MARK_VERIFIED: { cmd: 'user.mark_verified' },
  UPDATE_PASSWORD_HASH: { cmd: 'user.update_password_hash' },
  UPDATE_STRIPE_CUSTOMER_ID: { cmd: 'user.update_stripe_customer_id' },
  ADMIN_LIST: { cmd: 'user.admin_list' },
  ADMIN_GET: { cmd: 'user.admin_get' },
  ADMIN_UPDATE_STATUS: { cmd: 'user.admin_update_status' },
},
```

In `EVENT_PATTERNS.USER`, extend to include cross-service cleanup events:

```typescript
USER: {
  UPDATED: 'user.user.updated',
  DELETED: 'user.user.deleted',
  PASSWORD_CHANGED: 'user.password.changed',
},
```

- [ ] **Step 2.2: Create `apps/user-service/src/entities/user.entity.ts`**

Copy content from `apps/auth-service/src/entities/user.entity.ts` but remove all three `OneToMany` relations and the corresponding imports. Final file:

```typescript
import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, Language } from '@cyna-api/common';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_user_email')
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName?: string;

  @Column({ name: 'vat_number', type: 'varchar', length: 50, nullable: true })
  vatNumber?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({
    name: 'preferred_language',
    type: 'enum',
    enum: Language,
    default: Language.FR,
  })
  preferredLanguage: Language;

  @Column({
    name: 'stripe_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
  })
  @Index('idx_user_stripe')
  stripeCustomerId?: string;
}
```

- [ ] **Step 2.3: Create `apps/user-service/src/entities/index.ts`**

```typescript
export * from './user.entity';
```

- [ ] **Step 2.4: Remove the `ManyToOne User` relation from `apps/auth-service/src/entities/refresh-token.entity.ts`**

Delete the `User` import (line 10), delete the `@ManyToOne(() => User, ...)` block (lines 39-41), and the `user?: User` property. The resulting file:

```typescript
import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from './admin.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index('idx_refresh_user')
  userId?: string;

  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  @Index('idx_refresh_admin')
  adminId?: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_refresh_token')
  token: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Admin, (admin) => admin.refreshTokens, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin?: Admin;
}
```

- [ ] **Step 2.5: Remove the `ManyToOne User` relation from `apps/auth-service/src/entities/email-verification-token.entity.ts`**

Read the file first, then remove the `User` import, the `@ManyToOne(() => User, ...)` block, and the `user: User` property. The `userId: string` column stays.

- [ ] **Step 2.6: Remove the `ManyToOne User` relation from `apps/auth-service/src/entities/password-reset-token.entity.ts`**

Same approach as 2.5.

- [ ] **Step 2.7: Delete `apps/auth-service/src/entities/user.entity.ts`**

```bash
rm apps/auth-service/src/entities/user.entity.ts
```

- [ ] **Step 2.8: Update `apps/auth-service/src/entities/index.ts`**

Remove the line `export * from './user.entity';`.

- [ ] **Step 2.9: Remove `User` from `apps/auth-service/src/auth.module.ts`**

Search for `import { User }` in the file and remove it. In the `TypeOrmModule.forRoot({ entities: [...] })` block, remove `User` from the array. In the `TypeOrmModule.forFeature([...])` block, remove `User` too.

- [ ] **Step 2.10: Verify build passes (auth-service compiles without User)**

Run: `cd cyna-api && npm run build auth-service`
Expected: build fails with errors in `auth.service.ts`, `admin-auth.service.ts`, `auth.controller.ts`, and related specs because they still reference `User` and `userRepository`. This is EXPECTED — we'll fix them in Task 5. Do NOT commit yet if auth-service compilation is the only broken target.

Run: `cd cyna-api && npm run build user-service`
Expected: **PASSES**. user-service has no User-dependent code yet.

- [ ] **Step 2.11: Commit (even though auth-service is broken)**

This intermediate commit isolates the "entity relocation" change. The next tasks fix auth-service. We commit here so the rollback surface is clear.

```bash
git add libs/common/src/rabbitmq/patterns.ts \
  apps/user-service/src/entities/ \
  apps/auth-service/src/entities/ \
  apps/auth-service/src/auth.module.ts
git commit -m "refactor(user-service): move User entity and update RMQ patterns

Remove User entity from auth-service and its OneToMany relations.
Introduce new USER.* message patterns. auth-service build is
temporarily broken; subsequent commits wire the RMQ-based access.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Implement `UserService` with profile + credentials lookup handlers

**Files:**

- Create: `apps/user-service/src/services/user.service.ts`
- Create: `apps/user-service/src/services/user.service.spec.ts`
- Create: `apps/user-service/src/services/index.ts`
- Create: `apps/user-service/src/dto/create-user.dto.ts`
- Create: `apps/user-service/src/dto/index.ts`

- [ ] **Step 3.1: Create `apps/user-service/src/dto/create-user.dto.ts`**

This DTO is used by auth-service to request user creation via RMQ.

```typescript
import { IsEmail, IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { Language } from '@cyna-api/common';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(60) // bcrypt hashes are always 60 chars
  @MaxLength(255)
  passwordHash: string;

  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vatNumber?: string;

  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}
```

- [ ] **Step 3.2: Create `apps/user-service/src/dto/index.ts`**

```typescript
export * from './create-user.dto';
```

- [ ] **Step 3.3: Write `apps/user-service/src/services/user.service.spec.ts` (failing tests first)**

Reference the mocking pattern used in `apps/auth-service/src/services/auth.service.spec.ts` (TypeORM Repository mock with `getRepositoryToken(User)`).

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';
import { UserService } from './user.service';
import { User } from '../entities/user.entity';
import { Language, CynaLoggerService } from '@cyna-api/common';

describe('UserService', () => {
  let service: UserService;
  let userRepository: jest.Mocked<Repository<User>>;
  let eventsClient: jest.Mocked<ClientProxy>;
  const logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as CynaLoggerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: 'NOTIFICATION_SERVICE',
          useValue: { emit: jest.fn().mockReturnValue(of(undefined)) },
        },
        { provide: CynaLoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userRepository = module.get(getRepositoryToken(User));
    eventsClient = module.get('NOTIFICATION_SERVICE');
  });

  describe('create', () => {
    it('creates a user when email is free', async () => {
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue({ id: 'u1', email: 'a@b.c' } as User);
      userRepository.save.mockResolvedValue({ id: 'u1', email: 'a@b.c' } as User);

      const result = await service.create({
        email: 'a@b.c',
        passwordHash: '$2b$12$' + 'x'.repeat(53),
        firstName: 'A',
        lastName: 'B',
      });

      expect(userRepository.save).toHaveBeenCalled();
      expect(result.id).toBe('u1');
    });

    it('throws 409 RpcException when email exists', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'existing' } as User);
      await expect(
        service.create({
          email: 'a@b.c',
          passwordHash: '$2b$12$' + 'x'.repeat(53),
          firstName: 'A',
          lastName: 'B',
        }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('findByEmail', () => {
    it('returns user with passwordHash when found', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        passwordHash: 'hash',
        isActive: true,
        isVerified: true,
      } as User;
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.findByEmail('a@b.c');

      expect(result).toMatchObject({ id: 'u1', email: 'a@b.c', passwordHash: 'hash' });
    });

    it('returns null when not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      const result = await service.findByEmail('nobody@x.x');
      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns user when found', async () => {
      const user = { id: 'u1' } as User;
      userRepository.findOne.mockResolvedValue(user);
      expect(await service.getById('u1')).toEqual(user);
    });

    it('throws 404 RpcException when not found', async () => {
      userRepository.findOne.mockResolvedValue(null);
      await expect(service.getById('nope')).rejects.toThrow(RpcException);
    });
  });

  describe('getProfile', () => {
    it('returns UserResponseDto shape for active verified user', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        firstName: 'A',
        lastName: 'B',
        isActive: true,
        isVerified: true,
        preferredLanguage: Language.FR,
      } as User;
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.getProfile('u1');

      expect(result).toMatchObject({ id: 'u1', email: 'a@b.c', firstName: 'A' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws 403 when isActive=false', async () => {
      userRepository.findOne.mockResolvedValue({ id: 'u1', isActive: false } as User);
      await expect(service.getProfile('u1')).rejects.toThrow(RpcException);
    });
  });

  describe('markVerified', () => {
    it('sets isVerified=true', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 } as never);
      await service.markVerified('u1');
      expect(userRepository.update).toHaveBeenCalledWith({ id: 'u1' }, { isVerified: true });
    });
  });

  describe('updatePasswordHash', () => {
    it('sets new passwordHash by userId', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 } as never);
      await service.updatePasswordHash('u1', 'new_hash');
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { passwordHash: 'new_hash' },
      );
    });
  });

  describe('updateStripeCustomerId', () => {
    it('sets stripeCustomerId by userId', async () => {
      userRepository.update.mockResolvedValue({ affected: 1 } as never);
      await service.updateStripeCustomerId('u1', 'cus_123');
      expect(userRepository.update).toHaveBeenCalledWith(
        { id: 'u1' },
        { stripeCustomerId: 'cus_123' },
      );
    });
  });

  describe('updateProfile', () => {
    it('updates only provided fields', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        firstName: 'A',
        lastName: 'B',
        companyName: 'Old',
        isActive: true,
      } as User;
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, firstName: 'NewA' } as User);

      await service.updateProfile('u1', { firstName: 'NewA' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'NewA', lastName: 'B', companyName: 'Old' }),
      );
    });
  });

  describe('updatePassword', () => {
    it('rejects when current password is wrong', async () => {
      const user = { id: 'u1', email: 'a@b.c', passwordHash: 'old_hash', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(user);
      // @ts-expect-error testing private method via service level
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(false);

      await expect(
        service.updatePassword('u1', { currentPassword: 'wrong', newPassword: 'NewPw123!' }),
      ).rejects.toThrow(RpcException);
    });

    it('rejects when new password equals current password', async () => {
      const user = { id: 'u1', email: 'a@b.c', passwordHash: 'old_hash', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(user);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(true);

      await expect(
        service.updatePassword('u1', { currentPassword: 'same', newPassword: 'same' }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('updateLanguage', () => {
    it('updates preferredLanguage', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        isActive: true,
        preferredLanguage: Language.FR,
      } as User;
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, preferredLanguage: Language.EN } as User);

      await service.updateLanguage('u1', { preferredLanguage: Language.EN });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ preferredLanguage: Language.EN }),
      );
    });
  });

  describe('deleteAccount', () => {
    it('rejects when password is wrong', async () => {
      const user = { id: 'u1', email: 'a@b.c', passwordHash: 'h', isActive: true } as User;
      userRepository.findOne.mockResolvedValue(user);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(false);

      await expect(service.deleteAccount('u1', { password: 'wrong' })).rejects.toThrow(
        RpcException,
      );
    });

    it('sets isActive=false and emits user.deleted event', async () => {
      const user = {
        id: 'u1',
        email: 'a@b.c',
        passwordHash: 'h',
        isActive: true,
        stripeCustomerId: 'cus_1',
      } as User;
      userRepository.findOne.mockResolvedValue(user);
      userRepository.save.mockResolvedValue({ ...user, isActive: false } as User);
      jest
        .spyOn(
          service as unknown as { comparePassword: (p: string, h: string) => Promise<boolean> },
          'comparePassword',
        )
        .mockResolvedValue(true);

      await service.deleteAccount('u1', { password: 'correct' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(eventsClient.emit).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3.4: Run the tests to verify they fail (no UserService yet)**

Run: `cd cyna-api && npx jest apps/user-service/src/services/user.service.spec.ts`
Expected: FAIL with "Cannot find module './user.service'".

- [ ] **Step 3.5: Create `apps/user-service/src/services/user.service.ts`**

This service owns the User entity and exposes all profile/credentials operations. Use bcrypt directly for password operations (duplicated from `PasswordService` in auth-service — acceptable 2-line duplication).

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import * as bcrypt from 'bcrypt';
import {
  CynaLoggerService,
  Language,
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdateLanguageDto,
  DeleteAccountDto,
  SERVICE_NAMES,
  EVENT_PATTERNS,
} from '@cyna-api/common';
import { User } from '../entities/user.entity';
import { CreateUserDto } from '../dto/create-user.dto';

const BCRYPT_COST = 12;

export interface UserCredentialsView {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: Language;
}

export interface UserProfileView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  vatNumber?: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: Language;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  async create(dto: CreateUserDto): Promise<UserProfileView> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new RpcException({
        statusCode: 409,
        message: 'Email already registered',
        code: 'EMAIL_EXISTS',
      });
    }

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash: dto.passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      vatNumber: dto.vatNumber,
      preferredLanguage: dto.preferredLanguage ?? Language.FR,
      isVerified: false,
      isActive: true,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`User created: ${saved.email}`, 'UserService');
    return this.toProfileView(saved);
  }

  async findByEmail(email: string): Promise<UserCredentialsView | null> {
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      firstName: user.firstName,
      lastName: user.lastName,
      isActive: user.isActive,
      isVerified: user.isVerified,
      preferredLanguage: user.preferredLanguage,
    };
  }

  async getById(userId: string): Promise<UserProfileView> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    return this.toProfileView(user);
  }

  async markVerified(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { isVerified: true });
    this.logger.log(`User marked verified: ${userId}`, 'UserService');
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { passwordHash });
    this.logger.log(`Password hash updated for user: ${userId}`, 'UserService');
  }

  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { stripeCustomerId });
  }

  async getProfile(userId: string): Promise<UserProfileView> {
    const user = await this.findActiveUserOrThrow(userId);
    return this.toProfileView(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<{ message: string; user: UserProfileView }> {
    const user = await this.findActiveUserOrThrow(userId);
    if (dto.firstName !== undefined) user.firstName = dto.firstName;
    if (dto.lastName !== undefined) user.lastName = dto.lastName;
    if (dto.companyName !== undefined) user.companyName = dto.companyName;
    if (dto.vatNumber !== undefined) user.vatNumber = dto.vatNumber;
    const saved = await this.userRepository.save(user);
    this.logger.log(`Profile updated for user: ${saved.email}`, 'UserService');
    return { message: 'Profile updated successfully', user: this.toProfileView(saved) };
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto): Promise<{ message: string }> {
    const user = await this.findActiveUserOrThrow(userId);
    const valid = await this.comparePassword(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new RpcException({
        statusCode: 401,
        message: 'Current password is incorrect',
        code: 'INVALID_CURRENT_PASSWORD',
      });
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new RpcException({
        statusCode: 400,
        message: 'New password must be different from current password',
        code: 'SAME_PASSWORD',
      });
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);
    await this.userRepository.save(user);

    this.notificationClient.emit(EVENT_PATTERNS.USER.PASSWORD_CHANGED, {
      userId: user.id,
      email: user.email,
      language: user.preferredLanguage,
    });

    this.logger.log(`Password updated for user: ${user.email}`, 'UserService');
    return { message: 'Password updated successfully' };
  }

  async updateLanguage(
    userId: string,
    dto: UpdateLanguageDto,
  ): Promise<{ message: string; user: UserProfileView }> {
    const user = await this.findActiveUserOrThrow(userId);
    user.preferredLanguage = dto.preferredLanguage;
    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Language updated for user: ${saved.email} to ${dto.preferredLanguage}`,
      'UserService',
    );
    return { message: 'Language preference updated successfully', user: this.toProfileView(saved) };
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<{ message: string }> {
    const user = await this.findActiveUserOrThrow(userId);
    const valid = await this.comparePassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new RpcException({
        statusCode: 401,
        message: 'Password is incorrect',
        code: 'INVALID_PASSWORD',
      });
    }
    user.isActive = false;
    await this.userRepository.save(user);

    this.notificationClient.emit(EVENT_PATTERNS.USER.DELETED, {
      userId: user.id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
    });

    this.logger.log(`Account soft-deleted for user: ${user.email}`, 'UserService');
    return { message: 'Account deleted successfully' };
  }

  private async findActiveUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    if (!user.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }
    return user;
  }

  private async comparePassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  private toProfileView(user: User): UserProfileView {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      companyName: user.companyName,
      vatNumber: user.vatNumber,
      isActive: user.isActive,
      isVerified: user.isVerified,
      preferredLanguage: user.preferredLanguage,
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
```

- [ ] **Step 3.6: Create `apps/user-service/src/services/index.ts`**

```typescript
export * from './user.service';
```

- [ ] **Step 3.7: Run tests — expect pass**

Run: `cd cyna-api && npx jest apps/user-service/src/services/user.service.spec.ts`
Expected: all tests pass.

- [ ] **Step 3.8: Commit**

```bash
git add apps/user-service/src/services/ apps/user-service/src/dto/
git commit -m "feat(user-service): implement profile and credentials handlers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Implement `UserController` with all USER.\* patterns + wire the module

**Files:**

- Create: `apps/user-service/src/controllers/user.controller.ts`
- Create: `apps/user-service/src/controllers/user.controller.spec.ts`
- Create: `apps/user-service/src/controllers/index.ts`
- Modify: `apps/user-service/src/user.module.ts`

- [ ] **Step 4.1: Write `apps/user-service/src/controllers/user.controller.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from '../services/user.service';
import { Language } from '@cyna-api/common';

describe('UserController', () => {
  let controller: UserController;
  let service: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            getById: jest.fn(),
            markVerified: jest.fn(),
            updatePasswordHash: jest.fn(),
            updateStripeCustomerId: jest.fn(),
            getProfile: jest.fn(),
            updateProfile: jest.fn(),
            updatePassword: jest.fn(),
            updateLanguage: jest.fn(),
            deleteAccount: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get(UserController);
    service = module.get(UserService);
  });

  it('create → delegates to service.create', async () => {
    service.create.mockResolvedValue({ id: 'u1' } as never);
    await controller.create({ email: 'a@b.c', passwordHash: 'h', firstName: 'A', lastName: 'B' });
    expect(service.create).toHaveBeenCalled();
  });

  it('findByEmail → returns whatever service returns', async () => {
    service.findByEmail.mockResolvedValue({ id: 'u1', email: 'a@b.c', passwordHash: 'h' } as never);
    const res = await controller.findByEmail({ email: 'a@b.c' });
    expect(res?.id).toBe('u1');
  });

  it('getById → delegates', async () => {
    service.getById.mockResolvedValue({ id: 'u1' } as never);
    await controller.getById({ userId: 'u1' });
    expect(service.getById).toHaveBeenCalledWith('u1');
  });

  it('markVerified → fire-and-forget', async () => {
    await controller.markVerified({ userId: 'u1' });
    expect(service.markVerified).toHaveBeenCalledWith('u1');
  });

  it('updatePasswordHash → delegates', async () => {
    await controller.updatePasswordHash({ userId: 'u1', passwordHash: 'h' });
    expect(service.updatePasswordHash).toHaveBeenCalledWith('u1', 'h');
  });

  it('updateStripeCustomerId → delegates', async () => {
    await controller.updateStripeCustomerId({ userId: 'u1', stripeCustomerId: 'cus_1' });
    expect(service.updateStripeCustomerId).toHaveBeenCalledWith('u1', 'cus_1');
  });

  it('getProfile → delegates', async () => {
    await controller.getProfile({ userId: 'u1' });
    expect(service.getProfile).toHaveBeenCalledWith('u1');
  });

  it('updateProfile → strips userId and forwards dto', async () => {
    await controller.updateProfile({ userId: 'u1', firstName: 'N' });
    expect(service.updateProfile).toHaveBeenCalledWith('u1', { firstName: 'N' });
  });

  it('updatePassword → strips userId and forwards dto', async () => {
    await controller.updatePassword({ userId: 'u1', currentPassword: 'c', newPassword: 'n' });
    expect(service.updatePassword).toHaveBeenCalledWith('u1', {
      currentPassword: 'c',
      newPassword: 'n',
    });
  });

  it('updateLanguage → delegates', async () => {
    await controller.updateLanguage({ userId: 'u1', preferredLanguage: Language.EN });
    expect(service.updateLanguage).toHaveBeenCalledWith('u1', { preferredLanguage: Language.EN });
  });

  it('deleteAccount → delegates', async () => {
    await controller.deleteAccount({ userId: 'u1', password: 'p' });
    expect(service.deleteAccount).toHaveBeenCalledWith('u1', { password: 'p' });
  });
});
```

- [ ] **Step 4.2: Run spec — expect fail (no controller)**

Run: `cd cyna-api && npx jest apps/user-service/src/controllers/user.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Create `apps/user-service/src/controllers/user.controller.ts`**

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import {
  MESSAGE_PATTERNS,
  EVENT_PATTERNS,
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdateLanguageDto,
  DeleteAccountDto,
  Language,
} from '@cyna-api/common';
import { UserService } from '../services/user.service';
import { CreateUserDto } from '../dto/create-user.dto';

@Controller()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @MessagePattern(MESSAGE_PATTERNS.USER.CREATE)
  async create(@Payload() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.FIND_BY_EMAIL)
  async findByEmail(@Payload() data: { email: string }) {
    return this.userService.findByEmail(data.email);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.GET_BY_ID)
  async getById(@Payload() data: { userId: string }) {
    return this.userService.getById(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.MARK_VERIFIED)
  async markVerified(@Payload() data: { userId: string }) {
    await this.userService.markVerified(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD_HASH)
  async updatePasswordHash(@Payload() data: { userId: string; passwordHash: string }) {
    await this.userService.updatePasswordHash(data.userId, data.passwordHash);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_STRIPE_CUSTOMER_ID)
  async updateStripeCustomerId(@Payload() data: { userId: string; stripeCustomerId: string }) {
    await this.userService.updateStripeCustomerId(data.userId, data.stripeCustomerId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.GET_PROFILE)
  async getProfile(@Payload() data: { userId: string }) {
    return this.userService.getProfile(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PROFILE)
  async updateProfile(@Payload() data: { userId: string } & UpdateProfileDto) {
    const { userId, ...dto } = data;
    return this.userService.updateProfile(userId, dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD)
  async updatePassword(@Payload() data: { userId: string } & UpdatePasswordDto) {
    const { userId, ...dto } = data;
    return this.userService.updatePassword(userId, dto);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE)
  async updateLanguage(@Payload() data: { userId: string; preferredLanguage: Language }) {
    const { userId, preferredLanguage } = data;
    return this.userService.updateLanguage(userId, { preferredLanguage });
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT)
  async deleteAccount(@Payload() data: { userId: string } & DeleteAccountDto) {
    const { userId, ...dto } = data;
    return this.userService.deleteAccount(userId, dto);
  }
}
```

- [ ] **Step 4.4: Create `apps/user-service/src/controllers/index.ts`**

```typescript
export * from './user.controller';
```

- [ ] **Step 4.5: Wire `apps/user-service/src/user.module.ts`**

Look at `apps/catalog-service/src/catalog.module.ts` for the exact TypeOrmModule + ClientsModule pattern. The resulting file:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CommonModule, SERVICE_NAMES } from '@cyna-api/common';
import { User } from './entities/user.entity';
import { UserController } from './controllers/user.controller';
import { UserService } from './services/user.service';

@Module({
  imports: [
    CommonModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT || '5432', 10),
      username: process.env.DATABASE_USER || 'cyna',
      password: process.env.DATABASE_PASSWORD || 'cyna_dev',
      database: process.env.DATABASE_NAME || 'cyna_db',
      entities: [User],
      synchronize: process.env.DATABASE_SYNC === 'true',
      logging: process.env.DATABASE_LOGGING === 'true',
    }),
    TypeOrmModule.forFeature([User]),
    ClientsModule.registerAsync([
      {
        name: SERVICE_NAMES.NOTIFICATION,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
            queue: 'notification.emails',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}
```

> Note: verify the exact `CommonModule` import path and whether `ClientsModule.registerAsync` or `ClientsModule.register` is used in `catalog.module.ts`. Mirror whatever pattern exists there.

- [ ] **Step 4.6: Run controller spec**

Run: `cd cyna-api && npx jest apps/user-service/src/controllers/user.controller.spec.ts`
Expected: PASS.

- [ ] **Step 4.7: Run full user-service build**

Run: `cd cyna-api && npm run build user-service`
Expected: PASS.

- [ ] **Step 4.8: Boot the service and verify RMQ handlers register**

Run: `cd cyna-api && npm run start:dev:user`
Expected logs:

```
User Service is listening on user.queue
[RabbitMQConnection] Connected to amqp://...
```

Stop with Ctrl+C.

- [ ] **Step 4.9: Commit**

```bash
git add apps/user-service/src/controllers/ apps/user-service/src/user.module.ts
git commit -m "feat(user-service): implement USER.* message pattern handlers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Implement `UserAdminService` + `UserAdminController` (admin user management)

**Files:**

- Create: `apps/user-service/src/services/user-admin.service.ts`
- Create: `apps/user-service/src/services/user-admin.service.spec.ts`
- Create: `apps/user-service/src/controllers/user-admin.controller.ts`
- Create: `apps/user-service/src/controllers/user-admin.controller.spec.ts`
- Create: `apps/user-service/src/dto/admin-update-status.dto.ts`
- Modify: `apps/user-service/src/services/index.ts`
- Modify: `apps/user-service/src/controllers/index.ts`
- Modify: `apps/user-service/src/dto/index.ts`
- Modify: `apps/user-service/src/user.module.ts`

**Reference source:** `apps/auth-service/src/services/admin-auth.service.ts` lines handling `userRepository` (approx 300-395). Read those methods before writing the equivalent in `UserAdminService` — copy the business logic, adapt to the repository already held by `UserAdminService`.

- [ ] **Step 5.1: Create `apps/user-service/src/dto/admin-update-status.dto.ts`**

```typescript
import { IsBoolean } from 'class-validator';

export class AdminUpdateStatusDto {
  @IsBoolean()
  isActive: boolean;
}
```

- [ ] **Step 5.2: Write `apps/user-service/src/services/user-admin.service.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { UserAdminService } from './user-admin.service';
import { User } from '../entities/user.entity';
import { CynaLoggerService } from '@cyna-api/common';

describe('UserAdminService', () => {
  let service: UserAdminService;
  let userRepository: jest.Mocked<Repository<User>>;
  let qb: jest.Mocked<SelectQueryBuilder<User>>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<User>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAdminService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn().mockReturnValue(qb),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        { provide: CynaLoggerService, useValue: { log: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get(UserAdminService);
    userRepository = module.get(getRepositoryToken(User));
  });

  it('adminList returns paginated users', async () => {
    qb.getManyAndCount.mockResolvedValue([[{ id: 'u1' } as User], 1]);
    const res = await service.adminList({ page: 1, limit: 10 });
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it('adminGet throws 404 when not found', async () => {
    userRepository.findOne.mockResolvedValue(null);
    await expect(service.adminGet('missing')).rejects.toThrow(RpcException);
  });

  it('adminGet returns user when found', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'u1', email: 'a@b.c' } as User);
    const res = await service.adminGet('u1');
    expect(res.id).toBe('u1');
  });

  it('adminUpdateStatus updates isActive and returns user', async () => {
    const user = { id: 'u1', isActive: true } as User;
    userRepository.findOne.mockResolvedValue(user);
    userRepository.save.mockResolvedValue({ ...user, isActive: false } as User);
    const res = await service.adminUpdateStatus('u1', { isActive: false });
    expect(res.isActive).toBe(false);
  });
});
```

- [ ] **Step 5.3: Run spec — expect fail**

Run: `cd cyna-api && npx jest apps/user-service/src/services/user-admin.service.spec.ts`
Expected: FAIL.

- [ ] **Step 5.4: Create `apps/user-service/src/services/user-admin.service.ts`**

Before writing, read `apps/auth-service/src/services/admin-auth.service.ts` and find the method that currently handles `admin_get_users` (approx around line 310) — adapt its query-builder logic into `adminList` below. Same for `admin_get_user` and `admin_update_user_status`.

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { User } from '../entities/user.entity';
import { AdminUpdateStatusDto } from '../dto/admin-update-status.dto';

export interface AdminListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  isVerified?: boolean;
}

export interface AdminListResult {
  items: Array<Omit<User, 'passwordHash'>>;
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UserAdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly logger: CynaLoggerService,
  ) {}

  async adminList(query: AdminListQuery): Promise<AdminListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(user.email ILIKE :s OR user.firstName ILIKE :s OR user.lastName ILIKE :s OR user.companyName ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.isVerified !== undefined) {
      qb.andWhere('user.isVerified = :isVerified', { isVerified: query.isVerified });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(this.stripPasswordHash), total, page, limit };
  }

  async adminGet(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    return this.stripPasswordHash(user);
  }

  async adminUpdateStatus(
    userId: string,
    dto: AdminUpdateStatusDto,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    user.isActive = dto.isActive;
    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Admin ${dto.isActive ? 'activated' : 'deactivated'} user: ${saved.email}`,
      'UserAdminService',
    );
    return this.stripPasswordHash(saved);
  }

  private stripPasswordHash(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }
}
```

- [ ] **Step 5.5: Write `apps/user-service/src/controllers/user-admin.controller.spec.ts`**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserAdminController } from './user-admin.controller';
import { UserAdminService } from '../services/user-admin.service';

describe('UserAdminController', () => {
  let controller: UserAdminController;
  let service: jest.Mocked<UserAdminService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserAdminController],
      providers: [
        {
          provide: UserAdminService,
          useValue: {
            adminList: jest.fn(),
            adminGet: jest.fn(),
            adminUpdateStatus: jest.fn(),
          },
        },
      ],
    }).compile();
    controller = module.get(UserAdminController);
    service = module.get(UserAdminService);
  });

  it('adminList delegates to service', async () => {
    service.adminList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 });
    await controller.adminList({ page: 1, limit: 10 });
    expect(service.adminList).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('adminGet delegates', async () => {
    await controller.adminGet({ userId: 'u1' });
    expect(service.adminGet).toHaveBeenCalledWith('u1');
  });

  it('adminUpdateStatus delegates', async () => {
    await controller.adminUpdateStatus({ userId: 'u1', isActive: false });
    expect(service.adminUpdateStatus).toHaveBeenCalledWith('u1', { isActive: false });
  });
});
```

- [ ] **Step 5.6: Create `apps/user-service/src/controllers/user-admin.controller.ts`**

```typescript
import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { UserAdminService, AdminListQuery } from '../services/user-admin.service';
import { AdminUpdateStatusDto } from '../dto/admin-update-status.dto';

@Controller()
export class UserAdminController {
  constructor(private readonly userAdminService: UserAdminService) {}

  @MessagePattern(MESSAGE_PATTERNS.USER.ADMIN_LIST)
  async adminList(@Payload() query: AdminListQuery) {
    return this.userAdminService.adminList(query);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.ADMIN_GET)
  async adminGet(@Payload() data: { userId: string }) {
    return this.userAdminService.adminGet(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.ADMIN_UPDATE_STATUS)
  async adminUpdateStatus(@Payload() data: { userId: string } & AdminUpdateStatusDto) {
    const { userId, ...dto } = data;
    return this.userAdminService.adminUpdateStatus(userId, dto);
  }
}
```

- [ ] **Step 5.7: Update index.ts files**

`apps/user-service/src/services/index.ts`:

```typescript
export * from './user.service';
export * from './user-admin.service';
```

`apps/user-service/src/controllers/index.ts`:

```typescript
export * from './user.controller';
export * from './user-admin.controller';
```

`apps/user-service/src/dto/index.ts`:

```typescript
export * from './create-user.dto';
export * from './admin-update-status.dto';
```

- [ ] **Step 5.8: Wire `UserAdminController` + `UserAdminService` in `user.module.ts`**

Add `UserAdminController` to `controllers:` array and `UserAdminService` to `providers:` array in `apps/user-service/src/user.module.ts`.

- [ ] **Step 5.9: Run both user-service specs**

Run: `cd cyna-api && npx jest apps/user-service/`
Expected: all user-service specs pass.

- [ ] **Step 5.10: Build**

Run: `cd cyna-api && npm run build user-service`
Expected: PASS.

- [ ] **Step 5.11: Commit**

```bash
git add apps/user-service/src/controllers/user-admin.controller.ts \
  apps/user-service/src/controllers/user-admin.controller.spec.ts \
  apps/user-service/src/services/user-admin.service.ts \
  apps/user-service/src/services/user-admin.service.spec.ts \
  apps/user-service/src/dto/admin-update-status.dto.ts \
  apps/user-service/src/services/index.ts \
  apps/user-service/src/controllers/index.ts \
  apps/user-service/src/dto/index.ts \
  apps/user-service/src/user.module.ts
git commit -m "feat(user-service): implement admin user management handlers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Refactor `auth-service` to delegate user domain to `user-service` via RMQ

This is the largest and riskiest task. Do it in small sub-steps and run `auth-service` build after each. Do **NOT** skip the spec updates — they must match the new ClientProxy-based code.

**Files:**

- Modify: `apps/auth-service/src/auth.module.ts` (register USER_SERVICE client)
- Modify: `apps/auth-service/src/services/auth.service.ts` (replace `userRepository` with `userClient`)
- Modify: `apps/auth-service/src/services/admin-auth.service.ts` (remove user-management methods)
- Modify: `apps/auth-service/src/services/auth.service.spec.ts` (mock ClientProxy)
- Modify: `apps/auth-service/src/services/admin-auth.service.spec.ts` (remove deleted methods)
- Modify: `apps/auth-service/src/controllers/auth.controller.ts` (remove USER.\* handlers + GET_USER_BY_ID)
- Modify: `apps/auth-service/src/controllers/admin-auth.controller.ts` (remove ADMIN_GET_USERS, ADMIN_GET_USER, ADMIN_UPDATE_USER_STATUS)
- Modify: `apps/auth-service/src/dto/index.ts` (drop CreateUserDto if no longer used locally — verify first)

- [ ] **Step 6.1: Register USER_SERVICE ClientsModule in `auth.module.ts`**

Look at how `auth.module.ts` already declares `ClientsModule.register([...])` for NOTIFICATION_SERVICE (or registerAsync). Add a USER_SERVICE entry with the same pattern:

```typescript
{
  name: SERVICE_NAMES.USER,
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
    queue: 'user.queue',
    queueOptions: { durable: true },
  },
},
```

Import `SERVICE_NAMES` from `@cyna-api/common` if not already.

- [ ] **Step 6.2: Refactor `auth.service.ts` — constructor**

Replace `@InjectRepository(User) userRepository: Repository<User>` with `@Inject(SERVICE_NAMES.USER) userClient: ClientProxy`. Remove the `User` import. Imports needed:

```typescript
import { Inject } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError } from 'rxjs';
import { throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
```

Add a private helper for safe RMQ calls:

```typescript
private async callUserService<TResult, TPayload = unknown>(
  pattern: { cmd: string },
  payload: TPayload,
): Promise<TResult> {
  return firstValueFrom(
    this.userClient.send<TResult, TPayload>(pattern, payload).pipe(
      timeout(5000),
      retry(2),
      catchError((err) => {
        if (err && typeof err === 'object' && 'statusCode' in err) {
          return throwError(() => new RpcException(err as Record<string, unknown>));
        }
        return throwError(
          () =>
            new RpcException({
              statusCode: 503,
              message: 'User service unavailable',
              code: 'USER_SERVICE_UNAVAILABLE',
            }),
        );
      }),
    ),
  );
}
```

- [ ] **Step 6.3: Refactor `auth.service.ts` — register method**

```typescript
async register(dto: CreateUserDto): Promise<{ message: string; user: UserResponseDto }> {
  const passwordHash = await this.passwordService.hash(dto.password);

  const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.CREATE, {
    email: dto.email,
    passwordHash,
    firstName: dto.firstName,
    lastName: dto.lastName,
    companyName: dto.companyName,
    vatNumber: dto.vatNumber,
    preferredLanguage: dto.preferredLanguage,
  });

  const verificationToken = this.tokenService.generateSecureToken();
  const hashedToken = this.tokenService.hashToken(verificationToken);
  const expiresAt = new Date(Date.now() + this.emailVerificationExpiryHours * 60 * 60 * 1000);

  await this.emailVerificationTokenRepository.save(
    this.emailVerificationTokenRepository.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    }),
  );

  await this.authEventsPublisher.emitUserRegistered({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    verificationToken,
    language: user.preferredLanguage,
  });

  this.logger.log(`User registered: ${user.email}`, 'AuthService');

  return {
    message: 'Registration successful. Please check your email to verify your account.',
    user: UserResponseDto.fromProfileView(user),
  };
}
```

Note: `UserResponseDto.fromEntity(user)` must be adjusted to `fromProfileView` or similar since we no longer have a `User` entity here. If `UserResponseDto` is a simple DTO, either add a `fromProfileView` static or adapt its constructor. Inspect `apps/auth-service/src/dto/responses/` first.

**Define `UserProfileView`** locally at the top of `auth.service.ts` (or better, export it from a shared location like `libs/common/src/types/user-views.ts`):

```typescript
interface UserProfileView {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  vatNumber?: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: Language;
  stripeCustomerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface UserCredentialsView {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isVerified: boolean;
  preferredLanguage: Language;
}
```

> **Preferred approach:** export these two interfaces from `libs/common/src/types/user-views.ts` and re-export from `libs/common/src/index.ts` so both `auth-service` and `user-service` use the same types. Verify the existing barrel exports first.

- [ ] **Step 6.4: Refactor `auth.service.ts` — validateUser (login)**

```typescript
async validateUser(dto: LoginUserDto): Promise<AuthResponseDto> {
  const user = await this.callUserService<UserCredentialsView | null>(
    MESSAGE_PATTERNS.USER.FIND_BY_EMAIL,
    { email: dto.email },
  );

  if (!user) {
    throw new RpcException({
      statusCode: 401,
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });
  }

  if (!user.isActive) {
    throw new RpcException({
      statusCode: 403,
      message: 'Account is disabled',
      code: 'ACCOUNT_DISABLED',
    });
  }

  const isPasswordValid = await this.passwordService.compare(dto.password, user.passwordHash);
  if (!isPasswordValid) {
    throw new RpcException({
      statusCode: 401,
      message: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });
  }

  if (!user.isVerified) {
    throw new RpcException({
      statusCode: 403,
      message: 'Email not verified',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  const accessToken = this.tokenService.generateAccessToken({
    sub: user.id,
    email: user.email,
    type: 'user',
  });

  const refreshToken = await this.createRefreshToken(user.id, 'user');

  await this.authEventsPublisher.emitUserLogin(user.id);

  this.logger.log(`User logged in: ${user.email}`, 'AuthService');

  return {
    accessToken,
    refreshToken,
    expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
    user: UserResponseDto.fromCredentialsView(user),
  };
}
```

- [ ] **Step 6.5: Refactor `auth.service.ts` — verifyEmail**

```typescript
async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
  const hashedToken = this.tokenService.hashToken(token);

  const emailVerificationToken = await this.emailVerificationTokenRepository.findOne({
    where: { token: hashedToken, verifiedAt: IsNull() },
  });

  if (!emailVerificationToken) {
    throw new RpcException({
      statusCode: 400,
      message: 'Invalid or expired verification token',
      code: 'INVALID_TOKEN',
    });
  }

  if (emailVerificationToken.expiresAt < new Date()) {
    throw new RpcException({
      statusCode: 400,
      message: 'Verification token has expired',
      code: 'TOKEN_EXPIRED',
    });
  }

  const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
    userId: emailVerificationToken.userId,
  });

  await this.callUserService<void>(MESSAGE_PATTERNS.USER.MARK_VERIFIED, { userId: user.id });

  emailVerificationToken.verifiedAt = new Date();
  await this.emailVerificationTokenRepository.save(emailVerificationToken);

  await this.authEventsPublisher.emitUserVerified(user.id, user.email, user.preferredLanguage);

  this.logger.log(`Email verified for user: ${user.email}`, 'AuthService');

  return { success: true, message: 'Email verified successfully' };
}
```

- [ ] **Step 6.6: Refactor `auth.service.ts` — resendVerification**

Swap `userRepository.findOne({ where: { email } })` → `callUserService(USER.FIND_BY_EMAIL)`. The logic is the same otherwise. Handle null → silent success (anti-enumeration).

- [ ] **Step 6.7: Refactor `auth.service.ts` — forgotPassword**

Swap `userRepository.findOne({ where: { email } })` → `callUserService(USER.FIND_BY_EMAIL)`. Preserve silent-success behavior for unknown email.

- [ ] **Step 6.8: Refactor `auth.service.ts` — resetPassword**

```typescript
async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  const hashedToken = this.tokenService.hashToken(token);

  const passwordResetToken = await this.passwordResetTokenRepository.findOne({
    where: { token: hashedToken, usedAt: IsNull() },
  });

  if (!passwordResetToken) {
    throw new RpcException({ statusCode: 400, message: 'Invalid or expired reset token', code: 'INVALID_TOKEN' });
  }

  if (passwordResetToken.expiresAt < new Date()) {
    throw new RpcException({ statusCode: 400, message: 'Reset token has expired', code: 'TOKEN_EXPIRED' });
  }

  const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
    userId: passwordResetToken.userId,
  });

  const newHash = await this.passwordService.hash(newPassword);
  await this.callUserService<void>(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD_HASH, {
    userId: user.id,
    passwordHash: newHash,
  });

  passwordResetToken.usedAt = new Date();
  await this.passwordResetTokenRepository.save(passwordResetToken);

  await this.refreshTokenRepository.update(
    { userId: user.id, revokedAt: IsNull() },
    { revokedAt: new Date() },
  );

  await this.authEventsPublisher.emitPasswordResetCompleted(user.id, user.email, user.preferredLanguage);

  this.logger.log(`Password reset completed for user: ${user.email}`, 'AuthService');

  return { success: true, message: 'Password reset successfully' };
}
```

- [ ] **Step 6.9: Refactor `auth.service.ts` — refreshToken**

The current code does `relations: ['user']` to eager-load the User. After refactor, the entity no longer has this relation. Rewrite as two steps: find the refresh token row, then call `USER.GET_BY_ID` for the user data.

```typescript
async refreshToken(refreshTokenValue: string): Promise<AuthResponseDto> {
  const hashedToken = this.tokenService.hashToken(refreshTokenValue);

  // Active token lookup
  let refreshToken = await this.refreshTokenRepository.findOne({
    where: { token: hashedToken, revokedAt: IsNull() },
  });

  // Grace-period lookup for rapid double-refresh
  if (!refreshToken) {
    const graceCutoff = new Date(Date.now() - AuthService.REFRESH_TOKEN_GRACE_PERIOD_MS);
    refreshToken = await this.refreshTokenRepository.findOne({
      where: { token: hashedToken, revokedAt: MoreThan(graceCutoff) },
    });
    if (!refreshToken) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }
  } else if (refreshToken.expiresAt < new Date()) {
    throw new RpcException({
      statusCode: 401,
      message: 'Refresh token has expired',
      code: 'REFRESH_TOKEN_EXPIRED',
    });
  }

  if (!refreshToken.userId) {
    throw new RpcException({
      statusCode: 401,
      message: 'Invalid refresh token',
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
    userId: refreshToken.userId,
  });

  if (!user.isActive) {
    throw new RpcException({
      statusCode: 403,
      message: 'Account is disabled',
      code: 'ACCOUNT_DISABLED',
    });
  }

  // Revoke used token, mint new pair
  if (refreshToken.revokedAt === null || refreshToken.revokedAt === undefined) {
    refreshToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(refreshToken);
  }

  const accessToken = this.tokenService.generateAccessToken({
    sub: user.id,
    email: user.email,
    type: 'user',
  });

  const newRefreshToken = await this.createRefreshToken(user.id, 'user');

  this.logger.log(`Token refreshed for user: ${user.email}`, 'AuthService');

  return {
    accessToken,
    refreshToken: newRefreshToken,
    expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
    user: UserResponseDto.fromProfileView(user),
  };
}
```

- [ ] **Step 6.10: Remove the deleted methods from `auth.service.ts`**

Delete these methods entirely:

- `updateStripeCustomerId` (moves to user-service already via USER.UPDATE_STRIPE_CUSTOMER_ID)
- `findUserById` (replaced by USER.GET_BY_ID)
- `findActiveUserOrThrow` (private helper, unused after removals)
- `getProfile`
- `updateProfile`
- `updatePassword`
- `updateLanguage`
- `deleteAccount`

Keep: `register`, `validateUser`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`, `refreshToken`, `logout`, `createRefreshToken`, `cleanupExpiredTokens`.

- [ ] **Step 6.11: Add EventPattern handlers for cross-service cleanup**

When `USER.DELETED` or `USER.PASSWORD_CHANGED` events fire from user-service, auth-service must revoke the refresh tokens for that user.

In `auth.service.ts`, add:

```typescript
async revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await this.refreshTokenRepository.update(
    { userId, revokedAt: IsNull() },
    { revokedAt: new Date() },
  );
}
```

In `auth.controller.ts`, add:

```typescript
@EventPattern(EVENT_PATTERNS.USER.DELETED)
async handleUserDeleted(@Payload() data: { userId: string }) {
  await this.authService.revokeAllUserRefreshTokens(data.userId);
}

@EventPattern(EVENT_PATTERNS.USER.PASSWORD_CHANGED)
async handleUserPasswordChanged(@Payload() data: { userId: string }) {
  await this.authService.revokeAllUserRefreshTokens(data.userId);
}
```

Import `EVENT_PATTERNS` from `@cyna-api/common`.

- [ ] **Step 6.12: Remove deleted MessagePatterns from `auth.controller.ts`**

Delete the `@MessagePattern` blocks for:

- `MESSAGE_PATTERNS.AUTH.GET_USER_BY_ID`
- `MESSAGE_PATTERNS.USER.GET_PROFILE`
- `MESSAGE_PATTERNS.USER.UPDATE_PROFILE`
- `MESSAGE_PATTERNS.USER.UPDATE_PASSWORD`
- `MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE`
- `MESSAGE_PATTERNS.USER.DELETE_ACCOUNT`
- `@EventPattern('auth.update_stripe_customer_id')`

- [ ] **Step 6.13: Refactor `admin-auth.service.ts` — remove user-management methods**

Read the file. Delete methods handling `admin_get_users`, `admin_get_user`, `admin_update_user_status`. Remove the `userRepository` injection from the constructor. If the service becomes empty of user references, drop the `User` import. Keep all admin (backoffice employee) methods: `adminLogin`, `admin2FAVerify`, `adminRefreshToken`, `adminLogout`, `getAdmins`, `createAdmin`, etc.

- [ ] **Step 6.14: Remove deleted MessagePatterns from `admin-auth.controller.ts`**

Delete the `@MessagePattern` blocks for:

- `MESSAGE_PATTERNS.AUTH.ADMIN_GET_USERS`
- `MESSAGE_PATTERNS.AUTH.ADMIN_GET_USER`
- `MESSAGE_PATTERNS.AUTH.ADMIN_UPDATE_USER_STATUS`

(Keep admin-on-admin patterns: `ADMIN_GET_ADMINS`, `ADMIN_CREATE_ADMIN`, etc.)

- [ ] **Step 6.15: Update `auth.service.spec.ts`**

Replace `userRepository` mock with `userClient` mock. Example mock setup:

```typescript
import { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';

// in beforeEach providers:
{
  provide: 'USER_SERVICE',
  useValue: {
    send: jest.fn().mockReturnValue(of(null)),
    emit: jest.fn().mockReturnValue(of(undefined)),
  },
},
```

Update each test case that previously set `userRepository.findOne.mockResolvedValue(user)` → now set `userClient.send.mockReturnValue(of(user))`. Remove tests for `getProfile`, `updateProfile`, `updatePassword`, `updateLanguage`, `deleteAccount`, `updateStripeCustomerId`, `findUserById` — these moved to `user.service.spec.ts`.

Add new tests:

- `register` calls `userClient.send(USER.CREATE)` and uses the returned user id for the verification token.
- `validateUser` calls `userClient.send(USER.FIND_BY_EMAIL)` and handles null (401), inactive (403), wrong password (401), unverified (403), success (200).
- `verifyEmail` calls `USER.GET_BY_ID` then emits `USER.MARK_VERIFIED`.
- `forgotPassword` silently succeeds when USER.FIND_BY_EMAIL returns null.
- `resetPassword` calls `USER.UPDATE_PASSWORD_HASH` with new hash.
- `refreshToken` calls `USER.GET_BY_ID` and handles `isActive=false` → 403.
- `revokeAllUserRefreshTokens` updates refresh token rows by userId.

- [ ] **Step 6.16: Update `admin-auth.service.spec.ts`**

Delete test cases for the removed user-management methods. Keep all admin-on-admin tests. If the file has `userRepository` in its setup, remove it.

- [ ] **Step 6.17: Run auth-service tests**

Run: `cd cyna-api && npx jest apps/auth-service/`
Expected: PASS.

- [ ] **Step 6.18: Run auth-service build**

Run: `cd cyna-api && npm run build auth-service`
Expected: PASS.

- [ ] **Step 6.19: Commit**

```bash
git add apps/auth-service/ libs/common/src/types/ libs/common/src/index.ts
git commit -m "refactor(auth-service): delegate user domain to user-service via RMQ

Replace direct userRepository access with ClientProxy calls to
USER_SERVICE. Remove USER.* handlers from auth-controller and admin
user-management from admin-auth. Add EventPattern listeners for
USER.DELETED and USER.PASSWORD_CHANGED to revoke refresh tokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Refactor API Gateway + payment-service to target USER_SERVICE

**Files:**

- Modify: `apps/api-gateway/src/app.module.ts` (register USER_SERVICE client)
- Modify: `apps/api-gateway/src/profile/profile.service.ts` (switch injection)
- Modify: `apps/api-gateway/src/users/user-admin.controller.ts` (find its service and switch)
- Modify: `apps/payment-service/src/*` (replace emit of `auth.update_stripe_customer_id` with `USER.UPDATE_STRIPE_CUSTOMER_ID`)

- [ ] **Step 7.1: Pre-audit: grep all stale references before touching anything**

Run:

```bash
cd cyna-api && grep -rn "SERVICE_NAMES\.AUTH\b" apps/api-gateway/src apps/payment-service/src --include="*.ts"
grep -rn "MESSAGE_PATTERNS\.USER\." apps --include="*.ts"
grep -rn "auth.update_stripe_customer_id\|auth\.admin_get_users\|auth\.admin_get_user\|auth\.admin_update_user_status\|auth\.get_user_by_id" apps libs --include="*.ts"
```

Write down every file+line that appears. Each must be migrated or explicitly marked dead.

- [ ] **Step 7.2: Register USER_SERVICE in `apps/api-gateway/src/app.module.ts`**

Add inside the `ClientsModule.register` (or `registerAsync`) block:

```typescript
{
  name: SERVICE_NAMES.USER,
  transport: Transport.RMQ,
  options: {
    urls: [process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672'],
    queue: 'user.queue',
    queueOptions: { durable: true },
  },
},
```

- [ ] **Step 7.3: Update `apps/api-gateway/src/profile/profile.service.ts`**

Change `@Inject(SERVICE_NAMES.AUTH)` on line 18 → `@Inject(SERVICE_NAMES.USER)`. Rename the property `authClient` → `userClient` and update the body accordingly. The MESSAGE_PATTERNS references already use `MESSAGE_PATTERNS.USER.*` — no change needed there.

- [ ] **Step 7.4: Update the admin-user gateway controller**

Read `apps/api-gateway/src/users/user-admin.controller.ts` and its service dependency. Find references to `MESSAGE_PATTERNS.AUTH.ADMIN_GET_USERS` and friends → replace with `MESSAGE_PATTERNS.USER.ADMIN_LIST`, `USER.ADMIN_GET`, `USER.ADMIN_UPDATE_STATUS`. Switch the injected client from `SERVICE_NAMES.AUTH` to `SERVICE_NAMES.USER`.

If the gateway uses `AUTH.GET_USER_BY_ID` anywhere (e.g., in auth.service.ts of gateway for `@CurrentUser`), switch it to `USER.GET_BY_ID` with `SERVICE_NAMES.USER`.

- [ ] **Step 7.5: Update payment-service to target user-service for stripe customer id sync**

Find the `@EventPattern('auth.update_stripe_customer_id')` caller (most likely in a payment webhook handler). Replace the emit with:

```typescript
this.userClient.emit(MESSAGE_PATTERNS.USER.UPDATE_STRIPE_CUSTOMER_ID, {
  userId,
  stripeCustomerId,
});
```

Add `USER_SERVICE` to `payment.module.ts` `ClientsModule.register` (same block as step 7.2).

> If the existing payment-service uses `client.send(...)` instead of `emit(...)`, preserve the pattern — `send` goes as MessagePattern (USER.UPDATE_STRIPE_CUSTOMER_ID is declared under MESSAGE_PATTERNS).

- [ ] **Step 7.6: Rerun the grep checks from Step 7.1**

All references to the old patterns should be gone. If any remain in dead-code paths, decide whether to delete or stub them (preferred: delete).

- [ ] **Step 7.7: Build every service**

Run: `cd cyna-api && npm run build`
Expected: all services build.

- [ ] **Step 7.8: Run all tests**

Run: `cd cyna-api && npm run test`
Expected: PASS.

- [ ] **Step 7.9: Commit**

```bash
git add apps/api-gateway apps/payment-service
git commit -m "refactor(gateway,payment): route user patterns to user-service

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: docker-compose.yml entry for user-service (local dev)

**Files:**

- Modify: `cyna-api/docker-compose.yml`

- [ ] **Step 8.1: Add user-service block in `docker-compose.yml`**

Look at the auth-service block (if it exists) as a template. The block should mirror what auth-service does — same network, same depends_on (postgres, rabbitmq), same image/build context, same env var injection. If there's no auth-service block (services only come up via `npm run start:dev:*`), skip this step — the docker-compose currently only provisions infra (postgres, rabbitmq, redis) and that's fine.

Run: `grep -c "auth-service:" docker-compose.yml`

If 0 → skip Step 8.1 and 8.2, no change needed. Jump to Step 8.3 note.

If ≥1 → copy the full block and adapt service name, ports, env vars.

- [ ] **Step 8.2: Commit if changes were made**

```bash
git add docker-compose.yml
git commit -m "chore(infra): add user-service to local docker-compose

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 8.3: If no app containers in docker-compose, note the PR body**

The PR description must explicitly tell reviewers to run `npm run start:dev:user` locally (or `npm run start:dev:all` if updated in Task 1). This is informational only.

---

## Task 9: Security audit (agent dispatch)

**Files:** none modified directly — the agent produces a report.

- [ ] **Step 9.1: Dispatch `security-auditor` agent**

Use the Agent tool with subagent_type `security-auditor`. Prompt:

> Audit the security posture of the user-service extraction on branch `feat/user-service`. Focus areas:
>
> 1. `passwordHash` transiting via RabbitMQ (USER.FIND_BY_EMAIL return payload) — confirm the bus is internal and no log/telemetry captures payloads.
> 2. bcrypt cost factor 12 applied in both `UserService.updatePassword` and `PasswordService.hash`.
> 3. `admin.controller` in the API Gateway still enforces admin authz on `/admin/users/*` endpoints (no accidental exposure).
> 4. Event listeners `USER.DELETED` / `USER.PASSWORD_CHANGED` can't be spoofed from an external source.
> 5. Validation (class-validator) active on all new DTOs: `CreateUserDto`, `AdminUpdateStatusDto`.
> 6. `logger.log` / `logger.error` do not log `passwordHash` nor full user payloads in `UserService` and `AuthService`.
> 7. Rate limiting preserved on `POST /api/v1/profile/password`, `POST /api/v1/profile/delete`, `POST /api/v1/auth/login`, `POST /api/v1/auth/forgot-password`.
> 8. CORS and cookie config (HttpOnly, Secure, SameSite=Strict) unchanged on the gateway.
>
> Return findings ranked by severity. HIGH/CRITICAL findings must block the PR.

- [ ] **Step 9.2: Apply fixes if any HIGH/CRITICAL findings, commit as `fix(security): ...`**

If no findings → continue to Task 10.

---

## Task 10: Railway deployment (staging before merge)

**Files:** none (Railway CLI operations)

- [ ] **Step 10.1: Create user-service on Railway in production env**

Run:

```bash
cd cyna-api
railway add --service user-service --environment production
```

If the prompt asks for a GitHub source or deploy trigger, link it to `feat/user-service` branch path `cyna-api/`.

- [ ] **Step 10.2: Dump auth-service variables to use as template**

Run:

```bash
railway variables --service auth-service --environment production
```

Take note of which variables are references (`${{...}}`) vs inline literals.

- [ ] **Step 10.3: Set variables on user-service**

For each variable listed in the spec Section 9, run:

```bash
railway variables --service user-service --environment production --set DATABASE_HOST='${{Postgres.PGHOST}}'
railway variables --service user-service --environment production --set DATABASE_PORT='${{Postgres.PGPORT}}'
railway variables --service user-service --environment production --set DATABASE_USER='${{Postgres.PGUSER}}'
railway variables --service user-service --environment production --set DATABASE_PASSWORD='${{Postgres.PGPASSWORD}}'
railway variables --service user-service --environment production --set DATABASE_NAME='${{Postgres.PGDATABASE}}'
railway variables --service user-service --environment production --set DATABASE_SYNC='false'
railway variables --service user-service --environment production --set DATABASE_LOGGING='false'
railway variables --service user-service --environment production --set DATABASE_MIGRATIONS_RUN='false'
railway variables --service user-service --environment production --set RABBITMQ_URL='${{rabbitmq.RABBITMQ_URL}}'
railway variables --service user-service --environment production --set NODE_ENV='production'
railway variables --service user-service --environment production --set PORT='3005'
```

- [ ] **Step 10.4: Configure build/start commands**

Link the Railway service root to `cyna-api/` (via dashboard or CLI if supported). Set:

- Build: `npm ci && npm run build user-service`
- Start: `node dist/apps/user-service/main.js`

Verify the auth-service has identical build/start semantics to mirror.

- [ ] **Step 10.5: Push the branch and trigger deploy**

```bash
git push -u origin feat/user-service
railway up --service user-service --environment production --detach
```

- [ ] **Step 10.6: Tail the deploy logs**

Run:

```bash
railway logs --service user-service --environment production
```

Expected: eventually see `User Service is listening on user.queue`. Service status = `SUCCESS`.

- [ ] **Step 10.7: Verify it's healthy**

```bash
railway service status --service user-service --environment production --all | grep user-service
```

Expected output contains `SUCCESS`.

---

## Task 11: Smoke tests (local + prod)

**Files:** none modified — verification only.

Each test uses curl. Set `BASE_URL=http://localhost:3000` for local and `BASE_URL=https://<api-gateway-prod-url>` for prod. Run each test twice (local, then prod).

- [ ] **Step 11.1: Bootstrap test user**

```bash
export BASE_URL=http://localhost:3000  # or prod URL
export EMAIL="smoke-$(date +%s)@cyna.local"
curl -s -X POST $BASE_URL/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Test@1234!\",\"firstName\":\"Smoke\",\"lastName\":\"Test\",\"preferredLanguage\":\"FR\"}"
```

Expected: 200, user created, verification email enqueued.

- [ ] **Step 11.2: Manually mark user verified in DB (local only, to skip email)**

On prod, use the verification link from the real email.

Local: `docker exec -i cyna-postgres psql -U cyna cyna_db -c "UPDATE users SET is_verified = true WHERE email = '$EMAIL';"`

- [ ] **Step 11.3: Login and capture JWT**

```bash
curl -s -X POST $BASE_URL/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d "{\"email\":\"$EMAIL\",\"password\":\"Test@1234!\"}" | jq .
```

Expected: 200 with `accessToken`.
Capture: `export JWT=$(jq -r .accessToken < last_response.json)` — or extract from cookies.

- [ ] **Step 11.4: 18 smoke tests**

Run every test from the spec's Section 10 table (1-18). For each: expected status code + expected payload structure check with `jq`. Capture failures to a file.

Script scaffolding:

```bash
test() {
  local name=$1 expected=$2 actual=$3
  if [[ "$actual" == "$expected" ]]; then echo "✓ $name"; else echo "✗ $name expected=$expected got=$actual"; fi
}

# Test 1: GET /profile
status=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/v1/profile -H "Authorization: Bearer $JWT")
test "GET /profile" 200 $status

# ... (repeat for all 18)
```

Expected: all 18 tests pass.

- [ ] **Step 11.5: Monitor logs during and after**

```bash
railway logs --service user-service --environment production | grep -E "ERROR|WARN" &
railway logs --service auth-service --environment production | grep -E "ERROR|WARN" &
```

Wait 5 minutes with normal traffic. No ERROR level logs expected.

- [ ] **Step 11.6: Compare response shapes before/after**

Pick 3 key endpoints (`GET /profile`, `POST /auth/login`, `GET /admin/users`). On main (previous prod), capture the JSON response structure. On `feat/user-service`, capture again. Diff. Zero structural change expected.

---

## Task 12: PR + squash merge

**Files:** none (git/gh operations)

- [ ] **Step 12.1: Push branch**

```bash
git push origin feat/user-service
```

- [ ] **Step 12.2: Create PR**

```bash
gh pr create --title "feat(user-service): extract user domain from auth-service" --body "$(cat <<'EOF'
## Description

Extracts the user domain out of `auth-service` into a dedicated `user-service` microservice. Aligned with the existing logical-microservices pattern (shared PostgreSQL, isolated entities per service, cross-service via RabbitMQ).

## Type of change
- [x] Refactoring
- [x] New feature (user-service)

## What changed
- New `user-service` (queue `user.queue`, port 3005)
- `User` entity and all profile/admin patterns moved to user-service
- `auth-service` now calls user-service via RMQ for user lookups/updates
- API Gateway and payment-service re-routed to USER_SERVICE

## Checklist
- [x] Tests added/updated (user-service + auth-service specs)
- [x] Security audit passed (see security-auditor report in commits)
- [x] Spec document committed: `docs/superpowers/specs/2026-04-23-user-service-extraction-design.md`
- [x] Smoke tests 1-18 passing locally and in Railway production staging
- [x] docker-compose / local dev updated

## ⚠️ Reviewer note
After merge, pull main and run: `docker-compose down && docker-compose up -d && npm run start:dev:all`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 12.3: Wait for CI green**

```bash
gh pr checks --watch
```

Expected: all checks pass.

- [ ] **Step 12.4: Run post-deploy smoke tests one more time (prod)**

Re-run Task 11 tests against production BASE_URL.

- [ ] **Step 12.5: Squash merge**

```bash
gh pr merge --squash --subject "feat(user-service): extract user domain from auth into dedicated microservice" --delete-branch
```

- [ ] **Step 12.6: Observe prod redeploys**

```bash
railway logs --service auth-service --environment production &
railway logs --service api-gateway --environment production &
railway logs --service payment-service --environment production &
```

Expected: all three services redeploy cleanly. No ERROR logs.

- [ ] **Step 12.7: Final prod smoke test**

Re-run the 3 most critical tests: login, get profile, reset password. All 200. Done.

---

## Self-Review (performed before handoff)

**Spec coverage check:**

- Contexte/Problème (spec §1) → covered by Task 1 preamble + Tasks 2-6 extracting the items called out as indésirable.
- Objectif (spec §2) → Task 3 (user-service ownership), Task 6 (auth-service delegation), Task 7 (gateway + payment re-routing).
- DB shared, entities isolated (spec §3) → Task 2 (entity relocation, no migration), Task 4 (user.module TypeORM config).
- Responsibility split (spec §4) → Tasks 3-5 implement both USER.\* and admin patterns in user-service; Task 6 removes them from auth.
- Cross-service flows (spec §5) → Task 6 wires register/login/verify/forgot/reset/refreshToken through callUserService.
- Arborescence (spec §6) → Task 1 scaffold + Tasks 3-5 populate entities/services/controllers/dto.
- Collateral mods (spec §7) → Task 7.
- Phases (spec §8) → Tasks 1-10 cover phases 0-9; Task 9 maps to phase 8 (security), Task 10 maps to R1-R6.
- Railway (spec §9) → Task 10.
- Smoke tests (spec §10) → Task 11.
- Risks (spec §11) → mitigations woven into tasks: timeout+retry wrappers (6.2), user-service deployed before merge (10.5 before 12.5), grep for stale refs (7.1), spec updates (6.15), event-based token revocation (6.11).
- Team (spec §12) → Task 9 dispatches security-auditor; other agents invoked implicitly during their phases.

No gaps found.

**Placeholder scan:** One soft spot — the `UserResponseDto.fromProfileView` / `fromCredentialsView` static methods are referenced in Task 6 but their implementation isn't spelled out. Resolved by stating "inspect `apps/auth-service/src/dto/responses/` first" and the engineer will either add the static method or adapt the caller. This is acceptable because it's a trivial 3-line DTO shape mapping that depends on the current DTO file the engineer will open.

**Type consistency:** `UserProfileView` and `UserCredentialsView` types are defined once in Task 3 (inline in `user.service.ts`) and re-declared in Task 6.3. The plan notes the **preferred approach** of extracting them to `libs/common/src/types/user-views.ts` — the engineer should do that to avoid duplication. Flagged explicitly.

**Consistency audit:** queue name `user.queue` (dotted) is used consistently (Tasks 1, 4, 6.1, 7.2). `SERVICE_NAMES.USER` / `USER_SERVICE` consistent. `MESSAGE_PATTERNS.USER.*` consistent. Event patterns `EVENT_PATTERNS.USER.DELETED` / `PASSWORD_CHANGED` consistent.

Plan ready for execution.
