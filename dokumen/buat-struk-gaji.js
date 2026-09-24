/* Template Struk Gaji — dua struk per halaman A4 mendatar.
   Itemnya mengikuti Gabungan per Guru di Induk Pembiayaan:
   mengajar, wali, diperbantukan, piket meja, pengganti, ekskul, tahfidz,
   parkiran, TuSehat, TuKerja; potongan BPJS, koperasi, lain-lain; bersih. */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign,
  PageOrientation, TableLayoutType
} = require('docx');

const FONT = 'Calibri';
const NAVY = '1F3864', ABU = 'F2F2F2', BIRU_MUDA = 'E9EEF6', GARIS = 'BFBFBF', HIJAU_MUDA = 'E2EFDA';
const LOGO = fs.readFileSync(__dirname + '/../assets/logo.png');

const rp = n => Number(n || 0).toLocaleString('id-ID');
const tanpa = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorder = { top: tanpa, bottom: tanpa, left: tanpa, right: tanpa };
const tipis = { style: BorderStyle.SINGLE, size: 4, color: GARIS };
const bawahTipis = { top: tanpa, bottom: tipis, left: tanpa, right: tanpa };

/* ---------------------------------------------------------- terbilang */
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function terbilang(n) {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilang(n - 10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh ' + terbilang(n % 10);
  if (n < 200) return 'seratus ' + terbilang(n - 100);
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus ' + terbilang(n % 100);
  if (n < 2000) return 'seribu ' + terbilang(n - 1000);
  if (n < 1e6) return terbilang(Math.floor(n / 1000)) + ' ribu ' + terbilang(n % 1000);
  if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + ' juta ' + terbilang(n % 1e6);
  return terbilang(Math.floor(n / 1e9)) + ' miliar ' + terbilang(n % 1e9);
}
const Terbilang = n => {
  const t = terbilang(n).replace(/\s+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + ' rupiah' : 'Nol rupiah';
};

/* ------------------------------------------------------------ pembantu */
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size || 16, bold: o.bold, italics: o.italics, color: o.color });
const par = (runs, o = {}) => new Paragraph({
  alignment: o.align || AlignmentType.LEFT,
  spacing: { before: o.before || 0, after: o.after || 0, line: o.line || 216 },
  children: Array.isArray(runs) ? runs : [runs]
});
const teks = (t, o = {}) => par(run(t, o), o);

const sel = (children, w, o = {}) => new TableCell({
  width: { size: w, type: WidthType.DXA },
  columnSpan: o.span,
  borders: o.borders || noBorder,
  shading: o.shade ? { fill: o.shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
  verticalAlign: o.valign || VerticalAlign.CENTER,
  margins: { top: o.mt ?? 14, bottom: o.mb ?? 14, left: o.ml ?? 60, right: o.mr ?? 60 },
  children: Array.isArray(children) ? children : [children]
});
const tabel = (widths, rows, o = {}) => new Table({
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: widths,
  layout: TableLayoutType.FIXED,
  borders: o.borders || noBorder,
  rows
});

/* Lebar satu struk: 7.500 DXA (~13,2 cm). Tabel rincian 5 kolom:
   No | Uraian | Keterangan (dasar hitung) | Rp | Nominal            */
const LEBAR = 7500;
const KOL = [360, 2900, 2340, 400, 1500];

/* "(kehadiran 95,25%)" — persentasenya tebal; kosong bila tidak ada. */
const fmtPersen = p => Number(p).toFixed(2).replace('.', ',') + '%';
const runPersen = (persen, o = {}) => persen == null ? [] : [
  run('(kehadiran ', o), run(fmtPersen(persen), { ...o, bold: true }), run(')', o)
];
/* Kepala bagian; bila ada persentase kehadiran, judulnya di kolom Uraian dan
   persentasenya sejajar kolom Keterangan di bawahnya. */
const rowHeader = (kode, judul, persen) => new TableRow({ children: [
  sel(teks(kode, { bold: true, color: NAVY, size: 16 }), KOL[0], { shade: BIRU_MUDA, borders: bawahTipis }),
  ...(persen == null
    ? [sel(teks(judul, { bold: true, color: NAVY, size: 16 }), KOL[1] + KOL[2] + KOL[3] + KOL[4], { span: 4, shade: BIRU_MUDA, borders: bawahTipis })]
    : [sel(teks(judul, { bold: true, color: NAVY, size: 16 }), KOL[1], { shade: BIRU_MUDA, borders: bawahTipis }),
       sel(par(runPersen(persen, { color: NAVY })), KOL[2] + KOL[3] + KOL[4], { span: 3, shade: BIRU_MUDA, borders: bawahTipis })])
]});
const rowInfo = (label, isi) => new TableRow({ children: [
  sel(teks(''), KOL[0]),
  sel(teks(label, { color: '595959' }), KOL[1]),
  sel(teks(': ' + isi, { color: '595959' }), KOL[2] + KOL[3] + KOL[4], { span: 3 })
]});
const rowItem = (no, uraian, ket, nominal, persen) => new TableRow({ children: [
  sel(teks(no ? no + '.' : '', { align: AlignmentType.RIGHT }), KOL[0]),
  sel(teks(uraian), KOL[1]),
  sel(par([run(ket || '', { color: '595959', italics: true }),
           ...(ket ? [run(' ', { color: '595959', italics: true }), ...runPersen(persen, { color: '595959', italics: true })] : [])]), KOL[2]),
  sel(teks('Rp', { align: AlignmentType.LEFT }), KOL[3]),
  sel(teks(rp(nominal), { align: AlignmentType.RIGHT }), KOL[4])
]});
const rowJumlah = (label, nominal, o = {}) => new TableRow({ children: [
  sel(teks(''), KOL[0], { shade: o.shade || ABU, borders: bawahTipis }),
  sel(teks(label, { bold: true, italics: !o.tebal, color: o.color }), KOL[1] + KOL[2], { span: 2, shade: o.shade || ABU, borders: bawahTipis }),
  sel(teks('Rp', { bold: true, color: o.color }), KOL[3], { shade: o.shade || ABU, borders: bawahTipis }),
  sel(teks(rp(nominal), { bold: true, align: AlignmentType.RIGHT, color: o.color }), KOL[4], { shade: o.shade || ABU, borders: bawahTipis })
]});

/* ---------------------------------------------------------- satu struk */
function buatStruk(d) {
  const A = d.mengajar.honor + d.mengajar.transport + d.mengajar.insentif + d.mengajar.konsumsi;
  const B = d.wali.honor + d.wali.upacara + d.wali.bimbingan;
  const C = d.diperbantukan.honor + d.diperbantukan.transport;
  const D = d.lain.piketMeja + d.lain.pengganti + d.lain.ekskul + d.lain.tahfidz + d.lain.parkiran;
  const E = d.tunjangan.tusehat + d.tunjangan.tukerja;
  const pendapatan = A + B + C + D + E;
  const F = d.potongan.bpjs + d.potongan.koperasi + d.potongan.lain;
  const bersih = pendapatan - F;
  /* Tunjangan tidak diterima tunai — disetor sekolah ke bank / penyelenggara —
     jadi yang dibawa guru adalah bersih dikurangi tunjangan. */
  const diterima = bersih - E;
  const fmtPersen = p => Number(p).toFixed(2).replace('.', ',') + '%';
  const ringkasHadir = [
    d.mengajar.persen != null && `Mengajar ${fmtPersen(d.mengajar.persen)}`,
    d.wali.persen != null && `Wali kelas ${fmtPersen(d.wali.persen)}`,
    d.diperbantukan.persen != null && `Piket unit ${fmtPersen(d.diperbantukan.persen)}`,
    d.lain.persenPiket != null && `Piket meja ${fmtPersen(d.lain.persenPiket)}`,
    d.lain.persenParkir != null && `Parkiran ${fmtPersen(d.lain.persenParkir)}`
  ].filter(Boolean).join(' · ');

  /* kop: logo | nama & alamat sekolah | kotak bulan */
  const kop = tabel([900, 4700, 1900], [new TableRow({ children: [
    sel(par(new ImageRun({ type: 'png', data: LOGO, transformation: { width: 40, height: 40 } })), 900, { borders: { top: tanpa, left: tanpa, right: tanpa, bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY } } }),
    sel([
      teks(d.sekolah.nama, { bold: true, size: 20, color: NAVY }),
      teks(d.sekolah.alamat, { size: 14, color: '595959' }),
      teks(d.sekolah.kontak, { size: 14, color: '595959' })
    ], 4700, { borders: { top: tanpa, left: tanpa, right: tanpa, bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY } } }),
    sel([
      teks('PERIODE', { size: 13, color: '595959', align: AlignmentType.CENTER }),
      teks(d.periode.toUpperCase(), { bold: true, size: 18, color: NAVY, align: AlignmentType.CENTER })
    ], 1900, { shade: BIRU_MUDA, borders: { top: tipis, left: tipis, right: tipis, bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY } } })
  ]})]);

  /* identitas penerima */
  const id = tabel([1300, 200, 3000, 1100, 200, 1700], [
    new TableRow({ children: [
      sel(teks('Nama'), 1300), sel(teks(':'), 200), sel(teks(d.nama, { bold: true }), 3000),
      sel(teks('Unit'), 1100), sel(teks(':'), 200), sel(teks(d.unit, { bold: true }), 1700)
    ]}),
    new TableRow({ children: [
      sel(teks('Status'), 1300), sel(teks(':'), 200), sel(teks(d.status), 3000),
      sel(teks('Masa Kerja'), 1100), sel(teks(':'), 200), sel(teks(d.masaKerja), 1700)
    ]}),
    ...(ringkasHadir ? [new TableRow({ children: [
      sel(teks('Kehadiran'), 1300), sel(teks(':'), 200),
      sel(teks(ringkasHadir, { bold: true }), 3000 + 1100 + 200 + 1700, { span: 4 })
    ]})] : [])
  ]);

  const m = d.mengajar, w = d.wali, p = d.diperbantukan, l = d.lain, t = d.tunjangan, q = d.potongan;
  const rincian = tabel(KOL, [
    rowHeader('A', 'PENDAPATAN SEBAGAI GURU', m.persen),
    rowInfo('Mata Pelajaran', m.mapel),
    rowItem(1, 'Honor Mengajar', `${m.jam} jam/minggu`, m.honor),
    rowItem(2, 'Transpor Berdiri', `${m.jam} jam/minggu`, m.transport),
    rowItem(3, 'Insentif Tatap Muka', `${m.jamTM} jam hadir`, m.insentif),
    rowItem(4, 'Konsumsi Kedatangan', `${m.hari} hari hadir`, m.konsumsi),
    rowJumlah('Jumlah A', A),

    rowHeader('B', 'HONOR WALI KELAS', w.persen),
    rowItem(1, 'Honor Wali Kelas', `Kelas ${w.kelas}`, w.honor),
    rowItem(2, 'Honor Upacara', `${w.jamUpacara} jam hadir`, w.upacara),
    rowItem(3, 'Honor Bimbingan Wali Kelas', `${w.jamBimbingan} jam hadir`, w.bimbingan),
    rowJumlah('Jumlah B', B),

    rowHeader('C', 'HONOR GURU DIPERBANTUKAN', p.persen),
    rowItem(1, 'Honor Diperbantukan', p.unit, p.honor),
    rowItem(2, 'Transpor Piket Unit', `${p.jamJaga} jam jaga`, p.transport),
    rowJumlah('Jumlah C', C),

    rowHeader('D', 'TRANSPOR DAN KOMPENSASI LAIN'),
    rowItem(1, 'Transpor Piket Meja Sekolah', `${l.jamPiket} jam jaga`, l.piketMeja, l.persenPiket),
    rowItem(2, 'Transpor Guru Pengganti', `GT ${l.gt} · PT ${l.pt} · Inf ${l.inf} jam`, l.pengganti),
    rowItem(3, 'Transpor Pembina Ekstrakurikuler', `${l.pertEkskul} pertemuan`, l.ekskul),
    rowItem(4, 'Transpor Pembimbing Tahfidz', `${l.pertTahfidz} pertemuan`, l.tahfidz),
    rowItem(5, 'Kompensasi Piket Parkiran', `${l.hariParkir} hari jaga`, l.parkiran, l.persenParkir),
    rowJumlah('Jumlah D', D),

    rowHeader('E', 'TUNJANGAN'),
    rowItem(1, 'Tunjangan Kesehatan (TuSehat)', t.salurSehat, t.tusehat),
    rowItem(2, 'Tunjangan Ketenagakerjaan (TuKerja)', t.salurKerja, t.tukerja),
    rowJumlah('Jumlah E', E),

    rowJumlah('JUMLAH PENDAPATAN (A + B + C + D + E)', pendapatan, { shade: BIRU_MUDA, tebal: true, color: NAVY }),

    rowHeader('F', 'POTONGAN'),
    rowItem(1, 'Potongan BPJS (porsi guru)', 'TuSehat & TuKerja', q.bpjs),
    rowItem(2, 'Potongan Koperasi', 'Iuran anggota / cicilan', q.koperasi),
    rowItem(3, 'Potongan Lain-lain', 'Tabungan / pinjaman sekolah', q.lain),
    rowJumlah('Jumlah Potongan', F),
    ...(E > 0 ? [rowItem('', 'Tunjangan disetor ke bank', 'TuSehat & TuKerja, tidak diterima tunai', E)] : []),

    new TableRow({ children: [
      sel(teks(''), KOL[0], { shade: HIJAU_MUDA, mt: 40, mb: 40 }),
      sel(teks('DITERIMA GURU', { bold: true, size: 18, color: '375623' }), KOL[1] + KOL[2], { span: 2, shade: HIJAU_MUDA, mt: 40, mb: 40 }),
      sel(teks('Rp', { bold: true, size: 18, color: '375623' }), KOL[3], { shade: HIJAU_MUDA, mt: 40, mb: 40 }),
      sel(teks(rp(diterima), { bold: true, size: 18, align: AlignmentType.RIGHT, color: '375623' }), KOL[4], { shade: HIJAU_MUDA, mt: 40, mb: 40 })
    ]}),
    new TableRow({ children: [
      sel(teks(''), KOL[0]),
      sel(teks(`Terbilang: ${Terbilang(diterima)}`, { italics: true, color: '595959' }), KOL[1] + KOL[2] + KOL[3] + KOL[4], { span: 4 })
    ]})
  ]);

  /* catatan & tanda tangan */
  const ttd = tabel([3300, 2100, 2100], [
    new TableRow({ children: [
      sel([
        teks('Catatan:', { bold: true, size: 14, color: '595959' }),
        ...(E > 0 ? [teks(`Tunjangan Kesehatan dan Ketenagakerjaan sebesar Rp ${rp(E)} disetor langsung ke bank / penyelenggara oleh sekolah, tidak termasuk jumlah yang diterima.`, { size: 14, color: '595959' })] : []),
        teks('Mohon konfirmasi kepada bendahara bila terdapat kekeliruan atau kekurangan pada struk ini.', { size: 14, color: '595959' })
      ], 3300, { valign: VerticalAlign.TOP }),
      sel([
        teks(`${d.sekolah.kota}, ${d.tanggal}`, { size: 15, align: AlignmentType.CENTER }),
        teks('Bendahara', { size: 15, align: AlignmentType.CENTER }),
        teks('', { size: 15 }), teks('', { size: 15 }),
        teks(d.bendahara, { bold: true, size: 15, align: AlignmentType.CENTER })
      ], 2100, { valign: VerticalAlign.TOP }),
      sel([
        teks('', { size: 15 }),
        teks('Penerima', { size: 15, align: AlignmentType.CENTER }),
        teks('', { size: 15 }), teks('', { size: 15 }),
        teks(d.nama, { bold: true, size: 15, align: AlignmentType.CENTER })
      ], 2100, { valign: VerticalAlign.TOP })
    ]})
  ]);

  return [
    kop,
    teks('STRUK GAJI', { bold: true, size: 24, color: NAVY, align: AlignmentType.CENTER, before: 80, after: 40 }),
    id,
    teks('', { size: 6, before: 40 }),
    rincian,
    teks('', { size: 6, before: 40 }),
    ttd
  ];
}

/* ------------------------------------------------------------ dokumen */
const sekolah = {
  nama: 'SMK & SMA Plus Merdeka Soreang',
  alamat: 'Jl. Citaliktik – Sindang Wargi, Soreang 40911, Kab. Bandung',
  kontak: 'Telp. (022) 5891234  ·  smaplusmerdeka@sch.id',
  kota: 'Soreang'
};
const contoh1 = {
  sekolah, periode: 'Agustus 2026', tanggal: '28 Agustus 2026', bendahara: 'Nama Bendahara, S.E.',
  nama: 'Puspa Adiyuka Nurzanah, S.Pd.', unit: 'SMA', status: 'Guru Tetap Yayasan', masaKerja: '9 tahun',
  mengajar: { mapel: 'Bahasa Indonesia, Koordinator P5', jam: 33, jamTM: 118, hari: 21, honor: 1320000, transport: 546000, insentif: 590000, konsumsi: 169000, persen: 95.25 },
  wali: { kelas: 'XI IPS 2', honor: 325000, jamUpacara: 4, upacara: 80000, jamBimbingan: 7, bimbingan: 105000, persen: 87.5 },
  diperbantukan: { unit: 'Bidang Literasi', honor: 225000, jamJaga: 12, transport: 144000, persen: 100 },
  lain: { jamPiket: 8, piketMeja: 120000, persenPiket: 80, gt: 3, pt: 2, inf: 0, pengganti: 75000, pertEkskul: 4, ekskul: 200000, pertTahfidz: 0, tahfidz: 0, hariParkir: 0, parkiran: 0, persenParkir: null },
  tunjangan: { salurSehat: 'BPJS Kesehatan', tusehat: 150000, salurKerja: 'DPLK BJB', tukerja: 100000 },
  potongan: { bpjs: 37500, koperasi: 50000, lain: 0 }
};
const contoh2 = {
  ...contoh1,
  nama: 'Neneng Siti Maesyaroh, S.Pd.', unit: 'SMA', status: 'Guru Tetap Yayasan', masaKerja: '9 tahun',
  mengajar: { mapel: 'Pendidikan Pancasila, Sejarah', jam: 30, jamTM: 110, hari: 21, honor: 1200000, transport: 538000, insentif: 550000, konsumsi: 169000, persen: 92.73 },
  wali: { kelas: 'X 6', honor: 325000, jamUpacara: 4, upacara: 80000, jamBimbingan: 7, bimbingan: 105000, persen: 100 },
  diperbantukan: { unit: '–', honor: 0, jamJaga: 0, transport: 0, persen: null },
  lain: { jamPiket: 6, piketMeja: 90000, persenPiket: 75, gt: 1, pt: 4, inf: 2, pengganti: 105000, pertEkskul: 0, ekskul: 0, pertTahfidz: 3, tahfidz: 150000, hariParkir: 0, parkiran: 0, persenParkir: null },
  tunjangan: { salurSehat: 'BPJS Kesehatan', tusehat: 150000, salurKerja: 'Simponi BNI', tukerja: 100000 },
  potongan: { bpjs: 37500, koperasi: 50000, lain: 250000 }
};

const halaman = tabel([LEBAR, 500, LEBAR], [new TableRow({ children: [
  sel(buatStruk(contoh1), LEBAR, { valign: VerticalAlign.TOP, ml: 0, mr: 0, mt: 0, mb: 0 }),
  sel(teks(''), 500, { borders: { top: tanpa, bottom: tanpa, right: tanpa, left: { style: BorderStyle.DASHED, size: 4, color: GARIS } } }),
  sel(buatStruk(contoh2), LEBAR, { valign: VerticalAlign.TOP, ml: 0, mr: 0, mt: 0, mb: 0 })
]})]);

const doc = new Document({
  creator: 'Induk Pembiayaan',
  title: 'Struk Gaji',
  styles: { default: { document: { run: { font: FONT, size: 16 } } } },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 500, bottom: 400, left: 660, right: 660 }
      }
    },
    children: [halaman]
  }]
});

Packer.toBuffer(doc).then(b => {
  fs.writeFileSync(__dirname + '/Struk_Gaji.docx', b);
  console.log('OK', b.length);
});
