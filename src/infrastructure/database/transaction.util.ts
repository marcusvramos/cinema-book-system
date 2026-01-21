import { DataSource, EntityManager, QueryRunner } from 'typeorm';

export type IsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
}

export async function executeInTransaction<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { isolationLevel = 'READ COMMITTED' } = options;

  const queryRunner: QueryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction(isolationLevel);

  try {
    const result = await fn(queryRunner.manager);
    await queryRunner.commitTransaction();
    return result;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

export async function executeInSerializableTransaction<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return executeInTransaction(dataSource, fn, { isolationLevel: 'SERIALIZABLE' });
}
