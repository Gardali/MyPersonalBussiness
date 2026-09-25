# Cara memasang aplikasi Posetive

Aplikasi dipasang **di dalam file POSETIVE_Database_Master** (milik posetivestudio@gmail.com).
Cukup dilakukan sekali, sekitar 10 menit. Bisa dari akun Garda (editor file) atau akun bos.

## 1. Buka editor Apps Script
1. Buka file **POSETIVE_Database_Master** di laptop (bukan HP).
2. Menu **Ekstensi → Apps Script**. Tab baru terbuka.
3. Di kiri atas, klik "Proyek tanpa judul" lalu ganti nama menjadi **Posetive App**.

## 2–3. Kirim kode dengan clasp (bukan copy-paste)
Kode terdiri dari banyak file (`app/*.gs` dan `app/*.html`), jadi dikirim sekaligus dengan **clasp**
(alat resmi Google), dijalankan lewat **Bun** — Node.js tidak perlu dipasang.

Persiapan sekali saja (sudah dilakukan untuk akun posetivestudio@gmail.com):
1. Buka https://script.google.com/home/usersettings → **Google Apps Script API: Aktif**.
2. Di folder proyek: `bun install`, lalu `bun run masuk` → browser terbuka → pilih akun
   **posetivestudio@gmail.com** → **Izinkan**.
3. Script ID proyek sudah tercatat di `.clasp.json`.

Kirim kode: `bun run kirim` (semua file di `app/` terkirim; editor Apps Script ikut berubah, aplikasi
di HP belum).

Jangan mengedit kode langsung di editor Apps Script — pengiriman berikutnya akan menimpanya. Ubah kode
di folder proyek, lalu kirim.

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
Di folder proyek jalankan **`bun run pasang`**. Perintah ini mengirim semua file lalu memperbarui
deployment aplikasi web ke versi baru. URL tidak berubah; buka ulang aplikasi di HP untuk memakai kode baru.

Kalau Google meminta izin baru (mis. fitur baru memakai Kalender/Drive), buka editor Apps Script,
jalankan fungsi **izinkanAkses** sekali, lalu **Izinkan**.

**Mengembalikan versi lama** bila pembaruan bermasalah:
1. `bun run versi-aplikasi` → lihat nomor versi (mis. versi 31 terbaru, 30 sebelumnya).
2. `bunx @google/clasp update-deployment AKfycbzLnJOrqLzFUCmo91fog8eyVVl2F86RWW5Jtn0DaX-RPMHybQ2_AH-VCqFWYVBBU9zP -V 30`
   (ganti 30 dengan versi yang diinginkan). Aplikasi langsung kembali ke versi itu.

## Login & akun
Semua orang masuk dengan **username + PIN 6 angka**. Tiga role:
- **Admin** — bisa mengubah semua data dan mengelola akun.
- **Pemantau** (mis. bos) — melihat semua halaman, laporan, PDF, dan Unduh Laporan, tapi tidak bisa mengubah apa pun.
- **Crew** — hanya event tempat ia bertugas (hari ini & yang akan datang); mengisi checklist & laporan event hari ini.

Pengecekan hak akses dilakukan di server (`Akses.gs`), bukan hanya disembunyikan di tampilan.

**Akun admin pertama** (sekali saja): buka editor Apps Script → pilih fungsi **buatAdminPertama** → **Jalankan**.
Buka **Log eksekusi**: tertulis username `garda` dan PIN sementara. Masuk ke aplikasi dengan itu, lalu buat PIN
baru. Fungsi ini menolak dijalankan lagi bila sudah ada admin.

**Menambah akun** (bos, crew): Lainnya → Pengguna → **+ Pengguna**. Aplikasi menampilkan PIN sementara sekali
saja — berikan langsung ke orangnya; ia wajib menggantinya saat masuk pertama.

**Lupa PIN / terkunci** (5× salah PIN = terkunci 15 menit): admin membuka akunnya di Lainnya → Pengguna →
**Reset PIN**. **Keluarkan seseorang**: ubah Status jadi Nonaktif — ia langsung keluar di semua perangkat.

"Ingat saya" menyimpan login di perangkat itu 30 hari; tanpa itu login berakhir saat tab ditutup (maks. 12 jam).

**Akun crew**: Lainnya → Pengguna → **+ Pengguna** → Role **Crew** → pilih **Data crew**-nya (harus sudah ada di
Lainnya → Crew). Crew melihat menu **Event saya**: event tempat ia ditugaskan (Event → Crew bertugas), hari ini & mendatang,
dengan jam, lokasi, klien + WA, dan rekan crew — tanpa kontrak, fee, kas, atau HPP.
- **Checklist alat & laporan** hanya bisa diisi pada hari event, sampai **pukul 06.00 esok harinya**. Event mendatang
  hanya bisa dilihat. Setelah lewat 06.00 event hilang dari daftar crew; koreksi selanjutnya dilakukan admin.
- Admin QRIS & admin pencairan tidak diisi crew — admin melengkapinya lewat Ubah laporan.
- **Alur laporan**: saat buka, crew mengisi counter awal + fotonya lalu **Simpan**. Saat tutup, crew melengkapi angka,
  memotret counter akhir (wajib), uang tunai & bukti QRIS, **Simpan**, lalu **Kirim ke admin**. Foto disimpan di folder
  Drive **Posetive - Bukti Laporan**.
- Setelah dikirim, admin mendapat **email ringkasan** (angka, selisih lembar & kas, foto). Penerima: isi `EMAIL_LAPORAN`
  di tab PENGATURAN (boleh beberapa, pisahkan koma); kosong = email akun Posetive. Bila crew mengubah laporan setelah
  dikirim, admin dapat email "laporan diubah".
- Admin membuka event → cek foto & angka → **Setujui laporan** → event menjadi *Selesai* dan crew tidak bisa mengubah
  laporan/checklist lagi. Salah pencet? **Batalkan persetujuan**. Admin tetap bisa mengubah laporan kapan saja.
- Crew yang dilepas dari event langsung tidak bisa melihat/mengisi event itu lagi.

## Kerja sama panitia (skema A–F)
- Isi di **Prospek** (Pipeline): pilih Model pendapatan **Kerja Sama Panitia** → **Skema**. Kolom khusus skema itu muncul
  otomatis; kolom skema lain disembunyikan dan tidak ikut tersimpan. Saat deal, semuanya ikut ke Event.
- **Harga per acara** (4R, Graduation Book, strip, potongan grup) terisi dari PENGATURAN dan bisa diubah per acara. Harga
  ini dipakai juga untuk omzet laporan & selisih kas event itu.
- Di bawah form: **hasil hitungan** dari perkiraan jumlah sesi, **ringkasan untuk surat perjanjian** (tombol Salin teks), dan
  **riwayat perubahan**.
- **Status kesepakatan**: setelah **Disetujui**, kolom skema (termasuk harga & model) dikunci — di aplikasi dan di server.
  Untuk mengubah, kembalikan status ke **Draft**. Siapa & kapan status diubah tercatat; semua perubahan skema dicatat di
  tab **RIWAYAT_KS**.
- **Setelah acara** (detail event → Kerja sama panitia):
  - A/B/C: bagi hasil dihitung dari laporan (sesi berbayar; skema B "Seluruh omzet" dari omzet laporan), jatuh tempo H+1/H+3/H+7.
  - D: fee tetap, jatuh tempo H-7/H-3/H-1/saat loading. E/F: tagih panitia di muka, jatuh tempo H-7/H-3/H-1.
  - **+ Catat pembayaran** membuat catatan Kas (kategori *Bagi Hasil Panitia* / *Pembayaran Panitia*). Beranda mengingatkan
    yang jatuh tempo ≤ 3 hari lagi atau terlambat.
- Kalkulator skema (Pipeline → Kalkulator) kini memakai nilai bawaan formulir kerja sama. Pengaturan `SKEMA_*` di tab
  PENGATURAN tidak dipakai lagi.

## SOP event
- Isi SOP ada di tab **SOP** (dibuat otomatis dari "SOP Event Posetive Photobooth" saat aplikasi pertama kali dibuka
  setelah pembaruan). Ubah lewat **Lainnya → SOP event** — ketuk bagian untuk mengubah, **+ Bagian** untuk menambah.
  - **Langkah** dicentang tim di setiap event; **Bacaan** hanya dibaca (aturan QRIS, tunai, foto basah, dst.).
  - **Wajib = Ya** (7 poin uji coba): laporan tidak bisa dikirim crew sebelum langkah itu dicentang.
  - **Berlaku untuk**: langkah seperti uji QRIS dan hitung tunai hanya muncul di event yang tamunya bayar di booth
    (bukan Kontrak Klien).
  - Langkah yang pernah dipakai sebaiknya dijadikan **Nonaktif**, bukan dihapus.
- **Peran per event**: di Event → Crew bertugas → ketuk crew → **Peran di event** (FC / Operator Depan / Operator Cetak).
  Satu event hanya boleh satu FC. Beranda mengingatkan event ≤ 3 hari lagi yang belum punya FC.
- Crew membuka **SOP** (menu bawah) untuk membaca, dan **Event saya → SOP event** untuk mencentang langkah di hari event.
  Setiap centang langsung tersimpan beserta nama & jamnya. Admin bisa mencentang dari detail event kapan saja.
- Email laporan memuat jumlah langkah yang dicentang dan langkah yang terlewat.
- Aturan pembayaran **tunai** di SOP masih **draf** — tinjau dan ubah di Lainnya → SOP event.
- Isi SOP awal (`app/SopAwal.gs`) tidak masuk repo GitHub karena repo publik; hanya dikirim ke Apps Script. PIN Mini PC
  tidak ditulis di SOP — sampaikan langsung ke crew.

## Menghubungkan Google Calendar (sekali saja)
1. Buka aplikasi → **Lainnya → Google Calendar → Hubungkan & sinkronkan**.
2. Kalau muncul pesan gagal soal izin: buka editor Apps Script, pilih fungsi **izinkanAkses**
   di daftar fungsi (atas), klik **Jalankan**, lalu **Izinkan** akses Kalender. Setelah itu klik lagi
   tombolnya di aplikasi.
3. Kalender baru **Posetive Photobooth** muncul di Google Calendar. Tiap event yang disimpan otomatis
   masuk/diperbarui di sana; event Batal atau dihapus ikut hilang dari kalender. Ubah jadwal lewat
   aplikasi, bukan langsung di kalender (perubahan di kalender akan tertimpa).
4. **Crew diundang otomatis**: isi kolom **Email** di data crew (Lainnya → Crew). Crew yang ditugaskan di
   event mendatang otomatis masuk sebagai tamu, jadwalnya muncul di Google Calendar HP-nya. Kalau crew
   dilepas dari event, undangannya dicabut. Tamu lain yang Anda tambahkan manual (mis. bos) tidak disentuh.
5. Supaya bos bisa melihat semua jadwal: di Google Calendar, kalender Posetive Photobooth → ⋮ →
   **Setelan dan berbagi** → **Bagikan dengan orang tertentu**.

## Aturan pakai
- Isi data **lewat aplikasi**. Membuka spreadsheet langsung tetap boleh, tapi jangan mengubah judul
  kolom (baris 1) atau nama tab.
- HPP, harga jual, dan target event per bulan diubah lewat aplikasi (**Lainnya → HPP & harga jual**,
  **Lainnya → Inventaris**) supaya laporan event lama ikut terkunci. Angka lain di tab **PENGATURAN**.
- Baris dengan catatan diawali `CEK:` muncul di Beranda sebagai "Perlu dicek". Hapus tulisan `CEK:`
  setelah diperiksa.
