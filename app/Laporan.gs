/**
 * Posetive — PDF (laporan bulanan, invoice), Unduh Laporan event, dan backup.
 */

// ---------------------------------------------------------------- folder, PDF, backup

function buatPdf_(html, nama, folderNama) {
  var blob = Utilities.newBlob(html, 'text/html', nama + '.html').getAs('application/pdf').setName(nama + '.pdf');
  return folder_(folderNama).createFile(blob).getUrl();
}
function buatLaporanPdf(html, bulan) { return buatPdf_(html, 'Laporan Posetive ' + bulan, 'Posetive - Laporan'); }
function buatInvoice(html, nomor) { return buatPdf_(html, String(nomor).replace(/\//g, '-'), 'Posetive - Invoice'); }

var FORMAT_LAPORAN = { rp: '"Rp"#,##0;[Red]-"Rp"#,##0', n: '#,##0', pct: '0%', tgl: 'dd mmm yyyy' };
var WARNA_LAPORAN = { utama: '#6E1F2C', lembut: '#F2E1E1', garis: '#D9CFC7', redup: '#7A736A' };

/** Menulis satu sheet laporan beserta gayanya (lihat dataLaporanEvent di Index.html). */
function tulisSheetLaporan_(sh, def) {
  var rows = def.rows, lebar = Math.max(def.lebar.length, rows.reduce(function (m, r) { return Math.max(m, r.v.length); }, 1));
  var nilai = [], format = [], rata = [];
  rows.forEach(function (r) {
    var v = [], f = [], a = [], teksSaja = r.t === 'judul' || r.t === 'sub' || r.t === 'bagian';
    for (var c = 0; c < lebar; c++) {
      var x = c < r.v.length ? r.v[c] : '', fm = r.f[c] || '';
      if (fm === 'tgl' && /^\d{4}-\d{2}-\d{2}$/.test(String(x))) { var p = String(x).split('-'); x = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
      else if (fm === 'tgl') fm = '';
      if (x === null || x === undefined) x = '';
      v.push(x);
      // Teks disimpan apa adanya (kode, nomor HP, jam tidak diubah Sheets jadi angka/tanggal).
      f.push(FORMAT_LAPORAN[fm] && x !== '' ? FORMAT_LAPORAN[fm] : (typeof x === 'number' ? '#,##0.##' : '@'));
      // Angka & tanggal rata kanan, teks rata kiri.
      a.push(!teksSaja && c > 0 && (typeof x === 'number' || x instanceof Date) ? 'right' : 'left');
    }
    nilai.push(v); format.push(f); rata.push(a);
  });
  if (!rows.length) return;
  var semua = sh.getRange(1, 1, rows.length, lebar);
  semua.setNumberFormats(format).setValues(nilai).setHorizontalAlignments(rata)
    .setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle');
  def.lebar.forEach(function (px, i) { sh.setColumnWidth(i + 1, px); });
  sh.setHiddenGridlines(!def.grid);

  var head = -1;
  rows.forEach(function (r, i) {
    var rg = sh.getRange(i + 1, 1, 1, lebar);
    if (r.t === 'judul') { rg.setFontSize(15).setFontWeight('bold').setFontColor(WARNA_LAPORAN.utama); sh.setRowHeight(i + 1, 28); }
    else if (r.t === 'sub') rg.setFontColor(WARNA_LAPORAN.redup);
    else if (r.t === 'bagian') { rg.setBackground(WARNA_LAPORAN.utama).setFontColor('#FFFFFF').setFontWeight('bold'); sh.setRowHeight(i + 1, 22); }
    else if (r.t === 'head') { rg.setBackground(WARNA_LAPORAN.lembut).setFontWeight('bold').setBorder(null, null, true, null, null, null, WARNA_LAPORAN.utama, null); if (head < 0) head = i; }
    else if (r.t === 'total') rg.setFontWeight('bold').setBorder(true, null, true, null, null, null, WARNA_LAPORAN.utama, null);
    else if (r.v.length && head >= 0 && def.grid) rg.setBorder(null, null, true, null, null, null, WARNA_LAPORAN.garis, null);
    if (r.w) {
      // Teks panjang: sel B sampai kolom terakhir digabung & dibungkus; tinggi baris diperkirakan
      // (sel gabungan tidak ikut membesar otomatis). ±7 px per huruf, 15 px per baris.
      var px = def.lebar.slice(1).reduce(function (t, w) { return t + w; }, 0) || 300;
      var nBaris = String(nilai[i][1]).split('\n').reduce(function (t, s) { return t + Math.max(1, Math.ceil(s.length * 7 / px)); }, 0);
      sh.getRange(i + 1, 2, 1, lebar - 1).merge().setWrap(true);
      sh.getRange(i + 1, 1, 1, lebar).setVerticalAlignment('top');
      sh.setRowHeight(i + 1, Math.max(21, nBaris * 15 + 6));
    }
  });
  // Tabel (sheet dengan garis): judul kolom dibekukan supaya tetap terlihat saat menggulir.
  if (def.grid && head >= 0) sh.setFrozenRows(head + 1);
}

/**
 * Laporan event sebagai Google Spreadsheet (beberapa sheet, sudah dirapikan) di folder "Posetive - Laporan Event".
 * Satu file per event: diunduh ulang → file yang sama ditimpa & diberi nama terbaru. Mengembalikan link buka & link unduh .xlsx.
 */
function buatLaporanEventSheet(idEvent, nama, data) {
  var folder = folder_('Posetive - Laporan Event'), ss = null;
  var it = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (it.hasNext() && !ss) {
    var f = it.next();
    if (f.getName().indexOf(idEvent + ' - ') === 0 && !f.isTrashed()) ss = SpreadsheetApp.openById(f.getId());
  }
  if (ss) {
    ss.rename(nama);
  } else {
    ss = SpreadsheetApp.create(nama);
    DriveApp.getFileById(ss.getId()).moveTo(folder);
  }
  // Sheet lama dibuang seluruhnya (termasuk format & sel gabung) lalu ditulis ulang dari awal.
  var lama = ss.getSheets();
  lama.forEach(function (sh, i) { sh.setName('_lama' + i); });
  data.sheets.forEach(function (def) { tulisSheetLaporan_(ss.insertSheet(def.nama, ss.getSheets().length), def); });
  lama.forEach(function (sh) { ss.deleteSheet(sh); });
  ss.setActiveSheet(ss.getSheets()[0]);
  SpreadsheetApp.flush();
  return { url: ss.getUrl(), xlsx: 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx' };
}

/** Salinan file master ke folder "Posetive - Backup"; hanya 8 salinan terbaru yang disimpan. */
function backupSekarang() {
  var tz = ss_().getSpreadsheetTimeZone();
  var nama = 'Backup POSETIVE ' + Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HHmm');
  var fol = folder_('Posetive - Backup');
  var copy = DriveApp.getFileById(ss_().getId()).makeCopy(nama, fol);
  var files = [];
  var it = fol.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('Backup POSETIVE') === 0) files.push(f);
  }
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(8).forEach(function (f) { f.setTrashed(true); });
  return copy.getUrl();
}
