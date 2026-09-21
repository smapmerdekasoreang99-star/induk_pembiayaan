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
| Rekapitulasi | ✅ | Tujuh rekap: Honor Mengajar, Guru Pengganti, Piket Meja Sekolah, Piket Unit, Piket Parkiran, Transport Pembina, Honor Wali Kelas — masing-masing dengan unduhan xlsx |
| Identitas Dokumen | ✅ | Kop dokumen, baca saja dari Data Induk |

## Tabel yang dipakai

**Milik sendiri:** `ip_jenis_tarif` (jenis pembiayaan dan satuannya),
`ip_tarif` (besaran berversi).

**Perhitungan ada di database, bukan di aplikasi.** Lima fungsi yang melayani
tujuh rekap — transport piket memakai satu fungsi dengan argumen jenis:

| Fungsi | Menghitung |
|---|---|
| `f_ip_honor_mengajar` | honor menurut masa kerja, transport berdiri, insentif tatap muka, konsumsi |
| `f_ip_honor_pengganti` | jam penggantian GT / PT / Infaler |
| `f_ip_transport_piket` | giliran jaga satu jenis piket — kolom `ukuran` berisi **jam** untuk Meja Sekolah dan Unit, **hari** untuk Parkiran, mengikuti satuan pencatatannya di Kehadiran Guru; staf dikecualikan pada meja sekolah |
| `f_ip_transport_pembina` | pertemuan ekskul dan pembinaan, menurut jumlah siswa hadir |
| `f_ip_honor_wali_kelas` | komponen upacara, bimbingan, piket |

Semuanya mengambil periode sebagai argumen (`f_ip_transport_piket` ditambah
`p_jenis`) dan mengambil tarif
lewat `f_ip_nilai` pada **tanggal akhir periode**, bukan tanggal hari ini.

Rumus honor mengajar sengaja tidak disalin dari
`kehadiran_guru/assets/rekap-hitung.js` — dua salinan pasti menyimpang begitu
salah satunya diperbaiki, dan untuk angka yang dibayarkan itu berarti dua
dokumen resmi yang berbeda. Dengan di database, Kehadiran Guru kelak tinggal
diarahkan ke fungsi yang sama.

Empat hal yang mudah salah dan sudah ditangani di dalamnya:

- jam kontrak adalah jam **per minggu**, tidak dikalikan jumlah pekan — yang
  dikalikan hari hanya jam tatap muka dan hari kedatangan;
- Upacara (`M25`) dan Bimbingan Wali Kelas (`M08`) **bukan** jam mengajar;
- pada piket yang **digantikan**, harinya jatuh ke penggantinya, bukan ke
  petugas terjadwal;
- transport pembina dihitung **per pertemuan** menurut siswa yang hadir pada
  pertemuan itu, lalu dijumlahkan — memakai rata-rata kehadiran akan memberi
  hasil yang berbeda.

**Fungsi tarif:** `f_ip_tarif(p_acuan)` menjawab *"tarif apa yang berlaku pada
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
- Tiga komponen honor wali kelas belum ditetapkan besarannya (masih Rp 0).
  Jumlah jamnya sudah tercatat, tinggal menunggu keputusan yayasan.
- Tarif masih tersalin di `kg_pengaturan` dan `ae_tarif`. Keduanya tetap ada
  selama Kehadiran Guru dan Absensi Ekskul masih memakainya, dan dipensiunkan
  setelah aplikasi ini menggantikan perannya.
- Nama bendahara penanda tangan masih di pengaturan Kehadiran Guru, belum di
  Profil Dokumen.
