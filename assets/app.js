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
let D = { jenis: [], tarif: [], profil: null, rekap: null, galat: {} };
let halaman = 'beranda';
let ui = { acuan: '', rekapAwal: '', rekapAkhir: '', rekapJenis: 'gabungan', ikutStaf: false };

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
  // Katalog jenis + besaran yang berlaku pada tanggal acuan.
  [D.jenis, D.tarif] = await Promise.all([
    ambil('ip_jenis_tarif', 'select=*&order=urutan'),
    rpc('f_ip_tarif', { p_acuan: ui.acuan })
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
      Isi di halaman Pengaturan Nominal sebelum rekap dijalankan.</div>` : ''}
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
          ['Tugas wali kelas (upacara, bimbingan)', 'Data Induk — Komponen honor', true],
          ['Kehadiran staf', 'Data Induk — belum dibuat', false]
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
  const kelompok = [...new Set(D.jenis.filter(j => j.aktif).map(j => j.kelompok))];
  const tarifDari = kode => D.tarif.filter(t => t.kode === kode);

  const kartuJenis = j => {
    const baris = tarifDari(j.kode);
    const sejak = baris.length ? baris[0].berlaku_mulai : null;
    const isi = !baris.length
      ? '<span class="kecil" style="color:var(--warn)">belum ada besaran yang berlaku</span>'
      : j.berjenjang
        ? `<table class="log"><tbody>${baris.map(t => `<tr>
            <td class="kecil">${t.batas_min == null ? '—' : t.batas_min}${
              t.batas_maks == null ? ' ke atas' : '–' + t.batas_maks} ${esc(j.satuan_jenjang)}</td>
            <td style="text-align:right;font-weight:600">${rupiah(t.nilai)}</td></tr>`).join('')}</tbody></table>`
        : `<div style="font-size:22px;font-weight:600">${rupiah(baris[0].nilai)}</div>`;

    return `<div class="panel">
      <div class="panel-head"><h3>${esc(j.nama)}</h3>
        <div class="sp" style="flex:1"></div>
        <div class="info">${esc(j.satuan)}</div></div>
      <div style="padding:14px 16px">
        ${isi}
        ${j.penjelasan ? `<p class="kecil" style="margin:10px 0 0">${esc(j.penjelasan)}</p>` : ''}
      </div>
      <div class="foot">
        <div class="info">${sejak ? 'berlaku sejak ' + esc(tglIndo(sejak)) : 'belum pernah diisi'}</div>
        <div class="sp" style="flex:1"></div>
        <button class="btn btn-sm" data-ubah="${esc(j.kode)}">Ubah besaran</button>
        <button class="btn btn-sm" data-riwayat="${esc(j.kode)}">Riwayat</button>
      </div></div>`;
  };

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Pengaturan Nominal</h1>
      <p>Besaran tiap jenis pembiayaan. Mengubahnya tidak menimpa yang lama —
         yang tersimpan adalah besaran baru beserta tanggal mulai berlakunya.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih"><label class="kecil">Berlaku pada</label>
        <input class="field" type="date" id="acuan" value="${esc(ui.acuan)}" style="width:auto"></div></div>

    <div class="info-box">Halaman ini menampilkan besaran yang berlaku pada
      <b>${esc(tglIndo(ui.acuan))}</b>. Ubah tanggalnya untuk melihat besaran yang
      berlaku pada periode lain — itulah angka yang dipakai rekap periode tersebut.</div>

    ${kelompok.map(k => `
      <h2 class="kelompok-judul" style="margin:22px 0 10px;font-size:14px;letter-spacing:.04em;
        text-transform:uppercase;color:var(--primary)">${esc(k)}</h2>
      ${D.jenis.filter(j => j.aktif && j.kelompok === k).map(kartuJenis).join('')}
    `).join('')}`;

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

  bukaModal(`<h2>Ubah besaran — ${esc(j.nama)}</h2><div class="body">
    <p class="msg kecil">Besaran lama tidak dihapus. Yang tersimpan adalah besaran baru
      beserta tanggal mulai berlakunya, sehingga rekap periode sebelumnya tetap memakai
      angka yang lama.</p>

    <div class="fg"><label>Berlaku mulai <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="t-mulai" value="${esc(awalBulanDepan())}">
      <div class="hint">Bawaannya tanggal 1 bulan depan, karena pembiayaan dihitung per bulan.</div></div>

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
      await muatSemua();
      toast(`${j.nama}: besaran baru berlaku ${tglIndo(mulai)}`);
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

    bukaModal(`<h2>Riwayat besaran — ${esc(j.nama)}</h2><div class="body">
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

/* ------------------------------------------------------ daftar hadir */
function halHadir() {
  $('#isi').innerHTML = `
    <div class="head"><div><h1>Daftar Hadir</h1>
      <p>Kehadiran yang menjadi dasar pembiayaan. Dibaca dari aplikasi tempat
         kehadirannya dicatat — halaman ini tidak mencatat apa pun.</p></div></div>

    <div class="info-box"><b>Halaman ini belum diisi.</b> Bentuknya sudah disiapkan;
      isinya menyusul setelah Pengaturan Nominal dan Rekapitulasi selesai.</div>

    <div class="panel"><div class="panel-head"><h3>Yang akan ditampilkan</h3></div>
      <div class="scroll"><table><thead><tr>
        <th>Bagian</th><th>Sumber datanya</th>
      </tr></thead><tbody>
        ${[
          ['Kehadiran staf', 'Data Induk — pencatatan dan ketentuannya dibuat di sana'],
          ['Guru mengajar', 'Kehadiran Guru — jam terjadwal, hadir, dan tidak hadir'],
          ['Guru pengganti', 'Kehadiran Guru — penugasan GT / PT / Infaler'],
          ['Piket meja sekolah, unit, parkiran', 'Kehadiran Guru — Pelaksanaan Piket'],
          ['Ekskul dan Pembinaan Imtaq', 'Absensi Ekskul — pertemuan dan jumlah siswa hadir'],
          ['Tugas lainnya', 'Data Induk — komponen honor wali kelas dan jam tugas tambahan']
        ].map(([a, b]) => `<tr><td style="font-weight:500">${esc(a)}</td>
          <td class="kecil">${esc(b)}</td></tr>`).join('')}
      </tbody></table></div></div>

    <p class="kecil">Kehadiran staf sengaja dicatat di Data Induk, bukan di sini, mengikuti
      aturan yang sudah dipakai seluruh sistem: satu tempat mengubah, banyak tempat membaca.
      Induk Pembiayaan cukup membaca hasilnya, mengatur pembiayaannya, dan menyusun daftar
      pembayarannya.</p>`;
}

/* ------------------------------------------------------ rekapitulasi */
/* Kelima rekap berbentuk sama: satu fungsi database, satu daftar kolom.
   Ditulis sebagai data, bukan lima halaman yang mirip-mirip — menambah rekap
   keenam kelak cukup menambah satu baris di sini.                        */
const REKAP = {
  /* Rekap gabungan diletakkan paling depan karena inilah yang dipakai
     membuat daftar pembayaran. Enam rekap sesudahnya adalah rinciannya:
     dibuka bila ada angka yang perlu ditelusuri dari mana asalnya. */
  gabungan: {
    nama: 'Gabungan per Orang',
    fungsi: 'f_ip_rekap_gabungan',
    judul: 'REKAPITULASI PEMBIAYAAN PER PENERIMA',
    catatan: 'Menjumlahkan ketujuh jenis pembiayaan menjadi satu baris per orang. '
           + 'Pembina ekstrakurikuler yang juga guru sekolah digabung ke baris gurunya, '
           + 'sehingga seorang yang menerima dari beberapa jalur tetap muncul satu kali; '
           + 'pelatih dari luar berdiri sendiri. Namanya memakai ejaan data induk. '
           + 'Yang tidak menerima apa pun pada periode ini tidak dicetak.',
    kolom: [
      { k: 'jenis_orang', t: 'Jenis', w: 130, jumlah: false },
      { k: 'mengajar', t: 'Mengajar', w: 125, rp: true },
      { k: 'pengganti', t: 'Pengganti', w: 115, rp: true },
      { k: 'piket_meja', t: 'Piket Meja', w: 115, rp: true },
      { k: 'piket_unit', t: 'Piket Unit', w: 110, rp: true },
      { k: 'piket_parkiran', t: 'Piket Parkiran', w: 125, rp: true },
      { k: 'pembina', t: 'Pembina', w: 110, rp: true },
      { k: 'wali', t: 'Wali Kelas', w: 115, rp: true }
    ]
  },
  mengajar: {
    nama: 'Honor Mengajar',
    fungsi: 'f_ip_honor_mengajar',
    judul: 'DAFTAR PENERIMAAN HONOR MENGAJAR',
    catatan: 'Jam yang dibayar adalah jam kontrak per minggu, tidak dikalikan jumlah pekan — '
           + 'honor dan transport memang dibayarkan bulanan atas dasar kontrak itu. Yang dikalikan '
           + 'hari hanyalah jam tatap muka dan hari kedatangan. Upacara dan Bimbingan Wali Kelas '
           + 'tidak termasuk jam mengajar.',
    kolom: [
      { k: 'masa_kerja', t: 'M.Kerja', w: 70, num: true, jumlah: false },
      { k: 'jam_dibayar', t: 'Jam', w: 60, num: true },
      { k: 'tarif_jam', t: 'Tarif', w: 95, rp: true, jumlah: false },
      { k: 'honor_guru', t: 'Honor', w: 115, rp: true },
      { k: 'transport', t: 'Transport', w: 115, rp: true },
      { k: 'jam_tm', t: 'Jam TM', w: 65, num: true },
      { k: 'insentif', t: 'Insentif', w: 110, rp: true },
      { k: 'hari_datang', t: 'Hari', w: 55, num: true },
      { k: 'konsumsi', t: 'Konsumsi', w: 110, rp: true }
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
      { k: 'honor_gt', t: 'Honor GT', w: 110, rp: true },
      { k: 'jam_pt', t: 'PT', w: 55, num: true },
      { k: 'honor_pt', t: 'Honor PT', w: 110, rp: true },
      { k: 'jam_inf', t: 'Inf', w: 55, num: true },
      { k: 'honor_inf', t: 'Honor Inf', w: 110, rp: true },
      { k: 'jam_total', t: 'Jam', w: 60, num: true }
    ]
  },
  /* Ketiga piket dilaporkan terpisah karena memang tiga pembiayaan berbeda:
     dasar penugasannya beda, tarifnya beda, dan yang berhak pun beda. Bentuk
     tabelnya sama, jadi hanya judul, catatan, dan satu argumen yang berbeda. */
  ...(() => {
    const kolomPiket = [
      { k: 'hari', t: 'Hari jaga', w: 85, num: true },
      { k: 'tarif', t: 'Tarif/hari', w: 110, rp: true, jumlah: false }
    ];
    const dasar = 'Yang dibayar adalah orang yang benar-benar berjaga. Pada hari yang '
                + 'digantikan, harinya jatuh ke penggantinya — bukan ke petugas terjadwal.';
    return {
      piket_meja: {
        nama: 'Piket Meja Sekolah', fungsi: 'f_ip_transport_piket',
        arg: { p_jenis: 'Meja Sekolah' },
        judul: 'DAFTAR PENERIMAAN TRANSPORT PIKET MEJA SEKOLAH',
        catatan: dasar + ' Pemegang tugas Staf tidak dihitung di sini: kehadirannya sudah '
               + 'masuk kontrak jam kerja lewat fingerprint, jadi membayarnya lagi berarti dua kali.',
        kolom: kolomPiket
      },
      piket_unit: {
        nama: 'Piket Unit', fungsi: 'f_ip_transport_piket',
        arg: { p_jenis: 'Unit' },
        judul: 'DAFTAR PENERIMAAN TRANSPORT PIKET UNIT',
        catatan: dasar + ' Untuk guru diperbantukan yang menjaga unitnya, mis. Laboratorium '
               + 'IPA atau Perpustakaan.',
        kolom: kolomPiket
      },
      piket_parkiran: {
        nama: 'Piket Parkiran', fungsi: 'f_ip_transport_piket',
        arg: { p_jenis: 'Parkiran' },
        judul: 'DAFTAR PENERIMAAN KOMPENSASI PIKET PARKIRAN',
        catatan: dasar + ' Petugas parkiran memang staf, dan itu pengecualian yang sudah '
               + 'disepakati — jadi di sini staf tetap dihitung.',
        kolom: kolomPiket
      }
    };
  })(),
  pembina: {
    nama: 'Transport Pembina',
    fungsi: 'f_ip_transport_pembina',
    judul: 'DAFTAR PENERIMAAN TRANSPORT PEMBINA',
    catatan: 'Besaran tiap pertemuan ditentukan jumlah siswa yang hadir pada pertemuan itu, '
           + 'jadi dihitung per pertemuan lalu dijumlahkan — bukan dari rata-rata kehadiran, '
           + 'yang akan memberi hasil berbeda. Yang dibayar hanya pertemuan yang benar-benar '
           + 'berjalan dan dihadiri pembinanya atau penggantinya; pertemuan yang ditiadakan dan '
           + 'yang pembinanya tidak hadir sama-sama tidak dibayar. Pada pertemuan yang '
           + 'digantikan, haknya tetap pada pembina terjadwal — nama pengganti hanya dicatat '
           + 'sebagai keterangan, tidak tertaut ke data pembina.',
    kolom: [
      { k: 'jenis', t: 'Jenis', w: 110, jumlah: false },
      { k: 'pertemuan', t: 'Pertemuan', w: 90, num: true },
      { k: 'siswa_hadir', t: 'Siswa hadir', w: 100, num: true }
    ]
  },
  wali: {
    nama: 'Honor Wali Kelas',
    fungsi: 'f_ip_honor_wali_kelas',
    judul: 'DAFTAR PENERIMAAN HONOR WALI KELAS',
    catatan: 'Jamnya PER MINGGU, bukan jumlah jam sepanjang periode — honor wali kelas '
           + 'memang dibayarkan bulanan atas dasar jam kontrak itu, tidak dikalikan banyaknya '
           + 'pekan. Karena itu angkanya berbeda dari rekap Wali Kelas di aplikasi Kehadiran '
           + 'Guru, yang menghitung jam terjadwal sepanjang rentang tanggal untuk menilai '
           + 'kehadiran. Diisi di Data Induk → Piket & Honor → Komponen honor wali kelas. '
           + 'Baris bertanda "belum lengkap" masih ada komponen yang kosong — berbeda maknanya '
           + 'dengan nol.',
    kolom: [
      { k: 'jam_upacara', t: 'Jam Upacara /mg', w: 110, num: true },
      { k: 'honor_upacara', t: 'Honor Upacara', w: 125, rp: true },
      { k: 'jam_bimbingan', t: 'Jam Bimbingan /mg', w: 120, num: true },
      { k: 'honor_bimbingan', t: 'Honor Bimbingan', w: 130, rp: true },
      { k: 'jam_piket', t: 'Jam Piket /mg', w: 100, num: true },
      { k: 'honor_piket', t: 'Honor Piket', w: 115, rp: true }
    ]
  }
};

async function muatRekap() {
  const r = REKAP[ui.rekapJenis];
  D.rekap = await rpc(r.fungsi, { p_awal: ui.rekapAwal, p_akhir: ui.rekapAkhir, ...(r.arg || {}) });
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
  const punyaStaf = semua && semua.some(r => 'staf' in r);
  const baris = !semua ? null : (ui.ikutStaf || !punyaStaf ? semua : semua.filter(r => !r.staf));
  const jumlahStaf = punyaStaf ? semua.filter(r => r.staf).length : 0;
  const fp = baris ? baris.filter(r => r.fingerprint).length : 0;

  const kunciJumlah = ['jumlah', ...spek.kolom.filter(k => k.jumlah !== false && (k.num || k.rp)).map(k => k.k)];
  const total = (baris || []).reduce((t, r) => {
    for (const k of kunciJumlah) t[k] = (t[k] || 0) + (Number(r[k]) || 0);
    return t;
  }, {});

  // Jumlah nol padahal ada jam/hari tercatat berarti tarifnya belum diisi —
  // keadaan yang harus dikatakan, bukan ditampilkan sebagai Rp 0 begitu saja.
  const adaKegiatan = (baris || []).some(r => spek.kolom.some(k => k.num && Number(r[k.k]) > 0));
  const tarifKosong = baris && baris.length && adaKegiatan && !(total.jumlah > 0);

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Rekapitulasi Pembiayaan</h1>
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
      <b>Pengaturan Nominal</b>, lalu hitung ulang.</div>` : ''}
    ${jumlahStaf ? `<div class="info-box"><b>${jumlahStaf} pemegang tugas Staf
      ${ui.ikutStaf ? 'ikut ditampilkan' : 'dikecualikan'}.</b>
      Tugas Staf menggugurkan honor tambahan: jam kerjanya sudah dihitung lewat fingerprint,
      jadi membayarnya lagi berarti dua kali. Mereka tetap ditampilkan supaya jumlah orang
      di rekap ini sama dengan jumlah yang sebenarnya memegang tugas itu.
      <button class="btn btn-sm" id="rStaf" style="margin-left:8px">${
        ui.ikutStaf ? 'Kecualikan lagi' : 'Tampilkan juga'}</button></div>` : ''}
    ${fp ? `<div class="info-box"><b>${fp} guru berinsentif fingerprint.</b>
      Insentif tatap muka dan konsumsinya dibayarkan akhir bulan lewat mesin kehadiran,
      jadi di sini ditulis nol supaya jumlahnya sama dengan yang benar-benar dibayarkan.</div>` : ''}

    <div class="panel"><div class="panel-head"><h3>${esc(spek.nama)}</h3>
      <div class="sp" style="flex:1"></div>
      <div class="info">${esc(tglIndo(ui.rekapAwal))} – ${esc(tglIndo(ui.rekapAkhir))}</div>
      <button class="btn btn-sm" id="rUnduh" style="margin-left:10px">Unduh (xlsx)</button></div>
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
            b.staf ? ' <span class="tag tag-l">Staf</span>' : ''}${
            b.belum_lengkap ? ' <span class="kecil" style="color:var(--warn)">belum lengkap</span>' : ''}${
            'masa_kerja' in b && b.masa_kerja == null ? ' <span class="kecil" style="color:var(--warn)">TMT kosong</span>' : ''}</td>
          ${spek.kolom.map(k => `<td class="${k.num || k.rp ? 'num' : ''}">${angkaSel(b, k)}</td>`).join('')}
          <td class="num" style="font-weight:600">${rupiah(b.jumlah)}</td></tr>`).join('')
        : `<tr><td colspan="${spek.kolom.length + 3}"><div class="empty"><b>Tidak ada penerima</b>
            Tidak ada catatan untuk jenis pembiayaan ini pada periode tersebut.</div></td></tr>`
      }</tbody>
      ${baris.length ? `<tfoot><tr>
        <td class="num lekat-no"></td><td class="lekat" style="font-weight:600">Jumlah</td>
        ${spek.kolom.map(k => `<td class="${k.num || k.rp ? 'num' : ''}" style="font-weight:600">${
          k.jumlah === false ? '—' : k.rp ? rupiah(total[k.k] || 0) : (total[k.k] || 0)}</td>`).join('')}
        <td class="num" style="font-weight:700">${rupiah(total.jumlah || 0)}</td></tr></tfoot>` : ''}
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
  if ($('#rUnduh')) $('#rUnduh').onclick = () => jalankan('Menyiapkan berkas…', () => unduhRekap(spek, baris, total));
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
  let logo = null;
  try {
    logo = { buffer: await fetch('assets/logo.png').then(r => r.ok ? r.arrayBuffer() : Promise.reject()) };
  } catch (e) { /* tanpa logo pun berkasnya tetap terbentuk */ }

  const baris1 = kopBersama().kopExcel(ws, {
    wb, logo, profil: p,
    judul: spek.judul,
    sub: `Periode ${tglIndo(ui.rekapAwal)} – ${tglIndo(ui.rekapAkhir)}`,
    kolomAkhir: KOL, font: F
  });

  const TIPIS = { style: 'thin', color: { argb: 'FF808080' } };
  const KOTAK = { top: TIPIS, left: TIPIS, bottom: TIPIS, right: TIPIS };
  const RP = '"Rp" #,##0';

  let r = baris1;
  ['NO', 'NAMA', ...kolom.map(k => k.t.toUpperCase()), 'JUMLAH', 'TANDA TANGAN'].forEach((t, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = t; c.font = { name: F, size: 9, bold: true };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = KOTAK;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  ws.getRow(r).height = 30;
  r += 1;

  const sel = (br, kl, nilai, opsi = {}) => {
    const c = ws.getCell(br, kl);
    c.value = nilai;
    c.font = { name: F, size: 10, bold: !!opsi.tebal };
    c.alignment = { horizontal: opsi.rata || (typeof nilai === 'number' ? 'right' : 'left'), vertical: 'middle' };
    c.border = KOTAK;
    if (opsi.fmt) c.numFmt = opsi.fmt;
    if (opsi.abu) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
    return c;
  };

  baris.forEach((b, i) => {
    sel(r, 1, i + 1, { rata: 'center' });
    sel(r, 2, b.nama);
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

  ws.getCell(r, 2).value = 'Keterangan: ' + spek.catatan;
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

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${spek.nama} ${ui.rekapAwal} sd ${ui.rekapAkhir}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  toast('Berkas diunduh');
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
layarMasuk();
