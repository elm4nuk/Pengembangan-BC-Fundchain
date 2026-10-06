# FundChain blockchain-local development

Mode `bc-local` menjalankan PostgreSQL dan Hardhat hanya di loopback. Credential
`apps/api/.env` yang dipakai tim/live tidak dibaca oleh command di dokumen ini.
Semua command Prisma, seed, dan API melewati guard yang mewajibkan:

- database `fundchain_bc_dev` di `127.0.0.1`/loopback port `5433` untuk
  `DATABASE_URL` dan `DIRECT_URL`;
- `PAYMENT_PROVIDER=mock`;
- Hardhat `localhost`, RPC loopback port `8545`, dan chain ID `31337`;
- wallet relayer latihan akun #1 bawaan Hardhat;
- `WORKER_ENABLED=false` di file env. Worker hanya dapat diaktifkan lewat preflight
  `bc-local:api:worker`.

## Prasyarat Windows + Git Bash

Repository menetapkan Node 20 di `.nvmrc`. Jika NVM tersedia:

```bash
nvm use
pnpm install
```

Jika NVM belum tersedia, script `bc-local:*` otomatis memakai Node 20 sementara
melalui `pnpm dlx node@20`. Ini juga menghindari crash Hardhat yang pernah terjadi
dengan Node 24.

Docker CLI dan Compose saja belum cukup; `docker info` harus menampilkan bagian
`Server`. Pada mesin yang diperiksa saat setup ini, Docker Desktop terpasang tetapi
engine gagal start karena WSL belum terpasang. Perbaikannya memerlukan tindakan
manual berikut:

1. Buka **PowerShell as Administrator**.
2. Jalankan `wsl --install`.
3. Restart Windows bila diminta, selesaikan inisialisasi Ubuntu, lalu jalankan
   `wsl --update`.
4. Buka Docker Desktop dan gunakan backend WSL 2.
5. Verifikasi dari Git Bash atau PowerShell:

   ```bash
   wsl --status
   docker info
   docker compose version
   ```

Panduan resmi: [instalasi WSL](https://learn.microsoft.com/windows/wsl/install) dan
[Docker Desktop untuk Windows](https://docs.docker.com/desktop/setup/install/windows-install/).

## Konfigurasi lokal

File credential lokal sudah bernama `apps/api/.env.bc-local` dan diabaikan Git.
Pada clone baru, buat dari template yang boleh di-commit:

```bash
cp apps/api/.env.bc-local.example apps/api/.env.bc-local
pnpm bc-local:env:check
```

Jangan mengganti URL dengan host remote. Guard sengaja menghentikan command bila
file hilang, URL salah, atau target bukan `fundchain_bc_dev` di loopback port 5433;
tidak ada fallback ke `apps/api/.env`.

## PostgreSQL, migration, dan seed

Start PostgreSQL dan tunggu healthcheck:

```bash
pnpm bc-local:db:start
pnpm bc-local:db:check
```

Periksa migration sebelum mengubah database:

```bash
pnpm bc-local:db:migrations:check
```

Terapkan migration yang sudah ada lalu isi seed lokal:

```bash
pnpm bc-local:db:migrate
pnpm bc-local:db:seed
```

Atau jalankan tiga langkah start/migrate/seed sekaligus:

```bash
pnpm bc-local:db:setup
```

Compose memakai named volume `fundchain_bc_local_postgres_data`. Jangan memakai
`docker compose down -v` atau menghapus volume tersebut. Jika volume sudah pernah
dibuat dengan password berbeda, sesuaikan credential lokal dengan password volume;
PostgreSQL tidak mengubah password cluster lama hanya karena nilai Compose berubah.

## Hardhat, API, dan web

Untuk melihat startup aman dengan worker masih mati, buka empat terminal Git Bash.

Terminal 1 — Hardhat localhost:

```bash
pnpm bc-local:chain
```

Terminal 2 — deploy `DonationRegistry` setelah RPC hidup:

```bash
pnpm bc-local:contract:deploy:wait
```

Terminal 3 — API lokal, worker dipaksa tetap mati:

```bash
pnpm bc-local:api
```

Terminal 4 — Vite; proxy `/api` otomatis menuju `http://localhost:3000`:

```bash
pnpm bc-local:web
```

Alternatif satu command untuk keempat proses (worker tetap mati):

```bash
pnpm bc-local:dev
```

Buka `http://localhost:5173`.

## Mengaktifkan worker dengan aman

Hentikan proses API tanpa worker dengan `Ctrl+C`, pastikan deployment contract sudah
selesai, lalu jalankan:

```bash
pnpm bc-local:api:worker
```

Command ini baru mengubah `WORKER_ENABLED=true` di environment proses setelah:

1. kedua URL database lolos guard lokal;
2. `prisma migrate status` berhasil terhadap database lokal;
3. RPC menjawab chain ID `31337`;
4. deployment `localhost.json` valid dan bytecode contract ada pada node yang aktif.

Untuk startup gabungan dengan preflight worker:

```bash
pnpm bc-local:dev:worker
```

## Smoke test donasi mock

Dengan PostgreSQL, Hardhat, deployment contract, API worker, dan web/API sudah aktif:

```bash
pnpm bc-local:smoke
```

Smoke test mengambil user dan campaign hasil seed, membuat donasi mock Rp10.000,
mensimulasikan settlement, lalu menunggu maksimal 60 detik. Test hanya lulus bila:

- donasi berstatus `PAID`;
- canonical hash berbentuk `bytes32` dan tersimpan;
- transaksi blockchain memiliki `txHash` dan berstatus `CONFIRMED`.

Setiap eksekusi smoke test menambah satu donasi lokal; tidak ada akses ke database
tim/live karena guard dijalankan sebelum request.

## Menghentikan tanpa menghapus data

1. Tekan `Ctrl+C` pada proses API, web, dan Hardhat/concurrently.
2. Hentikan container PostgreSQL tanpa menghapus container atau volume:

   ```bash
   pnpm bc-local:db:stop
   ```

3. Nyalakan kembali dengan `pnpm bc-local:db:start`; data tetap berada di named
   volume `fundchain_bc_local_postgres_data`.

Hardhat localhost bersifat in-memory, jadi chain akan kosong setelah proses Hardhat
berhenti. Deploy ulang contract saat startup berikutnya. Worker akan menotarisasi
ulang record lokal yang perlu disinkronkan.
