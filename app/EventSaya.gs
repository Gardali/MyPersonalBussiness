/**
 * Posetive — tampilan crew ("Event saya"): data yang sudah disaring di server dan penyimpanan yang dijaga.
 * Crew hanya menerima event tempat ia bertugas (hari ini & mendatang) — tanpa kas, omzet, kontrak, fee, atau HPP.
 * Checklist & laporan hanya bisa disimpan pada hari event, sampai pukul 06.00 esok harinya.
 */

var JAM_TUTUP_ISI = 6; // event hari ini masih bisa diisi sampai pukul 06.00 besok (event malam / laporan setelah bongkar)

// Isian laporan yang boleh dikirim crew. Admin QRIS & admin pencairan (masuk ke KAS) tetap diisi admin.
var LAPORAN_CREW_TEKS = ['jam_setup_mulai', 'jam_setup_selesai', 'jam_buka_aktual', 'jam_tutup_aktual', 'jam_ramai', 'kendala', 'keluhan_pengunjung', 'rekomendasi', 'catatan'];
var LAPORAN_CREW_ANGKA = ['antrean_terpanjang', 'downtime_menit', 'jumlah_transaksi', 'sesi_terjual', 'lembar_tambahan', 'grad_book_terjual',
  'grup_potongan', 'softfile_terkirim', 'counter_awal', 'counter_akhir', 'lembar_uji_bonus', 'lembar_gagal', 'tunai_dihitung',
  'modal_kembalian', 'qris_transfer', 'stok_kertas_awal', 'stok_kertas_akhir_fisik', 'stok_buku_awal', 'buku_rusak', 'tinta_terendah_persen',
  'powerstation_awal', 'powerstation_akhir', 'softfile_gagal', 'cetak_ulang_voucher'];
var KONDISI_DEFAULT = ['Baik', 'Perlu Perbaikan', 'Rusak', 'Hilang'];

function hariIni_() { return Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
/** Tanggal "hari kerja": sama dengan hari ini, kecuali sebelum pukul 06.00 = kemarin (event malam belum selesai dilaporkan). */
function hariKerja_() { return Utilities.formatDate(new Date(Date.now() - JAM_TUTUP_ISI * 36e5), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }
/** Event tanggal ini boleh diisi sekarang? Hari ini, atau kemarin selama belum pukul 06.00. */
function bisaIsiTanggal_(tanggal) { tanggal = String(tanggal); return tanggal === hariIni_() || tanggal === hariKerja_(); }

/** Semua yang dibutuhkan tampilan crew, dalam satu panggilan. */
function dataCrew_(u) {
  siapkanSop_();
  siapkanVoucher_();
  var hari = hariKerja_(), idc = String(u.id_crew || '');
  var tugas = readTab_('TUGAS_CREW'), nama = {}, peranCrew = {};
  readTab_('CREW').forEach(function (c) { nama[c.id_crew] = c.nama_panggilan || c.nama_lengkap || c.id_crew; peranCrew[c.id_crew] = c.role || ''; });
  var milik = {};
  tugas.forEach(function (t) { if (idc && String(t.id_crew) === idc) milik[t.id_event] = true; });
  var pipeline = {};
  readTab_('PIPELINE').forEach(function (p) { pipeline[p.id] = p; });

  var semuaEvent = readTab_('EVENT'), event = semuaEvent.filter(function (e) {
    return milik[e.id_event] && e.status !== 'Batal' && /^\d{4}-\d{2}-\d{2}$/.test(String(e.tanggal)) && String(e.tanggal) >= hari;
  });
  var ids = {};
  event.forEach(function (e) { ids[e.id_event] = true; });

  // Checklist: baris event sendiri, daftar alat (Aset), nama set tanpa kode, dan checklist terakhir untuk "Salin dari event terakhir".
  var pemakaian = readTab_('PEMAKAIAN_ALAT'), tglEvent = {};
  semuaEvent.forEach(function (e) { tglEvent[e.id_event] = String(e.tanggal); });
  var set = {}, perEvent = {};
  pemakaian.forEach(function (a) {
    if (!a.id_alat && a.nama_alat) set[a.nama_alat] = true;
    if (tglEvent[a.id_event] !== undefined) (perEvent[a.id_event] = perEvent[a.id_event] || []).push(a);
  });
  var urutChecklist = Object.keys(perEvent).sort(function (a, b) { return tglEvent[a] < tglEvent[b] ? 1 : -1; });

  var disetujui = {};
  var sop = sopAktif_();
  var laporan = readTab_('LAPORAN_EVENT').filter(function (l) { return ids[l.id_event]; }).map(function (l) {
    var o = { id_event: l.id_event };
    LAPORAN_CREW_TEKS.concat(LAPORAN_CREW_ANGKA, LAPORAN_SISTEM).forEach(function (k) { o[k] = l[k] == null ? '' : l[k]; });
    if (l.status_laporan === STATUS_LAPORAN.setuju) disetujui[l.id_event] = true;
    return o;
  });

  return {
    modeCrew: true,
    hariIni: hariIni_(),
    hariKerja: hari,
    pengaturan: {},
    pilihan: { Kondisi: pilihan_().Kondisi || KONDISI_DEFAULT },
    event: event.map(function (e) {
      var p = e.id_pipeline ? pipeline[e.id_pipeline] : null;
      var dari = urutChecklist.filter(function (id) { return id !== e.id_event; })[0];
      return {
        id_event: e.id_event, nama_event: e.nama_event, tanggal: String(e.tanggal), jam_buka: e.jam_buka || '', jam_tutup: e.jam_tutup || '',
        lokasi: e.lokasi || '', kota: e.kota || '', jenis_acara: e.jenis_acara || '', status: e.status || '',
        penanggung_jawab: e.penanggung_jawab || '', tim: e.tim || '',
        klien: String((p && p.nama_klien) || e.narahubung || ''), kontak: String((p && p.kontak) || e.kontak_narahubung || ''),
        bisaIsi: bisaIsiTanggal_(e.tanggal) && !disetujui[e.id_event],
        voucher_mitra: e.voucher_mitra || '', voucher_nilai: e.voucher_nilai || '',
        rekan: tugas.filter(function (t) { return t.id_event === e.id_event; }).map(function (t) {
          return { nama: nama[t.id_crew] || t.id_crew, role: peranTugas_(t) || peranCrew[t.id_crew] || '', peran: peranTugas_(t), saya: String(t.id_crew) === idc };
        }),
        peranSaya: tugas.filter(function (t) { return t.id_event === e.id_event && String(t.id_crew) === idc; }).map(peranTugas_)[0] || '',
        sopLangkah: sop.filter(function (s) { return s.jenis === 'langkah' && sopBerlaku_(s, e); }).map(function (s) { return s.id; }),
        salinDari: dari ? { id_event: dari, kunci: perEvent[dari].filter(function (a) { return a.dibawa === 'Ya'; }).map(function (a) { return a.id_alat || 'SET:' + a.nama_alat; }) } : null
      };
    }),
    laporan: laporan,
    pemakaian: pemakaian.filter(function (a) { return ids[a.id_event]; }),
    inventaris: readTab_('INVENTARIS').filter(function (x) { return x.kategori === 'Aset'; }).map(function (x) {
      return { id_alat: x.id_alat, nama: x.nama, kategori: x.kategori, kondisi: x.kondisi || '', pemilik: x.pemilik || '' };
    }),
    setTanpaKode: Object.keys(set).sort(),
    sop: sop.map(function (s) { return { id: s.id, fase: s.fase, jenis: s.jenis, peran: s.peran, judul: s.judul, isi: s.isi, wajib: s.wajib }; }),
    sopEvent: readTab_('SOP_EVENT').filter(function (c) { return ids[c.id_event]; }),
    voucher: readTab_('VOUCHER').filter(function (v) { return ids[v.id_event]; }).map(function (v) {
      return { id: v.id, id_event: v.id_event, kode: v.kode, pemegang: v.pemegang, ditukar: v.ditukar, ditukar_oleh: v.ditukar_oleh, ditukar_pada: v.ditukar_pada };
    }),
    stokAwal: { kertas: stokSekarang_('Kertas 4R'), buku: stokSekarang_('Graduation Book') }
  };
}

/** Menolak bila crew tidak bertugas di event itu, atau event bukan hari kerja ini. Mengembalikan event. */
function cekBisaIsi_(u, idEvent) {
  var idc = String(u.id_crew || '');
  var bertugas = idc && readTab_('TUGAS_CREW').some(function (t) { return t.id_event === idEvent && String(t.id_crew) === idc; });
  var e = readTab_('EVENT').filter(function (x) { return x.id_event === idEvent; })[0];
  if (!bertugas || !e) throw new Error('Anda tidak bertugas di event ini.');
  if (e.status === 'Batal') throw new Error('Event ini sudah dibatalkan.');
  if (!bisaIsiTanggal_(e.tanggal)) throw new Error('Checklist & laporan hanya bisa diisi pada hari event, sampai pukul 0' + JAM_TUTUP_ISI + '.00 esok harinya. Hubungi admin bila perlu mengubah.');
  var l = laporanEvent_(idEvent);
  if (l && l.status_laporan === STATUS_LAPORAN.setuju) throw new Error('Laporan event ini sudah disetujui admin, tidak bisa diubah lagi. Hubungi admin bila ada koreksi.');
  return e;
}

/** Teks dari crew disimpan apa adanya, tapi tidak boleh terbaca sebagai rumus spreadsheet. */
function teksAman_(v, maks) {
  var s = String(v == null ? '' : v).slice(0, maks || 1000);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function angkaAman_(v) {
  if (v === '' || v == null) return '';
  var n = Number(v);
  if (!isFinite(n)) throw new Error('Isian angka tidak valid: ' + v);
  return n;
}

/** Menyimpan laporan dari crew (+ foto bukti baru). Bila laporan sudah dikirim ke admin, admin diberi email "diubah". */
function simpanLaporanCrew_(u, rec, fotos) {
  rec = rec || {};
  cekBisaIsi_(u, rec.id_event);
  var bersih = { id_event: rec.id_event };
  LAPORAN_CREW_TEKS.forEach(function (k) { if (k in rec) bersih[k] = teksAman_(rec[k]); });
  LAPORAN_CREW_ANGKA.forEach(function (k) { if (k in rec) bersih[k] = angkaAman_(rec[k]); });
  [['tinta_terendah_persen', 'Level tinta'], ['powerstation_awal', 'Powerstation awal'], ['powerstation_akhir', 'Powerstation akhir']].forEach(function (x) {
    var v = bersih[x[0]];
    if (v !== '' && v != null && (v < 0 || v > 1)) throw new Error(x[1] + ' harus 0–100%.');
  });
  simpanLaporan_(bersih, fotos);
  var l = laporanEvent_(rec.id_event);
  return { id: rec.id_event, email: l && l.status_laporan === STATUS_LAPORAN.dikirim ? cobaEmailLaporan_(rec.id_event, true) : '' };
}

function simpanChecklistCrew_(u, idEvent, rows) {
  cekBisaIsi_(u, idEvent);
  var inv = {}, kondisi = pilihan_().Kondisi || KONDISI_DEFAULT;
  readTab_('INVENTARIS').forEach(function (x) { if (x.kategori === 'Aset') inv[x.id_alat] = x; });
  var bersih = [];
  (rows || []).forEach(function (r) {
    var id = String(r.id_alat || '');
    if (id && !inv[id]) return; // hanya alat yang ada di Inventaris
    var nm = id ? inv[id].nama : teksAman_(r.nama_alat, 80).trim();
    if (!nm) return;
    var bawa = r.dibawa === 'Ya' ? 'Ya' : 'Tidak';
    bersih.push({ id_alat: id, nama_alat: nm, dibawa: bawa, kembali: bawa === 'Ya' && r.kembali === 'Ya' ? 'Ya' : '',
      kondisi_akhir: bawa === 'Ya' && kondisi.indexOf(r.kondisi_akhir) >= 0 ? r.kondisi_akhir : '', catatan: teksAman_(r.catatan, 200) });
  });
  return simpanChecklist_(idEvent, bersih);
}

/** Stok bahan saat ini dari MUTASI_STOK — rumus sama dengan stok() di JsDasar. null bila belum pernah dicatat. */
function stokSekarang_(bahan) {
  var urut = { Masuk: 0, Keluar: 0, 'Hitung Fisik': 1 };
  var rows = readTab_('MUTASI_STOK').filter(function (m) { return m.bahan === bahan; }).sort(function (a, b) {
    return a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? -1 : 1) : (urut[a.jenis] - urut[b.jenis]) || (a.id < b.id ? -1 : 1);
  });
  if (!rows.length) return null;
  var n = 0;
  rows.forEach(function (m) { var j = Number(m.jumlah) || 0; if (m.jenis === 'Hitung Fisik') n = j; else if (m.jenis === 'Masuk') n += j; else n -= j; });
  return n;
}
