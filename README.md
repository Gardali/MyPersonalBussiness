# Posetive Photobooth — Aplikasi Manajemen

Aplikasi pribadi untuk mengelola divisi photobooth Posetive: pipeline, event, laporan event, kas, dan inventaris dalam satu tempat.

## Struktur
- `migrasi/buat_master.py` — membuat file DATABASE MASTER (.xlsx) dari data lama.
- `app/Code.gs` — server Google Apps Script (baca/tulis tab spreadsheet).
- `app/Index.html` — tampilan aplikasi (Beranda, Pipeline, Event + laporan, Kas) dan semua perhitungan.
- `app/PANDUAN_PASANG.md` — langkah memasang aplikasi di file master.

## Tahap
1. Database master — selesai (milik posetivestudio@gmail.com).
2. Aplikasi Tahap 1: Beranda, Pipeline, Event + laporan event, Kas — selesai.
3. Kalkulator skema kerja sama + stok bahan (kertas, Graduation Book, tinta) — selesai.
4. Checklist alat per event, laporan bulanan (PDF), pengingat Gmail harian, invoice/kuitansi PDF, backup mingguan — selesai.
5. Penugasan & pembayaran fee crew per event (tab TUGAS_CREW, otomatis tercatat di KAS) dan tahap tagihan klien DP → pelunasan dengan jatuh tempo — selesai.
6. Kalender bulanan di Beranda (event, jatuh tempo tagihan, follow-up) dan sinkron otomatis ke Google Calendar — selesai.
7. Undangan Google Calendar otomatis untuk crew yang ditugaskan (kolom email di CREW) dan peringatan crew bentrok jadwal — selesai.
