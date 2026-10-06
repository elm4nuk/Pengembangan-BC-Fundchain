import * as fs from 'node:fs';
import * as path from 'node:path';

export const BC_LOCAL_MODE = 'bc-local';
export const BC_LOCAL_DATABASE = 'fundchain_bc_dev';
export const BC_LOCAL_DATABASE_PORT = '5433';
export const BC_LOCAL_CHAIN_ID = '31337';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function required(config: Record<string, unknown>, name: string): string {
  const value = config[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`[bc-local] ${name} wajib diisi.`);
  return value.trim();
}

function parseUrl(name: string, raw: string): URL {
  try {
    return new URL(raw);
  } catch {
    throw new Error(`[bc-local] ${name} bukan URL yang valid.`);
  }
}

export function assertBcLocalDatabaseUrl(name: 'DATABASE_URL' | 'DIRECT_URL', raw: string): void {
  const url = parseUrl(name, raw);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`[bc-local] ${name} harus memakai PostgreSQL.`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname) || url.port !== BC_LOCAL_DATABASE_PORT || database !== BC_LOCAL_DATABASE) {
    throw new Error(
      `[bc-local] ${name} ditolak: target wajib ${BC_LOCAL_DATABASE} pada loopback port ${BC_LOCAL_DATABASE_PORT}.`,
    );
  }
  if (!url.username || !url.password) throw new Error(`[bc-local] ${name} wajib memiliki user dan password lokal.`);
}

function assertBcLocalRpcUrl(raw: string): void {
  const url = parseUrl('BLOCKCHAIN_RPC_URL', raw);
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname) || url.port !== '8545') {
    throw new Error('[bc-local] BLOCKCHAIN_RPC_URL wajib menunjuk loopback port 8545.');
  }
}

/** Validasi fail-closed untuk API bc-local; tidak pernah menerima target database remote. */
export function assertBcLocalEnvironment(config: Record<string, unknown>): void {
  if (required(config, 'FUNDCHAIN_ENV') !== BC_LOCAL_MODE) throw new Error('[bc-local] FUNDCHAIN_ENV harus bc-local.');
  assertBcLocalDatabaseUrl('DATABASE_URL', required(config, 'DATABASE_URL'));
  assertBcLocalDatabaseUrl('DIRECT_URL', required(config, 'DIRECT_URL'));
  if (required(config, 'NODE_ENV') === 'production') throw new Error('[bc-local] NODE_ENV=production ditolak.');
  if (required(config, 'PAYMENT_PROVIDER') !== 'mock') throw new Error('[bc-local] PAYMENT_PROVIDER wajib mock.');
  if (required(config, 'BLOCKCHAIN_NETWORK') !== 'localhost') {
    throw new Error('[bc-local] BLOCKCHAIN_NETWORK wajib localhost.');
  }
  assertBcLocalRpcUrl(required(config, 'BLOCKCHAIN_RPC_URL'));
  if (required(config, 'CHAIN_ID') !== BC_LOCAL_CHAIN_ID) throw new Error('[bc-local] CHAIN_ID wajib 31337.');
  const worker = required(config, 'WORKER_ENABLED').toLowerCase();
  if (!['true', 'false'].includes(worker)) throw new Error('[bc-local] WORKER_ENABLED harus true atau false.');
}

/** Pilih tepat satu env file. Mode bc-local melempar error bila file lokal hilang. */
export function apiEnvFilePath(): string[] {
  if (process.env.FUNDCHAIN_ENV !== BC_LOCAL_MODE) return ['.env'];
  const candidates = [
    path.resolve(process.cwd(), '.env.bc-local'),
    path.resolve(process.cwd(), 'apps/api/.env.bc-local'),
    path.resolve(__dirname, '../../.env.bc-local'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error('[bc-local] apps/api/.env.bc-local tidak ditemukan. Tidak akan fallback ke apps/api/.env.');
  }
  return [found];
}

export function validateApiEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  if (process.env.FUNDCHAIN_ENV === BC_LOCAL_MODE || config.FUNDCHAIN_ENV === BC_LOCAL_MODE) {
    assertBcLocalEnvironment(config);
  }
  return config;
}
