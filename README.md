# Posetive Photobooth — Aplikasi Manajemen

Aplikasi pribadi untuk mengelola divisi photobooth Posetive: pipeline, event, laporan event, kas, dan inventaris dalam satu tempat.

## Struktur
- `migrasi/buat_master.py` — membuat file DATABASE MASTER (.xlsx) dari data lama.
- `app/` — kode Google Apps Script, dikirim ke Apps Script dengan clasp (`bun run kirim`).
  - Server (`.gs`, digabung otomatis oleh Apps Script):
    `Code.gs` (inti: baca/tulis tab, `doGet`, `include`), `Akses.gs` (login, sesi, `api()` + tabel izin), `Event.gs` (event, laporan, kas, stok, checklist),
    `EventSaya.gs` (tampilan crew: data tersaring & simpan yang dijaga),
    `Crew.gs` (crew & fee), `Kalender.gs` (Google Calendar), `Laporan.gs` (PDF, Unduh Laporan, backup),
    `Pengingat.gs` (email harian & pemicu), `Pengaturan.gs` (pengaturan & HPP).
  - Tampilan: `Index.html` hanya kerangka yang memanggil `Css.html` dan `Js*.html` lewat `include()`.
    `JsDasar` (utilitas & semua perhitungan, dimuat pertama), `JsBeranda`, `JsPipeline`, `JsEvent`, `JsKasStok`,
    `JsCrew`, `JsLainnya`, `JsEventSaya` (tampilan crew), `JsForm`, `JsAkses` (masuk & pengguna), dan `JsMulai` (menjalankan aplikasi, dimuat terakhir).
- `app/PANDUAN_PASANG.md` — langkah memasang & memperbarui aplikasi.
- `package.json` — perintah clasp: `bun run masuk` (login Google), `bun run kirim` (kirim kode ke Apps Script).

## Tahap
1. Database master — selesai (milik posetivestudio@gmail.com).
2. Aplikasi Tahap 1: Beranda, Pipeline, Event + laporan event, Kas — selesai.
3. Kalkulator skema kerja sama + stok bahan (kertas, Graduation Book, tinta) — selesai.
4. Checklist alat per event, laporan bulanan (PDF), pengingat Gmail harian, invoice/kuitansi PDF, backup mingguan — selesai.
5. Penugasan & pembayaran fee crew per event (tab TUGAS_CREW, otomatis tercatat di KAS) dan tahap tagihan klien DP → pelunasan dengan jatuh tempo — selesai.
6. Kalender bulanan di Beranda (event, jatuh tempo tagihan, follow-up) dan sinkron otomatis ke Google Calendar — selesai.
7. Undangan Google Calendar otomatis untuk crew yang ditugaskan (kolom email di CREW) dan peringatan crew bentrok jadwal — selesai.
8. Inventaris: target event per bulan bisa diubah langsung, alokasi penyusutan per event (total & per barang) tampil — selesai.
9. Halaman HPP & harga jual (Lainnya): rincian HPP, margin per produk, ubah angka dari aplikasi; HPP terkunci di laporan event — selesai.
10. Tombol "Unduh Laporan" di event: laporan lengkap & rapi sebagai Google Spreadsheet (Ringkasan, Produksi, Kas, Alat), satu file per event, bisa diunduh .xlsx — selesai.
11. Login username + PIN, role admin / pemantau (lihat saja) / crew, hak akses diperiksa di server (`Akses.gs`), kelola pengguna — selesai.
12. Tampilan crew "Event saya": hanya event tempat ia bertugas (hari ini & mendatang), info klien & rekan crew tanpa angka uang; checklist alat & laporan event hari ini bisa diisi sampai 06.00 esok harinya, diperiksa di server. HPP & alokasi kini dikunci di server saat laporan pertama kali disimpan — selesai.
