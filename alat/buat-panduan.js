/* Pembuat Panduan Induk Pembiayaan (15 Okt 2026) — mesin sama dengan Tryout_Guru, absen_ekskul, kehadiran_guru
   ---------------------------------------------------------------
   Satu sumber isi (ISI di bawah) → dua berkas di akar proyek, dibuka lewat tombol 📘 Panduan di bilah samping:
     Panduan_Induk_Pembiayaan.pdf   (dicetak Chrome/Edge tanpa jendela, lewat DevTools Protocol)
     Panduan_Induk_Pembiayaan.docx  (paket npm "docx")
   Jalankan dari akar proyek (paket docx dipinjam dari Tryout_Guru, tidak perlu node_modules di sini):
     NODE_PATH=../Tryout_Guru/node_modules node alat/buat-panduan.js
   Ubah isi panduan di sini bila tampilan atau aturan aplikasi berubah, lalu jalankan ulang. */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawn } = require("child_process");

const SUBJUDUL = "Besaran pembiayaan, tunjangan dan potongan, honor dan transpor, struk, dan setoran", UNTUK = "bendahara, operator (lihat saja), dan pimpinan";
const AKAR = path.join(__dirname, ".."), NAMA = "Panduan_Induk_Pembiayaan";
const JUDUL = "Panduan Induk Pembiayaan", VERSI = "16 Oktober 2026", MEREK = "INDUK PEMBIAYAAN · SMA PLUS MERDEKA SOREANG";

/* ================= Isi panduan =================
   Blok: H1/H2/H3 (judul, dinomori otomatis), P (paragraf), UL/OL (daftar), TB (tabel: kepala, baris, lebar relatif),
   KOTAK (jenis: info | saran | awas | bahaya), STAT (kotak angka contoh). Teks boleh memakai **tebal**. */
const H1 = s => ({ t: "h1", s }), H2 = s => ({ t: "h2", s }), H3 = s => ({ t: "h3", s }), P = s => ({ t: "p", s });
const UL = (...a) => ({ t: "ul", a }), OL = (...a) => ({ t: "ol", a });
const TB = (kepala, baris, lebar) => ({ t: "tb", kepala, baris, lebar: lebar || kepala.map(() => 1) });
const KOTAK = (jenis, judul, ...isi) => ({ t: "kotak", jenis, judul, isi });
const STAT = (ket, ...a) => ({ t: "stat", a, ket });

const ISI = [
  /* ============================ 1 ============================ */
  H1("Mengenal Induk Pembiayaan"),
  P("Induk Pembiayaan adalah aplikasi web sekolah untuk menghitung **honor, transpor, gaji staf, tunjangan, dan potongan** guru dan staf setiap periode, lalu menghasilkan daftar penerimaan, struk gaji, kuitansi, dan daftar setoran wajib (BPJS, koperasi, DPLK, Simponi)."),
  P("Aplikasi ini **tidak mencatat kehadiran sendiri**. Angka kehadiran dibaca dari aplikasi lain; di sini hanya besaran rupiah, tunjangan, dan potongan yang diatur."),
  H2("Dari mana angkanya datang"),
  TB(["Yang dibayar", "Kehadirannya dicatat di"], [
    ["Guru mengajar (jam hadir, ketidakhadiran)", "Kehadiran Guru → Ketidakhadiran Guru"],
    ["Guru pengganti (GT, PT, Inf)", "Kehadiran Guru → Penugasan Pengganti"],
    ["Piket meja, unit, parkiran", "Kehadiran Guru → Pelaksanaan Piket"],
    ["Pembina ekskul, Tahfidz", "Absensi Ekstrakurikuler"],
    ["Wali kelas, tugas guru, masa kerja, penerima tunjangan", "Data Induk"],
    ["Kehadiran staf (fingerprint)", "Kehadiran Guru → Kehadiran Staf"],
  ], [3, 3]),
  KOTAK("awas", "Angka kehadiran salah? Perbaiki di aplikasi asalnya",
    "Bila jumlah jam, hari, atau pertemuan seseorang keliru, perbaikannya dilakukan di aplikasi asal (tabel di atas), bukan di sini. Setelah diperbaiki, tekan **Hitung** lagi di Induk Pembiayaan."),
  H2("Alur kerja bulanan"),
  OL("**Awal tahun / bila ada perubahan**: periksa besaran di **Nominal Penggajian**, penerima tunjangan dan potongan di **Tunjangan dan Potongan**.",
    "**Akhir bulan**: pastikan aplikasi asal sudah lengkap (ketidakhadiran, pengganti, piket, ekskul, fingerprint staf). Periksa di **Kehadiran dan Piket**.",
    "Di **Honor dan Transpor**, pilih periode, **Hitung**, periksa tiap tab, lalu unduh daftar penerimaan.",
    "Di tab **Cetak Struk**, unduh struk gaji untuk dibagikan. Di **Nominal Setoran Wajib**, unduh daftar setoran.",
    "**Sesudah dibayarkan**: **Kunci periode ini** supaya angkanya tidak bergeser oleh koreksi di belakang hari.",
    "**Bila kemudian ditemukan kesalahan**: jangan buka kunci. Betulkan datanya di aplikasi asal, lalu selesaikan selisihnya lewat **Selisih & koreksi…** (bagian 7)."),
  H2("Menu aplikasi"),
  TB(["Menu", "Isi"], [
    ["**Beranda**", "Ringkasan jenis pembiayaan, peringatan besaran yang belum diisi, sumber data."],
    ["**Kehadiran dan Piket**", "Rekap kehadiran guru, staf, piket, dan ekskul dari aplikasi asal (hanya dibaca)."],
    ["**Nominal Penggajian**", "Besaran rupiah setiap jenis pembiayaan, dengan riwayat versi. Dibuka dengan PIN."],
    ["**Tunjangan dan Potongan**", "Tunjangan Kesehatan, Tunjangan Ketenagakerjaan, Potongan Koperasi, Potongan lain-lain."],
    ["**Honor dan Transpor**", "Perhitungan per jenis untuk guru dan staf, rekap keseluruhan, cetak struk, kunci periode."],
    ["**Nominal Setoran Wajib**", "Daftar setoran BPJS Kesehatan, BPJS Ketenagakerjaan, Koperasi, DPLK BJB, Simponi BNI."],
    ["**Riwayat Perubahan**", "Siapa mengubah apa dan kapan; riwayat kunci periode."],
    ["**Identitas Dokumen**", "Kop dan nama penanda tangan (diambil dari Data Induk → Profil Dokumen)."],
  ], [1.7, 4.3]),
  P("Di komputer, menu ada di bilah samping kiri; di HP menjadi pita di atas layar. Tabel yang lebar bisa digeser mendatar."),

  /* ============================ 2 ============================ */
  H1("Masuk dan Hak Akses"),
  OL("Buka alamat aplikasi. Isi **Email** dan **Kata sandi** akun Anda sendiri, lalu **Masuk**.",
    "Nama dan peran Anda tampil di kaki bilah samping, bersama tombol **Keluar**."),
  TB(["Peran", "Yang boleh dilakukan"], [
    ["**Bendahara**", "Melihat dan mengubah semua data pembiayaan, mengunci dan membuka kunci periode."],
    ["**Operator · lihat saja**", "Melihat semua halaman dan mengunduh dokumen. Saat mencoba menyimpan muncul \"Hanya bendahara yang boleh mengubah data pembiayaan. Akun ini hanya bisa melihat.\""],
  ], [1.6, 4.4]),
  KOTAK("info", "Akun masing-masing",
    "Setiap perubahan tercatat atas nama akun yang masuk (lihat **Riwayat Perubahan**), jadi jangan memakai akun bersama. Akun didaftarkan oleh operator data sekolah; bila muncul \"Akun ini belum berhak membuka Induk Pembiayaan\", minta didaftarkan."),
  UL("Sesi hanya disimpan selama halaman terbuka: **memuat ulang atau menutup tab berarti masuk lagi**.",
    "Bila muncul \"Sesi berakhir. Silakan masuk kembali.\", masuk lagi; data yang sudah tersimpan tidak hilang.",
    "Halaman **Nominal Penggajian** meminta **PIN** tambahan sekali per sesi. PIN diberikan oleh pimpinan; jangan dibagikan.",
    "Di komputer bersama, selalu tekan **Keluar** setelah selesai."),

  /* ============================ 3 ============================ */
  H1("Tanggal Acuan dan Periode"),
  TB(["Isian", "Dipakai di", "Arti"], [
    ["**Berlaku pada**", "Nominal Penggajian, Tunjangan dan Potongan", "Tanggal acuan: besaran dan potongan yang ditampilkan adalah yang berlaku pada tanggal ini (bawaannya hari ini)."],
    ["**Dari … sampai …** + **Hitung**", "Honor dan Transpor, Nominal Setoran Wajib", "Periode pembayaran (bawaannya bulan ini). Besaran yang dipakai adalah yang berlaku pada **tanggal akhir periode**."],
    ["**Dari … sampai …** + **Hitung**", "Kehadiran dan Piket", "Rentang rekap kehadiran (terpisah dari periode honor)."],
  ], [1.6, 2, 3]),
  P("Setelah tanggal diubah, tekan **Hitung**. Selama belum dihitung ulang tampil tanda **Rentang berubah**."),
  KOTAK("saran", "Pakai periode satu bulan penuh",
    "Mis. 1–31 Oktober. Kunci periode (bagian 7) hanya berlaku untuk pasangan tanggal yang persis sama, jadi biasakan periode yang sama setiap kali membuka bulan itu."),

  /* ============================ 4 ============================ */
  H1("Kehadiran dan Piket"),
  P("Halaman ini **hanya membaca** rekap dari aplikasi Kehadiran Guru dan Absensi Ekskul, sebagai bahan pemeriksaan sebelum menghitung honor. Pilih rentang, **Hitung**, pilih bagian dan tab, lalu **Unduh rekap** bila perlu."),
  TB(["Bagian", "Tab"], [
    ["**Kehadiran Guru**", "Kehadiran Guru · Guru Pengganti · Wali Kelas · Piket Meja Sekolah · Piket Guru Diperbantukan · Piket Parkiran"],
    ["**Kehadiran Staf**", "Pendukung · Karyawan · Staf Khusus · Pimpinan"],
    ["**Absensi Ekskul**", "Per kegiatan · Per pertemuan · Per pembina (bisa disaring per kategori)"],
  ], [1.5, 4.5]),
  UL("Bobot kehadiran guru: **HTTM** 100%, **ST** (sakit dengan tugas) 20%, **IT** (ijin dengan tugas) 10%, **TK** (tanpa keterangan) 0%. Bobot Hadir = Jam Hadir + HTTM + 20% ST + 10% IT; % Kehadiran = Bobot Hadir ÷ Jam Terjadwal.",
    "Pemegang tugas Staf disembunyikan dari tab guru secara bawaan; tekan **Tampilkan juga** untuk melihatnya.",
    "Warna persen: hijau ≥95%, emas ≥85%, merah di bawahnya.",
    "Halaman ini **selalu membaca data terkini**, juga untuk periode yang sudah dikunci. Koreksi kehadiran sesudah kunci langsung terlihat di sini, sedangkan struk dan rekap honor periode itu tetap dari arsip."),

  /* ============================ 5 ============================ */
  H1("Nominal Penggajian"),
  P("Daftar besaran rupiah setiap jenis pembiayaan (honor per jam, transpor, konsumsi, tunjangan jabatan, tarif staf, dan sebagainya). Pilih **Berlaku pada** untuk melihat besaran pada tanggal tertentu. Tab **Nominal Penggajian Guru** dan **Nominal Penggajian Staf**."),
  P("Kartu ringkasan menunjukkan berapa jenis yang sudah bernominal, **masih Rp 0**, atau **belum diisi**. Isi semua sebelum rekap dijalankan — Beranda juga memperingatkannya."),
  H2("Mengubah besaran (versi baru)"),
  OL("Pada kartu jenis, tekan **Ubah nominal**.",
    "Isi **Berlaku mulai** (bawaannya tanggal 1 bulan acuan). Besaran lama tetap dipakai untuk periode sebelum tanggal ini.",
    "Isi **Besaran**. Jenis berjenjang diisi per jenjang (**+ Tambah jenjang**: Dari, Sampai, Besaran). Jenis berindeks punya isian **Kenaikan per tahun masa kerja**, **Mulai dihitung sejak tahun ke-**, dan **Indeks maksimum**.",
    "Tulis **Catatan** bila perlu, lalu **Simpan sebagai versi baru**."),
  KOTAK("info", "Besaran tidak pernah ditimpa diam-diam",
    "Setiap perubahan disimpan sebagai versi dengan tanggal berlakunya, sehingga honor bulan lalu tetap dihitung dengan besaran bulan lalu. Tekan **Riwayat** untuk melihat semua versi; **Hapus versi ini** hanya untuk merapikan salah isi."),
  H2("Honor tenaga pendukung (per orang)"),
  P("Di tab Staf, panel **Honor Tenaga Pendukung (per orang)** mengatur komponen tiap orang: **+ Tambah orang**, lalu **+ Komponen** (Komponen, Satuan per bulan / per jam hadir / per hari hadir, Nominal, Berlaku mulai). Pilih **Dibayar** Bulanan, Mingguan, atau **Per periode (Dari–Sampai)**. Komponen yang tidak berlaku lagi diakhiri dengan **Akhiri**, bukan dihapus."),
  P("Yang dibayar **mingguan** dihitung per pekan Senin–Sabtu (supaya hadir hari Sabtu, mis. lembur, tetap terbayar), tetapi kartu dan kuitansinya menulis pekan **sampai hari kerja terakhirnya** menurut Jam Kerja Staf di Data Induk — mis. bekerja Senin–Jumat: \"pekan 12 Okt 2026 – 16 Okt 2026\"."),
  P("Yang dibayar **per periode** (mis. Kamal Sore, yang jadwalnya kadang berubah) punya tanggal **Dari** dan **Sampai** sendiri di kartunya (bawaannya rentang di atas). Kehadirannya **dianggap Senin–Jumat** di luar hari libur sekolah, tanpa membaca catatan Kehadiran Staf; kuitansinya menyebut periode itu. Seperti yang mingguan, ia tidak ikut Keseluruhan dan struk bulanan."),

  /* ============================ 6 ============================ */
  H1("Tunjangan dan Potongan"),
  P("Pilih **Berlaku pada**, lalu salah satu tab. Setiap tab bisa diunduh (**Unduh**) dan diisi massal lewat Excel."),
  H2("Tunjangan Kesehatan dan Ketenagakerjaan"),
  P("Siapa yang berhak ditentukan di **Data Induk** (disahkan Kepala Sekolah). Di sini diatur ke mana dan berapa tunjangannya disalurkan."),
  UL("Baris **Total** per orang = penyaluran utama + rincian tambahan yang sedang berjalan.",
    "**Atur** penyaluran utama: **Bentuk** (BPJS Kesehatan/Ketenagakerjaan, Simponi BNI, DPLK BJB, Lain-lain), **Nomor peserta**, **Berlaku mulai**, **Dari sekolah per bulan**, **Potongan porsi guru per bulan** (kosongkan untuk mengikuti bawaan), lalu **Simpan sebagai versi baru**.",
    "**Rincian** untuk menyalurkan sebagian ke tujuan lain: **+ Tambah rincian**, isi tujuan, nomor peserta, nominal, mulai bulan.",
    "**Ubah bawaan** mengubah nominal umum yang berlaku untuk semua penerima tanpa angka khusus.",
    "Potongan BPJS dicatat sebagai nominal; aplikasi tidak menghitung rumus BPJS sendiri."),
  H2("Potongan Koperasi dan Potongan lain-lain"),
  OL("Tekan **Cicilan** pada baris nama.",
    "**+ Tambah potongan**: pilih **Jenis**, isi **Nominal per bulan**, **Mulai bulan**, dan **Sampai bulan** (bila cicilan berakhir), lalu simpan.",
    "Potongan berhenti sendiri setelah bulan terakhirnya (bertanda **bulan terakhir**). Untuk menghentikan lebih awal, pakai **Akhiri**."),
  TB(["Tab", "Jenis potongan"], [
    ["**Potongan Koperasi**", "Iuran keanggotaan, Tabungan koperasi, Pinjaman koperasi, Lainnya"],
    ["**Potongan lain-lain**", "Pinjaman ke sekolah, Tabungan DPLK, Tabungan Simponi, Tabungan Koperasi, Lainnya"],
  ], [1.8, 4.2]),
  UL("Tombol **Anggota / Non-Anggota** mengatur keanggotaan koperasi. Bukan anggota tidak boleh punya tabungan atau pinjaman koperasi; akhiri dulu rinciannya sebelum menjadikan seseorang bukan anggota.",
    "Iuran bawaan untuk semua anggota diubah lewat **Ubah iuran bawaan**."),
  KOTAK("awas", "Akhiri, jangan hapus",
    "Potongan atau tunjangan yang pernah berjalan sebaiknya **diakhiri**, supaya rekap bulan-bulan lalu tetap benar. **Hapus** hanya untuk salah input dan tidak bisa dibatalkan."),
  H2("Isi massal lewat Excel"),
  OL("Tekan **Unduh template** pada tab yang dimaksud.",
    "Isi atau ubah nominal di Excel. **Jangan mengubah kolom ID dan No. baris.**",
    "Tekan **Unggah isian**. Aplikasi membandingkan dengan data tersimpan dan hanya menyimpan baris yang berubah, setelah konfirmasi \"Simpan … perubahan?\". Unggahan tidak pernah menghapus baris."),

  /* ============================ 7 ============================ */
  H1("Honor dan Transpor"),
  OL("Pilih periode **Dari … sampai …**, lalu **Hitung**.",
    "Pilih bagian (**Guru**, **Staf**, **Keseluruhan**, **Cetak Struk**) dan tabnya.",
    "Periksa kartu **penerima** dan **jumlah dibayarkan**, lalu tabelnya (baris **Jumlah** dan **Terbilang** di bawah).",
    "Tekan **Unduh rekap** untuk daftar penerimaan berkop (Excel), bertanda tangan Kepala Sekolah dan Bendahara, dengan kolom tanda tangan penerima."),
  TB(["Bagian", "Tab"], [
    ["**Guru**", "Guru Mengajar · Wali Kelas · Guru Diperbantukan · Piket Meja Sekolah · Guru Pengganti · Pembina Internal · Pembina Eksternal · Pembimbing Tahfidz"],
    ["**Staf**", "Piket Parkiran · Pendukung · Karyawan · Staf Khusus · Pimpinan (Karyawan, Staf Khusus, Pimpinan: sub-tab Gaji dan Tunjangan Jabatan / Transpor Berdiri, Insentif, dan Konsumsi)"],
    ["**Keseluruhan**", "Satu baris per orang, semua komponen; sub-tab **Tanpa Potongan** dan **Dengan Potongan**"],
    ["**Cetak Struk**", "Daftar pendapatan, potongan, dan yang diterima tiap orang; struk gaji"],
  ], [1.3, 4.7]),
  H2("Aturan perhitungan pokok"),
  TB(["Jenis", "Cara hitung (ringkas)"], [
    ["**Honor mengajar**", "Jam **kontrak** per minggu × nominal per jam (tidak dikalikan jumlah pekan). Insentif tatap muka per jam hadir, konsumsi per hari datang. Upacara dan Bimbingan Wali Kelas tidak termasuk."],
    ["**Wali kelas**", "Honor tetap per bulan; Upacara dan Bimbingan dibayar per jam hadir (HTTM, sakit, ijin tidak dibayar)."],
    ["**Guru diperbantukan**", "Honor tetap per unit per bulan + transpor per jam jaga."],
    ["**Piket meja**", "Per jam jaga. Tidak ada pengganti. Giliran HTTM (penugasan) tidak ditransport, tetapi dihitung hadir untuk persentase kehadiran."],
    ["**Piket parkiran**", "Per hari jaga (Kompensasi Piket Parkiran); staf ikut dihitung."],
    ["**Guru pengganti**", "Satu penugasan GT/PT/Inf = satu jam."],
    ["**Pembina ekskul**", "Per pertemuan yang berjalan dan dihadiri pembina, menurut jumlah siswa hadir pada pertemuan itu. Bila beberapa pembina: dibagi rata kepada yang hadir."],
    ["**Pembimbing Tahfidz (Imtaq)**", "Siswa hadir semua pertemuan periode dijumlahkan, dibagi banyaknya pertemuan, dibulatkan = rata-rata siswa hadir. Rata-rata itu menentukan nominal menurut jenjang, lalu dikalikan pertemuan yang dihadiri pembimbing (tidak dibagi antarpembimbing). Digenapkan ke bawah ke ribuan."],
    ["**Gaji staf**", "Tarif per jam (menurut masa kerja) × jam kerja per minggu, dibulatkan ke atas ke ribuan; tunjangan jabatan = nominal per hari × hari kerja per minggu."],
    ["**Transpor & insentif staf**", "Transpor berdiri = tarif × jam kerja per minggu × indeks; insentif = tarif × jam hadir sebulan × indeks; konsumsi = tarif × hari hadir × indeks."],
    ["**Tenaga pendukung**", "Komponen per bulan, per jam hadir, atau per hari hadir (fingerprint). Ada kuitansi per orang."],
  ], [1.6, 4.4]),
  P("**Indeks** staf naik menurut masa kerja sampai indeks maksimum; arahkan tetikus ke angka indeks untuk melihat jejak hitungnya. Angka kecil di bawah nominal adalah nilai \"seandainya\" (mis. honor yang gugur karena tugas Staf) dan **tidak ikut dijumlahkan**."),
  KOTAK("awas", "Rp 0 padahal kegiatannya tercatat?",
    "Muncul kotak \"Kegiatannya tercatat, tetapi jumlahnya Rp 0. Besaran … belum diisi\". Isi besarannya di **Nominal Penggajian** dengan tanggal berlaku sebelum akhir periode, lalu **Hitung** lagi."),
  H2("Keseluruhan dan Cetak Struk"),
  UL("**Keseluruhan · Dengan Potongan** menambahkan Pot. BPJS, Pot. Koperasi, Pot. Lain-lain, dan Tunjangan Disetor ke Bank. **Diterima Tunai = Jumlah − Jumlah Potongan − Tunjangan Disetor ke Bank.**",
    "**Cetak Struk**: **View struk** untuk melihat struk satu orang (lalu **Unduh struk ini**); **Unduh struk** untuk memilih banyak penerima sekaligus (Word, dua struk per halaman, siap digunting); **Unduh daftar** untuk rekap Excel.",
    "Struk berisi rincian pendapatan, potongan, tunjangan yang disetor ke bank, dan jumlah diterima tunai, ditandatangani Bendahara.",
    "**Catatan kaki** dari Identitas Dokumen tercetak di **kiri bawah setiap struk** dengan huruf kecil miring — per struk, bukan per halaman, supaya kedua struk yang digunting sama-sama membawanya. Bila catatan kaki disembunyikan di Data Induk → Profil Dokumen, struk juga tidak menampilkannya."),
  H2("Kunci periode"),
  P("Sesudah honor suatu periode dibayarkan, tekan **Kunci periode ini** dan tulis catatannya (mis. \"dibayar 5 Oktober\"). Seluruh hitungan periode itu — semua tab, Keseluruhan, struk, dan setoran — diarsipkan. Koreksi kehadiran di belakang hari **tidak lagi menggeser** angka periode yang terkunci."),
  UL("Periode terkunci menampilkan kotak \"**Periode ini dikunci** sejak … oleh …\" dengan tombol **Selisih & koreksi…** dan **Buka kunci…**.",
    "Kunci berlaku untuk pasangan tanggal yang **persis sama** (mis. 1–31 Oktober).",
    "**Buka kunci…** (dengan alasan) hanya bila periodenya belum dibayarkan atau memang harus dihitung ulang seluruhnya. Sesudah dibuka, semua angka dihitung ulang dari data sekarang; arsip lama tetap tersimpan. Siapa, kapan, dan alasannya tercatat di Riwayat Perubahan."),
  H2("Selisih dan koreksi sesudah kunci"),
  P("Bila sesudah dibayarkan ditemukan kesalahan (kurang bayar atau lebih bayar), **periode tidak dibuka ulang**. Struk dan rekap yang sudah dibayarkan tetap; selisihnya diselesaikan dengan dokumen tersendiri. Data kehadiran tetap dibetulkan di aplikasi asal, sehingga rekap kehadiran ikut benar."),
  OL("Betulkan dulu datanya di aplikasi asal (kehadiran, pengganti, piket, ekskul) atau besaran/potongannya.",
    "Di **Honor dan Transpor**, isi rentang periode yang terkunci, **Hitung**, lalu tekan **Selisih & koreksi…**.",
    "Bagian **Belum diselesaikan** memuat orang yang uang tunainya menurut data sekarang berbeda dari yang sudah dibayarkan, lengkap dengan kolom yang berubah (mis. \"Honor Mengajar Rp 1.072.000 → Rp 1.052.000\"). Periksa satu per satu: bisa jadi bukan kesalahan, melainkan data yang memang diubah sesudahnya.",
    "Selesaikan tiap orang (lihat tabel di bawah). Dokumennya langsung terunduh, dan orang itu pindah ke bagian **Koreksi tercatat**."),
  TB(["Keadaan", "Penyelesaian", "Dokumen"], [
    ["**Kurang bayar**, dibayar terpisah", "Pilih **Kuitansi susulan**, lalu **Catat** — dibayarkan sebesar selisihnya.", "Kuitansi \"kekurangan pembayaran honor periode …\" (Excel), bertanda tangan Kepala Sekolah, Bendahara, dan penerima."],
    ["**Kurang bayar**, ikut bulan berikutnya", "Pilih **Ditambahkan ke struk bulan…**, pilih bulannya (bawaan: bulan berikutnya), lalu **Catat**.", "Tidak ada dokumen terpisah: muncul sebagai bagian **Koreksi periode lalu** (\"Kekurangan bayar periode …\") di struk bulan itu, dan sebagai kolom **Koreksi Periode Lalu** di Keseluruhan. Ikut Jumlah Pendapatan dan Diterima Tunai."],
    ["**Lebih bayar**, dikembalikan", "Pilih **Dikembalikan tunai**, lalu **Catat**.", "Tanda terima pengembalian (Excel): diterima Bendahara dari orangnya, diketahui Kepala Sekolah."],
    ["**Lebih bayar**, dipotong", "Pilih **Dipotong bulan…**, pilih bulannya (bawaan: bulan berikutnya), lalu **Catat**.", "Tidak ada dokumen terpisah: muncul sebagai **Pot. Lain-lain \"Koreksi lebih bayar\"** di struk bulan itu."],
  ], [1.4, 2.4, 2.6]),
  UL("Selisih dihitung oleh database: uang tunai menurut data sekarang − yang tercatat di arsip − koreksi yang sudah dicatat. Karena itu selisih yang sama **tidak bisa dicatat (dibayar) dua kali**.",
    "Bulan potongan atau penambahan tidak boleh bulan yang sudah masuk periode terkunci (tidak akan pernah tampil di struk). Pembina dari luar: lebih bayar hanya bisa dikembalikan tunai.",
    "Kuitansi dan tanda terima bisa diunduh ulang dari **Koreksi tercatat**. Koreksi yang salah dicatat bisa **Dibatalkan** dengan alasan; potongan atau tambahan di bulan berikutnya ikut hilang, kecuali bulan itu sudah dikunci (sudah dibayarkan). Koreksi tidak pernah dihapus.",
    "Kolom **Koreksi Periode Lalu** di Keseluruhan hanya muncul pada periode yang memang memuat tambahan.",
    "Hanya **bendahara** yang mencatat dan membatalkan koreksi; operator hanya melihat."),
  KOTAK("info", "Buka kunci atau koreksi?",
    "Sudah dibayarkan → **Selisih & koreksi**. Belum dibayarkan, atau kuncinya keliru (salah rentang) → **Buka kunci**."),

  /* ============================ 8 ============================ */
  H1("Nominal Setoran Wajib"),
  P("Daftar uang yang harus disetor ke tiap lembaga untuk periode terpilih (**Dari … sampai …**, **Hitung**). Hanya dibaca; sumbernya Tunjangan dan Potongan."),
  TB(["Tab", "Isi setoran"], [
    ["**BPJS Kesehatan / BPJS Ketenagakerjaan**", "Penyaluran tunjangan berbentuk BPJS yang sama."],
    ["**Koperasi**", "Seluruh Potongan Koperasi + Tabungan Koperasi."],
    ["**DPLK BJB / Simponi BNI**", "Penyaluran tunjangan berbentuk sama + rincian tambahan + Tabungan DPLK/Simponi."],
  ], [2.2, 3.8]),
  P("Setoran = dari sekolah + potongan guru, × jumlah bulan. Tekan **Unduh setoran** untuk daftar berkop."),

  /* ============================ 9 ============================ */
  H1("Riwayat, Identitas Dokumen, dan Masalah Umum"),
  H2("Riwayat Perubahan"),
  P("Mencatat setiap perubahan besaran, tunjangan, potongan, dan komponen pendukung: **Waktu**, **Akun**, **Data**, **Aksi** (tambah/ubah/hapus), **Orang**, dan **Perubahan** (nilai lama → baru). Saring per jenis data; **Muat lebih banyak** untuk catatan lama. Panel **Kunci periode** menampilkan riwayat kunci dan buka kunci. Catatan ini dibuat otomatis oleh database dan tidak bisa diubah."),
  H2("Identitas Dokumen"),
  P("Nama sekolah, alamat, Kepala Sekolah, Bendahara, para Wakasek, dan catatan kaki yang dipakai di kop, tanda tangan, dan kaki dokumen (termasuk kiri bawah setiap struk). Halaman ini hanya menampilkan; ubah di **Data Induk → Profil Dokumen**."),
  H2("Masalah umum"),
  TB(["Keadaan / pesan", "Yang dilakukan"], [
    ["Email atau kata sandi salah.", "Periksa ejaan; minta operator data mengatur ulang kata sandi bila lupa."],
    ["Hanya bendahara yang boleh mengubah…", "Akun Anda berperan Operator (lihat saja). Minta Bendahara yang mengubah."],
    ["Sesi berakhir. Silakan masuk kembali.", "Masuk lagi; data yang sudah tersimpan tidak hilang."],
    ["Server terlalu lama menjawab saat menyimpan…", "Perubahan **mungkin sudah tersimpan**. Muat ulang dan periksa sebelum mengulang."],
    ["Sudah ada besaran untuk jenis dan tanggal berlaku itu.", "Pilih tanggal berlaku lain, atau ubah versi yang ada."],
    ["… bukan anggota koperasi pada …", "Jadikan anggota dulu lewat tombol **Non-Anggota**."],
    ["Ini bukan template …", "Unduh template dari tab yang sama, isi, lalu unggah kembali."],
    ["Pembuat Excel / Word gagal dimuat.", "Unduhan butuh internet; coba lagi."],
    ["Tulisan \"Memuat ulang…\" saat kembali ke tab", "Wajar: bila tab ditinggal lebih dari 5 menit, data dimuat ulang supaya perubahan di aplikasi lain ikut terbaca. Tidak perlu masuk lagi."],
    ["Angka kehadiran tidak sesuai", "Perbaiki di aplikasi asal (bagian 1), lalu **Hitung** lagi. Bila periodenya sudah dikunci dan dibayarkan, selesaikan selisihnya lewat **Selisih & koreksi…** (bagian 7), jangan buka kunci."],
    ["Server menolak membaca sebagian data (permission denied …)", "Masalah pengaturan database, bukan peran akun Anda. Laporkan ke pengelola aplikasi beserta isi pesannya."],
    ["Tidak ada selisih untuk orang ini — mungkin sudah dicatat.", "Koreksinya sudah tercatat (lihat **Koreksi tercatat**). Tutup lalu buka lagi **Selisih & koreksi…**."],
  ], [2.6, 3.4]),
  H2("Istilah"),
  TB(["Istilah", "Arti"], [
    ["**TuSehat / TuKerja**", "Tunjangan Kesehatan / Tunjangan Ketenagakerjaan."],
    ["**Koreksi / kuitansi susulan**", "Penyelesaian kurang atau lebih bayar pada periode yang sudah dikunci, tanpa mengubah struk dan rekap periode itu. Kurang bayar: kuitansi susulan atau ditambahkan ke struk bulan berikutnya; lebih bayar: dikembalikan tunai atau dipotong bulan berikutnya."],
    ["**Penyaluran utama / rincian tambahan**", "Bentuk utama tunjangan / bagian tunjangan yang disalurkan ke tujuan lain."],
    ["**Bawaan**", "Nominal umum yang berlaku bila seseorang tidak punya angka khusus."],
    ["**Versi**", "Besaran dengan tanggal mulai berlakunya."],
    ["**Transpor Berdiri**", "Transpor menurut jam kontrak/kerja per minggu, tidak bergantung kehadiran."],
    ["**Insentif / Konsumsi Kedatangan**", "Dibayar menurut jam hadir / hari datang."],
    ["**Indeks**", "Pengali transpor dan insentif staf menurut masa kerja."],
    ["**TMT**", "Terhitung mulai tanggal; dasar masa kerja."],
    ["**Diterima Tunai**", "Yang diterima langsung sesudah potongan dan tunjangan yang disetor ke bank."],
  ], [1.9, 4.1]),
];

/* ================= Penomoran judul ================= */
(function nomori() { const n = [0, 0, 0];
  ISI.forEach(b => { if (!/^h[123]$/.test(b.t)) return; const k = +b.t[1] - 1; n[k]++; for (let i = k + 1; i < 3; i++) n[i] = 0;
    b.no = k === 0 ? `${n[0]}.` : n.slice(0, k + 1).join("."); b.id = "b" + n.slice(0, k + 1).join("-"); }); })();
const DAFTAR = ISI.filter(b => b.t === "h1" || b.t === "h2");

/* ================= HTML untuk PDF ================= */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sebaris = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const WARNA_KOTAK = { info: ["#2F7FD8", "#E8F1FC"], saran: ["#2E9E5B", "#E7F5EC"], awas: ["#C98A12", "#FDF4E1"], bahaya: ["#D9534F", "#FBE9E8"] };
function htmlBlok(b) {
  if (b.t === "h1") return `<h1 id="${b.id}">${b.no} ${sebaris(b.s)}</h1>`;
  if (b.t === "h2") return `<h2 id="${b.id}">${b.no} ${sebaris(b.s)}</h2>`;
  if (b.t === "h3") return `<h3 id="${b.id}">${b.no} ${sebaris(b.s)}</h3>`;
  if (b.t === "p") return `<p>${sebaris(b.s)}</p>`;
  if (b.t === "ul" || b.t === "ol") return `<${b.t}>${b.a.map(x => `<li>${sebaris(x)}</li>`).join("")}</${b.t}>`;
  if (b.t === "tb") { const tot = b.lebar.reduce((a, x) => a + x, 0);
    return `<table><colgroup>${b.lebar.map(w => `<col style="width:${(w / tot * 100).toFixed(1)}%">`).join("")}</colgroup><thead><tr>${b.kepala.map(k => `<th>${sebaris(k)}</th>`).join("")}</tr></thead>
      <tbody>${b.baris.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' class="pertama"' : ""}>${sebaris(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; }
  if (b.t === "kotak") { const [w, l] = WARNA_KOTAK[b.jenis];
    return `<div class="kotak" style="border-color:${w};background:${l}"><div class="kotak-judul" style="color:${w}">${sebaris(b.judul)}</div>${b.isi.map(x => `<p>${sebaris(x)}</p>`).join("")}</div>`; }
  if (b.t === "stat") return `<div class="stat">${b.a.map(([a, k]) => `<div><b>${esc(a)}</b><span>${esc(k)}</span></div>`).join("")}</div><p class="stat-ket">${esc(b.ket)}</p>`;
  throw new Error("Blok tidak dikenal: " + b.t);
}
function buatHTML() {
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${JUDUL}</title><style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Calibri, "Segoe UI", Carlito, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1F2633; }
  b { font-weight: 700; }
  .sampul { height: 247mm; display: flex; flex-direction: column; justify-content: center; break-after: page; }
  .sampul .atas { font-size: 11pt; font-weight: 700; letter-spacing: .08em; color: #8F6B1A; }
  .sampul h1 { break-before: auto; font-size: 34pt; color: #1D2A3A; margin: 10px 0 6px; border: 0; padding: 0; }
  .sampul .sub { font-size: 15pt; color: #33445A; }
  .sampul .garis { height: 4px; background: linear-gradient(90deg, #1D2A3A 0 70%, #F2B92E 70%); margin: 34px 0 22px; border-radius: 2px; }
  .sampul ul { margin: 8px 0 0; } .sampul .kaki { margin-top: 70px; color: #556070; font-size: 9.5pt; }
  .daftar { break-after: page; } .daftar h1 { break-before: auto; }
  .daftar a { color: inherit; text-decoration: none; display: block; padding: 3px 0; border-bottom: 1px dotted #C9D2DE; }
  .daftar .d1 { font-weight: 700; margin-top: 8px; } .daftar .d2 { padding-left: 18px; color: #33445A; }
  h1 { break-before: page; font-size: 19pt; color: #1D2A3A; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 2.5px solid #1D2A3A; }
  h2 { font-size: 13.5pt; color: #1D2A3A; margin: 20px 0 6px; break-after: avoid; }
  h3 { font-size: 11.5pt; color: #2F6FB8; margin: 14px 0 4px; break-after: avoid; }
  p { margin: 0 0 8px; } ul, ol { margin: 0 0 10px; padding-left: 22px; } li { margin: 0 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; font-size: 9.5pt; }
  th { background: #1D2A3A; color: #fff; text-align: left; padding: 6px 8px; font-weight: 700; }
  td { padding: 6px 8px; border-bottom: 1px solid #D5DCE6; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #F6F8FB; } tr { break-inside: avoid; } td.pertama { font-weight: 400; }
  .kotak { border-left: 5px solid; border-radius: 4px; padding: 10px 14px; margin: 8px 0 14px; break-inside: avoid; font-size: 9.8pt; }
  .kotak-judul { font-weight: 700; margin-bottom: 3px; } .kotak p { margin: 0 0 4px; }
  .stat { display: flex; gap: 6px; margin: 8px 0 2px; break-inside: avoid; }
  .stat div { flex: 1; background: #EEF2F7; border-radius: 6px; padding: 8px 6px; text-align: center; }
  .stat b { display: block; font-size: 17pt; color: #1D2A3A; line-height: 1.1; } .stat span { font-size: 8.5pt; color: #556070; }
  .stat-ket { text-align: center; font-size: 8.5pt; font-style: italic; color: #8A93A3; margin-bottom: 12px; }
  </style></head><body>
  <section class="sampul"><div class="atas">${MEREK}</div><h1>${JUDUL}</h1>
    <div class="sub">${SUBJUDUL}</div><div class="garis"></div>
    <p>Isi panduan ini:</p><ul>${ISI.filter(b => b.t === "h1").map(b => `<li><b>${esc(b.s)}</b></li>`).join("")}</ul>
    <div class="kaki">Untuk: ${UNTUK}<br>Versi: ${VERSI} (sesuai tampilan aplikasi per tanggal tersebut)</div></section>
  <section class="daftar"><h1>Daftar Isi</h1>${DAFTAR.map(b => `<a class="d${b.t[1]}" href="#${b.id}">${b.no} ${sebaris(b.s)}</a>`).join("")}</section>
  ${ISI.map(htmlBlok).join("\n")}
  </body></html>`;
}

/* ================= Cetak PDF lewat Chrome/Edge (DevTools Protocol) ================= */
function cariPeramban() {
  const calon = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const ada = calon.find(p => p && fs.existsSync(p)); if (!ada) throw new Error("Chrome/Edge tidak ditemukan. Atur variabel CHROME ke lokasi chrome.exe."); return ada;
}
const tunggu = ms => new Promise(r => setTimeout(r, ms));
async function cetakPDF(berkasHTML, keluaran) {
  const port = 9300 + Math.floor(Math.random() * 500), profil = fs.mkdtempSync(path.join(os.tmpdir(), "panduan-"));
  const p = spawn(cariPeramban(), ["--headless=new", "--disable-gpu", "--no-first-run", `--remote-debugging-port=${port}`, `--user-data-dir=${profil}`, "about:blank"], { stdio: "ignore" });
  try {
    let daftar;
    for (let i = 0; i < 100 && !daftar; i++) { try { daftar = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { await tunggu(150); } }
    const hal = daftar && daftar.find(x => x.type === "page"); if (!hal) throw new Error("Peramban tidak merespons.");
    const ws = new WebSocket(hal.webSocketDebuggerUrl); await new Promise((ok, gagal) => { ws.onopen = ok; ws.onerror = gagal; });
    let id = 0; const janji = new Map(), acara = [];
    ws.onmessage = m => { const x = JSON.parse(m.data); if (x.id && janji.has(x.id)) { janji.get(x.id)(x); janji.delete(x.id); } else if (x.method) acara.push(x.method); };
    const kirim = (method, params = {}) => new Promise(ok => { const k = ++id; janji.set(k, ok); ws.send(JSON.stringify({ id: k, method, params })); });
    await kirim("Page.enable");
    await kirim("Page.navigate", { url: "file:///" + berkasHTML.replace(/\\/g, "/") });
    for (let i = 0; i < 100 && !acara.includes("Page.loadEventFired"); i++) await tunggu(100);
    await kirim("Runtime.evaluate", { expression: "document.fonts.ready.then(() => 1)", awaitPromise: true });
    const gaya = "font-family:Calibri,'Segoe UI',sans-serif;font-size:8px;color:#8A93A3;width:100%;padding:0 18mm;";
    const opsi = { printBackground: true, displayHeaderFooter: true, paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.75, marginBottom: 0.7, marginLeft: 0.71, marginRight: 0.71,
      headerTemplate: `<div style="${gaya}text-align:right">${JUDUL}</div>`,
      footerTemplate: `<div style="${gaya}text-align:center">Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></div>`,
      generateDocumentOutline: true, generateTaggedPDF: true };
    let r = await kirim("Page.printToPDF", opsi);
    if (r.error) { delete opsi.generateDocumentOutline; delete opsi.generateTaggedPDF; r = await kirim("Page.printToPDF", opsi); }   // Chrome lama
    if (r.error) throw new Error(r.error.message);
    fs.writeFileSync(keluaran, Buffer.from(r.result.data, "base64")); ws.close();
  } finally { p.kill(); await tunggu(400); try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) { /* biarkan */ } }
}

/* ================= Word (.docx) ================= */
async function buatDOCX(keluaran) {
  const D = require("docx");
  const LEBAR = 9638;   // lebar isi A4 dengan margin 2 cm (twip)
  const lari = (s, o = {}) => String(s).split(/(\*\*.+?\*\*)/).filter(Boolean).map(x => /^\*\*.+\*\*$/.test(x) ? new D.TextRun({ text: x.slice(2, -2), bold: true, ...o }) : new D.TextRun({ text: x, ...o }));
  const par = (s, o = {}, r = {}) => new D.Paragraph({ children: lari(s, r), spacing: { after: 120 }, ...o });
  const garis = { style: D.BorderStyle.SINGLE, size: 4, color: "D5DCE6" }, kosong = { style: D.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const sel = (isi, lebar, o = {}) => new D.TableCell({ width: { size: lebar, type: D.WidthType.DXA }, margins: { top: 70, bottom: 70, left: 110, right: 110 }, children: isi, ...o });
  let nomorDaftar = 0;
  const blok = b => {
    if (b.t === "h1") return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, pageBreakBefore: true, children: lari(`${b.no} ${b.s}`) })];
    if (b.t === "h2") return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, children: lari(`${b.no} ${b.s}`) })];
    if (b.t === "h3") return [new D.Paragraph({ heading: D.HeadingLevel.HEADING_3, children: lari(`${b.no} ${b.s}`) })];
    if (b.t === "p") return [par(b.s)];
    if (b.t === "ul") return b.a.map(x => par(x, { bullet: { level: 0 }, spacing: { after: 60 } }));
    if (b.t === "ol") { const n = ++nomorDaftar; return b.a.map(x => par(x, { numbering: { reference: "angka", level: 0, instance: n }, spacing: { after: 60 } })); }
    if (b.t === "tb") { const tot = b.lebar.reduce((a, x) => a + x, 0), w = b.lebar.map(x => Math.round(x / tot * LEBAR));
      return [new D.Table({ width: { size: LEBAR, type: D.WidthType.DXA }, columnWidths: w,
        borders: { top: garis, bottom: garis, left: kosong, right: kosong, insideHorizontal: garis, insideVertical: kosong },
        rows: [new D.TableRow({ tableHeader: true, cantSplit: true, children: b.kepala.map((k, i) => sel([par(k, { spacing: { after: 0 } }, { bold: true, color: "FFFFFF", size: 19 })], w[i], { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: "1D2A3A" } })) }),
          ...b.baris.map((r, j) => new D.TableRow({ cantSplit: true, children: r.map((c, i) => sel([par(c, { spacing: { after: 0 } }, { size: 19 })], w[i], j % 2 ? { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: "F6F8FB" } } : {})) }))] }),
        new D.Paragraph({ spacing: { after: 120 }, children: [] })]; }
    if (b.t === "kotak") { const [w, l] = WARNA_KOTAK[b.jenis].map(x => x.slice(1));
      return [new D.Table({ width: { size: LEBAR, type: D.WidthType.DXA }, columnWidths: [LEBAR],
        borders: { top: kosong, bottom: kosong, right: kosong, left: { style: D.BorderStyle.SINGLE, size: 30, color: w }, insideHorizontal: kosong, insideVertical: kosong },
        rows: [new D.TableRow({ cantSplit: true, children: [sel([par(b.judul, { spacing: { after: 40 } }, { bold: true, color: w, size: 20 }), ...b.isi.map(x => par(x, { spacing: { after: 40 } }, { size: 19 }))], LEBAR,
          { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: l }, margins: { top: 120, bottom: 120, left: 200, right: 160 } })] })] }),
        new D.Paragraph({ spacing: { after: 120 }, children: [] })]; }
    if (b.t === "stat") { const w = Math.floor(LEBAR / b.a.length), putih = { style: D.BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
      return [new D.Table({ width: { size: LEBAR, type: D.WidthType.DXA }, columnWidths: b.a.map(() => w),
        borders: { top: putih, bottom: putih, left: putih, right: putih, insideHorizontal: putih, insideVertical: putih },
        rows: [new D.TableRow({ cantSplit: true, children: b.a.map(([a, k]) => sel([
          new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: a, bold: true, size: 34, color: "1D2A3A" })] }),
          new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ text: k, size: 16, color: "556070" })] })], w, { shading: { type: D.ShadingType.CLEAR, color: "auto", fill: "EEF2F7" } })) })] }),
        new D.Paragraph({ alignment: D.AlignmentType.CENTER, spacing: { before: 40, after: 160 }, children: [new D.TextRun({ text: b.ket, italics: true, size: 16, color: "8A93A3" })] })]; }
    throw new Error("Blok tidak dikenal: " + b.t);
  };
  const sampul = [
    new D.Paragraph({ spacing: { before: 3200, after: 120 }, children: [new D.TextRun({ text: MEREK, bold: true, size: 22, color: "8F6B1A" })] }),
    new D.Paragraph({ spacing: { after: 120 }, children: [new D.TextRun({ text: JUDUL, bold: true, size: 64, color: "1D2A3A" })] }),
    new D.Paragraph({ spacing: { after: 400 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 24, color: "1D2A3A", space: 18 } },
      children: [new D.TextRun({ text: SUBJUDUL, size: 30, color: "33445A" })] }),
    par("Isi panduan ini:"),
    ...ISI.filter(b => b.t === "h1").map(b => par(`**${b.s}**`, { bullet: { level: 0 }, spacing: { after: 40 } })),
    new D.Paragraph({ spacing: { before: 1400, after: 0 }, children: [new D.TextRun({ text: "Untuk: " + UNTUK, size: 19, color: "556070" })] }),
    new D.Paragraph({ children: [new D.TextRun({ text: `Versi: ${VERSI} (sesuai tampilan aplikasi per tanggal tersebut)`, size: 19, color: "556070" })] }),
  ];
  const daftarIsi = [new D.Paragraph({ heading: D.HeadingLevel.HEADING_1, children: [new D.TextRun("Daftar Isi")] }),
    ...DAFTAR.map(b => new D.Paragraph({ spacing: { after: 50, before: b.t === "h1" ? 140 : 0 }, indent: { left: b.t === "h1" ? 0 : 360 },
      children: lari(`${b.no} ${b.s}`, { bold: b.t === "h1", color: b.t === "h1" ? "1F2633" : "33445A" }) }))];
  const kepala = new D.Header({ children: [new D.Paragraph({ alignment: D.AlignmentType.RIGHT, children: [new D.TextRun({ text: JUDUL, size: 16, color: "8A93A3" })] })] });
  const kaki = new D.Footer({ children: [new D.Paragraph({ alignment: D.AlignmentType.CENTER, children: [new D.TextRun({ children: ["Halaman ", D.PageNumber.CURRENT], size: 16, color: "8A93A3" })] })] });
  const halaman = { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } };
  const doc = new D.Document({
    creator: "Induk Pembiayaan", title: JUDUL, description: SUBJUDUL,
    styles: { default: { document: { run: { font: "Calibri", size: 21, color: "1F2633" }, paragraph: { spacing: { line: 276 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 36, bold: true, color: "1D2A3A" },
          paragraph: { spacing: { before: 0, after: 200 }, border: { bottom: { style: D.BorderStyle.SINGLE, size: 18, color: "1D2A3A", space: 6 } } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 27, bold: true, color: "1D2A3A" }, paragraph: { spacing: { before: 320, after: 100 }, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 23, bold: true, color: "2F6FB8" }, paragraph: { spacing: { before: 220, after: 80 }, keepNext: true } }] },
    numbering: { config: [{ reference: "angka", levels: [{ level: 0, format: D.LevelFormat.DECIMAL, text: "%1.", alignment: D.AlignmentType.START, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }] },
    sections: [{ properties: halaman, children: sampul },
      { properties: halaman, headers: { default: kepala }, footers: { default: kaki }, children: [...daftarIsi, ...ISI.flatMap(blok)] }],
  });
  fs.writeFileSync(keluaran, await D.Packer.toBuffer(doc));
}

(async () => {
  const html = path.join(os.tmpdir(), NAMA + ".html"); fs.writeFileSync(html, buatHTML());
  if (process.argv.includes("--html")) { fs.copyFileSync(html, path.join(AKAR, NAMA + ".html")); console.log("HTML →", NAMA + ".html"); }
  await cetakPDF(html, path.join(AKAR, NAMA + ".pdf")); console.log("PDF  →", NAMA + ".pdf");
  await buatDOCX(path.join(AKAR, NAMA + ".docx")); console.log("DOCX →", NAMA + ".docx");
})().catch(e => { console.error("Gagal:", e.message); process.exit(1); });
