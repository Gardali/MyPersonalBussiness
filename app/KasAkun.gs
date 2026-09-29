/**
 * Posetive — akun kas (BCA Posetive, tunai/pegangan crew, dibayar owner langsung, reimburse, kas lama) & pencocokan
 * dengan rekening BCA. Perhitungan saldo per akun ada di JsAkun (tampilan).
 * KAS.akun: akun tempat uang masuk/keluar (Pindah dana: akun asal). KAS.akun_tujuan: akun tujuan Pindah dana.
 * Tab REKONSILIASI: riwayat "Cocokkan dengan BCA" (saldo m-banking vs saldo aplikasi).
 */
var REKONSILIASI_HEAD = ['id', 'waktu', 'oleh', 'saldo_bank', 'saldo_aplikasi', 'selisih', 'catatan'];
var AKUN_KAS_BARU = 'BCA Posetive'; // akun bawaan catatan kas baru (catatan lama tanpa akun = Kas lama)

function siapkanKasAkun_() {
  tambahKolom_('KAS', ['akun', 'akun_tujuan']);
  var ss = ss_();
  if (ss.getSheetByName('REKONSILIASI')) return;
  var sh = ss.insertSheet('REKONSILIASI');
  sh.appendRow(REKONSILIASI_HEAD);
  sh.getRange(1, 1, 1, REKONSILIASI_HEAD.length).setFontWeight('bold').setBackground('#1F3A5F').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  sh.getRange(2, 1, 999, 3).setNumberFormat('@');
}

/** Mencatat satu pencocokan saldo BCA (angka dari m-banking & dari aplikasi). */
function simpanCocokBank_(u, saldoBank, saldoAplikasi, catatan) {
  var bank = Number(saldoBank), app = Number(saldoAplikasi);
  if (!isFinite(bank) || !isFinite(app) || String(saldoBank) === '') throw new Error('Saldo BCA tidak valid.');
  siapkanKasAkun_();
  var sh = sheet_('REKONSILIASI'), v = sh.getDataRange().getValues(), r = lastDataRow_(v) + 1;
  var id = nextId_(v, 0, { prefix: 'RB-', pad: 4 });
  sh.getRange(r, 1, 1, 3).setNumberFormat('@').setValues([[id, waktuSekarang_(), u.nama]]);
  sh.getRange(r, 4, 1, 4).setValues([[bank, app, bank - app, teksAman_(catatan, 200)]]);
  return { id: id, selisih: bank - app };
}
