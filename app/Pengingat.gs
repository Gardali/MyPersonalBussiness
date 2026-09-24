/**
 * Posetive — email pengingat harian & pemicu otomatis.
 */

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
