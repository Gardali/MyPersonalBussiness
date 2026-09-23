/**
 * Posetive — aplikasi manajemen (Google Apps Script, terpasang di file DATABASE MASTER).
 * Server: membaca & menulis tab di spreadsheet ini. Semua perhitungan dilakukan di Index.html.
 */

// Tab yang boleh ditulis aplikasi, kolom kodenya, dan format kode baru.
var TABS = {
  PIPELINE: { id: 'id', prefix: 'PSV-', pad: 3 },
  EVENT: { id: 'id_event', prefix: 'EV-', pad: 3 },
  LAPORAN_EVENT: { id: 'id_event' },
  KAS: { id: 'id', prefix: 'KS-', pad: 4 },
  INVENTARIS: { id: 'id_alat', prefix: 'ALT-', pad: 3 },
  MUTASI_STOK: { id: 'id', prefix: 'MS-', pad: 4 },
  CREW: { id: 'id_crew', prefix: 'CR-', pad: 3 },
  TUGAS_CREW: { id: 'id', prefix: 'TC-', pad: 4 }
};
var MUTASI_HEAD = ['id', 'tanggal', 'bahan', 'jenis', 'jumlah', 'id_event', 'sumber', 'catatan'];
var CREW_HEAD = ['id_crew', 'foto', 'nama_lengkap', 'nama_panggilan', 'domisili', 'kendaraan', 'bank', 'no_rekening',
  'role', 'tanggal_mulai_kontrak', 'tanggal_akhir_kontrak', 'catatan'];
// Penugasan crew per event. id_kas terisi setelah fee dibayar (baris KAS "Fee Crew" yang dibuat otomatis).
var TUGAS_HEAD = ['id', 'id_event', 'id_crew', 'fee', 'id_kas', 'catatan'];
// Pengaturan yang ditambahkan otomatis bila belum ada di tab PENGATURAN.
var PENGATURAN_BARU = [
  ['STOK_MIN_KERTAS', 100, 'lembar', 'Peringatan bila stok kertas 4R di bawah angka ini'],
  ['STOK_MIN_BUKU', 5, 'buku', 'Peringatan bila stok Graduation Book di bawah angka ini'],
  ['TINTA_MIN', 0.2, 'persen', 'Peringatan bila level tinta terendah di bawah angka ini'],
  ['CREW_DEFAULT', 2, 'orang', 'Jumlah crew default di kalkulator skema'],
  ['NAMA_USAHA', 'Posetive Photobooth', 'teks', 'Nama usaha di invoice & laporan'],
  ['KONTAK_USAHA', '', 'teks', 'No. WA / email usaha di invoice'],
  ['REKENING', '', 'teks', 'Rekening pembayaran di invoice, mis. BCA 123456 a.n. ...'],
  ['NAMA_MANAJER', 'Garda Ali Rayhaan', 'teks', 'Nama penyusun laporan bulanan'],
  ['HARGA_LEMBAR_TAMBAHAN', 0, 'Rp', 'Harga tiap lembar cetak tambahan di luar sesi (1 sesi = 1 lembar, dihitung dari HARGA_4R)'],
  ['PENYUSUTAN_HARGA_MIN', 250000, 'Rp', 'Barang Inventaris (kategori Aset, milik Posetive) di bawah harga ini tidak dihitung penyusutan']
];
// Kolom baru di tab LAPORAN_EVENT, EVENT, INVENTARIS, dan KAS yang ditambahkan otomatis bila belum ada (di kolom paling kanan).
var LAPORAN_KOLOM_BARU = ['sesi_terjual', 'lembar_tambahan', 'admin_qris', 'admin_pencairan', 'realisasi_penyusutan', 'realisasi_jepreto'];
var EVENT_KOLOM_BARU = ['rab_penyusutan', 'rab_jepreto', 'rab_fee_crew', 'rab_transport', 'rab_konsumsi',
  'dp_nominal', 'jatuh_tempo_dp', 'jatuh_tempo_pelunasan', 'id_kalender'];
var INVENTARIS_KOLOM_BARU = ['umur_manfaat_bulan'];
var KAS_KOLOM_BARU = ['sumber'];
var CREW_KOLOM_BARU = ['email'];
// Pilihan dropdown baru yang ditambahkan otomatis ke tab PILIHAN bila belum ada.
var PILIHAN_BARU = { 'Kategori Kas': ['Admin QRIS', 'Admin Pencairan QRIS'] };

/** Menambahkan nilai dropdown baru ke kolom PILIHAN yang sudah ada, di bawah nilai lama (tidak menyentuh nilai lama). */
function tambahPilihan_() {
  var sh = ss_().getSheetByName('PILIHAN');
  if (!sh) return;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  Object.keys(PILIHAN_BARU).forEach(function (nama) {
    var col = head.indexOf(nama) + 1;
    if (!col) return;
    var tinggi = Math.max(1, sh.getLastRow() - 1);
    var ada = sh.getRange(2, col, tinggi, 1).getValues().map(function (r) { return String(r[0]); });
    PILIHAN_BARU[nama].forEach(function (v) {
      if (ada.indexOf(v) < 0) { var baris = ada.filter(function (x) { return x !== ''; }).length + 2; sh.getRange(baris, col).setValue(v); ada.push(v); }
    });
  });
}

/** Menambahkan kolom baru ke tab yang sudah ada, tanpa menyentuh kolom/data lama. */
function tambahKolom_(namaTab, kolomBaru) {
  var sh = ss_().getSheetByName(namaTab);
  if (!sh) return;
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  kolomBaru.forEach(function (k) { if (head.indexOf(k) < 0) { sh.getRange(1, head.length + 1).setValue(k); head.push(k); } });
}
// Kolom yang harus disimpan sebagai teks (supaya 0 di depan nomor HP tidak hilang).
var TEXT_COLS = ['id', 'id_event', 'id_pipeline', 'id_alat', 'id_crew', 'id_kas', 'id_kalender', 'kontak', 'no_nota', 'no_rekening', 'foto',
  'parameter_skema', 'jam_buka', 'jam_tutup', 'jam_buka_aktual', 'jam_tutup_aktual', 'jam_ramai'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Posetive')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tidak ditemukan di spreadsheet.');
  return sh;
}

function isDateCol_(h) {
  return h.indexOf('tanggal') === 0 || h.indexOf('jatuh_tempo') === 0 || h === 'follow_up';
}

/** Membaca satu tab menjadi daftar objek {judul_kolom: nilai}. Baris kosong dilewati. */
function readTab_(name) {
  var range = sheet_(name).getDataRange();
  var values = range.getValues();
  var shown = range.getDisplayValues();
  var head = values[0].map(String);
  var tz = ss_().getSpreadsheetTimeZone();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (!row.some(function (v) { return v !== '' && v !== null; })) continue;
    var o = { _row: r + 1 };
    for (var c = 0; c < head.length; c++) {
      var h = head[c];
      if (!h) continue;
      var v = row[c];
      if (h.indexOf('jam') === 0) v = shown[r][c];
      else if (v instanceof Date) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
      o[h] = v;
    }
    out.push(o);
  }
  return out;
}

/**
 * Menyiapkan struktur baru tanpa menyentuh data lama: tab MUTASI_STOK (diisi stok awal dari laporan
 * event terakhir) dan baris PENGATURAN baru.
 */
function siapkan_() {
  var ss = ss_();
  var peng = sheet_('PENGATURAN');
  var ada = peng.getDataRange().getValues().map(function (r) { return String(r[0]); });
  PENGATURAN_BARU.forEach(function (r) { if (ada.indexOf(r[0]) < 0) peng.appendRow(r); });

  tambahKolom_('LAPORAN_EVENT', LAPORAN_KOLOM_BARU);
  tambahKolom_('EVENT', EVENT_KOLOM_BARU);
  tambahKolom_('INVENTARIS', INVENTARIS_KOLOM_BARU);
  tambahKolom_('KAS', KAS_KOLOM_BARU);
  tambahPilihan_();

  if (!ss.getSheetByName('CREW')) {
    var shC = ss.insertSheet('CREW');
    shC.appendRow(CREW_HEAD);
    shC.getRange(1, 1, 1, CREW_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
    shC.setFrozenRows(1);
    shC.getRange('A2:A1000').setNumberFormat('@');
    shC.getRange('H2:H1000').setNumberFormat('@');
    shC.getRange('J2:K1000').setNumberFormat('yyyy-mm-dd');
  }
  tambahKolom_('CREW', CREW_KOLOM_BARU);

  if (!ss.getSheetByName('TUGAS_CREW')) {
    var shT = ss.insertSheet('TUGAS_CREW');
    shT.appendRow(TUGAS_HEAD);
    shT.getRange(1, 1, 1, TUGAS_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
    shT.setFrozenRows(1);
    shT.getRange('A2:C1000').setNumberFormat('@');
    shT.getRange('E2:E1000').setNumberFormat('@');
  }

  if (ss.getSheetByName('MUTASI_STOK')) return;
  var sh = ss.insertSheet('MUTASI_STOK');
  sh.appendRow(MUTASI_HEAD);
  sh.getRange(1, 1, 1, MUTASI_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange('B2:B1000').setNumberFormat('yyyy-mm-dd');
  sh.getRange('A2:A1000').setNumberFormat('@');
  // Stok awal = hitungan fisik di laporan event terakhir.
  var ev = {};
  readTab_('EVENT').forEach(function (e) { ev[e.id_event] = e; });
  var lap = readTab_('LAPORAN_EVENT').filter(function (l) { return ev[l.id_event]; })
    .sort(function (a, b) { return ev[a.id_event].tanggal < ev[b.id_event].tanggal ? -1 : 1; }).pop();
  if (!lap) return;
  var tgl = ev[lap.id_event].tanggal;
  if (lap.stok_kertas_akhir_fisik !== '') {
    saveRecord('MUTASI_STOK', { tanggal: tgl, bahan: 'Kertas 4R', jenis: 'Hitung Fisik', jumlah: Number(lap.stok_kertas_akhir_fisik),
      id_event: lap.id_event, sumber: 'AWAL', catatan: 'CEK: stok awal diambil dari hitung fisik laporan ' + lap.id_event + '. Hitung ulang & koreksi bila perlu.' });
  }
  if (lap.stok_buku_awal !== '') {
    saveRecord('MUTASI_STOK', { tanggal: tgl, bahan: 'Graduation Book', jenis: 'Hitung Fisik',
      jumlah: Number(lap.stok_buku_awal) - Number(lap.grad_book_terjual || 0) - Number(lap.buku_rusak || 0),
      id_event: lap.id_event, sumber: 'AWAL', catatan: 'Stok awal dari laporan ' + lap.id_event });
  }
}

/** Semua data yang dibutuhkan aplikasi, dalam satu panggilan. */
function getData() {
  siapkan_();
  var pengaturan = {};
  readTab_('PENGATURAN').forEach(function (r) { pengaturan[r.kunci] = r.nilai; });

  var pv = sheet_('PILIHAN').getDataRange().getValues();
  var pilihan = {};
  pv[0].forEach(function (h, c) {
    if (!h) return;
    pilihan[h] = pv.slice(1).map(function (r) { return r[c]; }).filter(function (v) { return v !== ''; });
  });

  return {
    pengaturan: pengaturan,
    pilihan: pilihan,
    pipeline: readTab_('PIPELINE'),
    event: readTab_('EVENT'),
    laporan: readTab_('LAPORAN_EVENT'),
    kas: readTab_('KAS'),
    inventaris: readTab_('INVENTARIS'),
    mutasi: readTab_('MUTASI_STOK'),
    pemakaian: readTab_('PEMAKAIAN_ALAT'),
    keputusan: readTab_('LOG_KEPUTUSAN'),
    crew: readTab_('CREW'),
    tugas: readTab_('TUGAS_CREW'),
    kalender: kalenderAktif_(),
    hariIni: Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd')
  };
}

function toCell_(v, h) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' && isDateCol_(h) && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    var p = v.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  return v;
}

function nextId_(values, idCol, cfg) {
  var max = 0;
  for (var i = 1; i < values.length; i++) {
    var m = String(values[i][idCol]).match(/(\d+)$/);
    if (m && String(values[i][idCol]).indexOf(cfg.prefix) === 0) max = Math.max(max, Number(m[1]));
  }
  var n = String(max + 1);
  while (n.length < cfg.pad) n = '0' + n;
  return cfg.prefix + n;
}

function lastDataRow_(values) {
  for (var i = values.length - 1; i > 0; i--) {
    if (values[i].some(function (v) { return v !== '' && v !== null; })) return i + 1;
  }
  return 1;
}

/**
 * Menyimpan satu catatan. Kalau kodenya sudah ada → baris itu diperbarui (kolom yang tidak dikirim
 * tetap). Kalau belum ada → baris baru di bawah data terakhir, dengan kode baru bila perlu.
 * Mengembalikan kode catatan.
 */
function saveRecord(tab, rec) {
  var cfg = TABS[tab];
  if (!cfg) throw new Error('Tab tidak boleh diubah: ' + tab);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(tab);
    var values = sh.getDataRange().getValues();
    var head = values[0].map(String);
    var idCol = head.indexOf(cfg.id);
    var id = rec[cfg.id];
    var rowIdx = -1;
    if (id) {
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][idCol]) === String(id)) { rowIdx = i; break; }
      }
    } else {
      if (!cfg.prefix) throw new Error('Kode ' + cfg.id + ' wajib diisi.');
      id = nextId_(values, idCol, cfg);
      rec[cfg.id] = id;
    }
    var old = rowIdx > 0 ? values[rowIdx] : null;
    var row = head.map(function (h, c) {
      return Object.prototype.hasOwnProperty.call(rec, h) ? toCell_(rec[h], h) : (old ? old[c] : '');
    });
    var target = rowIdx > 0 ? rowIdx + 1 : lastDataRow_(values) + 1;
    head.forEach(function (h, c) {
      if (TEXT_COLS.indexOf(h) >= 0) sh.getRange(target, c + 1).setNumberFormat('@');
    });
    sh.getRange(target, 1, 1, head.length).setValues([row]);
    return id;
  } finally {
    lock.releaseLock();
  }
}

function deleteRecord(tab, id) {
  var cfg = TABS[tab];
  if (!cfg) throw new Error('Tab tidak boleh diubah: ' + tab);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_(tab);
    var values = sh.getDataRange().getValues();
    var idCol = values[0].map(String).indexOf(cfg.id);
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][idCol]) === String(id)) { sh.deleteRow(i + 1); return true; }
    }
    throw new Error('Kode ' + id + ' tidak ditemukan di ' + tab + '.');
  } finally {
    lock.releaseLock();
  }
}

// Pengaturan yang boleh diubah langsung dari aplikasi (sisanya tetap diubah di tab PENGATURAN).
var PENGATURAN_APP = {
  EVENT_BULAN: ['event', 'Target event per bulan (dasar alokasi Jepreto & penyusutan)']
};
/** Mengubah nilai satu pengaturan; baris dibuat bila belum ada. */
function simpanPengaturan(kunci, nilai) {
  var info = PENGATURAN_APP[kunci];
  if (!info) throw new Error('Pengaturan ' + kunci + ' hanya bisa diubah di tab PENGATURAN.');
  var n = Number(nilai);
  if (!(n > 0)) throw new Error('Nilai harus angka lebih dari 0.');
  var sh = sheet_('PENGATURAN'), values = sh.getDataRange().getValues();
  var col = values[0].map(String).indexOf('nilai') + 1;
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]) === kunci) { sh.getRange(i + 1, col).setValue(n); return n; }
  }
  sh.appendRow([kunci, n, info[0], info[1]]);
  return n;
}

/** Prospek jadi deal: buat event baru dari data pipeline, lalu tandai pipeline Deal + kode event. */
function dealKeEvent(pipelineId) {
  var p = readTab_('PIPELINE').filter(function (r) { return r.id === pipelineId; })[0];
  if (!p) throw new Error('Prospek ' + pipelineId + ' tidak ditemukan.');
  if (p.id_event) return p.id_event;
  var idEvent = saveRecord('EVENT', {
    id_pipeline: p.id,
    nama_event: p.referensi || p.nama_klien,
    tanggal: p.tanggal_event,
    kota: p.kota,
    jenis_acara: p.jenis_acara,
    model_pendapatan: p.model_pendapatan,
    skema: p.skema,
    parameter_skema: p.parameter_skema,
    nilai_kontrak: p.harga_deal,
    status: 'Terkonfirmasi',
    catatan: 'Dari pipeline ' + p.id + ' (' + p.nama_klien + ')'
  });
  saveRecord('PIPELINE', { id: p.id, status: 'Deal', id_event: idEvent });
  cobaSinkron_(idEvent);
  return idEvent;
}

/** Menyimpan event lalu menyamakan jadwalnya di Google Calendar. Gagal sinkron tidak membatalkan simpan. */
function simpanEvent(rec) {
  var id = saveRecord('EVENT', rec);
  return { id: id, peringatan: cobaSinkron_(id) };
}

/** Menghapus event beserta jadwalnya di Google Calendar. */
function hapusEvent(id) {
  var e = readTab_('EVENT').filter(function (x) { return x.id_event === id; })[0];
  if (e && e.id_kalender && kalenderAktif_()) {
    try { var ce = kalender_().getEventById(e.id_kalender); if (ce) ce.deleteEvent(); } catch (err) { }
  }
  return deleteRecord('EVENT', id);
}

/** Menyimpan catatan berdasarkan kolom kunci selain kode (mis. sumber otomatis), membuat baru bila belum ada. */
function saveBy_(tab, col, val, rec) {
  var hit = readTab_(tab).filter(function (r) { return String(r[col]) === String(val); })[0];
  rec[col] = val;
  if (hit) rec[TABS[tab].id] = hit[TABS[tab].id];
  return saveRecord(tab, rec);
}

/**
 * Menyimpan laporan event lalu memperbarui stok otomatis: kertas keluar = lembar tercetak (counter),
 * buku keluar = terjual + rusak, dan hitung fisik kertas bila diisi.
 */
function simpanLaporan(rec) {
  saveRecord('LAPORAN_EVENT', rec);
  var ev = readTab_('EVENT').filter(function (e) { return e.id_event === rec.id_event; })[0];
  var tgl = ev && ev.tanggal ? ev.tanggal : Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  var n = function (v) { return Number(v) || 0; };
  var kertas = Math.max(0, n(rec.counter_akhir) - n(rec.counter_awal));
  var buku = n(rec.grad_book_terjual) + n(rec.buku_rusak);
  var base = { tanggal: tgl, id_event: rec.id_event };
  saveBy_('MUTASI_STOK', 'sumber', 'LAPORAN:' + rec.id_event + ':KERTAS',
    Object.assign({}, base, { bahan: 'Kertas 4R', jenis: 'Keluar', jumlah: kertas, catatan: 'Otomatis dari laporan (counter printer)' }));
  saveBy_('MUTASI_STOK', 'sumber', 'LAPORAN:' + rec.id_event + ':BUKU',
    Object.assign({}, base, { bahan: 'Graduation Book', jenis: 'Keluar', jumlah: buku, catatan: 'Otomatis dari laporan (terjual + rusak)' }));
  if (rec.stok_kertas_akhir_fisik !== '' && rec.stok_kertas_akhir_fisik != null) {
    saveBy_('MUTASI_STOK', 'sumber', 'LAPORAN:' + rec.id_event + ':FISIK',
      Object.assign({}, base, { bahan: 'Kertas 4R', jenis: 'Hitung Fisik', jumlah: n(rec.stok_kertas_akhir_fisik), catatan: 'Hitung fisik akhir event' }));
  }
  sinkronAdminKas_(rec, tgl);
  return rec.id_event;
}

// Potongan admin dari laporan yang otomatis disinkronkan ke tab KAS sebagai transaksi Keluar sungguhan.
var ADMIN_KAS = [
  { kolom: 'admin_qris', kategori: 'Admin QRIS', tag: 'ADMINQRIS' },
  { kolom: 'admin_pencairan', kategori: 'Admin Pencairan QRIS', tag: 'ADMINPENCAIRAN' }
];
/** Menyamakan baris KAS "Keluar" untuk admin QRIS & admin pencairan sesuai laporan; baris dihapus otomatis bila angkanya dikosongkan. */
function sinkronAdminKas_(rec, tgl) {
  ADMIN_KAS.forEach(function (x) {
    var sumber = 'LAPORAN:' + rec.id_event + ':' + x.tag;
    var nominal = Number(rec[x.kolom]) || 0;
    if (nominal > 0) {
      saveBy_('KAS', 'sumber', sumber, { tanggal: tgl, jenis: 'Keluar', kategori: x.kategori, nominal: nominal,
        id_event: rec.id_event, keterangan: x.kategori, catatan: 'Otomatis dari laporan ' + rec.id_event });
    } else {
      var ada = readTab_('KAS').filter(function (k) { return String(k.sumber) === sumber; })[0];
      if (ada) deleteRecord('KAS', ada.id);
    }
  });
}
/**
 * Migrasi satu kali: sinkronkan admin QRIS & admin pencairan dari semua laporan yang sudah ada ke tab
 * KAS. Jalankan manual sekali dari editor Apps Script (pilih fungsi ini → Jalankan) setelah menempel
 * ulang Code.gs ini, supaya laporan lama yang sudah terisi admin_qris/admin_pencairan ikut tercatat.
 */
function migrasiAdminKas() {
  var ev = {};
  readTab_('EVENT').forEach(function (e) { ev[e.id_event] = e; });
  var lap = readTab_('LAPORAN_EVENT'), tz = ss_().getSpreadsheetTimeZone();
  lap.forEach(function (l) {
    var e = ev[l.id_event];
    var tgl = e && e.tanggal ? e.tanggal : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    sinkronAdminKas_(l, tgl);
  });
  return lap.length + ' laporan disinkronkan ke KAS.';
}

/** Mencatat mutasi stok. Pembelian (Masuk) dengan harga ikut dicatat di KAS sebagai Media Cetak. */
function simpanMutasi(rec, harga) {
  var baru = !rec.id;
  var id = saveRecord('MUTASI_STOK', rec);
  if (baru && rec.jenis === 'Masuk' && Number(harga) > 0) {
    saveRecord('KAS', { tanggal: rec.tanggal, jenis: 'Keluar', kategori: 'Media Cetak', nominal: Number(harga),
      keterangan: 'Beli ' + rec.bahan + ' (' + rec.jumlah + ')', catatan: 'Otomatis dari stok ' + id });
  }
  return id;
}

// ---------------------------------------------------------------- checklist alat

/** Mengganti seluruh checklist alat satu event. Kondisi akhir alat ikut diperbarui di INVENTARIS. */
function simpanChecklist(idEvent, rows) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_('PEMAKAIAN_ALAT');
    var values = sh.getDataRange().getValues();
    var head = values[0].map(String);
    var ci = head.indexOf('id_event');
    for (var i = values.length - 1; i >= 1; i--) {
      if (String(values[i][ci]) === String(idEvent)) sh.deleteRow(i + 1);
    }
    var out = rows.map(function (r) {
      return head.map(function (h) { return h === 'id_event' ? idEvent : (r[h] == null ? '' : r[h]); });
    });
    if (out.length) {
      var start = lastDataRow_(sh.getDataRange().getValues()) + 1;
      sh.getRange(start, 1, out.length, head.length).setValues(out);
    }
  } finally {
    lock.releaseLock();
  }
  rows.forEach(function (r) {
    if (r.id_alat && r.dibawa === 'Ya' && r.kondisi_akhir) saveRecord('INVENTARIS', { id_alat: r.id_alat, kondisi: r.kondisi_akhir });
  });
  return idEvent;
}

// ---------------------------------------------------------------- crew

/** Menyimpan foto profil crew ke folder Drive privat (tidak dibagikan), lalu mengaitkannya ke data crew. */
function simpanFotoCrew(idCrew, base64, mime, namaFile) {
  var lama = readTab_('CREW').filter(function (c) { return c.id_crew === idCrew; })[0];
  if (lama && lama.foto) { try { DriveApp.getFileById(lama.foto).setTrashed(true); } catch (e) { } }
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, namaFile || idCrew);
  var file = folder_('Posetive - Foto Crew').createFile(blob);
  saveRecord('CREW', { id_crew: idCrew, foto: file.getId() });
  return file.getId();
}

/** Menyimpan file nota/bukti kas ke Drive (nama file sudah dibentuk di klien), lalu mengaitkan URL-nya ke catatan KAS. */
function simpanNotaKas(idKas, base64, mime, namaFile) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, namaFile);
  var file = folder_('Posetive - Nota Kas').createFile(blob);
  saveRecord('KAS', { id: idKas, no_nota: file.getUrl() });
  return file.getUrl();
}

/** Foto profil crew sebagai data URI (base64), atau null bila belum ada foto. */
function getFotoCrew(idCrew) {
  var c = readTab_('CREW').filter(function (x) { return x.id_crew === idCrew; })[0];
  if (!c || !c.foto) return null;
  try {
    var blob = DriveApp.getFileById(c.foto).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) { return null; }
}

/** Menghapus data crew sekaligus foto profilnya di Drive. */
function hapusCrew(id) {
  var c = readTab_('CREW').filter(function (x) { return x.id_crew === id; })[0];
  if (c && c.foto) { try { DriveApp.getFileById(c.foto).setTrashed(true); } catch (e) { } }
  var email = c && emailBersih_(c.email);
  if (email && kalenderAktif_()) {
    var ev = {};
    readTab_('EVENT').forEach(function (e) { ev[e.id_event] = e; });
    readTab_('TUGAS_CREW').filter(function (t) { return t.id_crew === id && ev[t.id_event] && ev[t.id_event].id_kalender; }).forEach(function (t) {
      try { var ce = kalender_().getEventById(ev[t.id_event].id_kalender); if (ce) ce.removeGuest(email); } catch (e) { }
    });
  }
  return deleteRecord('CREW', id);
}

// ---------------------------------------------------------------- fee crew

/** Menyimpan penugasan crew. Bila fee-nya sudah dibayar, nominal di KAS ikut disamakan. */
function simpanTugasCrew(rec) {
  var id = saveRecord('TUGAS_CREW', rec);
  var t = readTab_('TUGAS_CREW').filter(function (x) { return x.id === id; })[0];
  var kas = t && t.id_kas ? readTab_('KAS').filter(function (k) { return k.id === t.id_kas; })[0] : null;
  if (kas) saveRecord('KAS', { id: kas.id, nominal: Number(t.fee) || 0 });
  if (t) cobaSinkron_(t.id_event);
  return id;
}

/**
 * Membayar fee satu atau beberapa penugasan: tiap penugasan menjadi satu baris KAS Keluar "Fee Crew"
 * di event-nya (ikut masuk realisasi RAB fee crew), lalu kode kasnya dicatat di penugasan.
 */
function bayarFeeCrew(ids, bayar) {
  var tugas = readTab_('TUGAS_CREW'), crew = {};
  readTab_('CREW').forEach(function (c) { crew[c.id_crew] = c; });
  ids.forEach(function (id) {
    var t = tugas.filter(function (x) { return x.id === id; })[0];
    if (!t) throw new Error('Penugasan ' + id + ' tidak ditemukan.');
    var c = crew[t.id_crew], nama = c ? (c.nama_panggilan || c.nama_lengkap) : t.id_crew;
    var idKas = saveBy_('KAS', 'sumber', 'TUGAS:' + id, { tanggal: bayar.tanggal, jenis: 'Keluar', kategori: 'Fee Crew',
      nominal: Number(t.fee) || 0, id_event: t.id_event, metode: bayar.metode || '', keterangan: 'Fee crew ' + nama,
      catatan: 'Otomatis dari penugasan ' + id });
    saveRecord('TUGAS_CREW', { id: id, id_kas: idKas });
  });
  return ids.length;
}

/** Membatalkan pembayaran fee: baris KAS-nya dihapus, penugasan kembali "belum dibayar". */
function batalBayarFeeCrew(id) {
  hapusKasTugas_(id);
  saveRecord('TUGAS_CREW', { id: id, id_kas: '' });
  return id;
}

/** Menghapus penugasan beserta baris KAS pembayarannya (bila ada). */
function hapusTugasCrew(id) {
  var t = readTab_('TUGAS_CREW').filter(function (x) { return x.id === id; })[0];
  hapusKasTugas_(id);
  deleteRecord('TUGAS_CREW', id);
  if (t) cobaSinkron_(t.id_event);
  return true;
}

// ---------------------------------------------------------------- Google Calendar

var KALENDER_NAMA = 'Posetive Photobooth';

// KALENDER_AKTIF = '1' setelah dihubungkan dari menu Lainnya; KALENDER_ID tetap disimpan walau diputus, supaya kalender yang sama dipakai lagi.
function kalenderAktif_() { return PropertiesService.getScriptProperties().getProperty('KALENDER_AKTIF') === '1'; }

/** Kalender khusus Posetive di akun pemilik aplikasi; dibuat sekali lalu kodenya disimpan. */
function kalender_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('KALENDER_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.createCalendar(KALENDER_NAMA, { color: CalendarApp.Color.RED });
    props.setProperty('KALENDER_ID', cal.getId());
  }
  return cal;
}

/** "2026-09-26" + "08:30" → Date di zona waktu spreadsheet; null bila jam kosong. */
function waktu_(tanggal, jam, tz) {
  var m = String(jam || '').match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return Utilities.parseDate(tanggal + ' ' + ('0' + m[1]).slice(-2) + ':' + m[2], tz, 'yyyy-MM-dd HH:mm');
}

/**
 * Menyamakan satu event ke Google Calendar: dibuat bila belum ada, diperbarui bila sudah, dihapus bila
 * event batal. Tanpa jam buka → acara sepanjang hari. Tidak melakukan apa pun sebelum kalender dihubungkan.
 */
function sinkronKalender_(idEvent) {
  if (!kalenderAktif_()) return;
  var e = readTab_('EVENT').filter(function (x) { return x.id_event === idEvent; })[0];
  if (!e) return;
  var cal = kalender_(), tz = ss_().getSpreadsheetTimeZone(), ce = null;
  if (e.id_kalender) { try { ce = cal.getEventById(e.id_kalender); } catch (err) { ce = null; } }
  if (e.status === 'Batal' || !e.tanggal) {
    if (ce) ce.deleteEvent();
    if (e.id_kalender) saveRecord('EVENT', { id_event: idEvent, id_kalender: '' });
    return;
  }
  var peng = {};
  readTab_('PENGATURAN').forEach(function (r) { peng[r.kunci] = r.nilai; });
  var mulai = waktu_(e.tanggal, e.jam_buka, tz), selesai = waktu_(e.tanggal, e.jam_tutup, tz);
  if (mulai && !selesai) selesai = new Date(mulai.getTime() + (Number(peng.DURASI_TERCAKUP) || 6) * 36e5);
  if (mulai && selesai <= mulai) selesai = new Date(selesai.getTime() + 864e5); // tutup lewat tengah malam

  var p = e.id_pipeline ? readTab_('PIPELINE').filter(function (x) { return x.id === e.id_pipeline; })[0] : null;
  var crew = {}, emailCrew = {};
  readTab_('CREW').forEach(function (c) { crew[c.id_crew] = c; var m = emailBersih_(c.email); if (m) emailCrew[m] = true; });
  var tugas = readTab_('TUGAS_CREW').filter(function (t) { return t.id_event === idEvent; });
  var tim = tugas.map(function (t) { var c = crew[t.id_crew]; return c ? c.nama_panggilan || c.nama_lengkap : t.id_crew; });
  var baris = [
    'Status: ' + (e.status || '-'),
    'Model: ' + (e.model_pendapatan || '-') + (e.skema ? ' (' + e.skema + ')' : ''),
    p ? 'Klien: ' + p.nama_klien + (p.kontak ? ' · WA ' + p.kontak : '') : '',
    e.model_pendapatan === 'Kontrak Klien' && Number(e.nilai_kontrak) ? 'Nilai kontrak: ' + rupiah_(Number(e.nilai_kontrak)) : '',
    'Crew: ' + (tim.length ? tim.join(', ') : (e.tim || 'belum ditugaskan')),
    e.penanggung_jawab ? 'Penanggung jawab: ' + e.penanggung_jawab : '',
    e.catatan ? '\nCatatan: ' + e.catatan : '',
    '\n' + e.id_event + ' — diatur dari aplikasi Posetive; perubahan langsung di kalender akan tertimpa.'
  ].filter(String);
  var judul = e.nama_event + (e.status === 'Selesai' ? ' (selesai)' : '');
  var lokasi = [e.lokasi, e.kota].filter(String).join(', ');

  if (!ce) {
    ce = mulai ? cal.createEvent(judul, mulai, selesai) : cal.createAllDayEvent(judul, Utilities.parseDate(e.tanggal, tz, 'yyyy-MM-dd'));
    saveRecord('EVENT', { id_event: idEvent, id_kalender: ce.getId() });
  } else {
    ce.setTitle(judul);
    if (mulai) ce.setTime(mulai, selesai); else ce.setAllDayDate(Utilities.parseDate(e.tanggal, tz, 'yyyy-MM-dd'));
  }
  ce.setLocation(lokasi);
  ce.setDescription(baris.join('\n'));

  // Crew yang ditugaskan & punya email diundang; crew yang tidak lagi bertugas dikeluarkan. Tamu lain
  // (mis. owner yang ditambahkan manual) tidak disentuh. Event yang sudah lewat dibiarkan.
  if (e.tanggal < Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd')) return;
  var mau = {}, ada = {};
  tugas.forEach(function (t) { var m = crew[t.id_crew] && emailBersih_(crew[t.id_crew].email); if (m) mau[m] = true; });
  ce.getGuestList().forEach(function (g) {
    var m = String(g.getEmail()).toLowerCase();
    ada[m] = true;
    if (emailCrew[m] && !mau[m]) ce.removeGuest(m);
  });
  Object.keys(mau).forEach(function (m) { if (!ada[m]) ce.addGuest(m); });
}

function emailBersih_(s) {
  var m = String(s || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m) ? m : '';
}

/** Setelah email crew diubah: samakan undangan di semua event mendatang tempat crew itu bertugas. */
function sinkronCrew(idCrew) {
  if (!kalenderAktif_()) return 0;
  var now = Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd'), ev = {}, ids = {};
  readTab_('EVENT').forEach(function (e) { ev[e.id_event] = e; });
  readTab_('TUGAS_CREW').forEach(function (t) { var e = ev[t.id_event]; if (t.id_crew === idCrew && e && e.tanggal >= now) ids[t.id_event] = true; });
  Object.keys(ids).forEach(function (id) { cobaSinkron_(id); });
  return Object.keys(ids).length;
}

/** Sinkron tanpa menggagalkan penyimpanan; mengembalikan pesan peringatan atau ''. */
function cobaSinkron_(idEvent) {
  try { sinkronKalender_(idEvent); return ''; } catch (err) { return 'Tersimpan, tapi gagal sinkron ke Google Calendar: ' + (err && err.message || err); }
}

/**
 * Menghubungkan (membuat kalender bila perlu) lalu menyinkronkan semua event. Jalankan juga sekali dari
 * editor Apps Script bila aplikasi web menolak dengan pesan izin, supaya Google meminta izin Kalender.
 */
function sinkronSemuaKalender() {
  kalender_();
  PropertiesService.getScriptProperties().setProperty('KALENDER_AKTIF', '1');
  var n = 0;
  readTab_('EVENT').forEach(function (e) { sinkronKalender_(e.id_event); n++; });
  return n;
}

/** Memutus sinkron: kalender & jadwalnya dibiarkan di Google Calendar, aplikasi berhenti memperbaruinya. */
function putusKalender() {
  PropertiesService.getScriptProperties().setProperty('KALENDER_AKTIF', '0');
  return true;
}

function hapusKasTugas_(id) {
  readTab_('KAS').filter(function (k) { return String(k.sumber) === 'TUGAS:' + id; })
    .forEach(function (k) { deleteRecord('KAS', k.id); });
}

// ---------------------------------------------------------------- folder, PDF, backup

/** Folder kerja di samping file master (atau di My Drive bila tidak bisa). */
function folder_(nama) {
  var parent;
  try {
    var it = DriveApp.getFileById(ss_().getId()).getParents();
    parent = it.hasNext() ? it.next() : DriveApp.getRootFolder();
    var ada = parent.getFoldersByName(nama);
    return ada.hasNext() ? ada.next() : parent.createFolder(nama);
  } catch (e) {
    var root = DriveApp.getRootFolder();
    var f = root.getFoldersByName(nama);
    return f.hasNext() ? f.next() : root.createFolder(nama);
  }
}

function buatPdf_(html, nama, folderNama) {
  var blob = Utilities.newBlob(html, 'text/html', nama + '.html').getAs('application/pdf').setName(nama + '.pdf');
  return folder_(folderNama).createFile(blob).getUrl();
}
function buatLaporanPdf(html, bulan) { return buatPdf_(html, 'Laporan Posetive ' + bulan, 'Posetive - Laporan'); }
function buatInvoice(html, nomor) { return buatPdf_(html, String(nomor).replace(/\//g, '-'), 'Posetive - Invoice'); }

/** Membuat file .xlsx dari baris data (array 2D) lewat Sheet sementara, lalu simpan ke Drive. */
function buatLaporanEventXlsx(nama, rows) {
  var temp = SpreadsheetApp.create(nama);
  if (rows.length) temp.getSheets()[0].getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
  var url = 'https://www.googleapis.com/drive/v3/files/' + temp.getId() + '/export?mimeType=' +
    encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  var blob = resp.getBlob().setName(nama + '.xlsx');
  var out = folder_('Posetive - Laporan Event').createFile(blob);
  DriveApp.getFileById(temp.getId()).setTrashed(true);
  return out.getUrl();
}

/** Salinan file master ke folder "Posetive - Backup"; hanya 8 salinan terbaru yang disimpan. */
function backupSekarang() {
  var tz = ss_().getSpreadsheetTimeZone();
  var nama = 'Backup POSETIVE ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HHmm');
  var fol = folder_('Posetive - Backup');
  var copy = DriveApp.getFileById(ss_().getId()).makeCopy(nama, fol);
  var files = [];
  var it = fol.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('Backup POSETIVE') === 0) files.push(f);
  }
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(8).forEach(function (f) { f.setTrashed(true); });
  return copy.getUrl();
}

// ---------------------------------------------------------------- pengingat email

function addHari_(s, n) {
  var p = s.split('-');
  return new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n)).toISOString().slice(0, 10);
}

function stok_(mutasi, bahan) {
  var urut = { Masuk: 0, Keluar: 0, 'Hitung Fisik': 1 };
  var rows = mutasi.filter(function (m) { return m.bahan === bahan; }).sort(function (a, b) {
    return a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? -1 : 1) : (urut[a.jenis] - urut[b.jenis]) || (a.id < b.id ? -1 : 1);
  });
  if (!rows.length) return null;
  var n = 0;
  rows.forEach(function (m) { var j = Number(m.jumlah) || 0; n = m.jenis === 'Hitung Fisik' ? j : m.jenis === 'Masuk' ? n + j : n - j; });
  return n;
}

/** Daftar hal yang perlu diingat hari ini (HTML), atau '' bila tidak ada. */
function isiPengingat_() {
  var d = getData(), now = d.hariIni, besok = addHari_(now, 1), P = d.pengaturan, bag = [];
  var li = function (arr) { return '<ul>' + arr.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; };
  var ev = d.event.filter(function (e) { return e.status === 'Terkonfirmasi' && (e.tanggal === now || e.tanggal === besok); });
  if (ev.length) bag.push('<h3>Event hari ini & besok</h3>' + li(ev.map(function (e) {
    return '<b>' + (e.tanggal === now ? 'HARI INI' : 'BESOK') + '</b> — ' + e.nama_event + (e.lokasi ? ' @ ' + e.lokasi : '') + (e.jam_buka ? ' (' + e.jam_buka + ')' : '');
  })));
  var fu = d.pipeline.filter(function (p) { return ['Deal', 'Kalah', 'Batal'].indexOf(p.status) < 0 && p.follow_up && p.follow_up <= now; });
  if (fu.length) bag.push('<h3>Follow-up jatuh tempo</h3>' + li(fu.map(function (p) {
    return p.nama_klien + (p.referensi ? ' (' + p.referensi + ')' : '') + ' — ' + (p.follow_up < now ? 'terlewat sejak ' + p.follow_up : 'hari ini') + (p.kontak ? ' · WA ' + p.kontak : '');
  })));
  var lewat = {};
  d.event.forEach(function (e) { lewat[e.id_event] = e; });
  var hilang = d.pemakaian.filter(function (a) { var e = lewat[a.id_event]; return e && e.tanggal < now && a.dibawa === 'Ya' && a.kembali !== 'Ya'; });
  if (hilang.length) bag.push('<h3>Alat belum kembali</h3>' + li(hilang.map(function (a) { return a.nama_alat + ' — ' + a.id_event; })));
  var tutup = d.event.filter(function (e) { return e.status === 'Terkonfirmasi' && e.tanggal && e.tanggal < now; });
  if (tutup.length) bag.push('<h3>Event belum ditutup</h3>' + li(tutup.map(function (e) { return e.nama_event + ' (' + e.tanggal + ') — isi laporan'; })));
  var tagih = tagihanJatuhTempo_(d, addHari_(now, 3));
  if (tagih.length) bag.push('<h3>Tagihan klien</h3>' + li(tagih.map(function (t) {
    return t.e.nama_event + ' — ' + t.tahap + ' ' + rupiah_(t.kurang) + ', ' + (t.jatuh < now ? 'terlambat sejak ' + t.jatuh : t.jatuh === now ? 'jatuh tempo hari ini' : 'jatuh tempo ' + t.jatuh);
  })));
  var fee = feeBelumDibayar_(d, now);
  if (fee.length) bag.push('<h3>Fee crew belum dibayar</h3>' + li(fee));
  var k = stok_(d.mutasi, 'Kertas 4R');
  if (k !== null && k < Number(P.STOK_MIN_KERTAS || 100)) bag.push('<h3>Stok</h3>' + li(['Kertas 4R tinggal ' + k + ' lembar']));
  return bag.join('');
}

function rupiah_(n) { return 'Rp' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

/** Tagihan kontrak klien yang belum lunas dan jatuh tempo paling lambat `batas` (logika sama dengan tagihan() di Index.html). */
function tagihanJatuhTempo_(d, batas) {
  var masuk = {};
  d.kas.forEach(function (k) {
    if (k.id_event && k.jenis === 'Masuk' && k.kategori !== 'Setoran Owner') masuk[k.id_event] = (masuk[k.id_event] || 0) + (Number(k.nominal) || 0);
  });
  var out = [];
  d.event.forEach(function (e) {
    var kontrak = Number(e.nilai_kontrak) || 0;
    if (e.model_pendapatan !== 'Kontrak Klien' || !kontrak || e.status === 'Batal') return;
    var bayar = masuk[e.id_event] || 0, dp = Math.min(Number(e.dp_nominal) || 0, kontrak);
    if (bayar >= kontrak) return;
    var isDp = dp > 0 && bayar < dp;
    var jatuh = isDp ? e.jatuh_tempo_dp : (e.jatuh_tempo_pelunasan || e.tanggal);
    if (jatuh && jatuh <= batas) out.push({ e: e, tahap: isDp ? 'DP' : 'pelunasan', kurang: (isDp ? dp : kontrak) - bayar, jatuh: jatuh });
  });
  return out.sort(function (a, b) { return a.jatuh < b.jatuh ? -1 : 1; });
}

/** Fee crew dari event yang sudah lewat tapi belum dibayar, dikelompokkan per crew. */
function feeBelumDibayar_(d, now) {
  var ev = {}, kas = {}, crew = {}, per = {};
  d.event.forEach(function (e) { ev[e.id_event] = e; });
  d.kas.forEach(function (k) { kas[k.id] = true; });
  d.crew.forEach(function (c) { crew[c.id_crew] = c; });
  d.tugas.forEach(function (t) {
    var e = ev[t.id_event];
    if (!e || e.status === 'Batal' || !(e.tanggal < now) || (t.id_kas && kas[t.id_kas])) return;
    var p = per[t.id_crew] = per[t.id_crew] || { n: 0, fee: 0 };
    p.n++; p.fee += Number(t.fee) || 0;
  });
  return Object.keys(per).map(function (id) {
    var c = crew[id];
    return (c ? c.nama_panggilan || c.nama_lengkap : id) + ' — ' + rupiah_(per[id].fee) + ' (' + per[id].n + ' event)';
  });
}

function kirim_(isi, paksa) {
  if (!isi && !paksa) return false;
  var tz = ss_().getSpreadsheetTimeZone();
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'Posetive — pengingat ' + Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px">' + (isi || '<p>Tidak ada yang mendesak hari ini.</p>') +
      '<p style="color:#888;font-size:12px">Dikirim otomatis oleh aplikasi Posetive.</p></div>'
  });
  return true;
}
/** Dipanggil pemicu harian. Email hanya dikirim bila ada yang perlu diingat. */
function kirimPengingat() { kirim_(isiPengingat_(), false); }
function kirimPengingatTes() { kirim_(isiPengingat_(), true); return Session.getEffectiveUser().getEmail(); }

// ---------------------------------------------------------------- pemicu otomatis

var PEMICU = { pengingat: 'kirimPengingat', backup: 'backupSekarang' };

function statusOtomatis() {
  var t = ScriptApp.getProjectTriggers().map(function (x) { return x.getHandlerFunction(); });
  return { pengingat: t.indexOf(PEMICU.pengingat) >= 0, backup: t.indexOf(PEMICU.backup) >= 0, email: Session.getEffectiveUser().getEmail() };
}

/** Menyalakan/mematikan pengingat harian (07.00) atau backup mingguan (Minggu 21.00). */
function aturOtomatis(nama, aktif) {
  var fn = PEMICU[nama];
  if (!fn) throw new Error('Tidak dikenal: ' + nama);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t); });
  if (aktif) {
    var b = ScriptApp.newTrigger(fn).timeBased();
    if (nama === 'pengingat') b.everyDays(1).atHour(7).create();
    else b.onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(21).create();
  }
  return statusOtomatis();
}
