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
  MUTASI_STOK: { id: 'id', prefix: 'MS-', pad: 4 }
};
var MUTASI_HEAD = ['id', 'tanggal', 'bahan', 'jenis', 'jumlah', 'id_event', 'sumber', 'catatan'];
// Pengaturan yang ditambahkan otomatis bila belum ada di tab PENGATURAN.
var PENGATURAN_BARU = [
  ['STOK_MIN_KERTAS', 100, 'lembar', 'Peringatan bila stok kertas 4R di bawah angka ini'],
  ['STOK_MIN_BUKU', 5, 'buku', 'Peringatan bila stok Graduation Book di bawah angka ini'],
  ['TINTA_MIN', 0.2, 'persen', 'Peringatan bila level tinta terendah di bawah angka ini'],
  ['CREW_DEFAULT', 2, 'orang', 'Jumlah crew default di kalkulator skema']
];
// Kolom yang harus disimpan sebagai teks (supaya 0 di depan nomor HP tidak hilang).
var TEXT_COLS = ['id', 'id_event', 'id_pipeline', 'id_alat', 'kontak', 'no_nota', 'parameter_skema', 'jam_buka',
  'jam_tutup', 'jam_buka_aktual', 'jam_tutup_aktual', 'jam_ramai'];

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
  return h.indexOf('tanggal') === 0 || h === 'follow_up';
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
  return idEvent;
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
  return rec.id_event;
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
