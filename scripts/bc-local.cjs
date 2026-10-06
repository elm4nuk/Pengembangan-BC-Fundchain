#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'apps', 'api');
const contractsDir = path.join(root, 'contracts');
const envFile = path.join(apiDir, '.env.bc-local');
const expectedNodeMajor = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
const hardhatDevRelayerKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const hardhatDevRelayerAddress = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';

function fail(message) {
  console.error(`\n[bc-local] ${message}\n`);
  process.exit(1);
}

function parseDotEnv(content) {
  const result = {};
  for (const original of content.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) fail(`Baris .env.bc-local tidak valid: ${original}`);
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    result[match[1]] = value;
  }
  return result;
}

function required(values, name) {
  const value = values[name];
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} wajib diisi di apps/api/.env.bc-local.`);
  return value.trim();
}

function assertDatabaseUrl(values, name) {
  let url;
  try {
    url = new URL(required(values, name));
  } catch {
    fail(`${name} bukan URL yang valid.`);
  }
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !loopback.has(url.hostname) ||
    url.port !== '5433' ||
    database !== 'fundchain_bc_dev' ||
    !url.username ||
    !url.password
  ) {
    fail(`${name} ditolak. Target wajib PostgreSQL fundchain_bc_dev pada loopback port 5433 dengan credential lokal.`);
  }
}

function assertRpcUrl(values) {
  let url;
  try {
    url = new URL(required(values, 'BLOCKCHAIN_RPC_URL'));
  } catch {
    fail('BLOCKCHAIN_RPC_URL bukan URL yang valid.');
  }
  const loopback = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!['http:', 'https:'].includes(url.protocol) || !loopback.has(url.hostname) || url.port !== '8545') {
    fail('BLOCKCHAIN_RPC_URL wajib menunjuk loopback port 8545.');
  }
}

function loadAndValidateLocalEnv() {
  if (!fs.existsSync(envFile)) {
    fail('apps/api/.env.bc-local tidak ditemukan. Tidak akan fallback ke apps/api/.env. Salin dari .env.bc-local.example.');
  }
  const values = parseDotEnv(fs.readFileSync(envFile, 'utf8'));
  if (required(values, 'FUNDCHAIN_ENV') !== 'bc-local') fail('FUNDCHAIN_ENV wajib bc-local.');
  assertDatabaseUrl(values, 'DATABASE_URL');
  assertDatabaseUrl(values, 'DIRECT_URL');
  if (required(values, 'NODE_ENV') === 'production') fail('NODE_ENV=production ditolak untuk bc-local.');
  if (required(values, 'PAYMENT_PROVIDER') !== 'mock') fail('PAYMENT_PROVIDER wajib mock untuk bc-local.');
  if (required(values, 'BLOCKCHAIN_NETWORK') !== 'localhost') fail('BLOCKCHAIN_NETWORK wajib localhost.');
  assertRpcUrl(values);
  if (required(values, 'CHAIN_ID') !== '31337') fail('CHAIN_ID wajib 31337.');
  if (required(values, 'RELAYER_PRIVATE_KEY') !== hardhatDevRelayerKey) {
    fail('RELAYER_PRIVATE_KEY wajib wallet latihan Hardhat #1 untuk bc-local.');
  }
  if (required(values, 'WORKER_ENABLED').toLowerCase() !== 'false') {
    fail('WORKER_ENABLED di .env.bc-local wajib false; gunakan bc-local:api:worker untuk aktivasi tervalidasi.');
  }
  return values;
}

function localProcessEnv(values, overrides = {}) {
  const env = { ...process.env, ...values, ...overrides, FUNDCHAIN_ENV: 'bc-local' };
  // pnpm dlx menaruh executable Node 20 sementara di sini; prioritaskan untuk child process.
  env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`;
  return env;
}

function runNode(script, args, cwd, env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit' });
  if (result.error) fail(result.error.message);
  return result.status ?? 1;
}

function prismaCli(args, env) {
  return runNode(path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js'), args, apiDir, env);
}

function assertNodeVersion() {
  const current = process.versions.node.split('.')[0];
  if (current !== expectedNodeMajor) fail(`Node ${expectedNodeMajor} diwajibkan oleh .nvmrc; terdeteksi ${process.version}.`);
}

function unwrap(body) {
  if (!body || body.success !== true) throw new Error(body?.error?.message || 'Response API tidak valid.');
  return body.data;
}

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || 'RPC error');
  return body.result;
}

async function waitForChain(values, timeoutMs = 120000) {
  const deploymentFile = path.join(contractsDir, 'deployments', 'localhost.json');
  const deadline = Date.now() + timeoutMs;
  let lastReason = 'Hardhat RPC belum siap';
  while (Date.now() < deadline) {
    try {
      if (!fs.existsSync(deploymentFile)) throw new Error('deployment localhost belum ada');
      const deployment = JSON.parse(fs.readFileSync(deploymentFile, 'utf8'));
      if (Number(deployment.chainId) !== 31337 || !/^0x[a-fA-F0-9]{40}$/.test(deployment.address || '')) {
        throw new Error('deployment localhost tidak valid');
      }
      if (String(deployment.relayer || '').toLowerCase() !== hardhatDevRelayerAddress) {
        throw new Error('deployment tidak memakai relayer latihan Hardhat #1');
      }
      if (values.CONTRACT_ADDRESS && values.CONTRACT_ADDRESS.toLowerCase() !== deployment.address.toLowerCase()) {
        throw new Error('CONTRACT_ADDRESS berbeda dari deployment localhost aktif');
      }
      const chainId = Number(await rpc(values.BLOCKCHAIN_RPC_URL, 'eth_chainId'));
      if (chainId !== 31337) throw new Error(`chainId RPC ${chainId}, bukan 31337`);
      const code = await rpc(values.BLOCKCHAIN_RPC_URL, 'eth_getCode', [deployment.address, 'latest']);
      if (!code || code === '0x') throw new Error('DonationRegistry belum ter-deploy pada node aktif');
      return deployment;
    } catch (error) {
      lastReason = error.message;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  fail(`Blockchain lokal tidak siap setelah ${timeoutMs / 1000}s: ${lastReason}`);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || `HTTP ${response.status}`);
  return unwrap(body);
}

async function smoke(values) {
  await waitForChain(values, 5000);
  const base = `http://127.0.0.1:${values.PORT || '3000'}/api/v1`;
  const config = await apiRequest(`${base}/config`);
  if (config.paymentProvider !== 'mock' || config.chain?.network !== 'localhost' || Number(config.chain?.chainId) !== 31337) {
    throw new Error('API yang aktif bukan konfigurasi bc-local mock/Hardhat.');
  }
  const users = await apiRequest(`${base}/users`);
  const donor = users.find((user) => user.role === 'STUDENT');
  if (!donor) throw new Error('User donor hasil seed tidak ditemukan.');
  const campaignPage = await apiRequest(`${base}/campaigns?status=ACTIVE&limit=1`);
  const campaign = campaignPage.campaigns?.[0];
  if (!campaign) throw new Error('Campaign ACTIVE hasil seed tidak ditemukan.');
  const idempotencyKey = `bc-local-${Date.now()}`;
  const donation = await apiRequest(`${base}/campaigns/${campaign.id}/donations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-user': donor.id, 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ amount: 10000, anonymous: false }),
  });
  const settled = await apiRequest(`${base}/dev/payments/${donation.id}/simulate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-acting-user': donor.id },
    body: JSON.stringify({ outcome: 'settlement' }),
  });
  if (settled.status !== 'PAID') throw new Error(`Pembayaran tidak menjadi PAID (${settled.status}).`);

  const deadline = Date.now() + 60000;
  let detail;
  while (Date.now() < deadline) {
    detail = await apiRequest(`${base}/donations/${donation.id}`, { headers: { 'x-acting-user': donor.id } });
    if (detail.blockchain?.status === 'CONFIRMED') break;
    if (detail.blockchain?.status === 'FAILED') throw new Error(`Notarisasi FAILED: ${detail.blockchain.lastError || 'unknown'}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (detail?.status !== 'PAID') throw new Error(`Status donasi akhir bukan PAID (${detail?.status}).`);
  if (!/^0x[a-fA-F0-9]{64}$/.test(detail.hash || '')) throw new Error('Hash canonical bytes32 tidak tercatat.');
  if (detail.blockchain?.status !== 'CONFIRMED' || !detail.blockchain?.txHash) {
    throw new Error(`Transaksi belum CONFIRMED setelah 60s (${detail.blockchain?.status || 'missing'}).`);
  }
  console.log('bc-local smoke berhasil:');
  console.log(`  donationId : ${detail.id}`);
  console.log(`  status     : ${detail.status}`);
  console.log(`  hash       : ${detail.hash}`);
  console.log(`  blockchain : ${detail.blockchain.status}`);
  console.log(`  txHash     : ${detail.blockchain.txHash}`);
}

async function main() {
  assertNodeVersion();
  const values = loadAndValidateLocalEnv();
  const baseEnv = localProcessEnv(values);
  const [action, ...args] = process.argv.slice(2);
  if (!action || action === 'check') {
    console.log('bc-local env valid: PostgreSQL fundchain_bc_dev @ loopback:5433, mock payment, Hardhat 31337, worker default OFF.');
    return;
  }
  if (action === 'prisma') process.exit(prismaCli(args, baseEnv));
  if (action === 'hardhat') {
    process.exit(runNode(path.join(contractsDir, 'node_modules', 'hardhat', 'internal', 'cli', 'cli.js'), args, contractsDir, baseEnv));
  }
  if (action === 'web') {
    process.exit(runNode(path.join(root, 'apps', 'web', 'node_modules', 'vite', 'bin', 'vite.js'), [], path.join(root, 'apps', 'web'), baseEnv));
  }
  if (action === 'api' || action === 'api-worker') {
    if (prismaCli(['migrate', 'status'], baseEnv) !== 0) fail('Migration lokal belum siap; jalankan pnpm bc-local:db:migrate.');
    const workerEnabled = action === 'api-worker';
    if (workerEnabled) await waitForChain(values);
    const apiEnv = localProcessEnv(values, { WORKER_ENABLED: workerEnabled ? 'true' : 'false' });
    process.exit(
      runNode(path.join(apiDir, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js'), ['start', '--watch'], apiDir, apiEnv),
    );
  }
  if (action === 'smoke') {
    await smoke(values);
    return;
  }
  fail(`Aksi tidak dikenal: ${action}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
