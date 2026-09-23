/* =====================================================================
   INDUK PEMBIAYAAN — SMA Plus Merdeka Soreang
   Aplikasi payroll: menghitung apa yang harus dibayarkan sekolah.

   Prinsip yang memandu seluruh berkas ini:

   1. APLIKASI INI HAMPIR TIDAK MEMILIKI DATA SENDIRI.
      Kehadiran, jam mengajar, penggantian, piket, dan ekskul dicatat di
      aplikasi masing-masing; di sini hanya dibaca. Yang dimiliki sendiri
      cuma tabel berawalan ip_: jenis pembiayaan dan besarannya.

   2. NOMINAL BERVERSI, TIDAK PERNAH DITIMPA.
      Mengubah tarif berarti menambah baris baru dengan berlaku_mulai baru.
      Rekap bulan lalu tetap memakai tarif bulan lalu. Ini bukan kerumitan
      tambahan — ini satu-satunya cara rekap yang sudah dibayarkan tidak
      berubah sendiri di belakang hari.

   3. IDENTITAS DOKUMEN DIBACA DARI DATA INDUK.
      Bukan disalin ke sini, supaya kop semua aplikasi benar-benar seragam.
   ===================================================================== */
const KONFIG = {
  url:     'https://xgtoneyvzfvfbidicotq.supabase.co',
  anonKey: 'sb_publishable_rjHVGT0ULc03TC2ljIytSA_2X54xzR1',
  sekolah: 'SMA Plus Merdeka Soreang'
};

let sesi = { token: '', email: '', nama: '' };
let D = { jenis: [], tarif: [], tarifSemua: [], profil: null, rekap: null, hadir: null, galat: {} };
let halaman = 'beranda';
let ui = { acuan: '', rekapAwal: '', rekapAkhir: '', rekapJenis: 'gabungan', ikutStaf: false,
           hadirAwal: '', hadirAkhir: '', hadirTab: 'kehadiran', hadirSaring: '', hadirIkutStaf: false,
           penggantiRinci: false, ekskulKategori: '' };

/* ---------------------------------------------------------------- util */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;

const hariIniISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
function tglIndo(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '—';
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${BULAN[Number(m) - 1]} ${y}`;
}
const rupiah = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

/* Tanggal 1 bulan berikutnya — bawaan yang wajar untuk pemberlakuan tarif
   baru, karena pembiayaan dihitung per bulan. */
function awalBulanDepan() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`;
}
/* Periode bawaan rekap: satu bulan penuh, karena pembiayaan dibayarkan
   bulanan. Bukan "sampai hari ini", yang akan menghasilkan jumlah setengah
   bulan dan mudah disangka jumlah sebenarnya. */
function bulanIni() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const p = n => String(n).padStart(2, '0');
  return { awal: `${y}-${p(m + 1)}-01`,
           akhir: `${y}-${p(m + 1)}-${p(new Date(y, m + 1, 0).getDate())}` };
}

/* Terbilang untuk daftar pembayaran — bendahara memerlukannya pada dokumen
   yang ditandatangani. */
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function terbilangAngka(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilangAngka(n - 10) + ' belas';
  if (n < 100) return terbilangAngka(Math.floor(n / 10)) + ' puluh ' + terbilangAngka(n % 10);
  if (n < 200) return 'seratus ' + terbilangAngka(n - 100);
  if (n < 1000) return terbilangAngka(Math.floor(n / 100)) + ' ratus ' + terbilangAngka(n % 100);
  if (n < 2000) return 'seribu ' + terbilangAngka(n - 1000);
  if (n < 1e6) return terbilangAngka(Math.floor(n / 1000)) + ' ribu ' + terbilangAngka(n % 1000);
  if (n < 1e9) return terbilangAngka(Math.floor(n / 1e6)) + ' juta ' + terbilangAngka(n % 1e6);
  return terbilangAngka(Math.floor(n / 1e9)) + ' miliar ' + terbilangAngka(n % 1e9);
}
const terbilang = n => {
  const t = terbilangAngka(n).replace(/\s+/g, ' ').trim();
  return (t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Nol') + ' rupiah';
};

function toast(pesan, salah) {
  const r = $('#toast-root');
  r.innerHTML = `<div class="toast${salah ? ' err' : ''}">${esc(pesan)}</div>`;
  clearTimeout(r._t);
  r._t = setTimeout(() => r.innerHTML = '', salah ? 6000 : 3200);
}
function sibuk(t) { $('#busy-root').innerHTML = t ? `<div class="sibuk">${esc(t)}</div>` : ''; }

async function jalankan(pesan, fn) {
  sibuk(pesan);
  try { await fn(); }
  catch (e) { toast(pesanRamah(e), true); }
  finally { sibuk(''); gambar(); }
}
function pesanRamah(e) {
  const m = e && e.message ? e.message : String(e);
  if (/duplicate key|already exists/i.test(m))
    return 'Sudah ada besaran untuk jenis dan tanggal berlaku itu. Pilih tanggal berlaku yang lain.';
  if (/row-level security|permission denied/i.test(m))
    return 'Akun ini belum berhak membuka Induk Pembiayaan. Hubungi operator untuk didaftarkan sebagai bendahara.';
  return m;
}

/* ------------------------------------------------------------ database */
async function api(jalur, opsi = {}) {
  const r = await fetch(KONFIG.url + jalur, {
    ...opsi,
    headers: {
      apikey: KONFIG.anonKey,
      Authorization: 'Bearer ' + (sesi.token || KONFIG.anonKey),
      'Content-Type': 'application/json',
      ...(opsi.headers || {})
    }
  });
  const teks = await r.text();
  let data = null;
  try { data = teks ? JSON.parse(teks) : null; } catch (e) {}
  if (r.status === 401) { sesi.token = ''; layarMasuk('Sesi berakhir. Silakan masuk kembali.'); throw new Error('Sesi berakhir'); }
  if (!r.ok) throw new Error((data && (data.message || data.hint || data.error_description)) || `Gagal (HTTP ${r.status})`);
  return data;
}
const ambil = (tabel, query = '') => api(`/rest/v1/${tabel}?${query}`);
const simpanBaru = (tabel, isi) =>
  api(`/rest/v1/${tabel}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(isi) });
const buang = (tabel, syarat) => api(`/rest/v1/${tabel}?${syarat}`, { method: 'DELETE' });
/* Fungsi database dipanggil lewat RPC; f_ip_tarif menjawab "tarif apa yang
   berlaku pada tanggal ini", dan itulah dasar seluruh perhitungan. */
const rpc = (nama, argumen) =>
  api(`/rest/v1/rpc/${nama}`, { method: 'POST', body: JSON.stringify(argumen) });

async function masuk(email, sandi) {
  const r = await fetch(KONFIG.url + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: KONFIG.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: sandi })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || 'Email atau kata sandi salah.');
  sesi.token = d.access_token;
  sesi.email = email;
}

/* -------------------------------------------------------- muat semua */
async function muatSemua() {
  D.galat = {};
  // Katalog jenis, besaran yang berlaku pada tanggal acuan, dan seluruh
  // versi — yang terakhir untuk menunjukkan versi yang BELUM berlaku, supaya
  // besaran yang baru disimpan untuk bulan depan tidak tampak hilang.
  [D.jenis, D.tarif, D.tarifSemua] = await Promise.all([
    ambil('ip_jenis_tarif', 'select=*&order=urutan'),
    rpc('f_ip_tarif', { p_acuan: ui.acuan }),
    ambil('ip_tarif', 'select=kode,berlaku_mulai,batas_min,batas_maks,nilai&order=berlaku_mulai.asc,batas_min.asc')
  ]);

  // RLS menolak dengan mengembalikan tabel kosong, bukan galat. Tanpa
  // pemeriksaan ini, akun yang tidak berhak akan melihat rekap penuh dengan
  // tarif Rp 0 dan menyangka itu angka sebenarnya — lebih berbahaya daripada
  // sekadar ditolak masuk.
  if (!D.jenis.length) throw new Error(
    'Akun ini belum berhak membuka Induk Pembiayaan. Emailnya perlu didaftarkan '
    + 'di operator_data dengan peran operator atau bendahara.');

  // Identitas dokumen milik Data Induk. Kegagalannya tidak menjatuhkan
  // halaman lain — hanya kop dokumen yang kosong.
  try {
    const pr = await ambil('v_penanda_tangan', 'select=*&limit=1');
    D.profil = (pr && pr[0]) || null;
  } catch (e) {
    D.profil = null;
    D.galat.profil = e.message;
  }

  // Nama petugas diambil dari operator_data bila ada, supaya yang tampil di
  // sudut bukan alamat email.
  try {
    const o = await ambil('operator_data', `select=nama,peran&email=eq.${enc(sesi.email)}&limit=1`);
    if (o && o[0]) { sesi.nama = o[0].nama || sesi.email; sesi.peran = o[0].peran; }
  } catch (e) { /* bukan penghalang */ }
  if (!sesi.nama) sesi.nama = sesi.email;
}

/* ------------------------------------------------------------ layar */
function layarMasuk(pesan) {
  $('#layar').innerHTML = `<div class="gate"><div class="gate-card">
    <h1>Induk Pembiayaan</h1><p class="sub">${esc(KONFIG.sekolah)}</p>
    ${pesan ? `<div class="gate-err">${esc(pesan)}</div>` : ''}
    <div class="fg"><label>Email</label><input class="field" id="g-email" type="email" autocomplete="username"></div>
    <div class="fg"><label>Kata sandi</label><input class="field" id="g-sandi" type="password" autocomplete="current-password"></div>
    <button class="btn btn-p btn-blok" id="g-masuk">Masuk</button>
    <p class="note">Memakai akun masing-masing, bukan akun bersama — setiap perubahan
      besaran pembiayaan tercatat atas nama siapa yang masuk.</p></div></div>`;
  const coba = async () => {
    const email = $('#g-email').value.trim(), sandi = $('#g-sandi').value;
    if (!email) return $('#g-email').focus();
    if (!sandi) return $('#g-sandi').focus();
    sibuk('Memeriksa…');
    try {
      await masuk(email, sandi);
      await muatSemua();
      layarUtama();
      toast('Selamat bekerja, ' + sesi.nama);
    } catch (e) { layarMasuk(pesanRamah(e)); }
    finally { sibuk(''); }
  };
  $('#g-masuk').onclick = coba;
  ['#g-email', '#g-sandi'].forEach(s => $(s).onkeydown = e => { if (e.key === 'Enter') coba(); });
  $('#g-email').focus();
}

function layarUtama() {
  $('#layar').innerHTML = '';
  $('#layar').appendChild($('#tpl-utama').content.cloneNode(true));
  $('#fPetugas').textContent = sesi.nama;
  $('#fPeran').textContent = sesi.peran === 'bendahara' ? 'Bendahara' : 'Operator';
  $('#bKeluar').onclick = () => { sesi = { token: '', email: '', nama: '' }; layarMasuk(); };
  $$('#nav button').forEach(b => b.onclick = () => {
    halaman = b.dataset.hal;
    $$('#nav button').forEach(x => x.classList.toggle('on', x === b));
    gambar();
  });
  gambar();
}

function gambar() {
  if (!$('#isi')) return;
  ({ beranda: halBeranda, hadir: halHadir, nominal: halNominal,
     rekap: halRekap, identitas: halIdentitas }[halaman] || halBeranda)();
}

/* ---------------------------------------------------------- beranda */
function halBeranda() {
  const kelompok = [...new Set(D.jenis.filter(j => j.aktif).map(j => j.kelompok))];
  const belumDiisi = D.jenis.filter(j => j.aktif && !D.tarif.some(t => t.kode === j.kode));
  const nol = D.tarif.filter(t => Number(t.nilai) === 0);

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Induk Pembiayaan</h1>
      <p>Menghitung apa yang harus dibayarkan sekolah, dari kehadiran yang sudah
         dicatat aplikasi lain.</p></div></div>

    ${belumDiisi.length ? `<div class="info-box"><b>${belumDiisi.length} jenis pembiayaan belum ada besarannya
      pada ${esc(tglIndo(ui.acuan))}:</b> ${esc(belumDiisi.map(j => j.nama).join(', '))}.
      Isi di halaman Penggajian sebelum rekap dijalankan.</div>` : ''}
    ${nol.length ? `<div class="info-box"><b>${nol.length} besaran masih Rp 0.</b>
      Periksa apakah memang nol, atau belum diisi.</div>` : ''}

    <div class="kartu-baris">
      <div class="kartu"><b>${D.jenis.filter(j => j.aktif).length}</b><span>jenis pembiayaan</span></div>
      <div class="kartu"><b>${kelompok.length}</b><span>kelompok</span></div>
      <div class="kartu"><b>${D.tarif.length}</b><span>besaran berlaku</span></div>
    </div>

    <div class="panel"><div class="panel-head"><h3>Dari mana angkanya datang</h3></div>
      <div class="scroll"><table><thead><tr>
        <th>Yang dibayar</th><th>Kehadirannya dicatat di</th><th style="width:130px">Keadaan</th>
      </tr></thead><tbody>
        ${[
          ['Guru mengajar', 'Kehadiran Guru — Ketidakhadiran', true],
          ['Guru pengganti', 'Kehadiran Guru — Penugasan Pengganti', true],
          ['Piket meja sekolah, unit, parkiran', 'Kehadiran Guru — Pelaksanaan Piket', true],
          ['Ekskul dan Pembinaan Imtaq', 'Absensi Ekskul — laporan pertemuan', true],
          ['Tugas wali kelas (upacara, bimbingan)', 'Data Induk — jam bawaan tiap komponen', true],
          ['Kehadiran staf (satpam, kebersihan, staf kontrak)', 'Kehadiran Guru — Kehadiran Staf; ketentuan jam kerja dan pola honornya di Data Induk', true]
        ].map(([a, b, siap]) => `<tr>
          <td style="font-weight:500">${esc(a)}</td><td class="kecil">${esc(b)}</td>
          <td>${siap ? '<span class="tag tag-l">siap dibaca</span>'
                     : '<span class="kecil" style="color:var(--warn)">belum ada datanya</span>'}</td>
        </tr>`).join('')}
      </tbody></table></div></div>

    <p class="kecil">Aplikasi ini tidak mencatat kehadiran sendiri. Bila ada angka yang
      terasa keliru, perbaikannya di aplikasi asal datanya — bukan di sini — supaya satu
      kekeliruan tidak perlu dibetulkan di dua tempat.</p>`;
}

/* ----------------------------------------------- pengaturan nominal */
function halNominal() {
  const aktif = D.jenis.filter(j => j.aktif);
  const kelompok = [...new Set(aktif.map(j => j.kelompok))];
  const tarifDari = kode => D.tarif.filter(t => t.kode === kode);
  /* Tiap kelompok mendapat satu warna aksen dari palet bersama, berurutan —
     warnanya penanda kelompok, bukan makna, jadi cukup bergiliran. */
  const WARNA = ['sakit', 'emas', 'hadir'];
  const warnaKelompok = k => WARNA[kelompok.indexOf(k) % WARNA.length];

  const belumDiisi = aktif.filter(j => !tarifDari(j.kode).length);
  const masihNol = aktif.filter(j => tarifDari(j.kode).length && tarifDari(j.kode).every(t => Number(t.nilai) === 0));
  const terisi = aktif.length - belumDiisi.length - masihNol.length;

  const kartuJenis = j => {
    const baris = tarifDari(j.kode);
    const sejak = baris.length ? baris[0].berlaku_mulai : null;
    const nol = baris.length && baris.every(t => Number(t.nilai) === 0);
    const isi = !baris.length
      ? '<div class="pg-nilai kosong">belum diisi</div>'
      : j.berjenjang
        ? `<table class="pg-jenjang"><tbody>${baris.map(t => `<tr>
            <td>${t.batas_min == null ? '—' : t.batas_min}${
              t.batas_maks == null ? ' ke atas' : '–' + t.batas_maks} ${esc(j.satuan_jenjang)}</td>
            <td>${rupiah(t.nilai)}</td></tr>`).join('')}</tbody></table>`
        : `<div class="pg-nilai${nol ? ' nol' : ''}">${rupiah(baris[0].nilai)}</div>`;

    /* Versi yang belum berlaku pada tanggal acuan. Tanpa ini, besaran yang
       baru disimpan untuk bulan depan tidak terlihat di mana pun dan tampak
       seolah tidak tersimpan. */
    const mendatang = (D.tarifSemua || []).filter(t => t.kode === j.kode && t.berlaku_mulai > ui.acuan);
    const tglBerikut = mendatang.length ? mendatang[0].berlaku_mulai : null;
    const versiBerikut = tglBerikut ? mendatang.filter(t => t.berlaku_mulai === tglBerikut) : [];
    const teksBerikut = !versiBerikut.length ? ''
      : j.berjenjang ? `${versiBerikut.length} jenjang`
      : rupiah(versiBerikut[0].nilai);

    return `<article class="pg-kartu${!baris.length ? ' kosong' : ''}">
      <div class="pg-kartu-atas"><h3>${esc(j.nama)}</h3><span class="pg-satuan">${esc(j.satuan)}</span></div>
      ${isi}
      <div class="pg-meta">${sejak ? 'berlaku sejak ' + esc(tglIndo(sejak)) : 'belum pernah diisi'}${
        nol ? ' · <span class="pg-nol">masih Rp 0</span>' : ''}</div>
      ${teksBerikut ? `<div class="pg-berikut"><b>Versi berikutnya ${esc(teksBerikut)}</b> berlaku
        ${esc(tglIndo(tglBerikut))} — belum dipakai pada tanggal acuan ${esc(tglIndo(ui.acuan))}.</div>` : ''}
      ${j.penjelasan ? `<p class="pg-penjelasan">${esc(j.penjelasan)}</p>` : '<p class="pg-penjelasan"></p>'}
      <div class="pg-aksi">
        <button class="btn btn-sm btn-p" data-ubah="${esc(j.kode)}">Ubah nominal</button>
        <button class="btn btn-sm" data-riwayat="${esc(j.kode)}">Riwayat</button>
      </div></article>`;
  };

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Penggajian</h1>
      <p>Nominal tiap jenis pembiayaan. Mengubahnya tidak menimpa yang lama —
         yang tersimpan adalah nominal baru beserta tanggal mulai berlakunya.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih"><label class="kecil">Berlaku pada</label>
        <input class="field" type="date" id="acuan" value="${esc(ui.acuan)}" style="width:auto"></div></div>

    <div class="kartu-baris pg-ringkas">
      <div class="kartu"><b>${aktif.length}</b><span>jenis pembiayaan</span></div>
      <div class="kartu"><b>${terisi}</b><span>sudah bernominal</span></div>
      <div class="kartu${masihNol.length ? ' warn' : ''}"><b>${masihNol.length}</b><span>masih Rp 0</span></div>
      <div class="kartu${belumDiisi.length ? ' warn' : ''}"><b>${belumDiisi.length}</b><span>belum diisi</span></div>
      <div class="kartu pg-acuan"><b>${esc(tglIndo(ui.acuan))}</b><span>tanggal acuan — rekap suatu periode memakai
        nominal yang berlaku pada tanggal akhir periodenya</span></div>
    </div>

    ${kelompok.map(k => {
      const isiKelompok = aktif.filter(j => j.kelompok === k);
      const kosong = isiKelompok.filter(j => !tarifDari(j.kode).length || tarifDari(j.kode).every(t => Number(t.nilai) === 0)).length;
      return `<section class="pg-kelompok pg-${warnaKelompok(k)}">
        <header class="pg-kelompok-head"><span class="pg-titik"></span><h2>${esc(k)}</h2>
          <span class="kecil">${isiKelompok.length} jenis${kosong ? ` · ${kosong} belum bernominal` : ''}</span></header>
        <div class="pg-grid">${isiKelompok.map(kartuJenis).join('')}</div>
      </section>`;
    }).join('')}`;

  $('#acuan').onchange = e => {
    ui.acuan = e.target.value || hariIniISO();
    jalankan('Memuat…', muatSemua);
  };
  $$('[data-ubah]').forEach(b => b.onclick = () => formTarif(b.dataset.ubah));
  $$('[data-riwayat]').forEach(b => b.onclick = () => dialogRiwayat(b.dataset.riwayat));
}

/* Mengubah besaran = menambah versi baru, bukan menyunting yang lama.
   Karena itu formulirnya selalu menanyakan tanggal mulai berlakunya. */
function formTarif(kode) {
  const j = D.jenis.find(x => x.kode === kode);
  if (!j) return;
  const sekarang = D.tarif.filter(t => t.kode === kode);

  const barisJenjang = () => (sekarang.length ? sekarang : [{ batas_min: 0, batas_maks: null, nilai: 0 }])
    .map((t, i) => `<tr>
      <td><input class="field num" type="number" min="0" step="1" data-j="min" data-i="${i}"
            value="${t.batas_min == null ? 0 : t.batas_min}"></td>
      <td><input class="field num" type="number" min="0" step="1" data-j="maks" data-i="${i}"
            value="${t.batas_maks == null ? '' : t.batas_maks}" placeholder="ke atas"></td>
      <td><input class="field num" type="number" min="0" step="500" data-j="nilai" data-i="${i}"
            value="${Number(t.nilai) || 0}"></td>
      <td style="text-align:right"><button class="btn btn-sm btn-d" data-hapus-j="${i}">Hapus</button></td>
    </tr>`).join('');

  bukaModal(`<h2>Ubah nominal — ${esc(j.nama)}</h2><div class="body">
    <p class="msg kecil">Besaran lama tidak dihapus. Yang tersimpan adalah besaran baru
      beserta tanggal mulai berlakunya, sehingga rekap periode sebelumnya tetap memakai
      angka yang lama.</p>

    <div class="fg"><label>Berlaku mulai <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="t-mulai" value="${esc(awalBulanDepan())}">
      <div class="hint">Bawaannya tanggal 1 bulan depan, karena pembiayaan dihitung per bulan. Rekap sebuah
        periode memakai besaran yang berlaku pada tanggal AKHIR periode itu — supaya bulan ini ikut
        memakai besaran baru, pilih tanggal 1 bulan ini atau lebih awal.</div></div>

    ${j.berjenjang ? `
      <div class="fg penuh"><label>Jenjang menurut ${esc(j.satuan_jenjang)}</label>
        <table class="log"><thead><tr>
          <th style="width:110px">Dari</th><th style="width:110px">Sampai</th>
          <th>Besaran (${esc(j.satuan)})</th><th style="width:90px"></th>
        </tr></thead><tbody id="t-jenjang">${barisJenjang()}</tbody></table>
        <button class="btn btn-sm" id="t-tambah" style="margin-top:8px">+ Tambah jenjang</button>
        <div class="hint">Kosongkan kolom "Sampai" pada jenjang terakhir agar berlaku ke atas.</div></div>`
      : `
      <div class="fg"><label>Besaran <span style="color:var(--danger)">*</span></label>
        <input class="field num" type="number" min="0" step="500" id="t-nilai"
          value="${sekarang.length ? Number(sekarang[0].nilai) : 0}">
        <div class="hint">${esc(j.satuan)}</div></div>`}

    <div class="fg penuh"><label>Catatan (opsional)</label>
      <input class="field" id="t-catatan" placeholder="Mis. keputusan yayasan 12 Juni 2026">
      <div class="hint">Berguna saat ditanya dasar perubahannya.</div></div>
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-simpan">Simpan sebagai versi baru</button></div>`, true);

  const pasangHapus = () => $$('[data-hapus-j]').forEach(b => b.onclick = () => {
    const tr = b.closest('tr');
    if ($$('#t-jenjang tr').length > 1) tr.remove();
  });
  if (j.berjenjang) {
    pasangHapus();
    $('#t-tambah').onclick = () => {
      const i = $$('#t-jenjang tr').length;
      $('#t-jenjang').insertAdjacentHTML('beforeend', `<tr>
        <td><input class="field num" type="number" min="0" step="1" data-j="min" data-i="${i}" value="0"></td>
        <td><input class="field num" type="number" min="0" step="1" data-j="maks" data-i="${i}" placeholder="ke atas"></td>
        <td><input class="field num" type="number" min="0" step="500" data-j="nilai" data-i="${i}" value="0"></td>
        <td style="text-align:right"><button class="btn btn-sm btn-d" data-hapus-j="${i}">Hapus</button></td></tr>`);
      pasangHapus();
    };
  }

  $('#m-batal').onclick = tutupModal;
  $('#m-simpan').onclick = () => {
    const mulai = $('#t-mulai').value;
    if (!mulai) { $('#t-mulai').focus(); return; }

    let baris;
    if (j.berjenjang) {
      baris = $$('#t-jenjang tr').map(tr => {
        const v = k => tr.querySelector(`[data-j="${k}"]`).value;
        return {
          kode, berlaku_mulai: mulai,
          batas_min: Number(v('min')) || 0,
          batas_maks: v('maks') === '' ? null : Number(v('maks')),
          nilai: Number(v('nilai')) || 0,
          catatan: $('#t-catatan').value.trim() || null
        };
      });
      const salah = baris.find(b => b.batas_maks !== null && b.batas_maks < b.batas_min);
      if (salah) { toast('Ada jenjang yang batas akhirnya lebih kecil dari batas awal.', true); return; }
      const kembar = baris.map(b => b.batas_min).filter((x, i, a) => a.indexOf(x) !== i);
      if (kembar.length) { toast('Ada dua jenjang dengan batas awal yang sama.', true); return; }
    } else {
      baris = [{ kode, berlaku_mulai: mulai, batas_min: null, batas_maks: null,
                 nilai: Number($('#t-nilai').value) || 0,
                 catatan: $('#t-catatan').value.trim() || null }];
    }

    tutupModal();
    jalankan('Menyimpan…', async () => {
      // Versi dengan tanggal berlaku yang sama ditulis ulang seluruhnya,
      // supaya jenjang yang dihapus di formulir ikut hilang.
      await buang('ip_tarif', `kode=eq.${enc(kode)}&berlaku_mulai=eq.${enc(mulai)}`);
      await simpanBaru('ip_tarif', baris);
      /* Bila versi barunya belum berlaku pada tanggal acuan, halaman akan
         tetap menampilkan versi lama dan besaran yang baru saja disimpan
         tampak hilang. Tanggal acuannya dipindahkan ke tanggal berlakunya,
         dan pemindahan itu disebut di pesan. */
      const acuanPindah = mulai > ui.acuan;
      if (acuanPindah) ui.acuan = mulai;
      await muatSemua();
      toast(`${j.nama}: besaran baru berlaku ${tglIndo(mulai)}`
        + (acuanPindah ? `. Tanggal acuan halaman dipindahkan ke ${tglIndo(mulai)} supaya besaran itu terlihat.` : ''));
    });
  };
}

function dialogRiwayat(kode) {
  const j = D.jenis.find(x => x.kode === kode);
  jalankan('Memuat riwayat…', async () => {
    const semua = await ambil('ip_tarif',
      `select=*&kode=eq.${enc(kode)}&order=berlaku_mulai.desc,batas_min.asc`);
    const perVersi = new Map();
    (semua || []).forEach(t => {
      if (!perVersi.has(t.berlaku_mulai)) perVersi.set(t.berlaku_mulai, []);
      perVersi.get(t.berlaku_mulai).push(t);
    });

    bukaModal(`<h2>Riwayat nominal — ${esc(j.nama)}</h2><div class="body">
      ${perVersi.size ? [...perVersi.entries()].map(([mulai, baris]) => `
        <div class="fg penuh"><label>Berlaku mulai ${esc(tglIndo(mulai))}${
          mulai <= ui.acuan ? '' : ' <span class="kecil">(belum berlaku pada tanggal acuan)</span>'}</label>
          <table class="log"><tbody>${baris.map(t => `<tr>
            <td class="kecil">${t.batas_min == null ? 'semua'
              : `${t.batas_min}${t.batas_maks == null ? ' ke atas' : '–' + t.batas_maks} ${esc(j.satuan_jenjang || '')}`}</td>
            <td style="text-align:right;font-weight:600">${rupiah(t.nilai)}</td></tr>`).join('')}</tbody></table>
          ${baris[0].catatan ? `<div class="hint">${esc(baris[0].catatan)}</div>` : ''}</div>`).join('')
        : '<p class="msg kecil">Belum ada besaran yang pernah disimpan.</p>'}
      </div>
      <div class="aksi"><button class="btn" id="m-batal">Tutup</button></div>`, true);
    $('#m-batal').onclick = tutupModal;
  });
}

/* ------------------------------------------------ kehadiran dan piket */
/* Kehadiran yang menjadi dasar pembiayaan, ditampilkan persis seperti di
   aplikasi asalnya: rekap Kehadiran Guru (tab Kehadiran Guru, Guru
   Pengganti, Wali Kelas, Piket — tanpa Hari Libur, yang memang diatur di
   sana) dan rekap Absensi Ekskul (per kegiatan, per pertemuan, per pembina
   — tanpa Per siswa, yang bukan urusan pembiayaan).

   Angkanya dihitung fungsi database (f_ip_kehadiran_*, f_ip_pengganti_rinci,
   f_ip_pelaksanaan_piket, f_ip_ekskul_pertemuan), bukan disalin dari
   rekap-hitung.js aplikasi Kehadiran Guru: dua salinan pasti menyimpang
   begitu salah satunya diperbaiki, dan bendahara akan membaca angka yang
   berbeda dari yang dibaca kurikulum. Yang dikerjakan di sini hanya
   menyaring, menjumlahkan, dan menggambar.                               */
const HADIR_TAB = {
  kehadiran: { nama: 'Kehadiran Guru', asal: 'guru' },
  pengganti: { nama: 'Guru Pengganti', asal: 'guru' },
  wali:      { nama: 'Wali Kelas',     asal: 'guru' },
  piket_meja:     { nama: 'Piket Meja Sekolah',      asal: 'guru' },
  piket_unit:     { nama: 'Piket Guru Diperbantukan', asal: 'guru' },
  piket_parkiran: { nama: 'Piket Parkiran',          asal: 'guru' },
  staf:      { nama: 'Kehadiran Staf', asal: 'guru' },
  kegiatan:  { nama: 'Per kegiatan',   asal: 'ekskul' },
  pertemuan: { nama: 'Per pertemuan',  asal: 'ekskul' },
  pembina:   { nama: 'Per pembina',    asal: 'ekskul' }
};
const KATEGORI_EKSKUL = ['Ekstrakurikuler', 'Pembinaan Imtaq', 'Pembinaan Kesiswaan'];
const HARI_NAMA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const STATUS_PEMBINA = { H: 'Hadir', TH: 'Tidak hadir', KG: 'Ditiadakan' };

function tglPanjang(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '—';
  return `${HARI_NAMA[new Date(iso + 'T00:00:00').getDay()]}, ${tglIndo(iso)}`;
}
const jamPendek = t => t ? String(t).slice(0, 5) : '';
const persenBulat = (a, b) => b ? Math.round(a / b * 100) : 0;
const persenDari = (hadir, terjadwal) => terjadwal ? Math.round(hadir / terjadwal * 10000) / 100 : null;
const fmtJam = v => { const n = Number(v) || 0; return n % 1 === 0 ? String(n) : n.toFixed(2).replace('.', ','); };
const fmtPersen = p => p == null ? '—' : Number(p).toFixed(2).replace('.', ',') + '%';
/* Ambang warnanya sama dengan aplikasi Kehadiran Guru: 95 % baik, 85 % sedang. */
const selPersen = p => p == null ? '—'
  : `<span class="persen ${p >= 95 ? 'baik' : p >= 85 ? 'sedang' : 'rendah'}">${fmtPersen(p)}</span>`;
const lencana = (kode, teks) => `<span class="lencana ${esc(String(kode).toLowerCase())}">${esc(teks || kode)}</span>`;
const jumlahkan = (baris, kunci) => baris.reduce((t, r) => {
  for (const k of kunci) t[k] = (t[k] || 0) + (Number(r[k]) || 0);
  return t;
}, {});
const bobotHadir = b => b.hadir_tm + b.httm + b.st * 0.2 + b.it * 0.1;

/* Ketujuh tab dimuat sekaligus untuk satu periode: enam permintaan yang
   berjalan serentak lebih ringan daripada satu permintaan tiap kali
   berpindah tab, dan sesudahnya berpindah tab tidak menunggu jaringan. */
async function muatHadir() {
  const arg = { p_awal: ui.hadirAwal, p_akhir: ui.hadirAkhir };
  const [hariKerja, kehadiran, wali, pengganti, piket, staf, sesi, ekskul] = await Promise.all([
    rpc('f_ip_hari_kerja', arg),
    rpc('f_ip_kehadiran_guru', arg),
    rpc('f_ip_kehadiran_wali', arg),
    rpc('f_ip_pengganti_rinci', arg),
    rpc('f_ip_pelaksanaan_piket', arg),
    rpc('f_ip_kehadiran_staf', arg),
    rpc('f_ip_ekskul_pertemuan', arg),
    ambil('ekskul', 'select=id,nama,pembina_id,kategori,hari,jam_mulai,aktif&order=id')
  ]);
  D.hadir = { awal: ui.hadirAwal, akhir: ui.hadirAkhir, hariKerja: (hariKerja || []).length,
              kehadiran: kehadiran || [], wali: wali || [], pengganti: pengganti || [],
              piket: piket || [], staf: staf || [], sesi: sesi || [], ekskul: ekskul || [] };
}

/* Tiap tab dijabarkan sebagai data — daftar kolom, baris, baris jumlah,
   keterangan — lalu digambar dan diunduh oleh satu penggambar dan satu
   penulis Excel yang sama, supaya berkas yang diunduh tidak pernah berbeda
   isi dari layar.
     kolom: { k, t, w, num, f (pemformat layar), html (sel utuh), xls (nilai
             Excel), fmt (numFmt Excel), lekat (dibekukan di kiri) }        */
function susunTabHadir(tab, h) {
  const q = ui.hadirSaring.trim().toLowerCase();
  const saring = baris => baris.filter(r => !q || String(r.nama || '').toLowerCase().includes(q));
  /* Pemegang tugas Staf disembunyikan secara bawaan pada rekap yang menjadi
     dasar honor tambahan (kehadiran guru, wali kelas, piket meja sekolah) —
     sama seperti Guru Mengajar di Honor dan Transpor. Kehadirannya tetap
     tercatat dan bisa ditampilkan lewat saklar di atas tabel. */
  const tanpaStaf = baris => ui.hadirIkutStaf ? baris : baris.filter(r => !r.staf);
  const periode = `${tglPanjang(h.awal)} – ${tglPanjang(h.akhir)}`;
  const angka = (k, t, w, f) => ({ k, t, w: w || 70, num: true, f });
  const kolPersen = (k, t) => ({ k, t: t || '% Kehadiran', w: 100, num: true, html: r => selPersen(r[k]), f: fmtPersen, fmt: '0.00' });

  if (tab === 'kehadiran') {
    const baris = saring(tanpaStaf(h.kehadiran));
    const total = jumlahkan(baris, ['kontrak', 'terjadwal', 'hadir_tm', 'httm', 'st', 'it', 'tk']);
    total.hadir = Math.round(bobotHadir(total) * 100) / 100;
    total.persen = persenDari(total.hadir, total.terjadwal);
    total.nama = `Total (${baris.length} guru)`;
    return {
      cari: 'Saring nama guru…', ringkas: `${h.hariKerja} hari kerja · ${periode}`,
      stafDisembunyikan: h.kehadiran.filter(r => r.staf).length,
      kolom: [
        { k: 'nama', t: 'Guru', lekat: true },
        // (+n) = jam Tugas Tambahan per minggu, sama seperti di Honor Mengajar.
        { k: 'kontrak', t: 'Kontrak Jam', w: 95, num: true,
          html: r => `${Number(r.kontrak) || 0}${Number(r.tambahan) > 0 ? ` <span class="kecil">(+${Number(r.tambahan)})</span>` : ''}`,
          xls: r => Number(r.tambahan) > 0 ? `${Number(r.kontrak) || 0} (+${Number(r.tambahan)})` : Number(r.kontrak) || 0 },
        angka('terjadwal', 'Terjadwal', 85), angka('hadir_tm', 'Hadir'), angka('httm', 'HTTM'),
        angka('st', 'ST', 55), angka('it', 'IT', 55), angka('tk', 'TK', 55),
        angka('hadir', 'Hadir (bobot)', 100, fmtJam), kolPersen('persen', '% Hadir')
      ],
      baris, total, kosong: 'Tidak ada data pada rentang ini.',
      catatan: 'Kontrak Jam = jam mengajar per minggu menurut jadwal KBM pada semester tanggal akhir rentang; '
             + '(+n) = jam Tugas Tambahan per minggu dari Data Induk, di luar jadwal KBM. '
             + 'Terjadwal = jam sepanjang rentang. Bobot kehadiran per status: HTTM 100% · ST 20% · IT 10% · TK 0%. % Hadir = (Hadir '
             + 'tatap muka + jumlah berbobot) ÷ Terjadwal. Sabtu–Minggu dan hari libur tidak dihitung '
             + 'sebagai hari kerja. Upacara dan Bimbingan Wali Kelas (Senin jam 1–2) tidak termasuk — '
             + 'lihat tab Wali Kelas.',
      judul: 'REKAP KEHADIRAN GURU', berkas: 'Rekap Kehadiran Guru', ttd: 'kurikulum'
    };
  }

  if (tab === 'pengganti') {
    /* Jam tugas wali kelas dikeluarkan dan hanya disebut jumlahnya —
       penggantiannya dibayar lewat jalur wali kelas. Ringkasan per guru
       pengganti disusun dari rinciannya, jadi keduanya tidak mungkin beda. */
    const rinci = h.pengganti.filter(r => !r.wali);
    const waliDikecualikan = h.pengganti.length - rinci.length;
    const tp = rinci.filter(r => r.kode === 'TP').length;
    const per = new Map();
    for (const r of rinci) {
      if (r.kode === 'TP' || !r.pengganti_id) continue;
      if (!per.has(r.pengganti_id)) per.set(r.pengganti_id, { nama: r.pengganti, GT: 0, PT: 0, Inf: 0, total: 0 });
      const b = per.get(r.pengganti_id);
      if (b[r.kode] !== undefined) b[r.kode] += 1;
      b.total += 1;
    }
    const ringkas = [...per.values()].sort((a, b) => b.total - a.total || a.nama.localeCompare(b.nama, 'id'));
    const total = jumlahkan(ringkas, ['GT', 'PT', 'Inf', 'total']);
    total.nama = `Total (${ringkas.length} guru pengganti)`;
    const dasar = {
      ringkas: `${total.total} jam digantikan · ${tp} jam tanpa pengganti (TP)`
             + (waliDikecualikan ? ` · ${waliDikecualikan} jam tugas wali kelas tidak termasuk` : ''),
      pilihan: [['ringkas', 'Per guru pengganti'], ['rinci', 'Rincian per jam']],
      catatan: 'GT = Guru diTugaskan · PT = Piket diTugaskan · Inf = Infaler · TP = Tidak Perlu Pengganti '
             + '(tidak masuk hitungan per guru). Penggantian jam Upacara dan Bimbingan Wali Kelas tidak termasuk.',
      kosong: 'Belum ada penugasan pada rentang ini.', ttd: 'kurikulum'
    };
    if (!ui.penggantiRinci) return { ...dasar,
      kolom: [{ k: 'nama', t: 'Guru Pengganti', lekat: true },
              angka('GT', 'GT', 55), angka('PT', 'PT', 55), angka('Inf', 'Inf', 55), angka('total', 'Total jam', 85)],
      baris: ringkas, total, judul: 'REKAP GURU PENGGANTI', berkas: 'Rekap Guru Pengganti' };
    return { ...dasar,
      kolom: [
        { k: 'tanggal', t: 'Tanggal', w: 105, f: tglIndo },
        { k: 'jam_ke', t: 'Jam', w: 75, f: v => 'Jam ke-' + v },
        { k: 'kelas', t: 'Kelas', w: 90 }, { k: 'mapel', t: 'Mata Pelajaran', w: 170 },
        { k: 'guru', t: 'Guru Tidak Hadir', w: 180 },
        { k: 'status', t: 'Ket', w: 70, html: r => lencana(r.status) },
        { k: 'pengganti', t: 'Guru Pengganti', w: 180, f: v => v || '—' },
        { k: 'kode', t: 'Status', w: 70, html: r => lencana(r.kode) }
      ],
      baris: rinci, total: null, judul: 'RINCIAN PENUGASAN GURU PENGGANTI', berkas: 'Rincian Guru Pengganti' };
  }

  if (tab === 'wali') {
    const baris = saring(tanpaStaf(h.wali));
    const total = jumlahkan(baris, ['terjadwal_upacara', 'hadir_upacara', 'terjadwal_bimbingan', 'hadir_bimbingan', 'terjadwal', 'hadir']);
    total.persen = persenDari(total.hadir, total.terjadwal);
    total.nama = `Total (${baris.length} wali kelas)`;
    return {
      cari: 'Saring nama wali kelas…', ringkas: `${h.hariKerja} hari kerja · ${periode}`,
      stafDisembunyikan: h.wali.filter(r => r.staf).length,
      kelompok: [{ n: 1 }, { t: 'Upacara (jam)', n: 2 }, { t: 'Bimbingan WK (jam)', n: 2 }, { n: 1 }],
      kolom: [
        { k: 'nama', t: 'Wali Kelas', lekat: true },
        angka('terjadwal_upacara', 'Terjadwal', 85), angka('hadir_upacara', 'Hadir'),
        angka('terjadwal_bimbingan', 'Terjadwal', 85), angka('hadir_bimbingan', 'Hadir'),
        kolPersen('persen')
      ],
      baris, total, kosong: 'Tidak ada jam tugas wali kelas pada rentang ini.',
      catatan: 'Upacara & Bimbingan Wali Kelas, Senin jam 1–2 — direkap terpisah dari jam mengajar. '
             + 'Terjadwal dihitung sepanjang rentang tanggal: tiap wali kelas 1 jam Upacara dan 1 jam '
             + 'Bimbingan setiap Senin, jadi dua Senin berarti 2 jam di tiap kolom. Ketidakhadiran yang '
             + 'berstatus (sakit, ijin, HTTM) tidak masuk kolom Hadir, tetapi tetap dihitung berbobot '
             + 'pada % Kehadiran, dengan bobot dan rumus yang sama seperti rekap kehadiran. Di '
             + 'Honor dan Transpor, honor wali kelas angkanya per minggu, karena honornya dibayarkan bulanan '
             + 'atas dasar jam kontrak itu.',
      judul: 'REKAP TUGAS WALI KELAS', berkas: 'Rekap Tugas Wali Kelas', ttd: 'kurikulum'
    };
  }

  if (tab === 'piket_meja' || tab === 'piket_unit' || tab === 'piket_parkiran') {
    /* Tiga jenis piket, tiga tab, dari satu fungsi database. Satuannya
       mengikuti jadwalnya: JAM untuk meja sekolah dan unit, HARI untuk
       parkiran. Hanya meja sekolah yang punya saklar staf: di situlah tugas
       Staf menggugurkan transportnya; petugas parkiran justru staf. */
    const J = {
      piket_meja: { p: 'meja', nama: 'Meja Sekolah', satuan: 'jam', staf: true, ttd: 'kurikulum',
        kosong: 'Belum ada jadwal maupun catatan piket meja sekolah pada rentang ini. Dicatat di Kehadiran Guru → Pelaksanaan Piket.' },
      piket_unit: { p: 'unit', nama: 'Guru Diperbantukan', satuan: 'jam', staf: false, ttd: 'kurikulum',
        kosong: 'Belum ada jadwal maupun catatan piket unit pada rentang ini. Jadwal unitnya di Data Induk → Jadwal Piket, pelaksanaannya di Kehadiran Guru → Pelaksanaan Piket.' },
      piket_parkiran: { p: 'parkiran', nama: 'Parkiran', satuan: 'hari', staf: false, ttd: 'kesiswaan',
        kosong: 'Belum ada jadwal maupun catatan piket parkiran pada rentang ini. Rosternya di Data Induk → Jadwal Piket.' }
    }[tab];
    const semua = h.piket
      .filter(r => Number(r[J.p + '_terjadwal']) > 0 || Number(r[J.p + '_jaga']) > 0)
      .map(r => ({ ...r, terjadwal: r[J.p + '_terjadwal'], jaga: r[J.p + '_jaga'],
                   persen: persenDari(r[J.p + '_jaga'], r[J.p + '_terjadwal']) }));
    const baris = saring(J.staf ? tanpaStaf(semua) : semua);
    const total = jumlahkan(baris, ['terjadwal', 'jaga']);
    total.persen = persenDari(total.jaga, total.terjadwal);
    total.nama = `Total (${baris.length} petugas)`;
    return {
      cari: 'Saring nama petugas…', ringkas: `${h.hariKerja} hari kerja · ${periode}`,
      stafDisembunyikan: J.staf ? semua.filter(r => r.staf).length : null,
      kolom: [
        { k: 'nama', t: 'Nama', lekat: true },
        angka('terjadwal', `Terjadwal (${J.satuan})`, 115), angka('jaga', `Jaga (${J.satuan})`, 90), kolPersen('persen')
      ],
      baris, total, kosong: J.kosong,
      catatan: `Piket ${J.nama} dihitung per ${J.satuan === 'jam' ? 'JAM pelajaran' : 'HARI jaga'}`
             + (J.p === 'parkiran' ? ' — parkiran memang bukan jam pelajaran, melainkan sekali jaga sesudah bel pulang.' : '.')
             + ' "Terjadwal" dihitung dari jadwal piket pada hari kerja dalam rentang ini, di luar hari libur; '
             + '"Jaga" adalah yang benar-benar dijalankan; "% Kehadiran" = Jaga ÷ Terjadwal. Piket tidak mengenal '
             + 'pengganti, jadi selisih antara keduanya berarti petugasnya tidak hadir, atau gilirannya belum '
             + 'dicatat. Nilai rupiahnya ada di Honor dan Transpor.',
      judul: `REKAP PELAKSANAAN PIKET ${J.nama.toUpperCase()}`, berkas: `Rekap Piket ${J.nama}`, ttd: J.ttd
    };
  }

  if (tab === 'staf') {
    /* Hari hadir tenaga kependidikan yang honornya bergantung kedatangan.
       Dicatat di Kehadiran Guru → Kehadiran Staf; hari kerja tiap orang
       mengikuti ketentuan Jam Kerja Staf di Data Induk, jadi bisa berbeda
       antar orang (ada yang bekerja Sabtu). */
    const POLA = { bulanan: 'bulanan', bulanan_harian: 'bulanan + insentif kedatangan', harian: 'upah harian' };
    const baris = saring(h.staf).map(r => ({ ...r, pola: POLA[r.pola_honor] || r.pola_honor || '—',
      persen: persenDari(r.hadir, r.hari_kerja) }));
    const total = jumlahkan(baris, ['hari_kerja', 'hadir', 'tidak_hadir', 'belum', 'terlambat']);
    total.persen = persenDari(total.hadir, total.hari_kerja);
    total.nama = `Total (${baris.length} staf)`;
    return {
      cari: 'Saring nama staf…', ringkas: periode,
      kolom: [
        { k: 'nama', t: 'Nama', lekat: true },
        { k: 'jabatan', t: 'Jabatan', w: 140, f: v => v || '—' },
        { k: 'pola', t: 'Pola honor', w: 190, html: r => `${esc(r.pola)}${
            r.sumber_hadir === 'fingerprint' ? ' <span class="kecil">fingerprint</span>' : ''}` },
        angka('hari_kerja', 'Hari kerja', 85), angka('hadir', 'Hadir'), angka('tidak_hadir', 'Tidak hadir', 85),
        angka('belum', 'Belum dicatat', 95), angka('terlambat', 'Terlambat', 80),
        kolPersen('persen', '% Hadir')
      ],
      baris, total,
      kosong: 'Belum ada staf yang hari hadirnya perlu dicatat, atau belum ada catatan pada rentang ini.',
      catatan: 'Hanya staf berpola honor bulanan + insentif kedatangan atau upah harian; staf berpola '
             + 'bulanan murni tidak bergantung hari hadir. Hari kerja dihitung dari ketentuan Jam Kerja '
             + 'Staf di Data Induk untuk tiap orang, di luar hari libur sekolah. "Belum dicatat" adalah '
             + 'hari kerja yang belum punya catatan — bukan tidak hadir. Terlambat = jam masuk tercatat '
             + 'lebih lambat dari ketentuan. Dicatat di Kehadiran Guru → Kehadiran Staf, manual atau dari '
             + 'rekaman fingerprint.',
      judul: 'REKAP KEHADIRAN STAF', berkas: 'Rekap Kehadiran Staf', ttd: 'kurikulum'
    };
  }

  /* ---- Absensi Ekskul: ketiga tab berbagi penyaring kategori dan ringkasan ---- */
  const kat = ui.ekskulKategori;
  const kategoriDari = e => (e && e.kategori) || 'Ekstrakurikuler';
  const ekskul = h.ekskul.filter(e => !kat || kategoriDari(e) === kat);
  const boleh = new Set(ekskul.map(e => e.id));
  const sesi = h.sesi.filter(s => boleh.has(s.ekskul_id));
  const perKegiatan = ekskul.map(e => {
    const s = sesi.filter(x => x.ekskul_id === e.id);
    const terlaksana = s.filter(x => x.status_pembina !== 'KG');
    const hadir = terlaksana.reduce((a, x) => a + x.h, 0);
    const slot = terlaksana.reduce((a, x) => a + x.h + x.s + x.i + x.a, 0);
    return {
      id: e.id, nama: e.nama, kategori: kategoriDari(e),
      pembina: (s[0] && s[0].pembina) || '—',
      jadwal: `${e.hari || ''} ${jamPendek(e.jam_mulai)}`.trim(),
      pertemuan: s.length, terlaksana: terlaksana.length,
      pHadir: s.filter(x => x.status_pembina === 'H').length,
      pTidak: s.filter(x => x.status_pembina === 'TH').length,
      pLibur: s.filter(x => x.status_pembina === 'KG').length,
      hadirSiswa: hadir,
      rata: terlaksana.length ? Math.round(hadir / terlaksana.length) : 0,
      tingkat: persenBulat(hadir, slot),
      foto: s.filter(x => x.foto).length
    };
  }).filter(b => b.pertemuan > 0);

  const tot = jumlahkan(perKegiatan, ['pertemuan', 'terlaksana', 'pHadir', 'hadirSiswa', 'foto']);
  const belum = ekskul.filter(e => e.aktif !== false && !perKegiatan.some(x => x.id === e.id)).length;
  const kartu = (a, b) => `<div class="kartu"><b>${esc(a)}</b><span>${esc(b)}</span></div>`;
  const ringkasan = !sesi.length ? '' : `<div class="kartu-baris">
    ${kartu(`${tot.pertemuan} pertemuan`, `${tot.terlaksana} terlaksana · ${tot.pertemuan - tot.terlaksana} ditiadakan`)}
    ${kartu(`${persenBulat(tot.pHadir, tot.pertemuan)}% pembina hadir`, `${tot.pHadir} dari ${tot.pertemuan} pertemuan dihadiri pembinanya`)}
    ${kartu(`${tot.hadirSiswa} kehadiran siswa`, `rata-rata ${tot.terlaksana ? Math.round(tot.hadirSiswa / tot.terlaksana) : 0} siswa per pertemuan`)}
    ${kartu(`${tot.foto} berfoto`, `${tot.pertemuan - tot.foto} laporan belum melampirkan foto`)}
    ${belum ? kartu(`${belum} tanpa catatan`, 'kegiatan yang tidak punya satu pun laporan') : ''}
  </div>`;
  const ekskulDasar = { ringkasan, kategori: true, ttd: 'kesiswaan',
    ringkas: `${periode}${kat ? ' · hanya ' + kat : ''}`,
    kosong: 'Tidak ada pertemuan pada rentang ini.' };

  if (tab === 'kegiatan') {
    const total = { ...tot, nama: 'Jumlah', rata: null, tingkat: null };
    total.pTidak = perKegiatan.reduce((a, x) => a + x.pTidak, 0);
    return { ...ekskulDasar,
      kolom: [
        { k: 'nama', t: 'Kegiatan', lekat: true, html: r => `<b>${esc(r.nama)}</b>${
            r.kategori !== 'Ekstrakurikuler' ? `<div class="kecil">${esc(r.kategori)}</div>` : ''}` },
        { k: 'pembina', t: 'Pembina', w: 160 }, { k: 'jadwal', t: 'Jadwal', w: 100 },
        angka('pertemuan', 'Pertemuan', 85), angka('terlaksana', 'Terlaksana', 85),
        angka('pHadir', 'Pembina hadir', 95), angka('pTidak', 'Tidak hadir', 85),
        angka('hadirSiswa', 'Siswa hadir', 85), angka('rata', 'Rata-rata', 80),
        { k: 'tingkat', t: 'Tingkat hadir', w: 90, num: true, f: v => v + '%', fmt: '0"%"' },
        angka('foto', 'Berfoto', 70)
      ],
      baris: perKegiatan, total,
      catatan: 'Jumlah pertemuan, kehadiran pembina, dan kehadiran siswa pada rentang tanggal yang dipilih. '
             + 'Tingkat hadir = siswa hadir ÷ seluruh catatan kehadiran pada pertemuan yang terlaksana.',
      judul: 'REKAP KEGIATAN EKSTRAKURIKULER DAN PEMBINAAN', berkas: 'Rekap Kegiatan Ekskul' };
  }

  if (tab === 'pertemuan') {
    return { ...ekskulDasar,
      kolom: [
        { k: 'tanggal', t: 'Tanggal', w: 105, f: tglIndo },
        { k: 'ekskul', t: 'Kegiatan', w: 170 },
        { k: 'status_pembina', t: 'Pembina', w: 110,
          html: r => lencana(r.status_pembina, STATUS_PEMBINA[r.status_pembina] || r.status_pembina),
          xls: r => STATUS_PEMBINA[r.status_pembina] || r.status_pembina },
        angka('h', 'Hadir', 60), angka('s', 'S', 50), angka('i', 'I', 50), angka('a', 'A', 50),
        { k: 'foto', t: 'Foto', w: 70, html: r => r.foto
            ? `<a href="${esc(r.foto)}" target="_blank" rel="noopener"><img class="foto-mini" src="${esc(r.foto)}" alt="Foto kegiatan"></a>`
            : '<span class="kecil">—</span>', xls: r => r.foto || '' },
        { k: 'materi', t: 'Materi', w: 220, f: v => v || '' }
      ],
      baris: sesi, total: null,
      catatan: 'Urut menurut tanggal, lengkap dengan foto kegiatan yang dilampirkan pembina. '
             + 'S = sakit, I = izin, A = tanpa keterangan.',
      judul: 'RINCIAN PERTEMUAN EKSTRAKURIKULER DAN PEMBINAAN', berkas: 'Rincian Pertemuan Ekskul' };
  }

  /* Per pembina: satu baris satu pertemuan yang benar-benar berjalan dan
     dihadiri pembinanya, dikelompokkan per kegiatan menurut nama pembina —
     bentuk yang dipakai perhitungan transport. */
  const baris = [];
  let no = 0;
  const urut = [...ekskul].sort((a, b) => {
    const pa = (sesi.find(x => x.ekskul_id === a.id) || {}).pembina || '';
    const pb = (sesi.find(x => x.ekskul_id === b.id) || {}).pembina || '';
    return pa.localeCompare(pb, 'id') || a.nama.localeCompare(b.nama, 'id');
  });
  for (const e of urut) {
    const s = sesi.filter(x => x.ekskul_id === e.id && x.status_pembina === 'H');
    if (!s.length) continue;
    no++;
    s.forEach((x, i) => {
      const peserta = x.h + x.s + x.i + x.a;
      baris.push({ no: i === 0 ? no : '', ekskul: i === 0 ? e.nama : '', pembina: i === 0 ? (x.pembina || '—') : '',
                   ekskulPenuh: e.nama, pembinaPenuh: x.pembina || '—', awal: i === 0,
                   tanggal: x.tanggal, hadir: x.h, peserta, persen: persenBulat(x.h, peserta) });
    });
  }
  return { ...ekskulDasar, tanpaNomor: true, barisKelas: r => r.awal ? 'awal-kelompok' : '',
    kolom: [
      { k: 'no', t: 'No.', w: 45, num: true, f: v => v === '' ? '' : String(v) },
      { k: 'ekskul', t: 'Kegiatan', w: 170, xls: r => r.ekskulPenuh },
      { k: 'pembina', t: 'Pembina', w: 160, xls: r => r.pembinaPenuh },
      { k: 'tanggal', t: 'Pertemuan', w: 170, f: tglPanjang },
      angka('hadir', 'Kehadiran Siswa', 100), angka('peserta', 'Peserta', 70),
      { k: 'persen', t: '% Kehadiran', w: 90, num: true, f: v => v + '%', fmt: '0"%"' }
    ],
    baris, total: baris.length ? { ekskul: 'Jumlah', tanggal: `${baris.length} pertemuan`,
                                   hadir: baris.reduce((a, x) => a + x.hadir, 0), persen: null } : null,
    kosong: 'Tidak ada pertemuan yang berjalan pada rentang ini.',
    catatan: 'Satu baris satu pertemuan yang benar-benar berjalan dan dihadiri pembinanya, diurutkan '
           + 'menurut nama pembina. Pertemuan yang ditiadakan dan yang pembinanya tidak hadir tidak ikut '
           + 'dihitung. Bentuk inilah yang dipakai perhitungan transport pembina di Honor dan Transpor.',
    judul: 'REKAP PERTEMUAN PER PEMBINA', berkas: 'Rekap Per Pembina' };
}

/* Nilai satu sel di layar. */
function selHadir(b, k) {
  if (k.html) return k.html(b);
  const v = b[k.k];
  if (k.f) return esc(k.f(v));
  if (k.num) return v == null ? '—' : esc(fmtJam(v));
  return v == null ? '—' : esc(String(v));
}

function tabelHadir(isi) {
  const nomor = !isi.tanpaNomor;
  const th = (k, extra = '') => `<th style="width:${k.w || 80}px" class="${k.num ? 'num' : ''}${k.lekat ? ' lekat' : ''}"${extra}>${esc(k.t)}</th>`;
  let kepala;
  if (isi.kelompok) {
    let i = 0, atas = nomor ? '<th rowspan="2" style="width:40px" class="num lekat-no">No</th>' : '', bawah = '';
    for (const g of isi.kelompok) {
      const ks = isi.kolom.slice(i, i + g.n); i += g.n;
      if (!g.t) atas += th(ks[0], ' rowspan="2"');
      else { atas += `<th colspan="${g.n}" class="kelompok">${esc(g.t)}</th>`; bawah += ks.map(k => th(k)).join(''); }
    }
    kepala = `<tr>${atas}</tr><tr>${bawah}</tr>`;
  } else {
    kepala = `<tr>${nomor ? '<th style="width:40px" class="num lekat-no">No</th>' : ''}${isi.kolom.map(k => th(k)).join('')}</tr>`;
  }
  const lebar = isi.kolom.length + (nomor ? 1 : 0);
  const sel = (k, isiSel, tebal) => `<td class="${k.num ? 'num' : ''}${k.lekat ? ' lekat nama' : ''}"${tebal ? ' style="font-weight:600"' : ''}>${isiSel}</td>`;
  // Pemegang tugas Staf diberi penanda pada kolom nama, seperti di Honor dan Transpor.
  const tagStaf = (b, k) => k.lekat && b.staf ? ' <span class="tag tag-l">Staf</span>' : '';
  const badan = isi.baris.length ? isi.baris.map((b, i) => `<tr${isi.barisKelas ? ` class="${isi.barisKelas(b)}"` : ''}>
      ${nomor ? `<td class="num lekat-no">${i + 1}</td>` : ''}
      ${isi.kolom.map(k => sel(k, selHadir(b, k) + tagStaf(b, k), k.lekat)).join('')}</tr>`).join('')
    : `<tr><td colspan="${lebar}"><div class="empty"><b>Tidak ada data</b>${esc(isi.kosong || '')}</div></td></tr>`;
  const kaki = isi.total && isi.baris.length ? `<tfoot><tr>
      ${nomor ? '<td class="num lekat-no"></td>' : ''}
      ${isi.kolom.map(k => {
        const v = isi.total[k.k];
        const teks = v === undefined ? '' : v === null ? '—'
                   : (k.lekat || !k.num) ? esc(String(v))
                   : k.html ? k.html(isi.total) : k.f ? esc(k.f(v)) : esc(fmtJam(v));
        return sel(k, teks, true);
      }).join('')}</tr></tfoot>` : '';
  return `<table class="rekap hadir"><thead>${kepala}</thead><tbody>${badan}</tbody>${kaki}</table>`;
}

function halHadir() {
  const h = D.hadir;
  const spek = HADIR_TAB[ui.hadirTab];
  const isi = h ? susunTabHadir(ui.hadirTab, h) : null;
  const chip = ([k, v]) => `<button class="chip${k === ui.hadirTab ? ' on' : ''}" data-hadir="${k}">${esc(v.nama)}</button>`;
  const berubah = h && (h.awal !== ui.hadirAwal || h.akhir !== ui.hadirAkhir);

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Kehadiran dan Piket</h1>
      <p>Kehadiran yang menjadi dasar pembiayaan, dibaca dari aplikasi tempat kehadirannya
         dicatat — halaman ini tidak mencatat apa pun. Bila ada yang keliru, perbaikannya di
         Kehadiran Guru atau Absensi Ekskul.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih">
        <label class="kecil">Dari</label>
        <input class="field" type="date" id="hAwal" value="${esc(ui.hadirAwal)}" style="width:auto">
        <label class="kecil">sampai</label>
        <input class="field" type="date" id="hAkhir" value="${esc(ui.hadirAkhir)}" style="width:auto">
        <span class="kecil" id="hBerubah" style="color:var(--warn)"${berubah ? '' : ' hidden'}>Rentang berubah</span>
        <button class="btn btn-p" id="hHitung">Hitung</button>
      </div></div>

    <div class="bar"><span class="label">Kehadiran Guru</span>
      ${Object.entries(HADIR_TAB).filter(([, v]) => v.asal === 'guru').map(chip).join('')}
      <span class="label" style="margin-left:14px">Absensi Ekskul</span>
      ${Object.entries(HADIR_TAB).filter(([, v]) => v.asal === 'ekskul').map(chip).join('')}
    </div>

    ${!h ? `<div class="panel"><div class="empty"><b>Belum dihitung</b>
      Pilih periodenya lalu ketuk Hitung.</div></div>` : `
    ${isi.ringkasan || ''}
    ${isi.stafDisembunyikan ? `<div class="info-box"><b>${isi.stafDisembunyikan} pemegang tugas Staf
      ${ui.hadirIkutStaf ? 'ikut ditampilkan' : 'disembunyikan'}.</b>
      Tugas Staf menggugurkan honor tambahan, jadi rekap ini bawaannya hanya menampilkan yang
      berhak honor. Kehadiran stafnya tetap tercatat di aplikasi asalnya dan bisa ditampilkan.
      <button class="btn btn-sm" id="hStaf" style="margin-left:8px">${
        ui.hadirIkutStaf ? 'Kecualikan lagi' : 'Tampilkan juga'}</button></div>` : ''}
    <div class="panel"><div class="panel-head"><h3>${esc(spek.nama)}</h3>
      ${isi.pilihan ? `<div class="pg">${isi.pilihan.map(([k, t]) =>
        `<button data-pilih="${k}" class="${(k === 'rinci') === ui.penggantiRinci ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>` : ''}
      ${isi.kategori ? `<select class="field sempit" id="hKategori"><option value="">Semua kategori</option>${
        KATEGORI_EKSKUL.map(k => `<option${k === ui.ekskulKategori ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>` : ''}
      ${isi.cari ? `<input class="field sempit" type="search" id="hCari" placeholder="${esc(isi.cari)}" value="${esc(ui.hadirSaring)}" autocomplete="off">` : ''}
      <div class="sp" style="flex:1"></div>
      <div class="info">${esc(isi.ringkas)}</div>
      <button class="btn btn-sm" id="hUnduh" style="margin-left:10px">Unduh (xlsx)</button></div>
      <div class="gulir-petunjuk">Geser mendatar bila tabel lebih lebar dari layar. Kolom pertama tetap terlihat saat digeser.</div>
      <div class="scroll" id="hTabel">${tabelHadir(isi)}</div>
      ${isi.catatan ? `<div class="foot"><div class="info">${esc(isi.catatan)}</div></div>` : ''}
    </div>`}`;

  /* Tanggal yang diubah tetapi belum dihitung adalah jebakan: angka di layar
     masih milik rentang lama sementara tanggal di atasnya sudah baru. Penanda
     "Rentang berubah" menyala sampai rekapnya benar-benar dihitung ulang. */
  const tandai = () => {
    ui.hadirAwal = $('#hAwal').value || ui.hadirAwal;
    ui.hadirAkhir = $('#hAkhir').value || ui.hadirAkhir;
    $('#hBerubah').hidden = !h || (h.awal === ui.hadirAwal && h.akhir === ui.hadirAkhir);
  };
  $('#hAwal').onchange = tandai;
  $('#hAkhir').onchange = tandai;
  $('#hHitung').onclick = () => {
    tandai();
    if (ui.hadirAwal > ui.hadirAkhir) { toast('Tanggal awal melewati tanggal akhir.', true); return; }
    jalankan('Memuat kehadiran…', muatHadir);
  };
  $$('[data-hadir]').forEach(b => b.onclick = () => {
    ui.hadirTab = b.dataset.hadir; ui.hadirSaring = '';
    if (!D.hadir) jalankan('Memuat kehadiran…', muatHadir); else gambar();
  });
  $$('[data-pilih]').forEach(b => b.onclick = () => { ui.penggantiRinci = b.dataset.pilih === 'rinci'; gambar(); });
  if ($('#hStaf')) $('#hStaf').onclick = () => { ui.hadirIkutStaf = !ui.hadirIkutStaf; gambar(); };
  if ($('#hKategori')) $('#hKategori').onchange = e => { ui.ekskulKategori = e.target.value; gambar(); };
  // Menyaring nama menggambar ulang tabelnya saja, supaya kotak isiannya tidak kehilangan fokus.
  if ($('#hCari')) $('#hCari').oninput = e => {
    ui.hadirSaring = e.target.value;
    $('#hTabel').innerHTML = tabelHadir(susunTabHadir(ui.hadirTab, D.hadir));
  };
  if ($('#hUnduh')) $('#hUnduh').onclick = () => jalankan('Menyiapkan berkas…', () => unduhHadir(isi));
}

/* ------------------------------------------------------ rekapitulasi */
/* Kelima rekap berbentuk sama: satu fungsi database, satu daftar kolom.
   Ditulis sebagai data, bukan lima halaman yang mirip-mirip — menambah rekap
   keenam kelak cukup menambah satu baris di sini.                        */
const REKAP = {
  /* Susunan tabnya PER PENERIMA, bukan per jenis tarif (keputusan 22
     September 2026): gabungan paling depan karena itulah dasar daftar
     pembayaran, lalu satu tab untuk tiap golongan penerima. Tiap tab satu
     fungsi database, satu daftar kolom; menambah tab kelak cukup menambah
     satu entri di sini. `saring` menyaring baris hasil fungsi yang dipakai
     dua tab sekaligus (transport pembina: ekskul lawan Tahfidz). */
  gabungan: {
    nama: 'Gabungan per Guru',
    fungsi: 'f_ip_rekap_gabungan',
    judul: 'REKAPITULASI PEMBIAYAAN PER PENERIMA',
    catatan: 'Menjumlahkan seluruh jenis pembiayaan menjadi satu baris per orang, kolomnya mengikuti '
           + 'tab di halaman ini. Pembina ekstrakurikuler yang juga guru sekolah digabung ke baris '
           + 'gurunya, sehingga seorang yang menerima dari beberapa jalur tetap muncul satu kali; '
           + 'pelatih dari luar berdiri sendiri. Namanya memakai ejaan data induk. '
           + 'Yang tidak menerima apa pun pada periode ini tidak dicetak.',
    kolom: [
      { k: 'jenis_orang', t: 'Jenis', w: 120, jumlah: false },
      // s = kolom nominal seandainya (staf), ditampilkan kecil di bawah angka yang dibayar.
      { k: 'mengajar', t: 'Honor Mengajar', w: 130, rp: true, s: 'mengajar_s' },
      { k: 'wali', t: 'Honor Wali Kelas', w: 130, rp: true, s: 'wali_s' },
      { k: 'diperbantukan', t: 'Honor Diperbantukan', w: 140, rp: true },
      { k: 'piket_meja', t: 'Transpor Piket Meja', w: 135, rp: true, s: 'piket_meja_s' },
      { k: 'pengganti', t: 'Transpor Pengganti', w: 135, rp: true },
      { k: 'osis', t: 'Honor Pembina OSIS', w: 140, rp: true },
      { k: 'ekskul', t: 'Transpor Pemb. Ekskul', w: 145, rp: true },
      { k: 'tahfidz', t: 'Transpor Pemb. Tahfidz', w: 150, rp: true },
      { k: 'parkiran', t: 'Transpor Parkiran', w: 130, rp: true },
      { k: 'bpjs', t: 'Tunj. TuSehat', w: 140, rp: true },
      { k: 'bpjs_tk', t: 'Tunj. TuKerja', w: 165, rp: true }
    ]
  },
  mengajar: {
    nama: 'Guru Mengajar',
    fungsi: 'f_ip_honor_mengajar',
    judul: 'DAFTAR PENERIMAAN HONOR MENGAJAR',
    catatan: 'Jam yang dibayar adalah jam kontrak per minggu, tidak dikalikan jumlah pekan — '
           + 'honor dan transport memang dibayarkan bulanan atas dasar kontrak itu. Yang dikalikan '
           + 'hari hanyalah jam tatap muka dan hari kedatangan. Upacara dan Bimbingan Wali Kelas '
           + 'tidak termasuk jam mengajar. Pemegang tugas Staf berhonor nol — kecuali yang jam '
           + 'mengajarnya dinyatakan di luar tupoksi di Data Induk → Tugas Guru: honor dan transport '
           + 'berdirinya dibayar, insentif dan konsumsinya tetap tidak karena lewat fingerprint. '
           + '(+n) di kolom Jam adalah guru dengan Tugas Tambahan: n jam tambahan mengajar per minggu, '
           + 'dari Data Induk → Tugas Guru, sudah termasuk dalam jumlah jamnya.',
    kolom: [
      { k: 'masa_kerja', t: 'M.Kerja', w: 70, num: true, jumlah: false },
      // Guru bertugas tambahan: jam tambahannya disebut kecil di samping
      // jumlah jam, supaya terlihat kenapa jamnya melebihi jadwal KBM.
      { k: 'jam_dibayar', t: 'Jam', w: 70, num: true,
        html: b => `${Number(b.jam_dibayar) || 0}${Number(b.jam_tambahan) > 0
          ? ` <span class="kecil">(+${Number(b.jam_tambahan)})</span>` : ''}` },
      { k: 'tarif_jam', t: 'Nominal/jam', w: 105, rp: true, jumlah: false },
      { k: 'honor_guru', t: 'Honor Mengajar', w: 125, rp: true },
      { k: 'transport', t: 'Transpor Berdiri', w: 125, rp: true },
      { k: 'jam_tm', t: 'Jam TM', w: 65, num: true },
      { k: 'insentif', t: 'Insentif Tatap Muka', w: 135, rp: true },
      { k: 'hari_datang', t: 'Hari', w: 55, num: true },
      { k: 'konsumsi', t: 'Konsumsi Kedatangan', w: 140, rp: true }
    ]
  },
  wali: {
    nama: 'Wali Kelas',
    fungsi: 'f_ip_honor_wali_kelas',
    judul: 'DAFTAR PENERIMAAN HONOR WALI KELAS',
    catatan: 'Honor Wali Kelas FLAT per bulan untuk tiap wali kelas yang tugasnya aktif pada periode; '
           + 'jumlah bulan dihitung dari bulan kalender yang lebih dari setengah harinya masuk rentang. '
           + 'Upacara dan Bimbingan Wali Kelas dibayar per JAM HADIR tatap muka dalam rentang — angka '
           + 'yang sama dengan kolom Hadir pada tab Wali Kelas di Kehadiran dan Piket dan di Rekapitulasi '
           + 'Kehadiran aplikasi Kehadiran Guru. Wali kelas yang tidak hadir upacara tidak menerima honor '
           + 'jam itu; HTTM, sakit, dan ijin tidak dibayar. Piket meja sekolah wali kelas tidak di sini: '
           + 'dibayar per jam jaga di daftar Piket Meja Sekolah. Pemegang tugas Staf ditampilkan dengan '
           + 'honor nol.',
    kolom: [
      { k: 'honor_bulanan', t: 'Honor Wali Kelas', w: 130, rp: true },
      { k: 'jam_upacara', t: 'Jam Hadir Upacara', w: 115, num: true },
      { k: 'honor_upacara', t: 'Honor Upacara', w: 125, rp: true },
      { k: 'jam_bimbingan', t: 'Jam Hadir Bimbingan', w: 125, num: true },
      { k: 'honor_bimbingan', t: 'Honor Bimbingan WK', w: 140, rp: true }
    ]
  },
  /* Honor penanggung jawab unit (flat per bulan) dan transport piket unit
     (per jam jaga) dalam satu daftar, satu baris per unit yang dipegang. */
  diperbantukan: {
    nama: 'Guru Diperbantukan',
    fungsi: 'f_ip_honor_diperbantukan',
    judul: 'DAFTAR PENERIMAAN HONOR DAN TRANSPOR GURU DIPERBANTUKAN',
    catatan: 'Honor FLAT per bulan untuk tiap unit yang dipegang (tugas Diperbantukan yang aktif di '
           + 'Data Induk → Tugas Guru); jumlah bulan dihitung dari bulan kalender yang LEBIH DARI '
           + 'SETENGAH harinya masuk rentang. Transport dihitung per JAM jaga unit yang tercatat Hadir '
           + 'di Kehadiran Guru → Pelaksanaan Piket, per penugasan. Pemegang tugas Staf: honor nol, '
           + 'transportnya tetap dihitung.',
    kolom: [
      { k: 'unit', t: 'Unit', w: 210, jumlah: false },
      { k: 'honor', t: 'Honor Diperbantukan', w: 140, rp: true },
      { k: 'jam_jaga', t: 'Jam jaga', w: 80, num: true },
      { k: 'tarif_jam', t: 'Nominal/jam', w: 105, rp: true, jumlah: false },
      { k: 'transport', t: 'Transpor Piket Unit', w: 135, rp: true }
    ]
  },
  piket_meja: {
    nama: 'Piket Meja Sekolah', fungsi: 'f_ip_transport_piket',
    arg: { p_jenis: 'Meja Sekolah' },
    judul: 'DAFTAR PENERIMAAN TRANSPORT PIKET MEJA SEKOLAH',
    catatan: 'Yang dibayar adalah petugas terjadwal yang benar-benar berjaga. Piket tidak mengenal '
           + 'pengganti: bila petugasnya berhalangan, gilirannya memang tidak dijaga. Dihitung per JAM '
           + 'pelajaran. Pemegang tugas Staf tidak dihitung di sini: kehadirannya sudah masuk kontrak '
           + 'jam kerja lewat fingerprint, jadi membayarnya lagi berarti dua kali.',
    kolom: [
      { k: 'ukuran', t: 'Jam jaga', w: 85, num: true },
      { k: 'tarif', t: 'Nominal/jam', w: 110, rp: true, jumlah: false }
    ]
  },
  pengganti: {
    nama: 'Guru Pengganti',
    fungsi: 'f_ip_honor_pengganti',
    judul: 'DAFTAR PENERIMAAN TRANSPORT GURU PENGGANTI',
    catatan: 'Satu baris penugasan sama dengan satu jam pelajaran. GT = Guru diTugaskan, '
           + 'PT = Piket diTugaskan, Inf = Infaler. Penggantian jam Upacara dan Bimbingan Wali '
           + 'Kelas tidak termasuk; itu dibayar lewat jalur wali kelas.',
    kolom: [
      { k: 'jam_gt', t: 'GT', w: 55, num: true },
      { k: 'honor_gt', t: 'Transpor GT', w: 115, rp: true },
      { k: 'jam_pt', t: 'PT', w: 55, num: true },
      { k: 'honor_pt', t: 'Transpor PT', w: 115, rp: true },
      { k: 'jam_inf', t: 'Inf', w: 55, num: true },
      { k: 'honor_inf', t: 'Transpor Inf', w: 115, rp: true },
      { k: 'jam_total', t: 'Jam', w: 60, num: true }
    ]
  },
  /* Satu-satunya pembiayaan yang tidak dihitung per kejadian, dan
     penerimanya seorang — karena itu unduhannya berbentuk KUITANSI, bukan
     daftar bertanda tangan. */
  osis: {
    nama: 'Pembina OSIS',
    fungsi: 'f_ip_honor_pembina_osis',
    judul: 'DAFTAR PENERIMAAN HONOR PEMBINA OSIS',
    kuitansi: 'Honor Pembina OSIS',
    catatan: 'FLAT per bulan, tidak bergantung jumlah pertemuan — haknya melekat pada tugas '
           + '"Pembina OSIS" yang aktif di Data Induk → Tugas Guru. Jumlah bulan dihitung dari '
           + 'bulan kalender yang LEBIH DARI SETENGAH harinya masuk rentang tanggal, karena '
           + 'periode pembayaran memang jarang tepat tanggal 1 sampai akhir bulan. Akibatnya '
           + 'rentang setengah bulan menghasilkan nol bulan: itu disengaja, supaya sebulan yang '
           + 'dipotong dua tidak terbayar dua kali tanpa ada yang menyadari. Unduhannya kuitansi '
           + 'perorangan berkop sekolah, ditandatangani Kepala Sekolah, Bendahara, dan penerima.',
    kolom: [
      { k: 'bulan', t: 'Bulan', w: 80, num: true },
      { k: 'tarif', t: 'Nominal/bulan', w: 120, rp: true, jumlah: false }
    ]
  },
  ...(() => {
    /* Transport pembina dibaca dari satu fungsi, lalu dipecah dua tab
       menurut jenis tarifnya: Internal/Eksternal untuk ekstrakurikuler,
       Imtaq untuk pembimbing Tahfidz. Pembina OSIS tidak pernah ada di
       sini — honornya flat per bulan, tab tersendiri. */
    const dasar = 'Besaran tiap pertemuan ditentukan jumlah siswa yang hadir pada pertemuan itu, '
                + 'jadi dihitung per pertemuan lalu dijumlahkan — bukan dari rata-rata kehadiran, '
                + 'yang akan memberi hasil berbeda. Yang dibayar hanya pertemuan yang benar-benar '
                + 'berjalan dan dihadiri pembinanya; pertemuan yang ditiadakan dan yang pembinanya '
                + 'tidak hadir sama-sama tidak dibayar. Kegiatan yang dibimbing beberapa orang '
                + 'sekaligus: nominal pertemuan dihitung dari SELURUH siswa yang hadir, lalu dibagi rata '
                + 'kepada pembimbing yang hadir pada pertemuan itu — yang tidak datang tidak kebagian. '
                + 'Karena itu kolom Siswa hadir adalah kehadiran PERTEMUANNYA, bukan bagian per orang, '
                + 'dan sengaja tidak dijumlahkan.';
    const kolom = [
      { k: 'jenis', t: 'Jenis', w: 100, jumlah: false },
      { k: 'pertemuan', t: 'Pertemuan', w: 90, num: true },
      { k: 'siswa_hadir', t: 'Siswa hadir', w: 100, num: true, jumlah: false }
    ];
    return {
      ekskul: {
        nama: 'Pembina Ekskul', fungsi: 'f_ip_transport_pembina',
        saring: r => r.jenis !== 'Imtaq',
        judul: 'DAFTAR PENERIMAAN TRANSPORT PEMBINA EKSTRAKURIKULER',
        catatan: dasar + ' Kolom Jenis menyebut nominal yang dipakai: Internal untuk pembina yang guru '
               + 'sekolah, Eksternal untuk pelatih dari luar.',
        kolom
      },
      tahfidz: {
        nama: 'Pembimbing Tahfidz', fungsi: 'f_ip_transport_pembina',
        saring: r => r.jenis === 'Imtaq',
        judul: 'DAFTAR PENERIMAAN TRANSPORT PEMBIMBING TAHFIDZ',
        catatan: dasar + ' Nominalnya tersendiri (Transport Pembimbing Imtaq), satu skala untuk '
               + 'pembimbing dari dalam maupun luar sekolah.',
        kolom
      }
    };
  })(),
  piket_parkiran: {
    nama: 'Piket Parkiran', fungsi: 'f_ip_transport_piket',
    arg: { p_jenis: 'Parkiran' },
    judul: 'DAFTAR PENERIMAAN KOMPENSASI PIKET PARKIRAN',
    catatan: 'Yang dibayar adalah petugas terjadwal yang benar-benar berjaga. Piket tidak mengenal '
           + 'pengganti: bila petugasnya berhalangan, gilirannya memang tidak dijaga. Dihitung per HARI '
           + 'jaga, bukan per jam pelajaran: parkiran memang sekali jaga sesudah bel pulang. Petugas '
           + 'parkiran memang staf, dan itu pengecualian yang sudah disepakati — jadi di sini staf '
           + 'tetap dihitung.',
    kolom: [
      { k: 'ukuran', t: 'Hari jaga', w: 85, num: true },
      { k: 'tarif', t: 'Nominal/hari', w: 110, rp: true, jumlah: false }
    ]
  },
  /* Dua tunjangan BPJS dari satu fungsi dengan argumen jenis, seperti
     transport piket. Tunjangan kesejahteraan, bukan honor atas pekerjaan:
     aturan Staf tidak berlaku. Siapa yang berhak ditentukan Data Induk
     (kelayakan dihitung, pengesahan kepala sekolah); di sini hanya
     dikalikan bulan dan nominal. */
  ...(() => {
    const bersama = 'Jumlah bulan dihitung dari bulan kalender yang LEBIH DARI SETENGAH harinya masuk '
                  + 'rentang, sejak bulan mulai. Tidak perlu dicabut bila syaratnya gugur: pembayaran '
                  + 'berhenti sendiri. Aturan Staf tidak berlaku: ini tunjangan kesejahteraan, bukan honor '
                  + 'pekerjaan tambahan.';
    const kolom = syarat => [
      { k: 'tmt_dasar', t: 'TMT', w: 100, jumlah: false, html: b => esc(tglIndo(b.tmt_dasar)) },
      { k: 'tanggal_syarat', t: syarat, w: 110, jumlah: false, html: b => esc(tglIndo(b.tanggal_syarat)) },
      { k: 'mulai', t: 'Mulai', w: 90, jumlah: false,
        html: b => b.mulai ? `${BULAN[Number(b.mulai.slice(5, 7)) - 1]} ${b.mulai.slice(0, 4)}` : '—' },
      { k: 'disahkan_oleh', t: 'Disahkan oleh', w: 140, jumlah: false },
      { k: 'bulan', t: 'Bulan', w: 70, num: true },
      { k: 'tarif', t: 'Nominal/bulan', w: 120, rp: true, jumlah: false }
    ];
    return {
      bpjs_kesehatan: {
        nama: 'TuSehat', fungsi: 'f_ip_tunjangan_bpjs',
        arg: { p_jenis: 'kesehatan' },
        judul: 'DAFTAR PENERIMAAN TUNJANGAN TUSEHAT',
        catatan: 'FLAT per bulan untuk guru yang masa kerjanya di sekolah ini sudah LIMA tahun (TMT di '
               + 'sekolah ini), bukan Guru Tidak Tetap (Dapodik menginduk di sekolah ini), dan DISAHKAN '
               + 'kepala sekolah di Data Induk → Data Guru. Mulai bulan berikutnya sesudah genap lima tahun; '
               + 'berhenti sendiri begitu guru nonaktif atau menjadi Guru Tidak Tetap. ' + bersama,
        kolom: kolom('Genap 5 tahun')
      },
      bpjs_ketenagakerjaan: {
        nama: 'TuKerja', fungsi: 'f_ip_tunjangan_bpjs',
        arg: { p_jenis: 'ketenagakerjaan' },
        judul: 'DAFTAR PENERIMAAN TUNJANGAN TUKERJA',
        catatan: 'FLAT per bulan untuk pemegang tugas STAF yang sudah TIGA tahun menjadi staf (TMT sebagai '
               + 'staf di Data Induk → Data Guru) dan DISAHKAN kepala sekolah. Mulai bulan berikutnya sesudah '
               + 'genap tiga tahun; berhenti sendiri begitu guru nonaktif atau tidak lagi memegang tugas Staf. '
               + bersama,
        kolom: kolom('Genap 3 tahun')
      }
    };
  })()
};


async function muatRekap() {
  const r = REKAP[ui.rekapJenis];
  const hasil = await rpc(r.fungsi, { p_awal: ui.rekapAwal, p_akhir: ui.rekapAkhir, ...(r.arg || {}) });
  D.rekap = r.saring ? (hasil || []).filter(r.saring) : hasil;
}

const angkaSel = (b, k) => {
  const v = b[k.k];
  if (k.rp) return rupiah(v);
  if (k.num) return Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(1).replace('.', ',');
  return v == null ? '—' : esc(String(v));
};

function halRekap() {
  const spek = REKAP[ui.rekapJenis];
  const semua = D.rekap;
  /* Pemegang tugas Staf berhonor nol di rekap ini — aturannya ditegakkan di
     fungsi database, bukan di layar. Yang disembunyikan secara bawaan hanya
     yang benar-benar nol; staf yang jam mengajarnya dinyatakan di luar
     tupoksi (mengajar_dibayar) tetap tampil karena memang dibayar. */
  const punyaStaf = semua && semua.some(r => 'staf' in r);
  // Staf yang toh menerima sesuatu (mis. transpor parkiran) bukan baris yang digugurkan.
  const digugurkan = r => r.staf && !r.mengajar_dibayar && !(Number(r.jumlah) > 0);
  const baris = !semua ? null : (ui.ikutStaf || !punyaStaf ? semua : semua.filter(r => !digugurkan(r)));
  const jumlahStaf = punyaStaf ? semua.filter(digugurkan).length : 0;
  const fp = baris ? baris.filter(r => r.fingerprint).length : 0;

  const kunciJumlah = ['jumlah', ...spek.kolom.filter(k => k.jumlah !== false && (k.num || k.rp)).map(k => k.k)];
  /* Baris staf yang tidak dibayar TIDAK ikut dijumlahkan, walaupun sedang
     ditampilkan: komponennya adalah angka "seandainya guru biasa" untuk
     analisis, bukan yang dibayarkan. Total harus tetap sama dengan gabungan. */
  const total = (baris || []).filter(r => !digugurkan(r)).reduce((t, r) => {
    for (const k of kunciJumlah) t[k] = (t[k] || 0) + (Number(r[k]) || 0);
    return t;
  }, {});

  /* Nominal seandainya — angka kecil di bawah angka yang dibayar. Per baris:
     kolom `s` (gabungan) atau kolom `seandainya`. Per total: jumlah semua
     baris yang ditampilkan seolah staf ikut dibayar, ditampilkan hanya bila
     berbeda dari yang dibayarkan. Kata "seandainya" sengaja tidak ditulis;
     ukuran hurufnya yang menandai. */
  const kecilRp = v => `<div class="kecil" style="font-weight:400">${esc(rupiah(v))}</div>`;
  const hip = (baris || []).reduce((t, r) => {
    for (const k of spek.kolom) {
      if (!k.rp || k.jumlah === false) continue;
      t[k.k] = (t[k.k] || 0) + (Number(r[k.k]) || 0) + (k.s ? (Number(r[k.s]) || 0) : 0);
    }
    t.jumlah = (t.jumlah || 0) + (r.seandainya != null ? Number(r.seandainya) : (Number(r.jumlah) || 0));
    return t;
  }, {});
  const kecilTotal = k => (hip[k] || 0) !== (total[k] || 0) ? kecilRp(hip[k] || 0) : '';

  // Jumlah nol padahal ada jam/hari tercatat berarti tarifnya belum diisi —
  // keadaan yang harus dikatakan, bukan ditampilkan sebagai Rp 0 begitu saja.
  const adaKegiatan = (baris || []).some(r => spek.kolom.some(k => k.num && Number(r[k.k]) > 0));
  const tarifKosong = baris && baris.length && adaKegiatan && !(total.jumlah > 0);

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Honor dan Transpor</h1>
      <p>Jumlah yang harus dibayarkan pada satu periode. Angkanya memakai besaran yang
         berlaku pada periode itu, bukan besaran hari ini.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih">
        <label class="kecil">Dari</label>
        <input class="field" type="date" id="rAwal" value="${esc(ui.rekapAwal)}" style="width:auto">
        <label class="kecil">sampai</label>
        <input class="field" type="date" id="rAkhir" value="${esc(ui.rekapAkhir)}" style="width:auto">
        <button class="btn btn-p" id="rHitung">Hitung</button>
      </div></div>

    <div class="bar">${Object.entries(REKAP).map(([k, v]) =>
      `<button class="chip${k === ui.rekapJenis ? ' on' : ''}" data-rekap="${k}">${esc(v.nama)}</button>`).join('')}
    </div>

    ${!semua ? `<div class="panel"><div class="empty"><b>Belum dihitung</b>
      Pilih periodenya lalu ketuk Hitung.</div></div>` : `

    <div class="kartu-baris">
      <div class="kartu"><b>${baris.length}</b><span>penerima</span></div>
      <div class="kartu"><b>${rupiah(total.jumlah || 0)}</b><span>jumlah dibayarkan</span></div>
    </div>

    ${tarifKosong ? `<div class="info-box"><b>Kegiatannya tercatat, tetapi jumlahnya Rp 0.</b>
      Besaran untuk jenis pembiayaan ini belum diisi. Isi di halaman
      <b>Penggajian</b>, lalu hitung ulang.</div>` : ''}
    ${jumlahStaf ? `<div class="info-box"><b>${jumlahStaf} pemegang tugas Staf berhonor nol
      ${ui.ikutStaf ? 'ikut ditampilkan' : 'disembunyikan'}.</b>
      Tugas Staf menggugurkan honor tambahan: jam kerjanya sudah dihitung lewat fingerprint,
      jadi membayarnya lagi berarti dua kali. Bila ditampilkan, komponen pada baris staf adalah
      angka <b>seandainya ia guru biasa</b> — dihitung dari kehadiran yang sama, untuk analisis —
      dan Jumlahnya tetap Rp 0 serta tidak masuk total maupun gabungan. Staf yang jam mengajarnya
      dinyatakan di luar tupoksi di Data Induk tetap tampil sebagai baris yang dibayar.
      <button class="btn btn-sm" id="rStaf" style="margin-left:8px">${
        ui.ikutStaf ? 'Kecualikan lagi' : 'Tampilkan juga'}</button></div>` : ''}
    ${fp ? `<div class="info-box"><b>${fp} guru berinsentif fingerprint.</b>
      Insentif tatap muka dan konsumsinya dibayarkan akhir bulan lewat mesin kehadiran,
      jadi di sini ditulis nol supaya jumlahnya sama dengan yang benar-benar dibayarkan.</div>` : ''}

    <div class="panel"><div class="panel-head"><h3>${esc(spek.nama)}</h3>
      <div class="sp" style="flex:1"></div>
      <div class="info">${esc(tglIndo(ui.rekapAwal))} – ${esc(tglIndo(ui.rekapAkhir))}</div>
      <button class="btn btn-sm" id="rUnduh" style="margin-left:10px">${spek.kuitansi ? 'Unduh kuitansi (xlsx)' : 'Unduh (xlsx)'}</button></div>
      <div class="gulir-petunjuk">Tabel lebih lebar dari layar — geser mendatar untuk melihat
        seluruh kolom. Kolom nama tetap terlihat saat digeser.</div>
      <div class="scroll"><table class="rekap"><thead><tr>
        <th style="width:40px" class="num lekat-no">No</th>
        <th class="lekat">Nama</th>
        ${spek.kolom.map(k => `<th style="width:${k.w}px" class="${k.num || k.rp ? 'num' : ''}">${esc(k.t)}</th>`).join('')}
        <th style="width:125px" class="num">Jumlah</th>
      </tr></thead><tbody>${
        baris.length ? baris.map((b, i) => `<tr>
          <td class="num lekat-no">${i + 1}</td>
          <td class="nama lekat" style="font-weight:500">${esc(b.nama)}${
            b.staf ? ` <span class="tag tag-l">${b.mengajar_dibayar ? 'Staf · di luar tupoksi' : 'Staf'}</span>` : ''}${
            b.belum_lengkap ? ' <span class="kecil" style="color:var(--warn)">belum lengkap</span>' : ''}${
            'masa_kerja' in b && b.masa_kerja == null ? ' <span class="kecil" style="color:var(--warn)">TMT kosong</span>' : ''}</td>
          ${spek.kolom.map(k => `<td class="${k.num || k.rp ? 'num' : ''}">${k.html ? k.html(b) : angkaSel(b, k)}${
            k.s && Number(b[k.s]) > 0 ? kecilRp(b[k.s]) : ''}</td>`).join('')}
          <td class="num" style="font-weight:600">${rupiah(b.jumlah)}${
            b.seandainya != null && Number(b.seandainya) !== Number(b.jumlah) ? kecilRp(b.seandainya) : ''}</td></tr>`).join('')
        : `<tr><td colspan="${spek.kolom.length + 3}"><div class="empty"><b>Tidak ada penerima</b>
            Tidak ada catatan untuk jenis pembiayaan ini pada periode tersebut.</div></td></tr>`
      }</tbody>
      ${baris.length ? `<tfoot><tr>
        <td class="num lekat-no"></td><td class="lekat" style="font-weight:600">Jumlah</td>
        ${spek.kolom.map(k => `<td class="${k.num || k.rp ? 'num' : ''}" style="font-weight:600">${
          k.jumlah === false ? '—' : k.rp ? rupiah(total[k.k] || 0) + kecilTotal(k.k) : (total[k.k] || 0)}</td>`).join('')}
        <td class="num" style="font-weight:700">${rupiah(total.jumlah || 0)}${kecilTotal('jumlah')}</td></tr></tfoot>` : ''}
      </table></div>
      <div class="foot"><div class="info">Terbilang: ${esc(terbilang(total.jumlah || 0))}</div></div></div>

    <p class="kecil">${esc(spek.catatan)}</p>`}`;

  $('#rHitung').onclick = () => {
    ui.rekapAwal = $('#rAwal').value || ui.rekapAwal;
    ui.rekapAkhir = $('#rAkhir').value || ui.rekapAkhir;
    if (ui.rekapAwal > ui.rekapAkhir) { toast('Tanggal awal melewati tanggal akhir.', true); return; }
    jalankan('Menghitung…', muatRekap);
  };
  $$('[data-rekap]').forEach(b => b.onclick = () => {
    ui.rekapJenis = b.dataset.rekap;
    D.rekap = null;
    jalankan('Menghitung…', muatRekap);
  });
  if ($('#rStaf')) $('#rStaf').onclick = () => { ui.ikutStaf = !ui.ikutStaf; gambar(); };
  if ($('#rUnduh')) $('#rUnduh').onclick = () => jalankan('Menyiapkan berkas…',
    () => spek.kuitansi ? unduhKuitansi(spek, baris) : unduhRekap(spek, baris, total));
}

/* ----------------------------------------------------------- excel */
async function muatExcelJS() {
  if (window.ExcelJS) return window.ExcelJS;
  await new Promise((selesai, gagal) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
    sc.onload = selesai;
    sc.onerror = () => gagal(new Error('Pembuat Excel gagal dimuat. Periksa sambungan internet.'));
    document.head.appendChild(sc);
  });
  return window.ExcelJS;
}

/* Penjaga: bila assets/kop-dokumen.js tidak termuat, unduhan gagal dengan
   pesan yang bisa ditindaklanjuti, bukan "undefined". */
function kopBersama() {
  if (!window.KopDokumen) throw new Error(
    'Berkas assets/kop-dokumen.js belum termuat, sehingga kop dokumen tidak bisa dibuat. '
    + 'Muat ulang halaman; bila tetap gagal, laporkan ke operator.');
  return window.KopDokumen;
}

/* Bagian yang dipakai bersama oleh kedua penulis Excel (rekap pembiayaan
   dan kehadiran): gaya sel, kepala tabel, logo, dan pengunduhan. */
const TIPIS = { style: 'thin', color: { argb: 'FF808080' } };
const KOTAK = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS };
const RP = '"Rp" #,##0';

async function ambilLogo() {
  try {
    return { buffer: await fetch('assets/logo.png').then(r => r.ok ? r.arrayBuffer() : Promise.reject()) };
  } catch (e) { return null; /* tanpa logo pun berkasnya tetap terbentuk */ }
}
function kepalaExcel(ws, r, judul, F) {
  judul.forEach((t, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = t; c.font = { name: F, size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = KOTAK;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  ws.getRow(r).height = 30;
}
const penulisSel = (ws, F) => (br, kl, nilai, opsi = {}) => {
  const c = ws.getCell(br, kl);
  c.value = nilai;
  c.font = { name: F, size: 10, bold: !!opsi.tebal };
  c.alignment = { horizontal: opsi.rata || (typeof nilai === 'number' ? 'right' : 'left'), vertical: 'middle',
                  wrapText: !!opsi.lipat };
  c.border = KOTAK;
  if (opsi.fmt) c.numFmt = opsi.fmt;
  if (opsi.abu) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
  return c;
};
async function simpanBuku(wb, nama) {
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = nama;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Berkas diunduh');
}

/* Satu penulis untuk kelima rekap, memakai daftar kolom yang sama dengan
   tampilannya — supaya berkas Excel tidak pernah berbeda isi dari layar. */
async function unduhRekap(spek, baris, total) {
  const ExcelJS = await muatExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(spek.nama.slice(0, 28), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                 margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  });
  const F = 'Calibri';
  const kolom = spek.kolom;
  const KOL = kolom.length + 4;      // No, Nama, …kolom…, Jumlah, Tanda tangan

  ws.columns = [{ width: 5 }, { width: 30 },
                ...kolom.map(k => ({ width: Math.max(9, Math.round(k.w / 8)) })),
                { width: 15 }, { width: 22 }];
  ws.views = [{ showGridLines: false }];
  const p = D.profil || {};

  /* Kop dibuat oleh assets/kop-dokumen.js — berkas yang sama persis di
     keempat aplikasi. Perhitungan piksel yang dulu ada di sini sudah
     pindah ke sana, sehingga letak kop cukup diatur sekali oleh operator
     di Data Induk → Profil Dokumen dan berlaku untuk semua unduhan. */
  const baris1 = kopBersama().kopExcel(ws, {
    wb, logo: await ambilLogo(), profil: p,
    judul: spek.judul,
    sub: `Periode ${tglIndo(ui.rekapAwal)} – ${tglIndo(ui.rekapAkhir)}`,
    kolomAkhir: KOL, font: F
  });

  let r = baris1;
  kepalaExcel(ws, r, ['NO', 'NAMA', ...kolom.map(k => k.t.toUpperCase()), 'JUMLAH', 'TANDA TANGAN'], F);
  r += 1;

  const sel = penulisSel(ws, F);

  baris.forEach((b, i) => {
    sel(r, 1, i + 1, { rata: 'center' });
    sel(r, 2, b.nama + (b.staf && b.seandainya != null ? ' (Staf — seandainya ' + rupiah(b.seandainya) + ')' : ''));
    kolom.forEach((k, j) => {
      const v = b[k.k];
      if (k.rp) sel(r, 3 + j, Number(v) || 0, { fmt: RP });
      else if (k.num) sel(r, 3 + j, Number(v) || 0, { rata: 'center' });
      else sel(r, 3 + j, v == null ? '—' : String(v), { rata: 'center' });
    });
    sel(r, kolom.length + 3, Number(b.jumlah) || 0, { fmt: RP, tebal: true });
    sel(r, kolom.length + 4, `${i + 1}. ……………………`);
    ws.getRow(r).height = 26;
    r += 1;
  });

  sel(r, 1, 'JUMLAH', { rata: 'center', tebal: true, abu: true });
  ws.mergeCells(r, 1, r, 2);
  kolom.forEach((k, j) => {
    if (k.jumlah === false) sel(r, 3 + j, '', { abu: true });
    else if (k.rp) sel(r, 3 + j, total[k.k] || 0, { fmt: RP, tebal: true, abu: true });
    else sel(r, 3 + j, total[k.k] || 0, { rata: 'center', tebal: true, abu: true });
  });
  sel(r, kolom.length + 3, total.jumlah || 0, { fmt: RP, tebal: true, abu: true });
  sel(r, kolom.length + 4, '', { abu: true });
  r += 1;

  ws.getCell(r, 1).value = 'Terbilang:';
  ws.getCell(r, 1).font = { name: F, size: 10, bold: true };
  ws.mergeCells(r, 2, r, KOL);
  ws.getCell(r, 2).value = terbilang(total.jumlah || 0);
  ws.getCell(r, 2).font = { name: F, size: 10, italic: true };
  r += 2;

  ws.getCell(r, 2).value = 'Keterangan: ' + spek.catatan
    + (baris.some(b => b.seandainya != null)
        ? ' Baris bertanda Staf: Jumlah nol dan tidak masuk total; komponennya angka seandainya dibayar seperti guru biasa, untuk analisis.'
        : '');
  ws.getCell(r, 2).font = { name: F, size: 8, italic: true };
  ws.mergeCells(r, 2, r, KOL);
  ws.getRow(r).height = 24;
  ws.getCell(r, 2).alignment = { wrapText: true, vertical: 'top' };
  r += 3;

  /* Yang menandatangani adalah pejabat yang berwenang atas isi dokumen —
     untuk pembiayaan itu Bendahara — dan Kepala Sekolah mengetahui. */
  const kolomKanan = Math.max(4, KOL - 3);
  ws.getCell(r - 1, 2).value = 'Mengetahui,';
  ws.getCell(r - 1, 2).font = { name: F, size: 10 };
  ws.getCell(r - 1, 2).alignment = { horizontal: 'center' };
  ws.getCell(r - 1, kolomKanan).value = `${p.kota || 'Soreang'}, ${tglIndo(ui.rekapAkhir)}`;
  ws.getCell(r - 1, kolomKanan).font = { name: F, size: 10 };
  ws.getCell(r - 1, kolomKanan).alignment = { horizontal: 'center' };
  const ttd = (kl, jabatan, nama) => {
    ws.getCell(r, kl).value = jabatan;
    ws.getCell(r + 5, kl).value = nama || '……………………';
    [r, r + 5].forEach(x => {
      ws.getCell(x, kl).font = { name: F, size: 10, bold: x !== r, underline: x !== r };
      ws.getCell(x, kl).alignment = { horizontal: 'center' };
    });
  };
  ttd(2, 'Kepala Sekolah,', p.kepala_sekolah);
  ttd(kolomKanan, 'Bendahara,', p.bendahara);
  ws.pageSetup.printTitlesRow = '7:7';

  await simpanBuku(wb, `${spek.nama} ${ui.rekapAwal} sd ${ui.rekapAkhir}.xlsx`);
}

/* Kuitansi perorangan — untuk pembiayaan yang penerimanya seorang (Pembina
   OSIS). Satu lembar per penerima, berkop sekolah yang sama dengan berkas
   lain, dan tiga tanda tangan: Kepala Sekolah menyetujui, Bendahara
   melunasi, penerima menerima. Bukan "Bendahara BOS" — sumber dananya
   bukan urusan kuitansi ini. */
function labelPeriodeRekap() {
  const a = ui.rekapAwal, b = ui.rekapAkhir;
  const [ya, ma, da] = a.split('-').map(Number), [yb, mb, db] = b.split('-').map(Number);
  const akhirBulan = new Date(ya, ma, 0).getDate();
  const NAMA = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  if (da === 1 && ya === yb && ma === mb && db === akhirBulan) return `bulan ${NAMA[ma - 1]} ${ya}`;
  return `periode ${tglIndo(a)} – ${tglIndo(b)}`;
}

async function unduhKuitansi(spek, baris) {
  if (!baris || !baris.length) throw new Error('Tidak ada penerima pada periode ini.');
  const ExcelJS = await muatExcelJS();
  const wb = new ExcelJS.Workbook();
  const F = 'Calibri';
  const p = D.profil || {};
  const logo = await ambilLogo();
  const KOL = 8;
  const dipakai = new Set();

  baris.forEach((b, i) => {
    let namaLembar = String(b.nama || 'Kuitansi').replace(/[\\/*?:[\]]/g, ' ').slice(0, 28).trim() || 'Kuitansi';
    if (dipakai.has(namaLembar)) namaLembar = `${namaLembar.slice(0, 25)} ${i + 1}`;
    dipakai.add(namaLembar);
    const ws = wb.addWorksheet(namaLembar, {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                   margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 } }
    });
    ws.columns = [{ width: 3 }, { width: 20 }, { width: 3 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 3 }];
    ws.views = [{ showGridLines: false }];

    const r0 = kopBersama().kopExcel(ws, { wb, logo, profil: p, judul: 'KWITANSI', sub: '', kolomAkhir: KOL, font: F });
    const tulis = (r, c, v, o = {}) => {
      const sel = ws.getCell(r, c);
      sel.value = v;
      sel.font = { name: F, size: o.ukuran || 10, bold: !!o.tebal, underline: !!o.garis };
      sel.alignment = { horizontal: o.rata || 'left', vertical: 'middle', wrapText: !!o.lipat };
      return sel;
    };
    const kotak = (r1, c1, r2, c2) => {
      ws.mergeCells(r1, c1, r2, c2);
      const s = ws.getCell(r1, c1);
      s.border = { top: { style: 'medium' }, left: { style: 'medium' }, bottom: { style: 'medium' }, right: { style: 'medium' } };
      return s;
    };
    const jumlah = Number(b.jumlah) || 0;
    const untuk = `${spek.kuitansi} ${labelPeriodeRekap()}`
      + (b.bulan != null ? ` (${b.bulan} bulan × ${rupiah(b.tarif)})` : '');

    let r = r0 + 1;
    tulis(r, 2, 'No.', { tebal: true });            tulis(r, 3, ':');  tulis(r, 4, '……………………');
    r += 1;
    tulis(r, 2, 'Telah terima dari', { tebal: true }); tulis(r, 3, ':'); tulis(r, 4, p.nama_sekolah || KONFIG.sekolah, { tebal: true });
    r += 1;
    tulis(r, 2, 'Uang sebesar', { tebal: true });   tulis(r, 3, ':');
    kotak(r, 4, r, 7).value = terbilang(jumlah);
    ws.getCell(r, 4).font = { name: F, size: 12, bold: true };
    ws.getCell(r, 4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    ws.getRow(r).height = 30;
    r += 1;
    tulis(r, 2, 'Untuk pembayaran', { tebal: true }); tulis(r, 3, ':'); tulis(r, 4, untuk, { lipat: true });
    ws.mergeCells(r, 4, r, 7);
    ws.getRow(r).height = 30;
    r += 2;
    kotak(r, 2, r, 2).value = `Rp ${jumlah.toLocaleString('id-ID')},-`;
    ws.getCell(r, 2).font = { name: F, size: 12, bold: true };
    ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = 26;
    r += 2;

    // Tiga tanda tangan: setuju, lunas, menerima.
    tulis(r, 2, 'Setuju dibayar,');
    tulis(r, 4, 'LUNAS DIBAYAR', { tebal: true });
    tulis(r, 6, `${p.kota || 'Soreang'}, ${tglIndo(ui.rekapAkhir)}`);
    tulis(r + 1, 4, 'Pada tanggal : ……………');
    tulis(r + 2, 2, 'Kepala Sekolah,');
    tulis(r + 2, 4, 'Bendahara,');
    tulis(r + 2, 6, 'Yang menerima,');
    tulis(r + 7, 2, p.kepala_sekolah || '……………………', { tebal: true, garis: true });
    tulis(r + 7, 4, p.bendahara || '……………………', { tebal: true, garis: true });
    tulis(r + 7, 6, b.nama || '……………………', { tebal: true, garis: true });
    r += 8;

    // Bingkai keliling kuitansi, dari kop sampai tanda tangan.
    for (let rr = 1; rr <= r; rr++) {
      const kiri = ws.getCell(rr, 1), kanan = ws.getCell(rr, KOL);
      kiri.border = { ...(kiri.border || {}), left: { style: 'medium' } };
      kanan.border = { ...(kanan.border || {}), right: { style: 'medium' } };
    }
    for (let cc = 1; cc <= KOL; cc++) {
      const atas = ws.getCell(1, cc), bawah = ws.getCell(r, cc);
      atas.border = { ...(atas.border || {}), top: { style: 'medium' } };
      bawah.border = { ...(bawah.border || {}), bottom: { style: 'medium' } };
    }
  });

  await simpanBuku(wb, `Kuitansi ${spek.kuitansi} ${ui.rekapAwal} sd ${ui.rekapAkhir}.xlsx`);
}

/* Penulis Excel halaman Kehadiran dan Piket: memakai daftar kolom yang sama
   dengan tabel di layar. Yang menandatangani adalah pejabat yang berwenang
   atas isinya — Wakasek Kurikulum untuk kehadiran guru, Wakasek Kesiswaan
   untuk ekstrakurikuler — dan Kepala Sekolah mengetahui; bukan Bendahara,
   karena ini dokumen kehadiran, bukan pembayaran. */
async function unduhHadir(isi) {
  const ExcelJS = await muatExcelJS();
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(isi.berkas.slice(0, 28), {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
                 margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  });
  const F = 'Calibri';
  const nomor = !isi.tanpaNomor;
  const kolom = isi.kolom;
  const KOL = kolom.length + (nomor ? 1 : 0);
  const h = D.hadir;

  ws.columns = [...(nomor ? [{ width: 5 }] : []),
                ...kolom.map(k => ({ width: k.lekat ? 30 : Math.max(8, Math.round((k.w || 80) / 7)) }))];
  ws.views = [{ showGridLines: false }];
  const p = D.profil || {};

  const baris1 = kopBersama().kopExcel(ws, {
    wb, logo: await ambilLogo(), profil: p,
    judul: isi.judul,
    sub: `Periode ${tglIndo(h.awal)} – ${tglIndo(h.akhir)}`,
    kolomAkhir: KOL, font: F
  });

  // Kepala tabel satu baris; nama kelompok kolom (mis. "Meja Sekolah (jam)")
  // ditempelkan di depan nama kolomnya supaya satuannya tidak hilang.
  const label = [];
  if (isi.kelompok) {
    let i = 0;
    for (const g of isi.kelompok) {
      kolom.slice(i, i + g.n).forEach(k => label.push((g.t ? g.t + ' — ' : '') + k.t));
      i += g.n;
    }
  } else kolom.forEach(k => label.push(k.t));

  let r = baris1;
  kepalaExcel(ws, r, [...(nomor ? ['NO'] : []), ...label.map(t => t.toUpperCase())], F);
  r += 1;
  const sel = penulisSel(ws, F);
  const awalKolom = nomor ? 2 : 1;

  const nilaiSel = (b, k) => {
    if (k.xls) return k.xls(b);
    const v = b[k.k];
    if (k.num) return v == null || v === '' ? (v === '' ? '' : '—') : Number(v);
    return v == null ? '' : (k.f ? k.f(v) : String(v));
  };
  isi.baris.forEach((b, i) => {
    if (nomor) sel(r, 1, i + 1, { rata: 'center' });
    kolom.forEach((k, j) => sel(r, awalKolom + j, nilaiSel(b, k),
      { fmt: k.fmt, rata: k.num ? 'right' : undefined, lipat: !k.num && !k.lekat }));
    ws.getRow(r).height = 22;
    r += 1;
  });

  if (isi.total && isi.baris.length) {
    if (nomor) sel(r, 1, '', { abu: true });
    kolom.forEach((k, j) => {
      const v = isi.total[k.k];
      const nilai = v === undefined ? '' : v === null ? '—' : (k.num && !k.lekat) ? Number(v) : String(v);
      sel(r, awalKolom + j, nilai, { fmt: k.fmt, tebal: true, abu: true, rata: k.num ? 'right' : undefined });
    });
    r += 1;
  }
  r += 1;

  if (isi.catatan) {
    ws.getCell(r, 1).value = 'Keterangan: ' + isi.catatan;
    ws.getCell(r, 1).font = { name: F, size: 8, italic: true };
    ws.mergeCells(r, 1, r, KOL);
    ws.getRow(r).height = 36;
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
    r += 2;
  }

  const kolomKiri = nomor ? 2 : 1;
  const kolomKanan = Math.max(kolomKiri + 2, KOL - 2);
  const tulis = (br, kl, v, tebal) => {
    ws.getCell(br, kl).value = v;
    ws.getCell(br, kl).font = { name: F, size: 10, bold: !!tebal, underline: !!tebal };
    ws.getCell(br, kl).alignment = { horizontal: 'center' };
  };
  const [jabatan, nama] = isi.ttd === 'kesiswaan'
    ? ['Wakasek Kesiswaan,', p.kesiswaan] : ['Wakasek Kurikulum,', p.kurikulum];
  tulis(r, kolomKiri, 'Mengetahui,');
  tulis(r, kolomKanan, `${p.kota || 'Soreang'}, ${tglIndo(h.akhir)}`);
  tulis(r + 1, kolomKiri, 'Kepala Sekolah,');
  tulis(r + 1, kolomKanan, jabatan);
  tulis(r + 6, kolomKiri, p.kepala_sekolah || '……………………', true);
  tulis(r + 6, kolomKanan, nama || '……………………', true);
  ws.pageSetup.printTitlesRow = `${baris1}:${baris1}`;

  await simpanBuku(wb, `${isi.berkas} ${h.awal} sd ${h.akhir}.xlsx`);
}

/* -------------------------------------------------- identitas dokumen */
function halIdentitas() {
  const p = D.profil;
  const baris = (label, nilai) => `<tr><td style="width:220px;font-weight:500">${esc(label)}</td>
    <td>${nilai ? esc(nilai) : '<span class="kecil" style="color:var(--warn)">belum diisi</span>'}</td></tr>`;

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Identitas Dokumen</h1>
      <p>Kop yang dipakai seluruh berkas cetak dan unduhan Excel aplikasi ini.</p></div></div>

    <div class="info-box"><b>Dibaca dari Data Induk, tidak disalin ke sini.</b>
      Perubahannya dilakukan di <b>Data Induk → Profil Dokumen</b>, dan langsung berlaku
      di semua aplikasi. Kalau identitasnya disimpan terpisah di tiap aplikasi, cepat atau
      lambat ketiganya akan berbeda tanpa ada yang menyadari.</div>

    ${D.galat.profil ? `<div class="info-box"><b>Profil dokumen tidak terbaca.</b>
      ${esc(D.galat.profil)}</div>` : ''}

    <div class="panel"><div class="panel-head"><h3>Identitas yang berlaku</h3>
      <div class="sp" style="flex:1"></div><div class="info">baca saja</div></div>
      <div class="scroll"><table><tbody>
        ${baris('Nama sekolah', p && p.nama_sekolah)}
        ${baris('Alamat', p && p.alamat)}
        ${baris('Kota', p && p.kota)}
        ${baris('NPSN', p && p.npsn)}
        ${baris('Telepon', p && p.telepon)}
        ${baris('Email', p && p.email)}
        ${baris('Laman', p && p.laman)}
        ${baris('Kepala Sekolah', p && p.kepala_sekolah)}
        ${baris('NIP Kepala Sekolah', p && p.nip_kepala)}
        ${baris('Bendahara', p && p.bendahara)}
        ${baris('Wakasek Kurikulum', p && p.kurikulum)}
        ${baris('Wakasek Kesiswaan', p && p.kesiswaan)}
        ${baris('Catatan kaki', p && p.catatan_kaki)}
      </tbody></table></div></div>

    <p class="kecil">Nama bendahara dan Wakasek Kesiswaan kini ikut tersimpan di Profil
      Dokumen, sehingga blok tanda tangan di seluruh unduhan Excel memakai nama yang sama
      dengan aplikasi lain.</p>`;
}

/* ------------------------------------------------------------ modal */
function tutupModal() { $('#modal-root').innerHTML = ''; }
function bukaModal(html, lebar) {
  $('#modal-root').innerHTML = `<div class="ov"><div class="modal${lebar ? ' lebar' : ''}">${html}</div></div>`;
  const ov = $('#modal-root .ov');
  ov.onclick = e => { if (e.target === ov) tutupModal(); };
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') tutupModal(); });

/* ------------------------------------------------------------- mulai */
ui.acuan = hariIniISO();
({ awal: ui.rekapAwal, akhir: ui.rekapAkhir } = bulanIni());
({ awal: ui.hadirAwal, akhir: ui.hadirAkhir } = bulanIni());
layarMasuk();
