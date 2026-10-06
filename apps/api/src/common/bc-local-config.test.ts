import { describe, expect, it } from 'vitest';
import { assertBcLocalDatabaseUrl, assertBcLocalEnvironment } from './bc-local-config';

const local = {
  FUNDCHAIN_ENV: 'bc-local',
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://fundchain:local@127.0.0.1:5433/fundchain_bc_dev?schema=public',
  DIRECT_URL: 'postgresql://fundchain:local@localhost:5433/fundchain_bc_dev?schema=public',
  PAYMENT_PROVIDER: 'mock',
  BLOCKCHAIN_NETWORK: 'localhost',
  BLOCKCHAIN_RPC_URL: 'http://127.0.0.1:8545',
  CHAIN_ID: '31337',
  WORKER_ENABLED: 'false',
};

describe('bc-local environment guard', () => {
  it('menerima kedua URL database lokal yang tepat', () => {
    expect(() => assertBcLocalEnvironment(local)).not.toThrow();
  });

  it.each([
    'postgresql://fundchain:local@db.example.com:5433/fundchain_bc_dev',
    'postgresql://fundchain:local@127.0.0.1:5432/fundchain_bc_dev',
    'postgresql://fundchain:local@127.0.0.1:5433/postgres',
  ])('menolak target database di luar invariant bc-local: %s', (url) => {
    expect(() => assertBcLocalDatabaseUrl('DATABASE_URL', url)).toThrow(/ditolak/);
  });

  it('menolak provider pembayaran non-mock', () => {
    expect(() => assertBcLocalEnvironment({ ...local, PAYMENT_PROVIDER: 'pakasir' })).toThrow(/mock/);
  });
});
