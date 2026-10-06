import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadEnvFile } from 'node:process';
import { defineConfig } from 'prisma/config';
import { assertBcLocalEnvironment, BC_LOCAL_MODE } from './src/common/bc-local-config';

const localMode = process.env.FUNDCHAIN_ENV === BC_LOCAL_MODE;
const envPath = path.resolve(__dirname, localMode ? '.env.bc-local' : '.env');

if (localMode && !fs.existsSync(envPath)) {
  throw new Error('[bc-local] apps/api/.env.bc-local tidak ditemukan. Tidak akan fallback ke apps/api/.env.');
}
if (fs.existsSync(envPath)) loadEnvFile(envPath);
if (localMode) assertBcLocalEnvironment(process.env);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'pnpm exec ts-node --transpile-only prisma/seed.ts',
  },
});
