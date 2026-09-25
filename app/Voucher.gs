/**
 * Posetive — voucher mitra (mis. Sinektive) per event: daftar kode yang bisa ditukar di booth.
 * Voucher = potongan harga senilai EVENT.voucher_nilai per sesi. Tamu tetap sesi biasa (membayar harga − potongan);
 * potongannya ditagihkan ke mitra setelah acara: jumlah voucher ditukar × nilai.
 * Tab VOUCHER: satu baris per kode. Admin mengisi daftar; crew menukar (mencentang) di hari event.
 */

var VOUCHER_HEAD = ['id', 'id_event', 'kode', 'pemegang', 'ditukar', 'ditukar_oleh', 'ditukar_pada', 'riwayat'];
var KAT_KLAIM_VOUCHER = 'Klaim Voucher Mitra';

function siapkanVoucher_() {
  tambahKolom_('EVENT', ['voucher_mitra', 'voucher_nilai']);
  var ss = ss_();
  if (ss.getSheetByName('VOUCHER')) return;
  var sh = ss.insertSheet('VOUCHER');
  sh.appendRow(VOUCHER_HEAD);
  sh.getRange(1, 1, 1, VOUCHER_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, 1999, VOUCHER_HEAD.length).setNumberFormat('@');
}

function kunciKode_(k) { return String(k || '').trim().toUpperCase(); }
function voucherEvent_(idEvent) { siapkanVoucher_(); return readTab_('VOUCHER').filter(function (v) { return v.id_event === idEvent; }); }

/**
 * Menambahkan banyak voucher sekaligus. teks: satu voucher per baris, "KODE" atau "KODE, nama pemegang"
 * (pemisah koma, titik koma, atau tab — cocok ditempel dari spreadsheet). Kode dobel di event yang sama dilewati.
 */
function tambahVoucher_(u, idEvent, teks) {
  if (!readTab_('EVENT').some(function (e) { return e.id_event === idEvent; })) throw new Error('Event tidak ditemukan.');
  var ada = {}, baru = [], dobel = [];
  voucherEvent_(idEvent).forEach(function (v) { ada[kunciKode_(v.kode)] = true; });
  String(teks || '').split(/\r?\n/).forEach(function (baris) {
    var bagian = baris.split(/\t|;|,/), kode = String(bagian[0] || '').trim();
    if (!kode) return;
    if (kode.length > 40) throw new Error('Kode terlalu panjang: ' + kode.slice(0, 20) + '…');
    var k = kunciKode_(kode);
    if (ada[k]) { dobel.push(kode); return; }
    ada[k] = true;
    baru.push({ kode: teksAman_(kode, 40), pemegang: teksAman_(bagian.slice(1).join(' ').trim(), 80) });
  });
  if (!baru.length) return { ditambah: 0, dobel: dobel };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_('VOUCHER'), v = sh.getDataRange().getValues(), mulai = lastDataRow_(v) + 1, nomor = nextId_(v, 0, { prefix: 'VC-', pad: 5 });
    var n = Number(nomor.slice(3));
    var rows = baru.map(function (b, i) { return ['VC-' + ('0000' + (n + i)).slice(-5), idEvent, b.kode, b.pemegang, '', '', '', 'Ditambahkan ' + u.nama + ' ' + waktuSekarang_()]; });
    sh.getRange(mulai, 1, rows.length, VOUCHER_HEAD.length).setNumberFormat('@').setValues(rows);
  } finally { lock.releaseLock(); }
  return { ditambah: baru.length, dobel: dobel };
}

/** Menghapus voucher yang belum ditukar (salah input). Voucher yang sudah ditukar tidak bisa dihapus — jadi bukti klaim. */
function hapusVoucher_(u, id) {
  var v = readTab_('VOUCHER').filter(function (x) { return x.id === id; })[0];
  if (!v) throw new Error('Voucher tidak ditemukan.');
  if (v.ditukar === 'Ya') throw new Error('Voucher ' + v.kode + ' sudah ditukar — tidak bisa dihapus. Batalkan penukarannya dulu bila salah.');
  deleteRecord_('VOUCHER', id);
  return true;
}

/**
 * Menukar (tukar = true) atau membatalkan penukaran satu voucher. Dikunci supaya satu kode tidak bisa ditukar
 * dua kali bersamaan. Setiap tukar & batal dicatat di kolom riwayat. Mengembalikan daftar voucher event itu.
 */
function tukarVoucher_(u, id, tukar) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var v;
  try {
    v = readTab_('VOUCHER').filter(function (x) { return x.id === id; })[0];
    if (!v) throw new Error('Voucher tidak ditemukan.');
    var jam = waktuSekarang_(), riwayat = String(v.riwayat || '');
    if (tukar) {
      if (v.ditukar === 'Ya') throw new Error('Voucher ' + v.kode + ' SUDAH DITUKAR pukul ' + String(v.ditukar_pada).slice(11) + ' oleh ' + v.ditukar_oleh + '.');
      saveRecordTanpaKunci_('VOUCHER', { id: id, ditukar: 'Ya', ditukar_oleh: u.nama, ditukar_pada: jam, riwayat: (riwayat ? riwayat + '; ' : '') + 'Ditukar ' + u.nama + ' ' + jam });
    } else {
      if (v.ditukar !== 'Ya') return voucherEvent_(v.id_event);
      saveRecordTanpaKunci_('VOUCHER', { id: id, ditukar: '', ditukar_oleh: '', ditukar_pada: '', riwayat: (riwayat ? riwayat + '; ' : '') + 'Dibatalkan ' + u.nama + ' ' + jam + ' (sebelumnya ' + v.ditukar_oleh + ' ' + v.ditukar_pada + ')' });
    }
  } finally { lock.releaseLock(); }
  return voucherEvent_(v.id_event);
}

/** Crew: hanya di event tempat ia bertugas, pada hari event (sama dengan checklist & laporan). */
function tukarVoucherCrew_(u, id, tukar) {
  var v = readTab_('VOUCHER').filter(function (x) { return x.id === id; })[0];
  if (!v) throw new Error('Voucher tidak ditemukan.');
  cekBisaIsi_(u, v.id_event);
  return tukarVoucher_(u, id, tukar);
}

/** saveRecord_ memakai LockService sendiri; di dalam kunci yang sama dipakai versi tanpa kunci. */
function saveRecordTanpaKunci_(tab, rec) {
  var sh = sheet_(tab), values = sh.getDataRange().getValues(), head = values[0].map(String), idCol = head.indexOf('id');
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) !== String(rec.id)) continue;
    head.forEach(function (h, c) { if (Object.prototype.hasOwnProperty.call(rec, h)) sh.getRange(i + 1, c + 1).setNumberFormat('@').setValue(rec[h] == null ? '' : String(rec[h])); });
    return rec.id;
  }
  throw new Error('Kode ' + rec.id + ' tidak ditemukan di ' + tab + '.');
}

/** Jumlah voucher ditukar & total potongannya di satu event (untuk laporan & tagihan mitra). */
function ringkasVoucher_(e) {
  var n = voucherEvent_(e.id_event).filter(function (v) { return v.ditukar === 'Ya'; }).length, nilai = Number(e.voucher_nilai) || 0;
  return { jumlah: n, nilai: nilai, potongan: n * nilai, mitra: e.voucher_mitra || 'mitra' };
}
