// Latihan lokal: membandingkan data contoh dengan hash yang disalin dari Remix verify.
// Tidak membaca blockchain/DB secara otomatis dan tidak mengubah data atau contract.
const { hashDonation, toOnchainKey } = require('../dist/index.cjs');

const onchainHash = process.argv[2];
if (!onchainHash || !/^0x[0-9a-fA-F]{64}$/.test(onchainHash)) {
    console.error('Masukkan hash bytes32 dari hasil verify sebagai argumen.');
    process.exit(1);
}

const original = {
    donationId: '11111111-1111-4111-8111-111111111111',
    integritySubjectId: 'STU-00042',
    amount: 50000,
    donatedAt: new Date('2026-10-04T12:00:00Z'),
};

console.log('Sumber hash blockchain: disalin manual dari Remix verify.');
console.log('Key donasi:', toOnchainKey(original.donationId));
console.log('Hash dari verify:', onchainHash);

for (const amount of [50000, 90000]) {
    const { payload, hash } = hashDonation({ ...original, amount });
    const status = hash.toLowerCase() === onchainHash.toLowerCase() ? 'MATCH' : 'MISMATCH';
    console.log('\nNominal: Rp' + amount);
    console.log('Payload:', payload);
    console.log('Hash hasil hitung:', hash);
    console.log('Hasil crosscheck:', status);
}
