/**
 * Posetive — login, sesi, dan hak akses.
 * Semua panggilan dari tampilan lewat api(token, nama, args): sesi diperiksa, lalu role dicocokkan dengan IZIN.
 * Fungsi server lain sengaja privat (berakhiran _) supaya tidak bisa dipanggil langsung dari browser.
 */

var PENGGUNA_HEAD = ['username', 'nama', 'role', 'id_crew', 'pin_hash', 'salt', 'aktif', 'wajib_ganti', 'gagal',
  'kunci_sampai', 'terakhir_login', 'catatan'];
var ROLE = { admin: 'Admin', pemantau: 'Pemantau (lihat saja)', crew: 'Crew' };
var SESI_INGAT_HARI = 30, SESI_SINGKAT_JAM = 12, MAKS_GAGAL = 5, KUNCI_MENIT = 15;

var LIHAT = ['admin', 'pemantau'], ADMIN = ['admin'], SEMUA = ['admin', 'pemantau', 'crew'], HANYA_CREW = ['crew'];
/**
 * nama yang dipanggil tampilan → [fungsi server, role yang boleh, fungsi menerima pengguna sebagai argumen pertama?]
 * Dibentuk saat dipanggil (bukan saat file dimuat), karena fungsinya ada di file .gs lain yang mungkin dimuat belakangan.
 */
function izin_() {
  return {
  sesiSaya: [function (u) { return publik_(u); }, SEMUA, true],
  gantiPin: [gantiPin_, SEMUA, true],
  getData: [getData_, LIHAT], getFotoCrew: [getFotoCrew_, LIHAT], statusOtomatis: [statusOtomatis_, LIHAT],
  buatLaporanPdf: [buatLaporanPdf_, LIHAT], buatInvoice: [buatInvoice_, LIHAT], buatLaporanEventSheet: [buatLaporanEventSheet_, LIHAT],
  fotoLaporan: [fotoLaporan_, LIHAT], setujuiLaporan: [setujuiLaporan_, ADMIN, true], batalSetujuiLaporan: [batalSetujuiLaporan_, ADMIN, true],
  centangSop: [centangSop_, ADMIN, true],
  tambahVoucher: [tambahVoucher_, ADMIN, true], hapusVoucher: [hapusVoucher_, ADMIN, true], tukarVoucher: [tukarVoucher_, ADMIN, true],
  saveRecord: [saveRecord_, ADMIN], deleteRecord: [deleteRecord_, ADMIN],
  dealKeEvent: [dealKeEvent_, ADMIN], simpanEvent: [simpanEvent_, ADMIN], hapusEvent: [hapusEvent_, ADMIN],
  simpanLaporan: [simpanLaporan_, ADMIN], simpanMutasi: [simpanMutasi_, ADMIN], simpanChecklist: [simpanChecklist_, ADMIN],
  simpanNotaKas: [simpanNotaKas_, ADMIN], simpanFotoCrew: [simpanFotoCrew_, ADMIN], hapusCrew: [hapusCrew_, ADMIN],
  simpanTugasCrew: [simpanTugasCrew_, ADMIN], bayarFeeCrew: [bayarFeeCrew_, ADMIN], batalBayarFeeCrew: [batalBayarFeeCrew_, ADMIN],
  hapusTugasCrew: [hapusTugasCrew_, ADMIN], sinkronCrew: [sinkronCrew_, ADMIN],
  sinkronSemuaKalender: [sinkronSemuaKalender_, ADMIN], putusKalender: [putusKalender_, ADMIN],
  backupSekarang: [backupSekarang, ADMIN], kirimPengingatTes: [kirimPengingatTes_, ADMIN], aturOtomatis: [aturOtomatis_, ADMIN],
  simpanPengaturan: [simpanPengaturan_, ADMIN], simpanPengaturanBanyak: [simpanPengaturanBanyak_, ADMIN],
  daftarPengguna: [daftarPengguna_, ADMIN], simpanPengguna: [simpanPengguna_, ADMIN, true], resetPin: [resetPin_, ADMIN, true],
  // Crew: data sudah disaring & setiap simpan diperiksa (bertugas di event itu, hari event s.d. 06.00 besok) — EventSaya.gs.
  dataCrew: [dataCrew_, HANYA_CREW, true], simpanLaporanCrew: [simpanLaporanCrew_, HANYA_CREW, true],
  simpanChecklistCrew: [simpanChecklistCrew_, HANYA_CREW, true], kirimLaporanCrew: [kirimLaporanCrew_, HANYA_CREW, true],
  centangSopCrew: [centangSopCrew_, HANYA_CREW, true], tukarVoucherCrew: [tukarVoucherCrew_, HANYA_CREW, true]
  };
}

// ---------------------------------------------------------------- pintu masuk

/** Satu-satunya jalan tampilan memanggil server (selain masuk/keluar). */
function api(token, nama, args) {
  var u = sesi_(token), semua = izin_(), aturan = Object.prototype.hasOwnProperty.call(semua, nama) ? semua[nama] : null;
  if (!aturan) throw new Error('Perintah tidak dikenal: ' + nama);
  if (u.wajib_ganti === 'Ya' && nama !== 'gantiPin' && nama !== 'sesiSaya') throw new Error('WAJIB_GANTI_PIN');
  if (aturan[1].indexOf(u.role) < 0) throw new Error('Akun Anda (' + (ROLE[u.role] || u.role) + ') tidak punya akses untuk ini.');
  args = args || [];
  if ((nama === 'saveRecord' || nama === 'deleteRecord') && String(args[0]) === 'PENGGUNA') throw new Error('Kelola akun lewat menu Pengguna.');
  // Kerja sama panitia: kunci setelah Disetujui + riwayat perubahan (KerjaSama.gs) untuk setiap simpan prospek/event.
  var sesudah = nama === 'saveRecord' ? jagaKs_(u, String(args[0]), args[1]) : nama === 'simpanEvent' ? jagaKs_(u, 'EVENT', args[0]) : null;
  var hasil = aturan[0].apply(null, aturan[2] ? [u].concat(args) : args);
  if (sesudah) sesudah(hasil && typeof hasil === 'object' ? hasil.id : hasil);
  return hasil;
}

/** Login dengan username + PIN. Mengembalikan token sesi & data pengguna. */
function masuk(username, pin, ingat) {
  var un = String(username || '').trim().toLowerCase(), salah = new Error('Username atau PIN salah.');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var u = cariPengguna_(un), now = Date.now();
    if (!u || u.aktif !== 'Ya') throw salah;
    var kunci = Number(u.kunci_sampai) || 0;
    if (kunci > now) throw new Error('Terlalu banyak percobaan salah. Coba lagi ' + Math.ceil((kunci - now) / 60000) + ' menit lagi.');
    if (hashPin_(pin, u.salt) !== u.pin_hash) {
      var gagal = (Number(u.gagal) || 0) + 1;
      simpanBaris_(un, gagal >= MAKS_GAGAL ? { gagal: 0, kunci_sampai: String(now + KUNCI_MENIT * 60000) } : { gagal: String(gagal) });
      throw gagal >= MAKS_GAGAL ? new Error('Terlalu banyak percobaan salah. Akun dikunci ' + KUNCI_MENIT + ' menit.') : salah;
    }
    simpanBaris_(un, { gagal: '0', kunci_sampai: '', terakhir_login: Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm') });
  } finally { lock.releaseLock(); }
  bersihkanSesi_();
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var umur = ingat ? SESI_INGAT_HARI * 864e5 : SESI_SINGKAT_JAM * 36e5;
  PropertiesService.getScriptProperties().setProperty('SESI:' + token, JSON.stringify({ u: un, exp: Date.now() + umur }));
  return { token: token, pengguna: publik_(cariPengguna_(un)) };
}

function keluar(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('SESI:' + token);
  return true;
}

/**
 * Jalankan SEKALI dari editor Apps Script untuk membuat akun admin pertama. PIN sementara tampil di
 * Log eksekusi (hanya terlihat di editor) dan wajib diganti saat login pertama. Menolak bila sudah ada admin.
 */
function buatAdminPertama() {
  tabPengguna_();
  if (readTab_('PENGGUNA').some(function (u) { return u.role === 'admin'; })) throw new Error('Sudah ada akun admin. Kelola akun lewat aplikasi (Lainnya → Pengguna).');
  var pin = pinAcak_();
  tambahPengguna_({ username: 'garda', nama: 'Garda Ali Rayhaan', role: 'admin' }, pin);
  var pesan = 'Akun admin dibuat. Username: garda · PIN sementara: ' + pin + ' (wajib diganti saat login pertama).';
  console.log(pesan);
  return pesan;
}

/** Jalankan dari editor bila Google meminta izin baru (Kalender, Drive, Gmail). Tidak mengubah data. */
function izinkanAkses() {
  CalendarApp.getAllOwnedCalendars();
  DriveApp.getRootFolder();
  MailApp.getRemainingDailyQuota();
  return 'Izin OK';
}

// ---------------------------------------------------------------- sesi & PIN

function sesi_(token) {
  var raw = token ? PropertiesService.getScriptProperties().getProperty('SESI:' + token) : null, s = raw ? JSON.parse(raw) : null;
  if (!s || s.exp < Date.now()) { if (raw) keluar(token); throw new Error('SESI_HABIS'); }
  var u = cariPengguna_(s.u);
  if (!u || u.aktif !== 'Ya') { keluar(token); throw new Error('SESI_HABIS'); }
  return u;
}

function bersihkanSesi_() {
  var props = PropertiesService.getScriptProperties(), semua = props.getProperties(), now = Date.now();
  Object.keys(semua).forEach(function (k) {
    if (k.indexOf('SESI:') !== 0) return;
    try { if (JSON.parse(semua[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}

/** Menghapus semua sesi milik satu pengguna (setelah reset PIN / dinonaktifkan). */
function cabutSesi_(username) {
  var props = PropertiesService.getScriptProperties(), semua = props.getProperties();
  Object.keys(semua).forEach(function (k) {
    if (k.indexOf('SESI:') !== 0) return;
    try { if (JSON.parse(semua[k]).u === username) props.deleteProperty(k); } catch (e) { }
  });
}

/** SHA-256(pepper + salt + PIN). Pepper disimpan di Script Properties, jadi isi tab PENGGUNA saja tidak cukup untuk menebak PIN. */
function hashPin_(pin, salt) {
  var props = PropertiesService.getScriptProperties(), pepper = props.getProperty('PIN_PEPPER');
  if (!pepper) { pepper = Utilities.getUuid(); props.setProperty('PIN_PEPPER', pepper); }
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pepper + ':' + salt + ':' + String(pin), Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join('');
}

function pinAcak_() { return ('00000' + Math.floor(Math.random() * 1e6)).slice(-6); }

/** PIN baru: tepat 6 angka, bukan angka sama semua, bukan urutan. */
function cekPinBaru_(pin) {
  pin = String(pin || '');
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN harus 6 angka.');
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.indexOf(pin) >= 0 || '9876543210'.indexOf(pin) >= 0) throw new Error('PIN terlalu mudah ditebak. Pilih angka lain.');
  return pin;
}

function gantiPin_(u, lama, baru) {
  if (hashPin_(lama, u.salt) !== u.pin_hash) throw new Error('PIN lama salah.');
  baru = cekPinBaru_(baru);
  if (baru === String(lama)) throw new Error('PIN baru harus berbeda dari PIN lama.');
  var salt = Utilities.getUuid();
  simpanBaris_(u.username, { pin_hash: hashPin_(baru, salt), salt: salt, wajib_ganti: 'Tidak' });
  return publik_(cariPengguna_(u.username));
}

// ---------------------------------------------------------------- data pengguna

function tabPengguna_() {
  var ss = ss_(), sh = ss.getSheetByName('PENGGUNA');
  if (sh) return sh;
  sh = ss.insertSheet('PENGGUNA');
  sh.appendRow(PENGGUNA_HEAD);
  sh.getRange(1, 1, 1, PENGGUNA_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, 999, PENGGUNA_HEAD.length).setNumberFormat('@');
  return sh;
}

function cariPengguna_(username) {
  tabPengguna_();
  return readTab_('PENGGUNA').filter(function (u) { return String(u.username).toLowerCase() === String(username).toLowerCase(); })[0] || null;
}

/** Mengubah kolom tertentu di baris pengguna (tanpa lewat saveRecord_, supaya tab PENGGUNA tidak bisa ditulis dari api). */
function simpanBaris_(username, ubah) {
  var sh = tabPengguna_(), v = sh.getDataRange().getValues(), head = v[0].map(String);
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][0]).toLowerCase() !== username) continue;
    Object.keys(ubah).forEach(function (k) {
      var c = head.indexOf(k);
      if (c >= 0) sh.getRange(i + 1, c + 1).setNumberFormat('@').setValue(ubah[k] == null ? '' : String(ubah[k]));
    });
    return;
  }
  throw new Error('Pengguna ' + username + ' tidak ditemukan.');
}

function tambahPengguna_(rec, pin) {
  var sh = tabPengguna_(), salt = Utilities.getUuid();
  var baris = { username: rec.username, nama: rec.nama, role: rec.role, id_crew: rec.id_crew || '', pin_hash: hashPin_(pin, salt), salt: salt,
    aktif: 'Ya', wajib_ganti: 'Ya', gagal: '0', kunci_sampai: '', terakhir_login: '', catatan: rec.catatan || '' };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var r = lastDataRow_(sh.getDataRange().getValues()) + 1;
  sh.getRange(r, 1, 1, head.length).setNumberFormat('@').setValues([head.map(function (h) { return baris[h] == null ? '' : String(baris[h]); })]);
}

function publik_(u) {
  return { username: u.username, nama: u.nama, role: u.role, id_crew: u.id_crew || '', wajib_ganti: u.wajib_ganti === 'Ya' };
}

function daftarPengguna_() {
  tabPengguna_();
  var now = Date.now();
  return readTab_('PENGGUNA').map(function (u) {
    var p = publik_(u);
    p.aktif = u.aktif === 'Ya'; p.terakhir_login = u.terakhir_login || ''; p.terkunci = (Number(u.kunci_sampai) || 0) > now; p.catatan = u.catatan || '';
    return p;
  });
}

/** Tambah pengguna baru (mengembalikan PIN sementara) atau ubah nama/role/crew/aktif pengguna lama. */
function simpanPengguna_(saya, rec) {
  var un = String(rec.username || '').trim().toLowerCase();
  if (!ROLE[rec.role]) throw new Error('Role tidak dikenal.');
  if (!String(rec.nama || '').trim()) throw new Error('Nama wajib diisi.');
  if (rec.role === 'crew' && !rec.id_crew) throw new Error('Akun crew harus dihubungkan ke data crew.');
  var lama = cariPengguna_(un), semua = readTab_('PENGGUNA');
  if (!lama) {
    if (!/^[a-z0-9._-]{3,20}$/.test(un)) throw new Error('Username 3–20 huruf kecil/angka (boleh . _ -), tanpa spasi.');
    var pin = pinAcak_();
    tambahPengguna_({ username: un, nama: String(rec.nama).trim(), role: rec.role, id_crew: rec.role === 'crew' ? rec.id_crew : '', catatan: rec.catatan }, pin);
    return { username: un, pinSementara: pin };
  }
  var aktif = rec.aktif === false || rec.aktif === 'Tidak' ? 'Tidak' : 'Ya';
  var adminLain = semua.filter(function (u) { return u.role === 'admin' && u.aktif === 'Ya' && u.username !== un; }).length;
  if (lama.role === 'admin' && (rec.role !== 'admin' || aktif !== 'Ya') && !adminLain) throw new Error('Harus ada minimal satu admin aktif.');
  if (un === saya.username && (rec.role !== saya.role || aktif !== 'Ya')) throw new Error('Tidak bisa mengubah role atau menonaktifkan akun sendiri.');
  simpanBaris_(un, { nama: String(rec.nama).trim(), role: rec.role, id_crew: rec.role === 'crew' ? rec.id_crew : '', aktif: aktif, catatan: rec.catatan || '' });
  if (aktif !== 'Ya' || rec.role !== lama.role) cabutSesi_(un);
  return { username: un };
}

/** PIN sementara baru untuk pengguna lain (yang lupa PIN / terkunci). Semua sesinya dicabut. */
function resetPin_(saya, username) {
  var u = cariPengguna_(username);
  if (!u) throw new Error('Pengguna tidak ditemukan.');
  if (u.username === saya.username) throw new Error('Untuk akun sendiri, pakai Ganti PIN.');
  var pin = pinAcak_(), salt = Utilities.getUuid();
  simpanBaris_(u.username, { pin_hash: hashPin_(pin, salt), salt: salt, wajib_ganti: 'Ya', gagal: '0', kunci_sampai: '' });
  cabutSesi_(u.username);
  return { username: u.username, pinSementara: pin };
}
