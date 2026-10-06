import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { assertBcLocalEnvironment, BC_LOCAL_MODE } from './common/bc-local-config';
import { env } from './common/env';

/** Gagal cepat dengan pesan jelas bila apps/api/.env belum dibuat / masih placeholder. */
function assertDatabaseConfigured() {
  if (process.env.FUNDCHAIN_ENV === BC_LOCAL_MODE) {
    assertBcLocalEnvironment(process.env);
    return;
  }
  const bad = ['DATABASE_URL', 'DIRECT_URL'].filter((k) => !process.env[k] || process.env[k]!.includes('<'));
  if (bad.length === 0) return;
  console.error(
    [
      '',
      '✗ FundChain API tidak bisa start: ' + bad.join(' & ') + ' belum diisi.',
      '  1. Salin apps/api/.env.example menjadi apps/api/.env',
      '  2. Isi DATABASE_URL & DIRECT_URL dari Supabase (Connect → ORMs → Prisma) — minta ke pemilik project',
      '  Hanya mengerjakan frontend? Jalankan: pnpm dev:web:remote (memakai API production)',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

async function bootstrap() {
  assertDatabaseConfigured();
  // rawBody dibutuhkan untuk verifikasi signature webhook.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const cfg = env();
  const logger = new Logger('Bootstrap');

  configureApp(app);
  app.enableShutdownHooks();

  if (cfg.isProduction && cfg.demoMode) {
    logger.warn('DEMO_MODE aktif di produksi! Siapa pun bisa berpura-pura menjadi user lain.');
  }

  await app.listen(cfg.port);
  logger.log(`FundChain API → http://localhost:${cfg.port}/api/v1 (payment: ${cfg.paymentProvider})`);
}

bootstrap();
