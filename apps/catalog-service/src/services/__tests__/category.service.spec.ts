import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CategoryService } from '../category.service';
import { Category } from '../../entities';
import { CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto } from '../../dto';
import { CynaLoggerService, CynaCacheService } from '@cyna-api/common';

// Mock du logger
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock du cache service
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPattern: jest.fn(),
  getOrSet: jest.fn(),
  invalidateDomain: jest.fn(),
  reset: jest.fn(),
};

// Fixture: categorie de base pour les tests
const createMockCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'cat-uuid-001',
  slug: 'services',
  nameFr: 'Services',
  nameEn: 'Services',
  descriptionFr: 'Description FR',
  descriptionEn: 'Description EN',
  imageUrl: 'https://example.com/image.png',
  displayOrder: 1,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  products: [],
  ...overrides,
});

// Tests du CategoryService
describe('CategoryService', () => {
  let service: CategoryService;
  let repository: jest.Mocked<Repository<Category>>;
  let queryBuilder: jest.Mocked<SelectQueryBuilder<Category>>;

  beforeEach(async () => {
    // Mock du QueryBuilder pour les requetes complexes
    queryBuilder = {
      leftJoin: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Category>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
          },
        },
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
        {
          provide: CynaCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    repository = module.get(getRepositoryToken(Category));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  beforeEach(() => {
    // Mock getOrSet to execute the factory function
    mockCacheService.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    // Mock get to return undefined (cache miss) by default
    mockCacheService.get.mockResolvedValue(undefined);
  });

  // Tests de creation d'une categorie
  describe('create()', () => {
    // Verifie qu'une categorie est creee avec un slug unique
    it('should create a category with unique slug', async () => {
      const dto: CreateCategoryDto = {
        slug: 'new-category',
        nameFr: 'Nouvelle Categorie',
        nameEn: 'New Category',
      };
      const expectedCategory = createMockCategory({
        slug: dto.slug,
        nameFr: dto.nameFr,
        nameEn: dto.nameEn,
      });

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(expectedCategory);
      repository.save.mockResolvedValue(expectedCategory);

      const result = await service.create(dto);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { slug: dto.slug } });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: dto.slug,
          nameFr: dto.nameFr,
          nameEn: dto.nameEn,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
      expect(result.slug).toBe(dto.slug);
    });

    // Verifie qu'une erreur 409 est levee si le slug existe deja
    it('should throw RpcException with 409 CATEGORY_SLUG_EXISTS if slug already exists', async () => {
      const dto: CreateCategoryDto = {
        slug: 'existing-slug',
        nameFr: 'Test',
        nameEn: 'Test',
      };
      const existingCategory = createMockCategory({ slug: dto.slug });

      repository.findOne.mockResolvedValue(existingCategory);

      await expect(service.create(dto)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 409,
          code: 'CATEGORY_SLUG_EXISTS',
        }),
      });
    });

    // Verifie que displayOrder et isActive ont des valeurs par defaut
    it('should use default values for displayOrder and isActive', async () => {
      const dto: CreateCategoryDto = {
        slug: 'test-category',
        nameFr: 'Test',
        nameEn: 'Test',
      };

      repository.findOne.mockResolvedValue(null);
      repository.create.mockReturnValue(createMockCategory(dto));
      repository.save.mockImplementation((cat) => Promise.resolve(cat as Category));

      await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          displayOrder: 0,
          isActive: true,
        }),
      );
    });
  });

  // Tests de recuperation de toutes les categories
  describe('findAll()', () => {
    // Verifie le filtrage par isActive
    it('should return categories filtered by isActive', async () => {
      const query: CategoryQueryDto = { isActive: true };
      const categories = [createMockCategory()];

      queryBuilder.getMany.mockResolvedValue(categories);

      const result = await service.findAll(query);

      expect(queryBuilder.where).toHaveBeenCalledWith('category.isActive = :isActive', {
        isActive: true,
      });
      expect(result).toEqual(categories);
    });

    // Verifie que les categories sont ordonnees par displayOrder
    it('should return categories ordered by displayOrder ASC', async () => {
      const query: CategoryQueryDto = {};
      const categories = [
        createMockCategory({ displayOrder: 1 }),
        createMockCategory({ displayOrder: 2 }),
      ];

      queryBuilder.getMany.mockResolvedValue(categories);

      await service.findAll(query);

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('category.displayOrder', 'ASC');
    });

    // Verifie que le filtre isActive n'est pas applique si non specifie
    it('should not filter by isActive if not specified', async () => {
      const query: CategoryQueryDto = {};

      queryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(query);

      expect(queryBuilder.where).not.toHaveBeenCalled();
    });
  });

  // Tests de recuperation d'une categorie par slug
  describe('findBySlug()', () => {
    // Verifie qu'une categorie avec ses produits est retournee
    it('should return category with its products', async () => {
      const slug = 'services';
      const category = createMockCategory({ slug });

      queryBuilder.getOne.mockResolvedValue(category);

      const result = await service.findBySlug(slug);

      expect(queryBuilder.where).toHaveBeenCalledWith('category.slug = :slug', { slug });
      expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'category.products',
        'product',
        'product.isAvailable = :isAvailable',
        { isAvailable: true },
      );
      expect(result).toEqual(category);
    });

    // Verifie qu'une erreur 404 est levee si la categorie n'existe pas
    it('should throw RpcException with 404 CATEGORY_NOT_FOUND if category does not exist', async () => {
      const slug = 'non-existent';

      queryBuilder.getOne.mockResolvedValue(null);

      await expect(service.findBySlug(slug)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
        }),
      });
    });
  });

  // Tests de mise a jour d'une categorie
  describe('update()', () => {
    // Verifie qu'une categorie est mise a jour correctement
    it('should update a category', async () => {
      const id = 'cat-uuid-001';
      const dto: UpdateCategoryDto = { nameFr: 'Updated Name' };
      const existingCategory = createMockCategory({ id });
      const updatedCategory = { ...existingCategory, ...dto };

      repository.findOne.mockResolvedValue(existingCategory);
      repository.save.mockResolvedValue(updatedCategory);

      const result = await service.update(id, dto);

      expect(repository.save).toHaveBeenCalled();
      expect(result.nameFr).toBe(dto.nameFr);
    });

    // Verifie qu'une erreur est levee si le nouveau slug existe deja
    it('should throw RpcException if new slug already exists', async () => {
      const id = 'cat-uuid-001';
      const dto: UpdateCategoryDto = { slug: 'existing-slug' };
      const existingCategory = createMockCategory({ id, slug: 'old-slug' });
      const anotherCategory = createMockCategory({ id: 'cat-uuid-002', slug: 'existing-slug' });

      repository.findOne
        .mockResolvedValueOnce(existingCategory) // findById
        .mockResolvedValueOnce(anotherCategory); // slug check

      await expect(service.update(id, dto)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 409,
          code: 'CATEGORY_SLUG_EXISTS',
        }),
      });
    });

    // Verifie que la mise a jour fonctionne si le slug reste identique
    it('should allow update when slug is the same', async () => {
      const id = 'cat-uuid-001';
      const dto: UpdateCategoryDto = { slug: 'services', nameFr: 'Updated' };
      const existingCategory = createMockCategory({ id, slug: 'services' });

      repository.findOne.mockResolvedValue(existingCategory);
      repository.save.mockResolvedValue({ ...existingCategory, ...dto });

      const result = await service.update(id, dto);

      expect(repository.save).toHaveBeenCalled();
      expect(result.nameFr).toBe(dto.nameFr);
    });
  });

  // Tests de suppression d'une categorie
  describe('delete()', () => {
    // Verifie qu'une categorie sans produits est supprimee
    it('should delete a category without products', async () => {
      const id = 'cat-uuid-001';
      const category = createMockCategory({ id, products: [] });

      repository.findOne.mockResolvedValue(category);
      repository.remove.mockResolvedValue(category);

      await service.delete(id);

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id },
        relations: ['products'],
      });
      expect(repository.remove).toHaveBeenCalledWith(category);
    });

    // Verifie qu'une erreur 409 est levee si la categorie a des produits
    it('should throw RpcException with 409 CATEGORY_HAS_PRODUCTS if category has products', async () => {
      const id = 'cat-uuid-001';
      const category = createMockCategory({
        id,
        products: [{ id: 'prod-001' } as unknown as import('../../entities').Product],
      });

      repository.findOne.mockResolvedValue(category);

      await expect(service.delete(id)).rejects.toThrow(RpcException);
      await expect(service.delete(id)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 409,
          code: 'CATEGORY_HAS_PRODUCTS',
        }),
      });
    });

    // Verifie qu'une erreur 404 est levee si la categorie n'existe pas
    it('should throw RpcException with 404 if category does not exist', async () => {
      const id = 'non-existent';

      repository.findOne.mockResolvedValue(null);

      await expect(service.delete(id)).rejects.toThrow(RpcException);
      await expect(service.delete(id)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
        }),
      });
    });
  });

  // Tests de findById
  describe('findById()', () => {
    // Verifie qu'une categorie est retournee par son ID
    it('should return category by id', async () => {
      const id = 'cat-uuid-001';
      const category = createMockCategory({ id });

      repository.findOne.mockResolvedValue(category);

      const result = await service.findById(id);

      expect(repository.findOne).toHaveBeenCalledWith({ where: { id } });
      expect(result).toEqual(category);
    });

    // Verifie qu'une erreur 404 est levee si l'ID n'existe pas
    it('should throw RpcException with 404 if category not found', async () => {
      const id = 'non-existent';

      repository.findOne.mockResolvedValue(null);

      await expect(service.findById(id)).rejects.toThrow(RpcException);
      await expect(service.findById(id)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
        }),
      });
    });

    it('should return cached category without hitting repository', async () => {
      const cached = createMockCategory({ id: 'cat-cached' });
      mockCacheService.get.mockResolvedValueOnce(cached);

      const result = await service.findById('cat-cached');

      expect(result).toEqual(cached);
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findBySlug() — cached', () => {
    it('should return cached category without hitting repository', async () => {
      const cached = createMockCategory({ slug: 'services-cached' });
      mockCacheService.get.mockResolvedValueOnce(cached);

      const result = await service.findBySlug('services-cached');

      expect(result).toEqual(cached);
      expect(queryBuilder.getOne).not.toHaveBeenCalled();
    });
  });

  describe('update() — extra branches', () => {
    it('should throw RpcException 404 when category does not exist', async () => {
      repository.findOne.mockResolvedValue(null);

      await expect(service.update('missing', { nameFr: 'X' })).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'CATEGORY_NOT_FOUND',
        }),
      });
    });

    it('should invalidate cache for new slug when slug is changed', async () => {
      const existing = createMockCategory({ id: 'cat-1', slug: 'old-slug' });
      repository.findOne
        .mockResolvedValueOnce(existing) // findById
        .mockResolvedValueOnce(null); // new slug not taken
      repository.save.mockImplementation((c) => Promise.resolve(c as Category));

      await service.update('cat-1', { slug: 'new-slug', nameFr: 'X' });

      // Verifie que del a ete appele avec une cle contenant le nouveau slug
      const delCalls = (mockCacheService.del as jest.Mock).mock.calls.flat();
      expect(delCalls.some((k: string) => typeof k === 'string' && k.includes('new-slug'))).toBe(
        true,
      );
    });
  });

  describe('reorder()', () => {
    it('should reorder categories and update displayOrder', async () => {
      const categoryIds = ['cat-1', 'cat-2', 'cat-3'];
      const categories = [
        createMockCategory({ id: 'cat-1', displayOrder: 5 }),
        createMockCategory({ id: 'cat-2', displayOrder: 5 }),
        createMockCategory({ id: 'cat-3', displayOrder: 5 }),
      ];

      repository.find
        .mockResolvedValueOnce(categories) // initial find
        .mockResolvedValueOnce(categories); // final reload
      repository.save.mockResolvedValue(categories as never);

      const result = await service.reorder(categoryIds);

      expect(categories[0].displayOrder).toBe(0);
      expect(categories[1].displayOrder).toBe(1);
      expect(categories[2].displayOrder).toBe(2);
      expect(repository.save).toHaveBeenCalledWith(categories);
      expect(result).toEqual(categories);
    });

    it('should throw RpcException 400 when some ids are missing', async () => {
      repository.find.mockResolvedValueOnce([createMockCategory({ id: 'cat-1' })]);

      await expect(service.reorder(['cat-1', 'cat-2'])).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 400,
          code: 'CATEGORY_INVALID_IDS',
        }),
      });
    });
  });
});
