/**
 * Posetive — pengaturan dari aplikasi & HPP.
 */

// Pengaturan yang boleh diubah langsung dari aplikasi (sisanya tetap diubah di tab PENGATURAN):
// [satuan, keterangan, nilai minimum, nilai maksimum, harus > minimum?]
var PENGATURAN_APP = {
  EVENT_BULAN: ['event', 'Target event per bulan (dasar alokasi Jepreto & penyusutan)', 0, null, true],
  HARGA_KERTAS: ['Rp/pack', 'Kertas foto 4R', 0, null, false],
  ISI_KERTAS: ['lembar', 'Isi per pack', 0, null, true],
  HARGA_TINTA: ['Rp/set', 'Tinta printer, satu set', 0, null, false],
  KAPASITAS_TINTA: ['lembar', 'Lembar per set tinta — perbarui dari data nyata', 0, null, true],
  CADANGAN_GAGAL: ['persen', 'Cadangan cetak gagal', 0, 1, false],
  BIAYA_BUKU: ['Rp/buku', 'Biaya cetak Graduation Book', 0, null, false],
  HARGA_4R: ['Rp/lembar', 'Harga jual foto 4R', 0, null, false],
  HARGA_BUKU: ['Rp/buku', 'Harga jual Graduation Book (termasuk 1 foto 4R)', 0, null, false],
  HARGA_STRIP: ['Rp/lembar', 'Harga lembar / strip tambahan di luar sesi', 0, null, false]
};
// Pengaturan yang menentukan HPP; sebelum diubah, HPP lama dikunci dulu ke laporan event yang sudah ada.
var KUNCI_HPP = ['HARGA_KERTAS', 'ISI_KERTAS', 'HARGA_TINTA', 'KAPASITAS_TINTA', 'CADANGAN_GAGAL', 'BIAYA_BUKU'];

/** HPP bahan per lembar cetak — rumus sama dengan biayaLembar() di Index.html. */
function biayaLembar_(p) {
  var n = function (k) { return Number(p[k]) || 0; };
  return (n('HARGA_KERTAS') / (n('ISI_KERTAS') || 1) + n('HARGA_TINTA') / (n('KAPASITAS_TINTA') || 1)) * (1 + n('CADANGAN_GAGAL'));
}

/** Mengubah nilai satu pengaturan; baris dibuat bila belum ada. */
function simpanPengaturan(kunci, nilai) {
  var o = {};
  o[kunci] = nilai;
  simpanPengaturanBanyak(o);
  return Number(nilai);
}

/**
 * Mengubah beberapa pengaturan sekaligus (semua diperiksa dulu, baru ditulis). Bila ada angka HPP yang
 * berubah, laporan event yang belum punya HPP terkunci diisi HPP lama, supaya laba event lama tidak ikut bergeser.
 */
function simpanPengaturanBanyak(obj) {
  var baru = {};
  Object.keys(obj).forEach(function (k) {
    var info = PENGATURAN_APP[k];
    if (!info) throw new Error('Pengaturan ' + k + ' hanya bisa diubah di tab PENGATURAN.');
    var n = Number(obj[k]);
    if (obj[k] === '' || obj[k] === null || !isFinite(n) || n < info[2] || (info[4] && n <= info[2]) || (info[3] !== null && n > info[3]))
      throw new Error(k + ': nilai tidak valid (' + obj[k] + ').');
    baru[k] = n;
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var sh, values, col, lama = {};
  try {
    sh = sheet_('PENGATURAN'); values = sh.getDataRange().getValues();
    col = values[0].map(String).indexOf('nilai') + 1;
    values.slice(1).forEach(function (r) { lama[String(r[0])] = r[col - 1]; });
  } finally { lock.releaseLock(); }

  var hppBerubah = KUNCI_HPP.some(function (k) { return k in baru && Number(lama[k]) !== baru[k]; });
  if (hppBerubah) kunciHppLaporan_(biayaLembar_(lama), Number(lama.BIAYA_BUKU) || 0);

  lock.waitLock(20000);
  try {
    values = sh.getDataRange().getValues();
    Object.keys(baru).forEach(function (k) {
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][0]) === k) { sh.getRange(i + 1, col).setValue(baru[k]); return; }
      }
      sh.appendRow([k, baru[k], PENGATURAN_APP[k][0], PENGATURAN_APP[k][1]]);
      values.push([k]);
    });
  } finally { lock.releaseLock(); }
  return baru;
}

/** Mengisi HPP terkunci di laporan event yang belum punya (laporan lama sebelum fitur ini ada). */
function kunciHppLaporan_(bl, buku) {
  readTab_('LAPORAN_EVENT').forEach(function (l) {
    var rec = { id_event: l.id_event }, isi = false;
    if (l.realisasi_biaya_lembar === '' || l.realisasi_biaya_lembar == null) { rec.realisasi_biaya_lembar = bl; isi = true; }
    if (l.realisasi_biaya_buku === '' || l.realisasi_biaya_buku == null) { rec.realisasi_biaya_buku = buku; isi = true; }
    if (isi) saveRecord('LAPORAN_EVENT', rec);
  });
}
