# Posetive Photobooth — Aplikasi Manajemen

Aplikasi pribadi untuk mengelola divisi photobooth Posetive: pipeline, event, laporan event, kas, dan inventaris dalam satu tempat.

## Tahap
1. **Database master** (selesai): satu file Google Sheets berisi semua data. Dibuat oleh `migrasi/buat_master.py`.
2. **Aplikasi** (berikutnya): Google Apps Script web app di atas file master.

## Membuat ulang file master
```
pip install openpyxl
python3 migrasi/buat_master.py POSETIVE_Database_Master.xlsx
```
