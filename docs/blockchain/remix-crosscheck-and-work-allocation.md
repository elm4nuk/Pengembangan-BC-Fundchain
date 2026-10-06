# Remix Cross-check dan Pembagian Kerja Blockchain

Tanggal pencatatan: 5 Oktober 2026  
Status bukti: hasil CLI tervalidasi; screenshot Remix belum tersedia di repo.

## Catatan cross-check

Pengujian membandingkan hash hasil `verify` yang disalin manual dari Remix dengan
hasil perhitungan fungsi canonical FundChain di `@fundchain/shared`.

Command:

```powershell
pnpm --filter @fundchain/shared build
pnpm --filter @fundchain/shared exec node scripts/demo-crosscheck.cjs 0x3a0adf185d40527d1996cd26f4613ef0d6f1af1211474bf84fcda19a6d058dd2
```

Data contoh:

- Donation ID: `11111111-1111-4111-8111-111111111111`
- Integrity subject: `STU-00042`
- Donated at: `2026-10-04T12:00:00Z`
- On-chain key: `0x31e5891f6803041a37cfae842c5bf47aa89df5130d6a8ba235cdd9041744763f`

Hasil:

| Skenario | Payload | Hash lokal | Hasil |
| --- | --- | --- | --- |
| Original Rp50.000 | `v1\|11111111-1111-4111-8111-111111111111\|STU-00042\|50000\|1791115200` | `0x3a0adf185d40527d1996cd26f4613ef0d6f1af1211474bf84fcda19a6d058dd2` | `MATCH` |
| Tampered Rp90.000 | `v1\|11111111-1111-4111-8111-111111111111\|STU-00042\|90000\|1791115200` | `0x39d0d37687d36d382c87699a9d97e23d97f0efc1cb3b476090e4e1750aea96b3` | `MISMATCH` |

Kesimpulan: input asli menghasilkan hash yang sama dengan nilai `verify` dari
Remix, sedangkan perubahan nominal terdeteksi sebagai mismatch. Script ini hanya
melakukan cross-check lokal; script tidak membaca blockchain atau database secara
otomatis dan tidak mengubah contract maupun data.

## Bukti screenshot

Screenshot asli dari Remix harus disimpan sebagai:

```text
docs/blockchain/evidence/remix-verify-crosscheck.png
```

Status saat ini: **pending** karena file gambar belum diberikan. Jangan menandai
bukti sebagai lengkap sebelum screenshot asli tersedia dan isi hash pada gambar
dapat dicocokkan dengan catatan di atas.

## Pembagian kerja

### Mikola — Notarization worker dan retry

Ruang lingkup utama:

- Audit `apps/api/src/modules/blockchain/notarization.worker.ts`.
- Pastikan state machine `QUEUED → SUBMITTED → CONFIRMED` dan jalur
  `RETRYING → FAILED` konsisten dengan schema dan dokumentasi.
- Verifikasi idempotency, retry count, backoff, klasifikasi error RPC/nonce,
  serta penanganan transaksi yang sudah pernah dinotarisasi.
- Pastikan worker tidak mengubah status pembayaran `PAID`.
- Tambahkan atau perkuat unit test untuk sukses, retry, max-attempt, dan replay.

Definition of done:

- Tidak ada duplicate transaction untuk donation yang sama.
- Retry dapat direproduksi dengan RPC gagal lalu pulih.
- Status dan audit log tetap konsisten setelah restart worker.

### Fedryan — Integrity checker dan auto-freeze

Ruang lingkup utama:

- Audit `apps/api/src/modules/integrity/integrity.service.ts`.
- Cocokkan canonical payload dari database dengan hash on-chain.
- Pastikan hasil `TAMPERED` membekukan campaign secara atomik dan tercatat di
  audit log.
- Pastikan campaign `FROZEN` memblokir pencairan tanpa merusak histori donasi.
- Tambahkan atau perkuat test untuk `VERIFIED`, `TAMPERED`, data belum
  dinotarisasi, dan kegagalan RPC.

Definition of done:

- False-positive akibat format UUID, timestamp, atau nominal tidak terjadi.
- Auto-freeze idempotent dan aman jika checker dijalankan berulang.
- Alasan freeze serta bukti perbandingan hash dapat diaudit.

### Fayola — Review contract dan deployment

Ruang lingkup utama:

- Audit `contracts/contracts/DonationRegistry.sol` dan access control relayer/admin.
- Review validasi zero hash, duplicate notarization, revoke relayer, event, serta
  perilaku `verify`.
- Review `contracts/test/DonationRegistry.test.ts`, `contracts/scripts/deploy.ts`,
  `contracts/scripts/smoke.ts`, dan `contracts/hardhat.config.ts`.
- Pastikan deployment lokal dan Sepolia menghasilkan artifact yang konsisten,
  tanpa private key atau RPC secret masuk Git.
- Dokumentasikan address, chain ID, block number, dan langkah verifikasi contract.

Definition of done:

- Seluruh contract test lulus, termasuk negative case dan access control.
- Deployment lokal serta smoke test dapat diulang anggota tim lain.
- Sepolia dilakukan hanya setelah konfigurasi dan pendanaan relayer siap.

## Aturan integrasi tim

- Format canonical dan fungsi hash di `@fundchain/shared` adalah kontrak bersama;
  perubahan harus direview lintas ketiga area.
- Mikola dan Fedryan menyepakati status database serta semantics retry sebelum
  merge.
- Fayola memberi ABI dan deployment artifact final kepada Mikola sebelum uji
  integrasi worker.
- Setiap PR harus menyertakan command pengujian, hasil, dan bukti bahwa secret
  tidak terlacak Git.
- Jangan memakai screenshot sebagai satu-satunya bukti; pertahankan test otomatis
  dan output cross-check yang dapat direproduksi.
