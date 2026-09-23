# Cara memasang aplikasi Posetive

Aplikasi dipasang **di dalam file POSETIVE_Database_Master** (milik posetivestudio@gmail.com).
Cukup dilakukan sekali, sekitar 10 menit. Bisa dari akun Garda (editor file) atau akun bos.

## 1. Buka editor Apps Script
1. Buka file **POSETIVE_Database_Master** di laptop (bukan HP).
2. Menu **Ekstensi → Apps Script**. Tab baru terbuka.
3. Di kiri atas, klik "Proyek tanpa judul" lalu ganti nama menjadi **Posetive App**.

## 2. Tempel kode server
1. Di daftar file sebelah kiri, klik **Code.gs**.
2. Hapus semua isinya.
3. Salin seluruh isi file `app/Code.gs` lalu tempel.
4. Tekan **Ctrl+S** (simpan).

## 3. Tempel tampilan
1. Klik **+** di samping "File" → **HTML**.
2. Beri nama persis **Index** (tanpa .html; huruf I besar).
3. Hapus isinya, lalu tempel seluruh isi file `app/Index.html`.
4. Tekan **Ctrl+S**.

## 4. Terbitkan sebagai aplikasi web
1. Kanan atas: **Terapkan → Deployment baru**.
2. Ikon gerigi di samping "Pilih jenis" → **Aplikasi web**.
3. Isi:
   - Deskripsi: `Tahap 1`
   - Jalankan sebagai: **Saya**
   - Yang memiliki akses: **Hanya saya sendiri**
4. Klik **Terapkan**.
5. Google meminta izin: **Izinkan akses** → pilih akun Anda.
   Kalau muncul "Google belum memverifikasi aplikasi ini": klik **Lanjutan** → **Buka Posetive App (tidak aman)** → **Izinkan**.
   Ini normal: aplikasinya buatan Anda sendiri dan hanya membaca/menulis file master ini.
6. Salin **URL aplikasi web** (berakhiran `/exec`).

## 5. Pasang di HP
Buka URL tadi di Chrome HP (login dengan akun yang sama) → menu ⋮ → **Tambahkan ke layar utama**.

## Kalau ada pembaruan kode
Tempel kode baru di Code.gs / Index, simpan, lalu **Terapkan → Kelola deployment → ikon pensil →
Versi: Versi baru → Terapkan**. URL tidak berubah.

## Menghubungkan Google Calendar (sekali saja)
1. Buka aplikasi → **Lainnya → Google Calendar → Hubungkan & sinkronkan**.
2. Kalau muncul pesan gagal soal izin: buka editor Apps Script, pilih fungsi **sinkronSemuaKalender**
   di daftar fungsi (atas), klik **Jalankan**, lalu **Izinkan** akses Kalender. Setelah itu klik lagi
   tombolnya di aplikasi.
3. Kalender baru **Posetive Photobooth** muncul di Google Calendar. Tiap event yang disimpan otomatis
   masuk/diperbarui di sana; event Batal atau dihapus ikut hilang dari kalender. Ubah jadwal lewat
   aplikasi, bukan langsung di kalender (perubahan di kalender akan tertimpa).
4. Supaya crew atau bos ikut melihat: di Google Calendar, kalender Posetive Photobooth → ⋮ →
   **Setelan dan berbagi** → **Bagikan dengan orang tertentu**.

## Aturan pakai
- Isi data **lewat aplikasi**. Membuka spreadsheet langsung tetap boleh, tapi jangan mengubah judul
  kolom (baris 1) atau nama tab.
- Angka harga & biaya diubah di tab **PENGATURAN**; aplikasi otomatis memakai angka terbaru.
- Baris dengan catatan diawali `CEK:` muncul di Beranda sebagai "Perlu dicek". Hapus tulisan `CEK:`
  setelah diperiksa.
