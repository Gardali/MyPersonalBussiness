/**
 * Posetive — kerja sama panitia (skema A–F): kolom ks_* di PIPELINE & EVENT, kunci setelah Disetujui,
 * siapa & kapan status diubah, dan riwayat perubahan per acara (tab RIWAYAT_KS). Hitungan ada di JsKerjaSama.
 */

// Kolom kerja sama yang dikunci setelah Disetujui & dicatat di riwayat → label untuk riwayat.
var KS_KOLOM = {
  model_pendapatan: 'Model pendapatan', skema: 'Skema',
  ks_harga_4r: 'Harga 4R', ks_harga_buku: 'Harga Graduation Book', ks_harga_strip: 'Harga strip tambahan', ks_potongan_grup: 'Potongan grup',
  ks_tenggat: 'Tenggat bagi hasil',
  ks_a_tingkat: 'Tingkat bagi hasil',
  ks_b_persen: 'Persentase panitia', ks_b_dasar: 'Dasar perhitungan',
  ks_c_sesi_awal: 'Sesi awal Posetive', ks_c_bentuk: 'Bentuk bagi hasil', ks_c_nilai: 'Nilai bagi hasil',
  ks_d_fee: 'Fee panitia', ks_d_waktu: 'Waktu pembayaran fee', ks_d_bukti: 'Bukti pembayaran fee',
  ks_e_jumlah: 'Jumlah voucher', ks_e_minimal: 'Minimal voucher', ks_e_harga: 'Harga voucher', ks_e_harga_jual: 'Harga jual voucher',
  ks_e_tenggat: 'Tenggat voucher', ks_e_masa: 'Masa berlaku voucher', ks_e_sisa: 'Voucher tidak terpakai',
  ks_f_jumlah: 'Jumlah peserta', ks_f_minimal: 'Minimal peserta', ks_f_harga: 'Harga per peserta', ks_f_harga_tiket: 'Harga tiket',
  ks_f_tenggat: 'Tenggat bundling', ks_f_non_peserta: 'Tamu non-peserta'
};
var KS_STATUS_KOLOM = ['ks_status', 'ks_status_oleh', 'ks_status_pada'];
var RIWAYAT_KS_HEAD = ['id', 'waktu', 'tab', 'id_ref', 'id_pipeline', 'oleh', 'perubahan'];

/** Semua kolom ks_* (untuk ditambahkan ke tab & disalin saat deal). */
function kolomKs_() { return Object.keys(KS_KOLOM).filter(function (k) { return k.indexOf('ks_') === 0; }).concat(KS_STATUS_KOLOM); }

/** Kolom baru di PIPELINE & EVENT + tab RIWAYAT_KS. Dipanggil dari siapkan_. */
function siapkanKs_() {
  tambahKolom_('PIPELINE', ['organisasi', 'jam_buka', 'jam_tutup', 'lokasi'].concat(kolomKs_()));
  tambahKolom_('EVENT', ['organisasi', 'narahubung', 'kontak_narahubung', 'estimasi_sesi'].concat(kolomKs_()));
  var ss = ss_();
  if (ss.getSheetByName('RIWAYAT_KS')) return;
  var sh = ss.insertSheet('RIWAYAT_KS');
  sh.appendRow(RIWAYAT_KS_HEAD);
  sh.getRange(1, 1, 1, RIWAYAT_KS_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, 999, RIWAYAT_KS_HEAD.length).setNumberFormat('@');
}

function teksNilai_(v) { var s = String(v == null ? '' : v); return s === '' ? '—' : s.length > 60 ? s.slice(0, 57) + '…' : s; }

/**
 * Dijalankan sebelum prospek/event disimpan (lihat api di Akses.gs):
 * - kerja sama Disetujui: kolom skema tidak boleh berubah kecuali status dikembalikan ke Draft;
 * - status berubah: siapa & kapan dicatat di ks_status_oleh / ks_status_pada (nilai dari tampilan diabaikan);
 * - mengembalikan fungsi pencatat riwayat yang dipanggil setelah simpan berhasil (null bila tidak ada perubahan).
 */
function jagaKs_(u, tab, rec) {
  if (!rec || (tab !== 'PIPELINE' && tab !== 'EVENT')) return null;
  var kunciId = tab === 'EVENT' ? 'id_event' : 'id';
  var lama = rec[kunciId] ? readTab_(tab).filter(function (x) { return String(x[kunciId]) === String(rec[kunciId]); })[0] || null : null;
  delete rec.ks_status_oleh; delete rec.ks_status_pada;
  var nilai = function (o, k) { return o && o[k] != null ? String(o[k]) : ''; };
  var berubah = Object.keys(KS_KOLOM).filter(function (k) { return (k in rec) && nilai(rec, k) !== nilai(lama, k); });
  var stLama = nilai(lama, 'ks_status'), stBaru = 'ks_status' in rec ? nilai(rec, 'ks_status') : stLama;
  if (stLama === 'Disetujui' && stBaru !== 'Draft' && berubah.length)
    throw new Error('Kerja sama sudah Disetujui — kolom skema dikunci (' + berubah.map(function (k) { return KS_KOLOM[k]; }).join(', ') + '). Ubah status ke Draft dulu untuk mengubahnya.');
  if (stBaru !== stLama) { rec.ks_status_oleh = u.nama; rec.ks_status_pada = waktuSekarang_(); }
  var ks = function (o) { return o && o.model_pendapatan === 'Kerja Sama Panitia'; };
  if (!ks(rec) && !ks(lama)) return null;
  var isi;
  if (!lama) isi = ['Dibuat: ' + (rec.skema || 'skema belum dipilih') + ', status ' + (stBaru || 'Draft')];
  else {
    isi = berubah.map(function (k) { return KS_KOLOM[k] + ': ' + teksNilai_(lama[k]) + ' → ' + teksNilai_(rec[k]); });
    if (stBaru !== stLama) isi.unshift('Status: ' + (stLama || '—') + ' → ' + (stBaru || '—'));
  }
  if (!isi.length) return null;
  var idPipeline = tab === 'PIPELINE' ? rec.id || (lama && lama.id) : rec.id_pipeline || (lama && lama.id_pipeline) || '';
  return function (id) { catatRiwayatKs_(tab, id || rec[kunciId], tab === 'PIPELINE' ? id || rec.id : idPipeline, u.nama, isi.join('; ')); };
}

function catatRiwayatKs_(tab, idRef, idPipeline, oleh, perubahan) {
  siapkanKs_();
  var sh = sheet_('RIWAYAT_KS'), v = sh.getDataRange().getValues();
  var id = nextId_(v, 0, { prefix: 'RK-', pad: 5 }), r = lastDataRow_(v) + 1;
  sh.getRange(r, 1, 1, RIWAYAT_KS_HEAD.length).setNumberFormat('@')
    .setValues([[id, waktuSekarang_(), tab, String(idRef || ''), String(idPipeline || ''), oleh, perubahan]]);
}

/** Harga resmi event (isian kerja sama) menggantikan PENGATURAN untuk hitungan omzet — sama dengan hargaEv di JsKerjaSama. */
function hargaEvent_(p, e) {
  var o = Object.assign({}, p);
  [['ks_harga_4r', 'HARGA_4R'], ['ks_harga_buku', 'HARGA_BUKU'], ['ks_harga_strip', 'HARGA_STRIP'], ['ks_potongan_grup', 'POTONGAN_GRUP']].forEach(function (x) {
    if (e && e[x[0]] !== '' && e[x[0]] != null) o[x[1]] = Number(e[x[0]]);
  });
  return o;
}
