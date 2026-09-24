/**
 * Posetive — SOP event: bacaan + langkah yang dicentang tim per event.
 * Tab SOP (diubah admin lewat Lainnya → SOP):
 *   jenis   'baca' = bagian bacaan, 'langkah' = langkah yang dicentang per event
 *   peran   FC | Operator Depan | Operator Cetak | Semua (siapa yang mengerjakan)
 *   wajib   'Ya' = harus dicentang sebelum crew bisa mengirim laporan ke admin (mis. uji coba)
 *   berlaku '' = semua event | 'Berbayar di booth' = selain Kontrak Klien | 'Kontrak Klien'
 * Tab SOP_EVENT: satu baris per langkah yang sudah dicentang di satu event (siapa & kapan).
 */

var SOP_HEAD = ['id', 'fase', 'urutan', 'jenis', 'peran', 'judul', 'isi', 'wajib', 'berlaku', 'aktif'];
var SOP_EVENT_HEAD = ['id', 'id_event', 'id_langkah', 'dicentang_oleh', 'dicentang_pada', 'catatan'];
var PERAN_TUGAS = ['FC', 'Operator Depan', 'Operator Cetak'];

/** Membuat tab SOP (diisi SOP awal bila tersedia) & SOP_EVENT bila belum ada. Dipanggil dari siapkan_. */
function siapkanSop_() {
  var ss = ss_();
  [['SOP', SOP_HEAD], ['SOP_EVENT', SOP_EVENT_HEAD]].forEach(function (x) {
    if (ss.getSheetByName(x[0])) return;
    var sh = ss.insertSheet(x[0]);
    sh.appendRow(x[1]);
    sh.getRange(1, 1, 1, x[1].length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 999, x[1].length).setNumberFormat('@');
    // Isi SOP awal ada di SopAwal.gs — sengaja tidak masuk repo GitHub (publik); hanya dikirim ke Apps Script.
    if (x[0] === 'SOP' && typeof SOP_AWAL !== 'undefined') {
      var rows = SOP_AWAL.map(function (r, i) {
        return SOP_HEAD.map(function (h) { return h === 'id' ? 'SOP-' + ('00' + (i + 1)).slice(-3) : h === 'urutan' ? String((i + 1) * 10) : h === 'aktif' ? 'Ya' : String(r[h] || ''); });
      });
      if (rows.length) sh.getRange(2, 1, rows.length, SOP_HEAD.length).setValues(rows);
    }
  });
  tambahanSop_();
}

/**
 * Tambahan SOP (SOP_TAMBAHAN di SopAwal.gs): tiap butir ditambahkan sekali saja, tepat setelah bagian berjudul
 * `setelah`, dan dicatat di Script Properties ({id, v}). Bila `versi` butir dinaikkan, judul & isi baris yang sudah
 * ada diperbarui sekali. Butir yang kemudian dihapus admin tidak ditambahkan lagi.
 */
function tambahanSop_() {
  if (typeof SOP_TAMBAHAN === 'undefined') return;
  var props = PropertiesService.getScriptProperties();
  SOP_TAMBAHAN.forEach(function (t) {
    var kunci = 'SOP_TAMBAH:' + t.kunci, versi = Number(t.versi) || 1, raw = props.getProperty(kunci), cat = null;
    if (raw) { try { cat = JSON.parse(raw); } catch (e) { } if (!cat || typeof cat !== 'object') cat = { id: '', v: 1 }; }
    if (cat && cat.v >= versi) return;
    var sop = readTab_('SOP');
    if (cat) { // sudah pernah ditambahkan → perbarui isinya bila barisnya masih ada
      var ada = sop.filter(function (s) { return cat.id ? s.id === cat.id : s.judul === t.judul; })[0];
      if (ada) saveRecord_('SOP', { id: ada.id, judul: String(t.judul), isi: String(t.isi || '') });
      props.setProperty(kunci, JSON.stringify({ id: ada ? ada.id : cat.id, v: versi }));
      return;
    }
    var acuan = sop.filter(function (s) { return s.judul === t.setelah; })[0];
    var akhir = sop.reduce(function (m, s) { return Math.max(m, Number(s.urutan) || 0); }, 0);
    var rec = {};
    SOP_HEAD.forEach(function (h) { if (h !== 'id') rec[h] = t[h] == null ? '' : String(t[h]); });
    rec.urutan = String(acuan ? (Number(acuan.urutan) || 0) + 5 : akhir + 10);
    rec.aktif = 'Ya';
    props.setProperty(kunci, JSON.stringify({ id: saveRecord_('SOP', rec), v: versi }));
  });
}

function sopAktif_() {
  return readTab_('SOP').filter(function (s) { return s.aktif !== 'Tidak'; })
    .sort(function (a, b) { return (Number(a.urutan) || 0) - (Number(b.urutan) || 0); });
}

/** Langkah ini berlaku untuk event ini? (mis. uji QRIS tidak dipakai di event Kontrak Klien) */
function sopBerlaku_(s, e) {
  var b = String(s.berlaku || '');
  if (!b) return true;
  if (b === 'Kontrak Klien') return e.model_pendapatan === 'Kontrak Klien';
  if (b === 'Berbayar di booth') return e.model_pendapatan !== 'Kontrak Klien';
  return true;
}

/** Ringkasan SOP satu event: {total, selesai, wajibKurang: [judul], terlewat: [judul]}. */
function progresSop_(e, sop, centang) {
  var sudah = {};
  centang.forEach(function (c) { if (c.id_event === e.id_event) sudah[c.id_langkah] = true; });
  var langkah = sop.filter(function (s) { return s.jenis === 'langkah' && sopBerlaku_(s, e); });
  var belum = langkah.filter(function (s) { return !sudah[s.id]; });
  return { total: langkah.length, selesai: langkah.length - belum.length,
    wajibKurang: belum.filter(function (s) { return s.wajib === 'Ya'; }).map(function (s) { return s.judul; }),
    terlewat: belum.map(function (s) { return s.judul; }) };
}

/** Mencentang / membatalkan centang satu langkah. Admin: kapan saja. Crew: lewat centangSopCrew_ (dijaga). */
function centangSop_(u, idEvent, idLangkah, centang, catatan) {
  var e = readTab_('EVENT').filter(function (x) { return x.id_event === idEvent; })[0];
  var s = readTab_('SOP').filter(function (x) { return x.id === idLangkah; })[0];
  if (!e) throw new Error('Event tidak ditemukan.');
  if (!s || s.jenis !== 'langkah') throw new Error('Langkah SOP tidak ditemukan.');
  var ada = readTab_('SOP_EVENT').filter(function (c) { return c.id_event === idEvent && c.id_langkah === idLangkah; })[0];
  if (centang) {
    var rec = { id_event: idEvent, id_langkah: idLangkah, dicentang_oleh: u.nama, dicentang_pada: waktuSekarang_(), catatan: teksAman_(catatan, 300) };
    if (ada) rec.id = ada.id;
    saveRecord_('SOP_EVENT', rec);
  } else if (ada) deleteRecord_('SOP_EVENT', ada.id);
  return readTab_('SOP_EVENT').filter(function (c) { return c.id_event === idEvent; });
}

function centangSopCrew_(u, idEvent, idLangkah, centang, catatan) {
  cekBisaIsi_(u, idEvent);
  return centangSop_(u, idEvent, idLangkah, centang, catatan);
}

/** Peran seseorang di event (FC / Operator Depan / Operator Cetak), dari penugasan. */
function peranTugas_(t) { return PERAN_TUGAS.indexOf(t.peran) >= 0 ? t.peran : ''; }
