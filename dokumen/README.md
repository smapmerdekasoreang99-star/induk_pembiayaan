# Template Struk Gaji

`Struk_Gaji.docx` — template struk gaji, dua struk per halaman A4 mendatar,
itemnya mengikuti kolom Keseluruhan di Induk Pembiayaan; sejak 28 September 2026 tanpa tanda tangan penerima (hanya bendahara) — `Struk_Gaji.docx` dan `.pdf` di sini masih versi lama sampai dibuat ulang dengan skripnya. `Struk_Gaji.pdf`
pratinjaunya (dibuat dari versi sebelum baris Kehadiran dan Diterima Tunai oleh Guru; yang mutakhir berkas .docx-nya). Data di dalamnya contoh; ubah langsung di Word.

`buat-struk-gaji.js` membuat ulang berkasnya dari data di bagian bawah skrip
(objek `contoh1`, `contoh2`). Menjalankannya perlu paket `docx`:

    npm install docx
    node buat-struk-gaji.js
