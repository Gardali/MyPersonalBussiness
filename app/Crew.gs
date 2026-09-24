/**
 * Posetive — data crew, penugasan, dan pembayaran fee crew.
 */

// ---------------------------------------------------------------- crew

/** Menyimpan foto profil crew ke folder Drive privat (tidak dibagikan), lalu mengaitkannya ke data crew. */
function simpanFotoCrew_(idCrew, base64, mime, namaFile) {
  var lama = readTab_('CREW').filter(function (c) { return c.id_crew === idCrew; })[0];
  if (lama && lama.foto) { try { DriveApp.getFileById(lama.foto).setTrashed(true); } catch (e) { } }
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, namaFile || idCrew);
  var file = folder_('Posetive - Foto Crew').createFile(blob);
  saveRecord_('CREW', { id_crew: idCrew, foto: file.getId() });
  return file.getId();
}

/** Foto profil crew sebagai data URI (base64), atau null bila belum ada foto. */
function getFotoCrew_(idCrew) {
  var c = readTab_('CREW').filter(function (x) { return x.id_crew === idCrew; })[0];
  if (!c || !c.foto) return null;
  try {
    var blob = DriveApp.getFileById(c.foto).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) { return null; }
}

/** Menghapus data crew sekaligus foto profilnya di Drive. */
function hapusCrew_(id) {
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
  return deleteRecord_('CREW', id);
}

// ---------------------------------------------------------------- fee crew

/** Menyimpan penugasan crew. Bila fee-nya sudah dibayar, nominal di KAS ikut disamakan. */
function simpanTugasCrew_(rec) {
  var id = saveRecord_('TUGAS_CREW', rec);
  var t = readTab_('TUGAS_CREW').filter(function (x) { return x.id === id; })[0];
  var kas = t && t.id_kas ? readTab_('KAS').filter(function (k) { return k.id === t.id_kas; })[0] : null;
  if (kas) saveRecord_('KAS', { id: kas.id, nominal: Number(t.fee) || 0 });
  if (t) cobaSinkron_(t.id_event);
  return id;
}

/**
 * Membayar fee satu atau beberapa penugasan: tiap penugasan menjadi satu baris KAS Keluar "Fee Crew"
 * di event-nya (ikut masuk realisasi RAB fee crew), lalu kode kasnya dicatat di penugasan.
 */
function bayarFeeCrew_(ids, bayar) {
  var tugas = readTab_('TUGAS_CREW'), crew = {};
  readTab_('CREW').forEach(function (c) { crew[c.id_crew] = c; });
  ids.forEach(function (id) {
    var t = tugas.filter(function (x) { return x.id === id; })[0];
    if (!t) throw new Error('Penugasan ' + id + ' tidak ditemukan.');
    var c = crew[t.id_crew], nama = c ? (c.nama_panggilan || c.nama_lengkap) : t.id_crew;
    var idKas = saveBy_('KAS', 'sumber', 'TUGAS:' + id, { tanggal: bayar.tanggal, jenis: 'Keluar', kategori: 'Fee Crew',
      nominal: Number(t.fee) || 0, id_event: t.id_event, metode: bayar.metode || '', keterangan: 'Fee crew ' + nama,
      catatan: 'Otomatis dari penugasan ' + id });
    saveRecord_('TUGAS_CREW', { id: id, id_kas: idKas });
  });
  return ids.length;
}

/** Membatalkan pembayaran fee: baris KAS-nya dihapus, penugasan kembali "belum dibayar". */
function batalBayarFeeCrew_(id) {
  hapusKasTugas_(id);
  saveRecord_('TUGAS_CREW', { id: id, id_kas: '' });
  return id;
}

/** Menghapus penugasan beserta baris KAS pembayarannya (bila ada). */
function hapusTugasCrew_(id) {
  var t = readTab_('TUGAS_CREW').filter(function (x) { return x.id === id; })[0];
  hapusKasTugas_(id);
  deleteRecord_('TUGAS_CREW', id);
  if (t) cobaSinkron_(t.id_event);
  return true;
}

function hapusKasTugas_(id) {
  readTab_('KAS').filter(function (k) { return String(k.sumber) === 'TUGAS:' + id; })
    .forEach(function (k) { deleteRecord_('KAS', k.id); });
}
