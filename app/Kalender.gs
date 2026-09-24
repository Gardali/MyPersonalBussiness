/**
 * Posetive — sinkron Google Calendar & undangan crew.
 */

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
