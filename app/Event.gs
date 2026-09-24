/**
 * Posetive — event, laporan event, kas, stok, dan checklist alat.
 */

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

/** Menyimpan file nota/bukti kas ke Drive (nama file sudah dibentuk di klien), lalu mengaitkan URL-nya ke catatan KAS. */
function simpanNotaKas(idKas, base64, mime, namaFile) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, namaFile);
  var file = folder_('Posetive - Nota Kas').createFile(blob);
  saveRecord('KAS', { id: idKas, no_nota: file.getUrl() });
  return file.getUrl();
}
