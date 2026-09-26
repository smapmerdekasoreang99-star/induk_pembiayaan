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
| Kehadiran dan Piket | ✅ | Kehadiran yang menjadi dasar pembiayaan, persis seperti di aplikasi asalnya, dalam tiga bagian (tab induk seperti Honor dan Transpor): **Kehadiran Guru** — Kehadiran Guru, Guru Pengganti, Wali Kelas, Piket Meja Sekolah, Piket Guru Diperbantukan, Piket Parkiran (tanpa Hari Libur); **Kehadiran Staf** — Hari Hadir Staf dan **Kehadiran Karyawan** (meniru sheet Karyawan struk bendahara: masa kerja, hari dan jam per minggu, hari dan jam efektif, hari dan jam hadir, persentase; hanya kelompok tarif Kepala TU, Tata Usaha, Caraka/Satpam; dari `f_ip_honor_staf`); **Absensi Ekskul** — Per kegiatan, Per pertemuan, Per pembina (tanpa Per siswa). Kehadiran Guru, Wali Kelas, dan Piket Meja Sekolah menyembunyikan pemegang tugas Staf secara bawaan, dengan saklar untuk menampilkannya. Tiap tab bisa diunduh xlsx |
| Nominal Penggajian | ✅ | Dibuka dengan PIN khusus (sekali per sesi). Dua tab menurut penerimanya: **Nominal Penggajian Guru** dan **Nominal Penggajian Staf** (kolom `penerima` di `ip_jenis_tarif`: guru, staf, atau semua — yang "semua", seperti iuran koperasi dan piket parkiran, tampil di kedua tab). Tab Staf menyimpan **formulasi honor staf** dari berkas bendahara (Data Nominal Staf SMA, TP 2026/2027) sebagai besaran berversi yang bisa diubah: kelompok **Honor Staf** (Gaji Pokok Staf per jam per minggu, berjenjang masa kerja; Transport Berdiri per jam per minggu × indeks; Transport HTM per jam hadir × indeks; Konsumsi per hari hadir × indeks), **Tunjangan Jabatan Staf** (per hari per minggu untuk Kepala Sekolah, Wakasek, Staf, Kepala TU, Tata Usaha dan Toolman, Caraka dan Satpam; kartu Wakasek adalah kartu ganda dengan **Tambahan Hari** — bawaan 0,5 — yang ditambahkan ke hari kerja Wakasek berkontrak kurang dari 5 hari saat menghitung tunjangan jabatan, 4 → 4,5 hari), dan **Indeks Staf** (bentuk indeks: dasar berjenjang masa kerja di kartu, ditambah kenaikan per tahun sejak tahun ke-N dan batas maksimum yang diisi di formulir yang sama dan disimpan di `ip_indeks`; KS maks 2,5, Wakasek 2,0, Staf 1,2). Rumusnya satu di database, `f_ip_indeks_staf`. Di bawahnya panel **Honor Tenaga Pendukung (per orang)**: kartu per orang (pemegang tugas Staf berkelompok tarif Tenaga Pendukung, atau siapa pun yang diberi komponen lewat Tambah orang) berisi komponen yang berlaku pada tanggal acuan — nama komponen bebas (Gaji, Tunjangan Pendidikan, Transpor Kedatangan, …), satuan per bulan / per jam hadir / per hari hadir, nominal — dengan tombol Komponen, Ubah (versi baru sejak tanggal tertentu, versi lama diakhiri sehari sebelumnya), dan Akhiri; disimpan di `ip_pendukung`. Tiga jenis lama (Honor Bulanan Staf, Insentif Kedatangan Staf, Upah Harian Staf) dinonaktifkan 25 September 2026. Besaran tiap jenis pembiayaan berversi menurut tanggal berlaku (dulu bernama Pengaturan Nominal). Kelompok Tunjangan dan Potongan (TuSehat, TuKerja, iuran keanggotaan koperasi) tidak digambar di sini sejak 25 September 2026; bawaannya diubah dari halaman Tunjangan dan Potongan dengan formulir dan riwayat yang sama |
| Tunjangan dan Potongan | ✅ | Empat tab. **Tunjangan Kesehatan** dan **Tunjangan Ketenagakerjaan**: penyaluran TuSehat / TuKerja per orang (BPJS, Simponi BNI, atau DPLK BJB), nomor peserta, nominal dari sekolah dan potongan porsi guru per bulan — bawaan keduanya (nominal dari sekolah dan potongan porsi guru, satu formulir) diubah di tab ini lewat tombol **Ubah bawaan**, boleh ditetapkan per orang dan tetap sampai diubah lagi; berversi menurut tanggal berlaku; siapa yang berhak ditentukan Data Induk. **Potongan Koperasi** (iuran keanggotaan, tabungan koperasi, pinjaman koperasi) dan **Potongan lain-lain** (pinjaman ke sekolah, lainnya; jenis lama Simpanan wajib dan Tabungan rutin tidak ditawarkan lagi, baris lamanya tetap tampil): matriks semua guru dan staf aktif urut masa kerja: baris utama per orang dengan Nominal/bulan seluruhnya (bawaan Rp 0; untuk koperasi iuran keanggotaan bawaan yang diubah lewat tombol **Ubah iuran bawaan**, tombol **Anggota / Non-Anggota** menjadikan iurannya nol atau kembali bawaan sejak bulan acuan), lalu baris cicilan di bawahnya untuk tiap potongan lain (pinjaman, tabungan, simpanan) dengan Nominal, Mulai, Sampai, Ubah, Akhiri; tombol **Cicilan** menambah baris; pada bulan terakhir barisnya bertanda dan bulan berikutnya berhenti sendiri; mengubah nominal mengakhiri baris lama dan menambah baris baru; tautan riwayat membuka semua baris seseorang dengan tombol Ubah, Akhiri, dan Hapus. Bawaan bulan Mulai adalah bulan acuan yang sedang dilihat, dan Honor dan Transpor menghitung ulang sendiri saat dibuka setelah ada perubahan |
| Honor dan Transpor | ✅ | Tiga bagian (25 September 2026) sebagai tab induk, dengan tab-tab per penerima di bilah anaknya. **Guru**: Guru Mengajar, Wali Kelas (honor bulanan + Upacara + Bimbingan), Guru Diperbantukan (honor bulanan + transport piket unit, per unit), Piket Meja Sekolah, Guru Pengganti, Pembina Internal dan Pembina Eksternal (transport pembina ekstrakurikuler, dipisah menurut guru sekolah atau pelatih dari luar), Pembimbing Tahfidz. Pemegang tugas Staf berhonor nol tidak ditampilkan dan tidak lagi ada saklar untuk menampilkannya. **Staf**: Piket Parkiran; **Pendukung** (honor tenaga pendukung per orang dari `f_ip_honor_pendukung`, digambar sebagai kartu per orang seperti Nominal Penggajian: tiap kartu memuat komponennya — per bulan × bulan periode, per jam hadir atau per hari hadir × kehadiran fingerprint — jumlahnya, dan tombol **Unduh kuitansi (xlsx)**; ada pula Unduh semua kuitansi dan Unduh Format daftar bertanda tangan; komponennya diatur di Nominal Penggajian Staf); **Karyawan**, **Staf Khusus**, dan **Pimpinan** — ketiganya dari `f_ip_honor_staf` disaring kelompok tarif (Karyawan = Kepala TU, Tata Usaha, Caraka/Satpam dengan transpor berdiri 30 %; Staf Khusus = kelompok Staf; Pimpinan = jenis PTK Pimpinan di Data Induk, serta kelompok Kepala Sekolah dan Wakasek), masing-masing dengan dua sub-tab meniru sheet (1) dan (2) struk bendahara: **Gaji dan Tunjangan Jabatan** (tarif/jam menurut masa kerja × jam/minggu; nominal jabatan × hari/minggu) dan **Transpor Berdiri, Insentif, dan Konsumsi** (× indeks — kolom Indeks tampil di layar tetapi tidak ikut ke berkas unduhan; Insentif = transport HTM per jam hadir). Semua daftar per orang di halaman ini dan di Kehadiran dan Piket diurutkan menurut masa kerja, yang paling lama di atas (TMT staf atau TMT sekolah; tanpa TMT di akhir). Daftar TuSehat, TuKerja, Potongan Koperasi, Potongan lain-lain, dan Potongan per Guru tidak ada lagi di halaman ini (25 September 2026): tunjangan dan potongan diurus di halaman Tunjangan dan Potongan, pengurangannya tercetak di struk gaji. **Gabungan Keseluruhan** (dulu Gabungan per Guru): satu baris per orang, yang dibayarkan dari semua bagian — termasuk kolom Gaji & Tunj. Staf, Transpor Staf, dan Honor Pendukung (25 September 2026) — tanpa kolom potongan. Struk gajinya ikut memuat bagian **Pendapatan sebagai Staf** (gaji pokok, tunjangan jabatan, transpor berdiri, insentif kedatangan, konsumsi, dengan persentase hari hadir) dan **Honor Tenaga Pendukung** (satu baris satu komponen). Selebihnya daftar bertanda tangan xlsx. Tombol **Unduh Format (xlsx)** mengunduh daftar bertanda tangan. Di Nominal Penggajian, tanggal berlaku bawaan versi baru adalah tanggal 1 bulan acuan, dan dialog Riwayat punya tombol **Hapus versi ini** (untuk merapikan uji coba; versi sebelumnya kembali berlaku). Gabungan Keseluruhan juga punya **Unduh struk (docx)** yang lebih dulu membuka daftar centang penerima (semua terpilih secara bawaan, bisa disaring nama) lalu mengunduh yang dicentang: struk gaji Word per penerima, dua struk sehalaman A4 mendatar, rinciannya dari fungsi tab-tab lain dan subtotal serta diterima bersihnya dari Gabungan; contoh tampilannya di [dokumen/Struk_Gaji.docx](dokumen/Struk_Gaji.docx). Nominal **Diterima Tunai oleh Guru** pada struk = penerimaan bersih dikurangi tunjangan (TuSehat + TuKerja), karena tunjangan disetor sekolah langsung ke bank / penyelenggara; barisnya tercetak sebagai "Tunjangan disetor ke bank" tepat di atasnya. Blok identitas memuat baris **Kehadiran** (ringkasan persentase mengajar, wali kelas, piket). Tiap baris juga punya tombol **Struk** untuk mengunduh struk satu orang saja — ukuran, format, dan tata letaknya sama, sisi kanan halaman dibiarkan kosong, nama berkasnya memuat nama penerima. Kepala bagian Pendapatan sebagai Guru, Honor Wali Kelas, dan Honor Guru Diperbantukan memuat **persentase kehadiran** (sejajar kolom keterangan; mengajar dan wali kelas berbobot seperti tab Kehadiran, piket unit = jaga ÷ terjadwal), begitu pula keterangan Piket Meja Sekolah dan Piket Parkiran; angkanya dari fungsi yang sama dengan halaman Kehadiran dan Piket, dan tidak dicetak bila tidak ada yang terjadwal |
| Nominal Setoran Wajib | ✅ | Empat tab menurut tujuan setoran: **BPJS Kesehatan**, **BPJS Ketenagakerjaan**, **DPLK BJB**, **Simponi BNI** (26 September 2026). Tiap tab daftar per orang untuk periode yang sama dengan Honor dan Transpor: program (TuSehat/TuKerja), nomor peserta, bulan, nominal dari sekolah dan potongan guru per bulan, jumlah dari sekolah, potongan guru, dan **Setoran** = keduanya; disaring menurut bentuk penyaluran di Tunjangan dan Potongan; dari `f_ip_tunjangan_bpjs`; unduh daftar bertanda tangan xlsx |
| Identitas Dokumen | ✅ | Kop dokumen, baca saja dari Data Induk |

## Tabel yang dipakai

**Milik sendiri:** `ip_jenis_tarif` (jenis pembiayaan, satuannya, penerimanya: guru / staf / semua, dan bentuknya: rupiah / indeks),
`ip_tarif` (besaran berversi, termasuk bawaan nominal dan potongan TuSehat/TuKerja serta dasar indeks staf),
`ip_indeks` (kenaikan per tahun, tahun mulai, dan batas maksimum indeks staf per versi),
`ip_pendukung` (komponen honor tenaga pendukung per orang: satuan, nominal, berlaku mulai–sampai),
`ip_tunjangan_penyaluran` (penyaluran TuSehat/TuKerja per orang, berversi; kolom
`nominal` dan `potongan` kosong = mengikuti Nominal Penggajian), `ip_potongan` (potongan
sekolah dan koperasi per orang, satu baris satu potongan dengan `berlaku_mulai`
dan `berlaku_sampai`).

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
| `f_ip_tunjangan_bpjs` | TuSehat / TuKerja menurut `p_jenis`: nominal per bulan sejak bulan mulai pengesahan, hanya yang disahkan di Data Induk dan masih memenuhi syarat; membawa bentuk penyaluran, nomor peserta, nominal dan potongan porsi guru dari `ip_tunjangan_penyaluran` yang berlaku pada akhir periode — bila kosong, bawaan Nominal Penggajian (`bpjs_*` dan `potongan_bpjs_*`) |
| `f_ip_potongan` | potongan satu kelompok (`p_kelompok`: sekolah = lain-lain / koperasi) dalam rentang: satu baris satu potongan yang berjalan, nominal per bulan × bulan yang dipotong (dihitung seperti `f_ip_bulan`); untuk koperasi ditambah baris bawaan iuran keanggotaan (`iuran_koperasi` di Nominal Penggajian, id kosong) bagi tiap guru/staf aktif pada bulan yang tidak tertutup baris Iuran keanggotaan miliknya |
| `f_ip_honor_staf` | honor semua pemegang tugas Staf aktif per periode menurut formulasi bendahara: masa kerja (TMT staf), hari dan jam kerja per minggu (Jam Kerja Staf), hari dan jam efektif dalam rentang, hari dan jam hadir (Kehadiran Staf, jam dipotong pada ketentuan; Kepala Sekolah dianggap hadir penuh bila pengaturan Kehadiran Guru → Kehadiran Staf berkata penuh — bawaannya, diubah dengan PIN khusus; koreksi tangan di Rekap hari hadir untuk rentang yang persis sama didahulukan), indeks, tarif/jam, gaji pokok, tunjangan jabatan, transport berdiri (karyawan memakai `karyawan_transport_berdiri`), transport HTM, konsumsi, jumlah; kolom `karyawan` menandai kelompok Kepala TU / Tata Usaha / Caraka-Satpam |
| `f_ip_honor_pendukung` | honor tenaga pendukung per periode: satu baris satu komponen per orang yang berlaku pada akhir periode, × bulan (`f_ip_bulan`), jam hadir, atau hari hadir dari Kehadiran Staf |
| `f_ip_indeks_staf` | indeks pengali honor staf satu kelompok jabatan (`p_kode`, mis. `indeks_staf`) pada tanggal acuan untuk masa kerja tertentu: MIN(maksimum, dasar berjenjang dari `ip_tarif` + kenaikan × (masa kerja − sejak_tahun)); parameternya di `ip_indeks`, kenaikan tidak pernah minus |
| `f_ip_rekap_gabungan` | satu baris per penerima, kolomnya mengikuti tab: mengajar, wali, diperbantukan, piket meja, pengganti, ekskul, Tahfidz, parkiran, TuSehat, TuKerja, lalu potongan BPJS, sekolah, koperasi, dan diterima bersih (jumlah dikurangi seluruh potongan) |

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
  dicatat di Kehadiran Guru → Kehadiran Staf). Formulasi honornya sudah
  tersimpan lengkap di Nominal Penggajian Staf (lima komponen, indeks per kelompok
  jabatan, `f_ip_indeks_staf`), tetapi `f_ip_honor_staf` yang mengalikannya
  dengan jam kerja, hari kerja, jam hadir, dan hari hadir sudah ada
  (`f_ip_honor_staf`, 25 September 2026) dan dipakai dua daftar Karyawan di
  Honor dan Transpor → Staf (Karyawan, Staf Khusus, Pimpinan), dan
  honor tenaga pendukung per orang di `f_ip_honor_pendukung` (tab Pendukung).
  Nominal komponen pendukung masih Rp 0 menunggu keputusan. Yang belum:
  Gabungan Keseluruhan belum menjumlahkan honor staf dan pendukung.
- `guru_privat` (nama bank, nomor rekening, NPWP) masih kosong — daftar
  transfer belum bisa dicetak sampai diisi.
- Honor bulanan wali kelas (`wali_bulanan`), honor bulanan guru diperbantukan
  (`diperbantukan_bulanan`), dan tiga komponen jam wali kelas belum
  ditetapkan besarannya (masih Rp 0). Isiannya sudah ada di Nominal Penggajian;
  jumlah bulan dan jamnya sudah terhitung, tinggal menunggu keputusan yayasan.
- Tarif masih tersalin di `kg_pengaturan` dan `ae_tarif`. Keduanya tetap ada
  selama Kehadiran Guru dan Absensi Ekskul masih memakainya, dan dipensiunkan
  setelah aplikasi ini menggantikan perannya.
- Nama bendahara penanda tangan masih di pengaturan Kehadiran Guru, belum di
  Profil Dokumen.
