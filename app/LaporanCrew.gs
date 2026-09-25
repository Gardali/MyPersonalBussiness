/**
 * Posetive — foto bukti laporan, kirim laporan ke admin (+ email ringkasan), dan persetujuan laporan.
 * Alur: crew menyimpan laporan (boleh berkali-kali) → "Kirim ke admin" → admin dapat email → admin "Setujui"
 * → event Selesai & laporan terkunci untuk crew.
 */

// Kolom foto di LAPORAN_EVENT (isi: ID file Drive) dan labelnya.
var FOTO_LAPORAN = [['foto_counter_awal', 'Counter awal'], ['foto_counter_akhir', 'Counter akhir'], ['foto_tunai', 'Uang tunai'], ['foto_qris', 'Bukti QRIS']];
// Kolom yang hanya diisi server (tidak pernah diterima dari tampilan).
var LAPORAN_SISTEM = ['foto_counter_awal', 'foto_counter_akhir', 'foto_tunai', 'foto_qris', 'status_laporan', 'dikirim_oleh', 'dikirim_pada', 'disetujui_oleh', 'disetujui_pada'];
var STATUS_LAPORAN = { dikirim: 'Menunggu dicek', setuju: 'Disetujui' };
var FOTO_MAKS_BYTE = 6 * 1024 * 1024;

function waktuSekarang_() { return Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm'); }
function laporanEvent_(idEvent) { return readTab_('LAPORAN_EVENT').filter(function (l) { return l.id_event === idEvent; })[0] || null; }
function urlFile_(id) { return 'https://drive.google.com/file/d/' + id + '/view'; }
/** Memastikan kolom foto & status sudah ada sebelum ditulis (saveRecord_ mengabaikan kolom yang tidak ada). */
function kolomLaporan_() { tambahKolom_('LAPORAN_EVENT', LAPORAN_KOLOM_BARU); }

/**
 * Menyimpan foto bukti ke Drive (folder "Posetive - Bukti Laporan"). fotos: {foto_counter_awal: {base64, mime}, ...}.
 * Foto lama di kolom yang sama dibuang ke sampah. Mengembalikan {kolom: id file} untuk disimpan di laporan.
 */
function simpanFotoLaporan_(idEvent, fotos) {
  var out = {};
  if (!fotos) return out;
  var lama = laporanEvent_(idEvent) || {}, stempel = Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HHmm');
  FOTO_LAPORAN.forEach(function (x) {
    var f = fotos[x[0]];
    if (!f || !f.base64) return;
    if (['image/jpeg', 'image/png'].indexOf(f.mime) < 0) throw new Error('Foto ' + x[1] + ' harus JPG atau PNG.');
    var bytes = Utilities.base64Decode(f.base64);
    if (bytes.length > FOTO_MAKS_BYTE) throw new Error('Foto ' + x[1] + ' terlalu besar.');
    var nama = idEvent + ' - ' + x[1] + ' - ' + stempel + (f.mime === 'image/png' ? '.png' : '.jpg');
    var file = folder_('Posetive - Bukti Laporan').createFile(Utilities.newBlob(bytes, f.mime, nama));
    if (lama[x[0]]) { try { DriveApp.getFileById(String(lama[x[0]])).setTrashed(true); } catch (e) { } }
    out[x[0]] = file.getId();
  });
  return out;
}

/** Foto bukti satu event untuk ditampilkan (admin & pemantau): [{kolom, label, url, data}] — data = data URI. */
function fotoLaporan_(idEvent) {
  var l = laporanEvent_(idEvent);
  if (!l) return [];
  return FOTO_LAPORAN.filter(function (x) { return l[x[0]]; }).map(function (x) {
    var o = { kolom: x[0], label: x[1], url: urlFile_(l[x[0]]), data: null };
    try { var b = DriveApp.getFileById(String(l[x[0]])).getBlob(); o.data = 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()); } catch (e) { }
    return o;
  });
}

/** Yang masih kurang sebelum laporan boleh dikirim ke admin ([] bila lengkap). */
function kurangLaporan_(l) {
  var kosong = function (k) { return !l || l[k] === '' || l[k] == null; }, kurang = [];
  if (kosong('counter_awal')) kurang.push('counter awal');
  if (kosong('counter_akhir')) kurang.push('counter akhir');
  if (!kosong('counter_awal') && !kosong('counter_akhir') && Number(l.counter_akhir) < Number(l.counter_awal)) kurang.push('counter akhir lebih kecil dari counter awal');
  if (kosong('foto_counter_awal')) kurang.push('foto counter awal');
  if (kosong('foto_counter_akhir')) kurang.push('foto counter akhir');
  return kurang;
}

/** Crew menandai laporan selesai → status "Menunggu dicek" + email ke admin. */
function kirimLaporanCrew_(u, idEvent) {
  cekBisaIsi_(u, idEvent);
  kolomLaporan_();
  var l = laporanEvent_(idEvent);
  if (!l) throw new Error('Isi & simpan laporan dulu.');
  var kurang = kurangLaporan_(l).concat(sopEventIni_(idEvent).wajibKurang.map(function (j) { return 'SOP ' + j; }));
  if (kurang.length) throw new Error('Laporan belum lengkap: ' + kurang.join(', ') + '.');
  saveRecord_('LAPORAN_EVENT', { id_event: idEvent, status_laporan: STATUS_LAPORAN.dikirim, dikirim_oleh: u.nama, dikirim_pada: waktuSekarang_() });
  return { status: STATUS_LAPORAN.dikirim, email: cobaEmailLaporan_(idEvent, false) };
}

/** Admin menyetujui laporan: status Disetujui, event menjadi Selesai. */
function setujuiLaporan_(u, idEvent) {
  var l = laporanEvent_(idEvent);
  if (!l) throw new Error('Event ini belum punya laporan.');
  kolomLaporan_();
  saveRecord_('LAPORAN_EVENT', { id_event: idEvent, status_laporan: STATUS_LAPORAN.setuju, disetujui_oleh: u.nama, disetujui_pada: waktuSekarang_() });
  var e = readTab_('EVENT').filter(function (x) { return x.id_event === idEvent; })[0];
  if (e && e.status === 'Terkonfirmasi') simpanEvent_({ id_event: idEvent, status: 'Selesai' });
  return STATUS_LAPORAN.setuju;
}

/** Membatalkan persetujuan (salah pencet): kembali "Menunggu dicek" bila dulu dikirim crew. Status event tidak diubah. */
function batalSetujuiLaporan_(u, idEvent) {
  var l = laporanEvent_(idEvent);
  if (!l || l.status_laporan !== STATUS_LAPORAN.setuju) throw new Error('Laporan ini belum disetujui.');
  var st = l.dikirim_pada ? STATUS_LAPORAN.dikirim : '';
  saveRecord_('LAPORAN_EVENT', { id_event: idEvent, status_laporan: st, disetujui_oleh: '', disetujui_pada: '' });
  return st;
}

/** Progres SOP satu event (lihat progresSop_). */
function sopEventIni_(idEvent) {
  siapkanSop_();
  var e = readTab_('EVENT').filter(function (x) { return x.id_event === idEvent; })[0] || { id_event: idEvent };
  return progresSop_(e, sopAktif_(), readTab_('SOP_EVENT'));
}

// ---------------------------------------------------------------- email ringkasan

/** Angka penting laporan — rumus sama dengan hasilEvent() di JsDasar. */
/** vm: ringkasan voucher mitra event ({jumlah, potongan}) — potongannya dikurangkan dari omzet. */
function ringkasLaporan_(l, p, vm) {
  var n = function (v) { var x = Number(v); return isFinite(x) ? x : 0; };
  // Sesi di Jepreto termasuk sesi cetak ulang pakai voucher (diskon penuh) → dikurangi, sama dengan hasilEvent() di JsDasar.
  var sesi = Math.max(0, (l.sesi_terjual !== '' && l.sesi_terjual != null ? n(l.sesi_terjual) : n(l.foto_4r_terjual)) - n(l.cetak_ulang_voucher));
  var tambahan = n(l.lembar_tambahan) + Math.ceil(n(l.strip_terjual) * (n(p.LEMBAR_PER_STRIP) || 1));
  var r = { tercetak: Math.max(0, n(l.counter_akhir) - n(l.counter_awal)), sesi: sesi, tambahan: tambahan, buku: n(l.grad_book_terjual) };
  r.omzet = sesi * n(p.HARGA_4R) + tambahan * n(p.HARGA_STRIP) + r.buku * n(p.HARGA_BUKU) - n(l.grup_potongan) * n(p.POTONGAN_GRUP) - (vm ? n(vm.potongan) : 0);
  r.voucherMitra = vm || null;
  r.diterima = n(l.tunai_dihitung) - n(l.modal_kembalian) + n(l.qris_transfer);
  r.selisihKas = r.diterima - r.omzet;
  r.selisihLembar = r.tercetak - (sesi + tambahan + r.buku + n(l.lembar_uji_bonus) + n(l.lembar_gagal));
  // Setiap cetak ulang pakai voucher harus punya satu lembar gagal yang disimpan.
  r.voucher = n(l.cetak_ulang_voucher);
  r.voucherLebih = r.voucher > n(l.lembar_gagal);
  return r;
}

function persen_(v) { return v === '' || v == null ? '?' : Math.round(Number(v) * 100) + '%'; }

function penerimaLaporan_() {
  var daftar = String(pengaturan_().EMAIL_LAPORAN || '').split(/[,;\s]+/).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); });
  return daftar.length ? daftar.join(',') : Session.getEffectiveUser().getEmail();
}

/** Mengirim email ringkasan laporan. Gagal kirim tidak membatalkan apa pun — mengembalikan pesan galat atau ''. */
function cobaEmailLaporan_(idEvent, diperbarui) {
  try { emailLaporan_(idEvent, diperbarui); return ''; } catch (e) { return 'Email ke admin gagal dikirim: ' + e.message; }
}

function emailLaporan_(idEvent, diperbarui) {
  var l = laporanEvent_(idEvent), e = readTab_('EVENT').filter(function (x) { return x.id_event === idEvent; })[0] || { nama_event: idEvent, tanggal: '' };
  var p = hargaEvent_(pengaturan_(), e), r = ringkasLaporan_(l, p, e.id_event ? ringkasVoucher_(e) : null), esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var masalah = [], sop = { total: 0, selesai: 0, terlewat: [] };
  try { sop = sopEventIni_(idEvent); } catch (err) { }
  if (r.selisihLembar) masalah.push('selisih lembar ' + r.selisihLembar);
  if (r.selisihKas) masalah.push('selisih kas ' + rupiah_(r.selisihKas));
  if (r.voucherLebih) masalah.push('cetak ulang voucher (' + r.voucher + ') lebih banyak dari lembar gagal (' + (Number(l.lembar_gagal) || 0) + ')');
  var baris = function (k, v, tanda) { return '<tr><td style="padding:4px 12px 4px 0;color:#666">' + k + '</td><td style="padding:4px 0;font-weight:bold' + (tanda ? ';color:#B3261E' : '') + '">' + v + '</td></tr>'; };
  var h = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
    '<p>' + (diperbarui ? 'Laporan yang sudah dikirim <b>diubah</b> oleh ' : 'Laporan dikirim oleh ') + '<b>' + esc(l.dikirim_oleh || 'crew') + '</b> · ' + esc(l.dikirim_pada) + '</p>' +
    '<h2 style="margin:0 0 4px">' + esc(e.nama_event) + '</h2><p style="margin:0 0 12px;color:#666">' + esc(e.tanggal) + (e.lokasi ? ' · ' + esc(e.lokasi) : '') + '</p>' +
    (masalah.length ? '<p style="background:#FDECEA;color:#B3261E;padding:8px 12px;border-radius:8px"><b>Perlu dicek:</b> ' + masalah.join(', ') + '</p>' : '<p style="background:#E8F5E9;color:#1B5E20;padding:8px 12px;border-radius:8px">Lembar & kas cocok.</p>') +
    '<table style="border-collapse:collapse">' +
    (l.jam_setup_mulai || l.jam_setup_selesai ? baris('Jam setup', esc(l.jam_setup_mulai || '?') + '–' + esc(l.jam_setup_selesai || '?')) : '') +
    baris('Jam aktual', esc(l.jam_buka_aktual || '?') + '–' + esc(l.jam_tutup_aktual || '?')) +
    baris('Transaksi', Number(l.jumlah_transaksi) || 0) +
    baris('Sesi berbayar · Lembar tambahan · Grad Book', r.sesi + ' · ' + r.tambahan + ' · ' + r.buku + (r.voucher ? ' (+' + r.voucher + ' sesi voucher)' : '')) +
    baris('Tercetak (counter ' + esc(l.counter_awal) + ' → ' + esc(l.counter_akhir) + ')', r.tercetak) +
    baris('Selisih lembar', r.selisihLembar || 'Cocok', !!r.selisihLembar) +
    (r.voucherMitra && r.voucherMitra.jumlah ? baris('Voucher ' + esc(r.voucherMitra.mitra) + ' ditukar', r.voucherMitra.jumlah + ' × ' + rupiah_(r.voucherMitra.nilai) + ' = ' + rupiah_(r.voucherMitra.potongan) + ' (ditagih ke ' + esc(r.voucherMitra.mitra) + ')') : '') +
    baris('Omzet menurut laporan', rupiah_(r.omzet)) +
    baris('Uang diterima (tunai − modal + QRIS)', rupiah_(r.diterima)) +
    baris('Selisih kas', r.selisihKas ? rupiah_(r.selisihKas) : 'Cocok', !!r.selisihKas) +
    (l.powerstation_awal !== '' && l.powerstation_awal != null ? baris('Powerstation awal → akhir', persen_(l.powerstation_awal) + ' → ' + persen_(l.powerstation_akhir)) : '') +
    (Number(l.softfile_gagal) ? baris('Softfile gagal terunggah', Number(l.softfile_gagal) + ' (kirim lewat WA)', true) : '') +
    (r.voucher ? baris('Cetak ulang pakai voucher · lembar gagal', r.voucher + ' · ' + (Number(l.lembar_gagal) || 0), r.voucherLebih) : '') +
    (sop.total ? baris('SOP dicentang', sop.selesai + ' dari ' + sop.total + ' langkah', sop.selesai < sop.total) : '') + '</table>' +
    (sop.terlewat.length ? '<p style="margin:8px 0 0;color:#666"><b>Langkah SOP belum dicentang:</b> ' + sop.terlewat.map(esc).join(', ') + '</p>' : '');
  [['kendala', 'Kendala & penanganan'], ['keluhan_pengunjung', 'Keluhan pengunjung'], ['rekomendasi', 'Rekomendasi'], ['catatan', 'Catatan']].forEach(function (x) {
    if (l[x[0]]) h += '<p style="margin:12px 0 0"><b>' + x[1] + '</b><br>' + esc(l[x[0]]).replace(/\n/g, '<br>') + '</p>';
  });
  var gambar = {}, foto = '';
  FOTO_LAPORAN.forEach(function (x, i) {
    if (!l[x[0]]) return;
    try { gambar['f' + i] = DriveApp.getFileById(String(l[x[0]])).getBlob(); } catch (err) { return; }
    foto += '<td style="padding:0 8px 8px 0;vertical-align:top"><a href="' + urlFile_(l[x[0]]) + '"><img src="cid:f' + i + '" width="150" style="border-radius:8px;display:block"></a><div style="font-size:12px;color:#666">' + x[1] + '</div></td>';
  });
  if (foto) h += '<p style="margin:16px 0 6px"><b>Foto bukti</b></p><table><tr>' + foto + '</tr></table>';
  var url = '';
  try { url = ScriptApp.getService().getUrl(); } catch (err) { }
  h += '<p style="margin-top:16px">' + (url ? '<a href="' + url + '">Buka aplikasi</a> → Event → ' + esc(e.nama_event) + ' → <b>Setujui laporan</b>.' : 'Buka aplikasi untuk menyetujui laporan.') + '</p>' +
    '<p style="color:#888;font-size:12px">Dikirim otomatis oleh aplikasi Posetive.</p></div>';
  MailApp.sendEmail({
    to: penerimaLaporan_(),
    subject: 'Posetive — laporan ' + (diperbarui ? 'diubah' : 'masuk') + ': ' + e.nama_event + (masalah.length ? ' ⚠ perlu dicek' : ' ✓ cocok'),
    htmlBody: h, inlineImages: gambar
  });
}
