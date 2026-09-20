# Induk Pembiayaan — SMA Plus Merdeka Soreang

Aplikasi payroll sekolah: menghitung apa yang harus dibayarkan, dari kehadiran
yang sudah dicatat aplikasi lain.

Halaman statis (HTML + JavaScript, tanpa proses build), Supabase, dan GitHub
Pages — sama seperti empat aplikasi lain di kumpulan ini.

## Tiga prinsip yang memandu seluruh rancangan

**1. Aplikasi ini hampir tidak memiliki data sendiri.**
Kehadiran, jam mengajar, penggantian, piket, dan ekskul dicatat di aplikasi
masing-masing; di sini hanya dibaca. Yang dimilikinya sendiri hanya tabel
berawalan `ip_`: jenis pembiayaan dan besarannya. Kalau ada angka yang keliru,
perbaikannya di aplikasi asal datanya — bukan di sini — supaya satu kekeliruan
tidak perlu dibetulkan di dua tempat.

**2. Nominal berversi, tidak pernah ditimpa.**
Mengubah tarif berarti menambah baris baru dengan `berlaku_mulai` baru. Rekap
bulan lalu tetap memakai tarif bulan lalu. Ini bukan kerumitan tambahan —
tanpa itu, menaikkan tarif bulan Juli akan diam-diam mengubah rekap bulan Maret
yang sudah dibayarkan, dan selisihnya baru ketahuan saat diaudit.

**3. Identitas dokumen dibaca dari Data Induk.**
Bukan disalin ke sini. Kalau identitas disimpan terpisah di tiap aplikasi,
cepat atau lambat ketiganya akan berbeda tanpa ada yang menyadari.

## Masuk

Memakai **Supabase Auth dengan akun masing-masing**, bukan akun bersama seperti
Data Induk dan bukan PIN seperti dua aplikasi lain. Alasannya: halaman ini
menyentuh uang dan kelak nomor rekening, dan setiap perubahan besaran perlu
tercatat atas nama siapa yang masuk.

Yang boleh membuka: email yang terdaftar di tabel `operator_data` dengan peran
`operator` atau `bendahara` — diperiksa database lewat fungsi
`boleh_pembiayaan()`, bukan di sisi tampilan.

Mendaftarkan bendahara baru:

```sql
insert into operator_data (email, nama, peran)
values ('bendahara@smapmerdeka.sch.id', 'Nama Bendahara', 'bendahara');
```

Akunnya juga harus dibuat di Supabase → Authentication → Users.

## Halaman

| Halaman | Keadaan | Isinya |
|---|---|---|
| Beranda | ✅ | Ringkasan kesiapan dan dari mana tiap angka datang |
| Daftar Hadir | 🔲 kerangka | Kehadiran yang menjadi dasar pembiayaan, dibaca dari aplikasi lain |
| Pengaturan Nominal | ✅ | Besaran tiap jenis pembiayaan, berversi menurut tanggal berlaku |
| Rekapitulasi | 🔲 kerangka | Jumlah per periode per jenis, dengan unduhan Excel |
| Identitas Dokumen | ✅ | Kop dokumen, baca saja dari Data Induk |

## Tabel yang dipakai

**Milik sendiri:** `ip_jenis_tarif` (jenis pembiayaan dan satuannya),
`ip_tarif` (besaran berversi).

**Fungsi:** `f_ip_tarif(p_acuan)` menjawab *"tarif apa yang berlaku pada
tanggal ini"* — dasar seluruh perhitungan. `f_ip_nilai(p_kode, p_acuan,
p_ukuran)` mengambil satu angka, termasuk untuk tarif berjenjang.

**Dibaca dari aplikasi lain:** `profil_dokumen`, `v_guru` (Data Induk);
menyusul `kg_ketidakhadiran_guru`, `kg_penugasan_pengganti`,
`kg_pelaksanaan_piket` (Kehadiran Guru), `ae_sesi`, `ae_kehadiran`
(Absensi Ekskul).

Daftarnya dijaga [`database/kontrak/induk_pembiayaan.sql`](../database/kontrak/induk_pembiayaan.sql):
karena aplikasi ini hidup dari data aplikasi lain, perubahan di sana bisa
mematahkannya, dan kontrak itulah yang menahannya.

## Yang belum selesai

- Kehadiran staf belum ada datanya di mana pun. Pencatatannya akan dibuat di
  **Data Induk**; di sini hanya dibaca.
- `guru_privat` (nama bank, nomor rekening, NPWP) masih kosong — daftar
  transfer belum bisa dicetak sampai diisi.
- Tarif masih tersalin di `kg_pengaturan` dan `ae_tarif`. Keduanya tetap ada
  selama Kehadiran Guru dan Absensi Ekskul masih memakainya, dan dipensiunkan
  setelah aplikasi ini menggantikan perannya.
- Nama bendahara penanda tangan masih di pengaturan Kehadiran Guru, belum di
  Profil Dokumen.
