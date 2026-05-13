import { Repository, SelectQueryBuilder, DataSource, EntityManager } from 'typeorm';

export type MockRepository<T extends object = object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

export const createMockRepository = <T extends object = object>(): MockRepository<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  findOneOrFail: jest.fn(),
  findAndCount: jest.fn().mockResolvedValue([[], 0]),
  create: jest.fn().mockImplementation((entity) => entity),
  save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
  insert: jest.fn(),
  update: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
  delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
  softDelete: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
  restore: jest.fn().mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] }),
  count: jest.fn().mockResolvedValue(0),
  exists: jest.fn().mockResolvedValue(false),
  increment: jest.fn(),
  decrement: jest.fn(),
  createQueryBuilder: jest.fn(
    () => createMockQueryBuilder<T>() as unknown as SelectQueryBuilder<T>,
  ),
  manager: {
    transaction: jest.fn(async (cb: (em: EntityManager) => Promise<unknown>) =>
      cb({} as EntityManager),
    ),
  } as unknown as jest.Mock,
});

export const createMockQueryBuilder = <T extends object = object>(): Partial<
  Record<keyof SelectQueryBuilder<T>, jest.Mock>
> => {
  const qb: Partial<Record<keyof SelectQueryBuilder<T>, jest.Mock>> = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    having: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    getRawOne: jest.fn().mockResolvedValue(null),
    getRawMany: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  return qb;
};

export const createMockDataSource = (): Partial<Record<keyof DataSource, jest.Mock>> => ({
  transaction: jest.fn(async (cb: (em: EntityManager) => Promise<unknown>) =>
    cb({} as EntityManager),
  ),
  createQueryRunner: jest.fn(() => ({
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {} as EntityManager,
  })) as unknown as jest.Mock,
});
