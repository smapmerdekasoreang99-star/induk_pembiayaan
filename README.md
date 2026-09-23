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
| Kehadiran dan Piket | ✅ | Kehadiran yang menjadi dasar pembiayaan, persis seperti di aplikasi asalnya: dari Kehadiran Guru tab Kehadiran Guru, Guru Pengganti, Wali Kelas, Piket Meja Sekolah, Piket Guru Diperbantukan, Piket Parkiran, Kehadiran Staf (tanpa Hari Libur); dari Absensi Ekskul tab Per kegiatan, Per pertemuan, Per pembina (tanpa Per siswa). Kehadiran Guru, Wali Kelas, dan Piket Meja Sekolah menyembunyikan pemegang tugas Staf secara bawaan, dengan saklar untuk menampilkannya. Tiap tab bisa diunduh xlsx |
| Penggajian | ✅ | Besaran tiap jenis pembiayaan, berversi menurut tanggal berlaku (dulu bernama Pengaturan Nominal) |
| Honor dan Transpor | ✅ | Disusun per penerima: Gabungan per Guru, Guru Mengajar, Wali Kelas (honor bulanan + Upacara + Bimbingan), Guru Diperbantukan (honor bulanan + transport piket unit, per unit), Piket Meja Sekolah, Guru Pengganti, Pembina OSIS (unduhannya **kuitansi** perorangan berkop, ditandatangani Kepala Sekolah, Bendahara, penerima), Pembina Ekskul, Pembimbing Tahfidz, Piket Parkiran, BPJS Kesehatan dan BPJS Ketenagakerjaan (tunjangan flat per bulan bagi yang disahkan di Data Induk; aturan Staf tidak berlaku) — selebihnya daftar bertanda tangan xlsx |
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
| `f_ip_honor_wali_kelas` | honor bulanan flat + Upacara dan Bimbingan WK per **jam hadir** tatap muka dalam rentang (dari `f_ip_kehadiran_wali`, angka yang sama dengan rekap kehadiran); piket tidak termasuk, dibayar per jam jaga di Piket Meja Sekolah |
| `f_ip_honor_diperbantukan` | honor bulanan flat per unit yang dipegang + transport piket unit per jam jaga, per penugasan |
| `f_ip_honor_pembina_osis` | flat per bulan; `f_ip_bulan` menghitung bulan yang lebih dari setengah harinya masuk rentang, dipakai ketiga honor flat |
| `f_ip_tunjangan_bpjs` | tunjangan BPJS flat per bulan sejak bulan mulai pengesahan, argumen `p_jenis` kesehatan (guru: aktif, bukan Guru Tidak Tetap, TMT sekolah 5 tahun) atau ketenagakerjaan (pemegang tugas Staf, TMT staf 3 tahun); hanya yang disahkan di Data Induk dan masih memenuhi syarat saat dihitung (`v_guru_bpjs`) |
| `f_ip_rekap_gabungan` | satu baris per penerima, kolomnya mengikuti tab: mengajar, wali, diperbantukan, piket meja, pengganti, OSIS, ekskul, Tahfidz, parkiran, BPJS Kesehatan, BPJS Ketenagakerjaan |

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

**Kehadiran dan Piket** memakai lima fungsi lagi, dengan rumus yang
dipindahkan apa adanya dari `kehadiran_guru/assets/rekap-hitung.js` dan
`absen_ekskul/scripts/rekap.js`:

| Fungsi | Menampilkan |
|---|---|
| `f_ip_hari_kerja` | hari kerja dalam rentang (Senin–Jumat di luar `hari_libur`), dipakai keempat fungsi berikut |
| `f_ip_kehadiran_guru` | terjadwal, hadir, HTTM/ST/IT/TK, hadir berbobot, % hadir per guru — jadwal tahun ajaran aktif, semester mengikuti tanggal |
| `f_ip_kehadiran_wali` | Upacara dan Bimbingan Wali Kelas per wali kelas, persentase dari gabungan keduanya |
| `f_ip_pengganti_rinci` | satu baris satu jam penggantian; ringkasan GT/PT/Inf per guru pengganti disusun aplikasi dari sini |
| `f_ip_pelaksanaan_piket` | Terjadwal dan Jaga per petugas — jam untuk Meja Sekolah dan Unit, hari untuk Parkiran |
| `f_ip_ekskul_pertemuan` | satu baris satu pertemuan ekskul/pembinaan dengan jumlah siswa H/S/I/A; rekap per kegiatan dan per pembina disusun aplikasi dari sini |
| `f_ip_kehadiran_staf` | hari kerja (ketentuan Jam Kerja Staf tiap orang, di luar hari libur), hadir, tidak hadir, belum dicatat, terlambat — hanya staf berpola bulanan + insentif kedatangan atau upah harian |

Ketujuh tab dimuat sekaligus untuk satu periode, jadi berpindah tab tidak
menunggu jaringan. Yang dikerjakan aplikasi hanya menyaring, menjumlahkan,
dan menggambar; berkas xlsx tiap tab ditulis dari daftar kolom yang sama
dengan layarnya. Yang menandatangani unduhan ini Wakasek Kurikulum (kehadiran
guru) atau Wakasek Kesiswaan (ekskul), bukan Bendahara — ini dokumen
kehadiran, bukan pembayaran.

**Dibaca dari aplikasi lain:** `profil_dokumen`, `v_guru`, `jadwal_kbm`,
`hari_libur`, `piket`, `piket_unit`, `piket_parkiran`, `guru_tugas` (Data
Induk); `kg_ketidakhadiran_guru`, `kg_penugasan_pengganti`,
`kg_pelaksanaan_piket` (Kehadiran Guru); `ekskul`, `ae_pembina`, `ae_sesi`,
`ae_kehadiran` (Absensi Ekskul).

Daftarnya dijaga [`database/kontrak/induk_pembiayaan.sql`](../database/kontrak/induk_pembiayaan.sql):
karena aplikasi ini hidup dari data aplikasi lain, perubahan di sana bisa
mematahkannya, dan kontrak itulah yang menahannya.

## Yang belum selesai

- Kehadiran staf sudah terbaca (tab Kehadiran Staf, dari `f_ip_kehadiran_staf`;
  dicatat di Kehadiran Guru → Kehadiran Staf). Honornya belum: tiga besaran
  untuk pola bulanan, bulanan + insentif kedatangan, dan upah harian belum
  ada di Penggajian, dan `f_ip_honor_staf` belum dibuat.
- `guru_privat` (nama bank, nomor rekening, NPWP) masih kosong — daftar
  transfer belum bisa dicetak sampai diisi.
- Honor bulanan wali kelas (`wali_bulanan`), honor bulanan guru diperbantukan
  (`diperbantukan_bulanan`), dan tiga komponen jam wali kelas belum
  ditetapkan besarannya (masih Rp 0). Isiannya sudah ada di Penggajian;
  jumlah bulan dan jamnya sudah terhitung, tinggal menunggu keputusan yayasan.
- Tarif masih tersalin di `kg_pengaturan` dan `ae_tarif`. Keduanya tetap ada
  selama Kehadiran Guru dan Absensi Ekskul masih memakainya, dan dipensiunkan
  setelah aplikasi ini menggantikan perannya.
- Nama bendahara penanda tangan masih di pengaturan Kehadiran Guru, belum di
  Profil Dokumen.
