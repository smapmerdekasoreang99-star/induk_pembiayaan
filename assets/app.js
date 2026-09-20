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
let D = { jenis: [], tarif: [], profil: null, galat: {} };
let halaman = 'beranda';
let ui = { acuan: '' };

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

  // Identitas dokumen milik Data Induk. Kegagalannya tidak menjatuhkan
  // halaman lain — hanya kop dokumen yang kosong.
  try {
    const pr = await ambil('profil_dokumen', 'select=*&limit=1');
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
function halRekap() {
  $('#isi').innerHTML = `
    <div class="head"><div><h1>Rekapitulasi Pembiayaan</h1>
      <p>Jumlah yang harus dibayarkan per periode, per jenis pembiayaan, dengan
         unduhan Excel masing-masing.</p></div></div>

    <div class="info-box"><b>Halaman ini belum diisi.</b> Dikerjakan sesudah Pengaturan
      Nominal lengkap, karena angkanya harus memakai besaran yang berlaku pada periode
      yang direkap — bukan besaran hari ini.</div>

    <div class="panel"><div class="panel-head"><h3>Rencana isinya</h3></div>
      <div class="scroll"><table><thead><tr>
        <th>Rekap</th><th>Dihitung dari</th>
      </tr></thead><tbody>
        ${[
          ['Honor Mengajar', 'jam kontrak × tarif menurut masa kerja, ditambah transport, insentif tatap muka, dan konsumsi'],
          ['Honor Guru Pengganti', 'jumlah jam penggantian × tarif PT / GT / Infaler'],
          ['Transport Piket', 'hari jaga meja sekolah, unit, dan parkiran'],
          ['Transport Pembina', 'pertemuan ekskul dan Pembinaan Imtaq menurut jumlah siswa hadir'],
          ['Honor Wali Kelas', 'komponen upacara, bimbingan, dan piket'],
          ['Rekap gabungan', 'seluruhnya per orang, untuk daftar pembayaran dan tanda tangan']
        ].map(([a, b]) => `<tr><td style="font-weight:500">${esc(a)}</td>
          <td class="kecil">${esc(b)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
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
        ${baris('Catatan kaki', p && p.catatan_kaki)}
      </tbody></table></div></div>

    <p class="kecil">Nama bendahara penanda tangan belum ada di Profil Dokumen — sekarang
      masih tersimpan terpisah di pengaturan Kehadiran Guru. Itu termasuk yang akan
      dipindahkan ke Data Induk supaya benar-benar satu sumber.</p>`;
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
layarMasuk();
