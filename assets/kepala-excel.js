/* =====================================================================
   Kepala tabel Excel — satu kata tidak pernah terpotong di tengah
   (4 Oktober 2026; aturan yang sama dengan kepalaTabel di Kehadiran Guru)

   Dipanggil SESUDAH baris kepala tabel ditulis dengan ExcelJS:

       pasKepalaExcel(ws, barisAwal, barisAkhir?, { kolomAwal?, kolomAkhir? })

   Untuk baris-baris itu dipilih SATU ukuran huruf — yang terbesar, tidak
   lebih besar dari huruf yang sudah dipasang, tidak lebih kecil dari 8 pt —
   yang membuat kata terpanjang di tiap sel muat utuh di lebar selnya (sel
   gabungan: jumlah lebar kolom yang digabung). Bila kolomnya terlalu sempit
   bahkan untuk 8 pt, kolomnya dilebarkan seperlunya. Teks lalu hanya
   berpindah baris di antara kata, dan tinggi tiap baris mengikuti jumlah
   baris teks terbanyak (tidak pernah diperkecil).

   Lebar teks ditaksir per huruf (Arial Bold; Calibri ±12 % lebih sempit),
   sengaja agak longgar supaya huruf lebar seperti M dan W tetap muat. Satuan
   lebar kolom Excel = lebar angka "0" huruf bawaan (Calibri 11 = 7 piksel);
   sel memakan ±6 piksel tepi.
   ===================================================================== */
(function (akar) {
  'use strict';
  var MIN = 8;

  // Lebar satu huruf dalam em, Arial Bold, dibulatkan ke atas.
  function lebarHuruf(h) {
    if (/[MW@%]/.test(h)) return 0.95;
    if (/[A-Z&]/.test(h)) return 0.76;
    if (/[mw]/.test(h)) return 0.9;
    if (/[a-z0-9#$?_]/.test(h)) return 0.6;
    if (/[ .,:;'!|il\-()\[\]/]/.test(h)) return 0.36;
    return 0.7;   // huruf lain (aksen, simbol)
  }
  function pxTeks(teks, pt, faktor) {
    var em = 0;
    for (var i = 0; i < teks.length; i++) em += lebarHuruf(teks[i]);
    return em * pt * 96 / 72 * faktor;
  }
  var pxIsi = function (lebar) { return Math.floor((lebar == null ? 8.43 : lebar) * 7 + 5) - 6; };
  var lebarUntuk = function (px) { return Math.ceil(((px + 6 - 5) / 7) * 2) / 2; };

  function teksSel(sel) {
    var v = sel.value;
    if (v && typeof v === 'object' && Array.isArray(v.richText)) return v.richText.map(function (r) { return r.text; }).join('');
    return v == null ? '' : String(v);
  }
  function ukuranSel(sel) {
    var v = sel.value;
    if (v && typeof v === 'object' && Array.isArray(v.richText)) {
      return Math.max.apply(null, v.richText.map(function (r) { return (r.font && r.font.size) || (sel.font && sel.font.size) || 11; }));
    }
    return (sel.font && sel.font.size) || 11;
  }
  function faktorHuruf(sel) {
    var nama = String((sel.font && sel.font.name) || 'Calibri').toLowerCase();
    return nama.indexOf('calibri') >= 0 ? 0.88 : 1;
  }

  function pasKepalaExcel(ws, barisAwal, barisAkhir, opsi) {
    opsi = opsi || {};
    barisAkhir = barisAkhir || barisAwal;
    var kolomAwal = opsi.kolomAwal || 1;
    var kolomAkhir = opsi.kolomAkhir || ws.columnCount || ws.actualColumnCount || 1;

    // Kumpulkan sel kepala (sel induk saja untuk sel gabungan) beserta rentangnya.
    var daftar = [];
    var sudah = {};
    for (var r = barisAwal; r <= barisAkhir; r++) {
      for (var c = kolomAwal; c <= kolomAkhir; c++) {
        var sel = ws.getCell(r, c);
        var induk = sel.isMerged ? sel.master : sel;
        if (sudah[induk.address]) continue;
        sudah[induk.address] = true;
        var teks = teksSel(induk).trim();
        if (!teks) continue;
        // Rentang gabungan: telusuri ke kanan dan ke bawah selama induknya sama.
        var kanan = induk.col, bawah = induk.row;
        while (kanan < kolomAkhir && ws.getCell(induk.row, kanan + 1).isMerged && ws.getCell(induk.row, kanan + 1).master.address === induk.address) kanan++;
        while (bawah < barisAkhir && ws.getCell(bawah + 1, induk.col).isMerged && ws.getCell(bawah + 1, induk.col).master.address === induk.address) bawah++;
        daftar.push({ sel: induk, teks: teks, kiri: induk.col, kanan: kanan, atas: induk.row, bawah: bawah,
                      faktor: faktorHuruf(induk), ukuran: ukuranSel(induk) });
      }
    }
    if (!daftar.length) return null;

    var lebarRentang = function (d) {
      var px = 0;
      for (var k = d.kiri; k <= d.kanan; k++) px += Math.floor((ws.getColumn(k).width == null ? 8.43 : ws.getColumn(k).width) * 7 + 5);
      return px - 6;
    };
    var kataDari = function (teks) { return teks.split(/\s+/).filter(Boolean); };

    // Ukuran seragam: tidak lebih besar dari huruf yang ada, cukup untuk kata terpanjang tiap sel.
    var ukuran = Math.max.apply(null, daftar.map(function (d) { return d.ukuran; }));
    daftar.forEach(function (d) {
      var terpanjang = kataDari(d.teks).reduce(function (a, k) { return Math.max(a, pxTeks(k, 1, d.faktor)); }, 0);
      if (!terpanjang) return;
      var muat = Math.floor((lebarRentang(d) / terpanjang) * 2) / 2;
      if (muat < MIN) {
        // Terlalu sempit: lebarkan kolom paling kanan rentangnya seperlunya.
        var kurang = terpanjang * MIN - lebarRentang(d);
        var kol = ws.getColumn(d.kanan);
        kol.width = lebarUntuk(pxIsi(kol.width) + kurang);
        muat = MIN;
      }
      ukuran = Math.min(ukuran, muat);
    });

    // Pasang ukurannya (rich text: tiap potongan diperkecil sebanding).
    daftar.forEach(function (d) {
      var v = d.sel.value;
      if (v && typeof v === 'object' && Array.isArray(v.richText)) {
        var skala = ukuran / d.ukuran;
        if (skala < 1) {
          d.sel.value = { richText: v.richText.map(function (p) {
            var f = Object.assign({}, p.font || {});
            f.size = Math.max(MIN, Math.round(((f.size || d.ukuran) * skala) * 2) / 2);
            return Object.assign({}, p, { font: f });
          }) };
        }
      } else if (ukuran < d.ukuran) {
        d.sel.font = Object.assign({}, d.sel.font || {}, { size: ukuran });
      }
      d.sel.alignment = Object.assign({}, d.sel.alignment || {}, { wrapText: true });
    });

    // Tinggi baris: jumlah baris teks terbanyak (dilipat di antara kata), sel satu baris saja.
    var tinggiPerlu = {};
    daftar.forEach(function (d) {
      if (d.bawah !== d.atas) return;
      var lebar = lebarRentang(d), n = 0;
      d.teks.split(/\n/).forEach(function (bagian) {
        var isi = 0, baris = 1;
        kataDari(bagian).forEach(function (k) {
          var p = pxTeks(k, ukuran, d.faktor), spasi = pxTeks(' ', ukuran, d.faktor);
          if (isi && isi + spasi + p > lebar) { baris++; isi = p; } else isi += (isi ? spasi : 0) + p;
        });
        n += baris;
      });
      tinggiPerlu[d.atas] = Math.max(tinggiPerlu[d.atas] || 0, Math.ceil(n * ukuran * 1.25 + 6));
    });
    Object.keys(tinggiPerlu).forEach(function (r) {
      var row = ws.getRow(Number(r));
      if (!row.height || row.height < tinggiPerlu[r]) row.height = tinggiPerlu[r];
    });
    return ukuran;
  }

  akar.pasKepalaExcel = pasKepalaExcel;
  if (typeof module === 'object' && module.exports) module.exports = { pasKepalaExcel: pasKepalaExcel, pxTeks: pxTeks };
})(typeof window !== 'undefined' ? window : globalThis);
