/**
 * Posetive — aplikasi manajemen (Google Apps Script, terpasang di file DATABASE MASTER).
 * Server inti: membaca & menulis tab di spreadsheet ini. Fitur lain ada di file .gs terpisah (Event, Crew,
 * Kalender, Laporan, Pengingat, Pengaturan) — Apps Script menggabungkan semuanya otomatis.
 * Tampilan: Index.html (kerangka) + Css.html + Js*.html; semua perhitungan dilakukan di sisi tampilan.
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
  ['PENYUSUTAN_HARGA_MIN', 250000, 'Rp', 'Barang Inventaris (kategori Aset, milik Posetive) di bawah harga ini tidak dihitung penyusutan']
];
// Kolom baru di tab LAPORAN_EVENT, EVENT, INVENTARIS, dan KAS yang ditambahkan otomatis bila belum ada (di kolom paling kanan).
var LAPORAN_KOLOM_BARU = ['sesi_terjual', 'lembar_tambahan', 'admin_qris', 'admin_pencairan', 'realisasi_penyusutan', 'realisasi_jepreto',
  'realisasi_biaya_lembar', 'realisasi_biaya_buku'];
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
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Posetive')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Dipakai di Index.html (<?!= include('Css'); ?>) untuk menyisipkan isi file HTML lain apa adanya. */
function include(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
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
    saveRecord_('MUTASI_STOK', { tanggal: tgl, bahan: 'Kertas 4R', jenis: 'Hitung Fisik', jumlah: Number(lap.stok_kertas_akhir_fisik),
      id_event: lap.id_event, sumber: 'AWAL', catatan: 'CEK: stok awal diambil dari hitung fisik laporan ' + lap.id_event + '. Hitung ulang & koreksi bila perlu.' });
  }
  if (lap.stok_buku_awal !== '') {
    saveRecord_('MUTASI_STOK', { tanggal: tgl, bahan: 'Graduation Book', jenis: 'Hitung Fisik',
      jumlah: Number(lap.stok_buku_awal) - Number(lap.grad_book_terjual || 0) - Number(lap.buku_rusak || 0),
      id_event: lap.id_event, sumber: 'AWAL', catatan: 'Stok awal dari laporan ' + lap.id_event });
  }
}

/** Semua data yang dibutuhkan aplikasi, dalam satu panggilan. */
function getData_() {
  siapkan_();
  return {
    pengaturan: pengaturan_(),
    pilihan: pilihan_(),
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

/** Tab PENGATURAN sebagai {kunci: nilai}. */
function pengaturan_() {
  var o = {};
  readTab_('PENGATURAN').forEach(function (r) { o[r.kunci] = r.nilai; });
  return o;
}

/** Tab PILIHAN (isi dropdown) sebagai {judul kolom: [nilai]}. */
function pilihan_() {
  var pv = sheet_('PILIHAN').getDataRange().getValues(), o = {};
  pv[0].forEach(function (h, c) {
    if (!h) return;
    o[h] = pv.slice(1).map(function (r) { return r[c]; }).filter(function (v) { return v !== ''; });
  });
  return o;
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
function saveRecord_(tab, rec) {
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

function deleteRecord_(tab, id) {
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

/** Menyimpan catatan berdasarkan kolom kunci selain kode (mis. sumber otomatis), membuat baru bila belum ada. */
function saveBy_(tab, col, val, rec) {
  var hit = readTab_(tab).filter(function (r) { return String(r[col]) === String(val); })[0];
  rec[col] = val;
  if (hit) rec[TABS[tab].id] = hit[TABS[tab].id];
  return saveRecord_(tab, rec);
}

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

function rupiah_(n) { return 'Rp' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
