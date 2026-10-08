import { ethers, network } from 'hardhat';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Monitoring saldo relayer.
 *
 * - Alamat relayer dibaca dari deployments/<network>.json (sama seperti smoke.ts).
 *   Bisa ditimpa lewat MONITOR_RELAYER_ADDRESS (dipakai saat testing).
 * - Threshold default 0.02 ETH, sesuai BLOCKCHAIN FLOW.md & 15-EXECUTION-PLAN.md.
 *   Bisa diubah lewat RELAYER_MIN_BALANCE_ETH.
 * - Alert: selalu ke console; kalau ALERT_WEBHOOK_URL diisi, juga dikirim ke Discord.
 * - Exit code: 0 = saldo aman, 1 = saldo rendah, 2 = error.
 */
const DEFAULT_MIN_ETH = '0.02';

function relayerAddress(): string {
  const override = process.env.MONITOR_RELAYER_ADDRESS?.trim();
  if (override) {
    if (!ethers.isAddress(override)) {
      throw new Error('MONITOR_RELAYER_ADDRESS bukan address yang valid: ' + override);
    }
    return ethers.getAddress(override);
  }

  const fileName = network.name + '.json';
  const file = path.join(__dirname, '..', 'deployments', fileName);
  if (!fs.existsSync(file)) {
    throw new Error('File deployments/' + fileName + ' tidak ada. Deploy dulu atau isi MONITOR_RELAYER_ADDRESS.');
  }
  const dep = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!ethers.isAddress(dep.relayer)) {
    throw new Error('Field "relayer" di deployments/' + fileName + ' tidak valid');
  }
  return ethers.getAddress(dep.relayer);
}

function minBalance(): { text: string; wei: bigint } {
  const text = (process.env.RELAYER_MIN_BALANCE_ETH || DEFAULT_MIN_ETH).trim();
  let wei: bigint;
  try {
    wei = ethers.parseEther(text); // dibandingkan dalam wei (bigint), bukan float
  } catch {
    throw new Error('RELAYER_MIN_BALANCE_ETH tidak valid: ' + text);
  }
  if (wei < 0n) throw new Error('RELAYER_MIN_BALANCE_ETH tidak boleh negatif');
  return { text, wei };
}

function explorerUrl(address: string): string {
  if (network.name !== 'sepolia') return '';
  return 'https://sepolia.etherscan.io/address/' + address;
}

async function sendAlert(message: string) {
  console.error(message);

  const webhook = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!webhook) {
    console.warn('(ALERT_WEBHOOK_URL kosong, alert hanya tampil di console)');
    return;
  }
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message }), // format Discord webhook
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) console.error('Gagal kirim alert ke webhook: HTTP ' + res.status);
    else console.log('Alert terkirim ke webhook.');
  } catch (e) {
    console.error('Gagal kirim alert ke webhook: ' + (e as Error).message);
  }
}

async function main() {
  const address = relayerAddress();
  const min = minBalance();
  const balance = await ethers.provider.getBalance(address);
  const balanceText = ethers.formatEther(balance);
  const now = new Date().toISOString();

  console.log('Waktu     :', now);
  console.log('Network   :', network.name);
  console.log('Relayer   :', address);
  console.log('Saldo     :', balanceText, 'ETH');
  console.log('Threshold :', min.text, 'ETH');

  if (balance < min.wei) {
    const lines = [
      '⚠️ SALDO RELAYER RENDAH',
      'Network: ' + network.name,
      'Address: ' + address,
      'Saldo: ' + balanceText + ' ETH',
      'Threshold: ' + min.text + ' ETH',
      'Waktu: ' + now,
      'Aksi: isi ulang relayer dari faucet Sepolia.',
    ];
    const link = explorerUrl(address);
    if (link) lines.push('Etherscan: ' + link);

    await sendAlert(lines.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Status    : OK, saldo aman');
  }
}

main().catch((e) => {
  console.error('ERROR:', e instanceof Error ? e.message : e);
  process.exitCode = 2;
});