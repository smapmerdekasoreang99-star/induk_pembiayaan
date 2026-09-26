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
let D = { jenis: [], tarif: [], tarifSemua: [], indeks: [], pendukung: [], orangPendukung: [], guruAktif: [], profil: null, setoran: null, rekap: null, hadir: null, galat: {} };
let halaman = 'beranda';
let ui = { acuan: '', rekapAwal: '', rekapAkhir: '', rekapJenis: 'mengajar',
           hadirAwal: '', hadirAkhir: '', hadirTab: 'kehadiran', hadirSaring: '', hadirIkutStaf: false,
           penggantiRinci: false, ekskulKategori: '', rekapBentuk: '',
           tunjanganTab: 'kesehatan', tunjanganCari: '', gajiTab: 'guru', rekapSub: {}, setoranTab: 'bpjs_kesehatan' };

/* ---------------------------------------------------------------- util */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
/* Halaman Nominal Penggajian hanya dibuka dengan PIN khusus (keputusan 25
   September 2026), sekali per sesi. Halaman lain tetap terbuka bagi
   operator dan bendahara. */
const PIN_NOMINAL = 'kepsek2026';

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
    cache: 'no-store',   // data selalu segar dari server, tidak pernah dari cache peramban
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
const ubah = (tabel, syarat, isi) =>
  api(`/rest/v1/${tabel}?${syarat}`, { method: 'PATCH', body: JSON.stringify(isi) });
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
  [D.jenis, D.tarif, D.tarifSemua, D.indeks, D.pendukung, D.orangPendukung, D.guruAktif] = await Promise.all([
    ambil('ip_jenis_tarif', 'select=*&order=urutan'),
    rpc('f_ip_tarif', { p_acuan: ui.acuan }),
    ambil('ip_tarif', 'select=kode,berlaku_mulai,batas_min,batas_maks,nilai&order=berlaku_mulai.asc,batas_min.asc'),
    // Parameter indeks staf (kenaikan per tahun, tahun mulai, batas) per versi.
    ambil('ip_indeks', 'select=kode,berlaku_mulai,kenaikan,sejak_tahun,maksimum,catatan&order=berlaku_mulai.asc'),
    // Honor tenaga pendukung per orang: komponennya, siapa yang berkelompok pendukung, dan daftar guru untuk menambah orang.
    ambil('ip_pendukung', 'select=id,guru_id,komponen,satuan,nilai,berlaku_mulai,berlaku_sampai,catatan&order=guru_id,komponen,berlaku_mulai.asc'),
    ambil('v_jam_kerja_guru', 'select=guru_id,nama,jabatan,kelompok_tarif&kelompok_tarif=eq.pendukung'),
    ambil('v_guru', 'select=id,nama,tmt_sekolah,status_aktif&status_aktif=eq.Aktif&order=nama')
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
  /* Kembali ke tab ini sesudah beberapa saat (26 September 2026): data yang
     diubah di aplikasi lain — pengesahan TuSehat/TuKerja dan jam kerja di Data
     Induk, kehadiran di Kehadiran Guru — tidak akan terlihat bila halaman
     memakai hasil muatan lama. Hitungan yang tersimpan dibuang dan halaman
     yang sedang dibuka dimuat ulang dengan periode yang sama. */
  let tersembunyiSejak = 0;
  document.onvisibilitychange = () => {
    if (document.hidden) { tersembunyiSejak = Date.now(); return; }
    if (!tersembunyiSejak || Date.now() - tersembunyiSejak < 15000 || $('#modal-root').innerHTML) return;
    tersembunyiSejak = 0;
    D.tunjangan = null; D.rekap = null; D.setoran = null;
    if (halaman === 'rekap' && ui.rekapAwal && ui.rekapAkhir) jalankan('Memuat ulang…', muatRekap);
    else if (halaman === 'setoran' && ui.rekapAwal && ui.rekapAkhir) jalankan('Memuat ulang…', muatSetoran);
    else if (halaman === 'hadir' && D.hadir) jalankan('Memuat ulang…', muatHadir);
    else jalankan('Memuat ulang…', muatSemua);
  };
  $$('#nav button').forEach(b => b.onclick = () => {
    if (b.dataset.hal === 'nominal' && !ui.nominalDibuka) {
      const pin = window.prompt('Masukkan PIN untuk membuka Nominal Penggajian:');
      if (pin == null) return;
      if (pin !== PIN_NOMINAL) { toast('PIN salah. Nominal Penggajian tidak dibuka.', true); return; }
      ui.nominalDibuka = true;
    }
    halaman = b.dataset.hal;
    $$('#nav button').forEach(x => x.classList.toggle('on', x === b));
    // Pengesahan dilakukan di Data Induk; tiap kali halaman Tunjangan dibuka,
    // daftarnya dibaca segar supaya yang baru disahkan langsung tampak.
    if (halaman === 'tunjangan') D.tunjangan = null;
    // Rekap yang dibuang karena ada perubahan (potongan, penyaluran) dihitung
    // ulang sendiri dengan periode yang sama, supaya perubahannya langsung
    // terlihat tanpa menekan Hitung lagi.
    if (halaman === 'rekap' && !D.rekap && ui.rekapAwal && ui.rekapAkhir) { jalankan('Menghitung…', muatRekap); return; }
    if (halaman === 'setoran' && !D.setoran && ui.rekapAwal && ui.rekapAkhir) { jalankan('Menghitung…', muatSetoran); return; }
    gambar();
  });
  gambar();
}

function gambar() {
  if (!$('#isi')) return;
  ({ beranda: halBeranda, hadir: halHadir, nominal: halNominal, tunjangan: halTunjangan,
     rekap: halRekap, setoran: halSetoran, identitas: halIdentitas }[halaman] || halBeranda)();
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
      Isi di halaman Nominal Penggajian sebelum rekap dijalankan.</div>` : ''}
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
/* Tunjangan yang punya potongan porsi guru (TuSehat, TuKerja): di database
   tetap dua kode besaran, tetapi di Nominal Penggajian keduanya SATU kartu — nominal
   dari sekolah dan potongan guru berdampingan — satu formulir, satu riwayat,
   disimpan bersama pada tanggal berlaku yang sama. Kode potongannya tidak
   digambar sebagai kartu sendiri. */
/* Kartu ganda: satu kartu, dua besaran (kode utama + kode pasangan), satu
   formulir, satu riwayat, tanggal berlaku yang sama. Dipakai TuSehat/TuKerja
   (nominal dari sekolah + potongan porsi guru) dan, sejak 25 September 2026,
   Tunjangan Jabatan Wakasek (nominal per hari + tambahan hari bagi kontrak
   kurang dari 5 hari). `bentuk` pasangan: rupiah atau indeks (desimal). */
const PASANGAN = {
  bpjs_kesehatan: { kode: 'potongan_bpjs_kesehatan', utama: 'Dari sekolah', judul: 'Potongan guru', label: 'Potongan porsi guru',
    bentuk: 'rupiah', step: 500, hintUtama: ', ditanggung sekolah untuk tiap penerima',
    hint: j => `${j.satuan}, bawaan untuk semua penerima; dikurangkan dari pendapatan guru. Angka per orang yang berbeda diatur di Tunjangan dan Potongan.` },
  bpjs_ketenagakerjaan: { kode: 'potongan_bpjs_ketenagakerjaan', utama: 'Dari sekolah', judul: 'Potongan guru', label: 'Potongan porsi guru',
    bentuk: 'rupiah', step: 500, hintUtama: ', ditanggung sekolah untuk tiap penerima',
    hint: j => `${j.satuan}, bawaan untuk semua penerima; dikurangkan dari pendapatan guru. Angka per orang yang berbeda diatur di Tunjangan dan Potongan.` },
  tj_wakasek: { kode: 'tj_wakasek_tambahan_hari', utama: 'Nominal per hari', judul: 'Tambahan hari (kontrak < 5 hari)', label: 'Tambahan hari bila kontrak kurang dari 5 hari',
    bentuk: 'indeks', step: 0.5, hintUtama: ', dikalikan hari kerja per minggu',
    hint: () => 'Wakasek yang hari kerja per minggunya kurang dari 5 dibayar untuk hari kerjanya ditambah angka ini: kontrak 4 hari → 4 + 0,5 = 4,5 hari. Kontrak 5 hari tidak ditambah.' }
};
const POTONGAN_DARI = Object.fromEntries(Object.entries(PASANGAN).map(([k, v]) => [k, v.kode]));
const KODE_POTONGAN = new Set(Object.values(POTONGAN_DARI));
const teksPasangan = (p, n) => p.bentuk === 'indeks' ? angkaIndeks(n) : rupiah(n);

/* Besaran berbentuk INDEKS (Nominal Penggajian Staf, 25 September 2026): nilainya
   angka pengali berdesimal, bukan rupiah. Dasarnya (boleh berjenjang menurut
   masa kerja) disimpan di ip_tarif seperti besaran lain; kenaikan per tahun,
   tahun mulai, dan batas atasnya di ip_indeks dengan tanggal berlaku yang
   sama. Rumusnya di f_ip_indeks_staf:
     indeks = MIN(maksimum, dasar(masa kerja) + kenaikan × (masa kerja − sejak_tahun)) */
const angkaIndeks = n => Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const teksNilai = (j, n) => j.bentuk === 'indeks' ? angkaIndeks(n) : rupiah(n);
// Parameter indeks yang berlaku pada tanggal tertentu (D.indeks urut berlaku_mulai naik).
const indeksPada = (kode, tgl) => (D.indeks || []).filter(i => i.kode === kode && i.berlaku_mulai <= tgl).pop() || null;
/* Jejak hitung indeks satu baris daftar staf, untuk keterangan sel: versi
   mana yang dipakai (yang berlaku pada tanggal AKHIR periode), dasar
   jenjang menurut masa kerja, kenaikan, dan batasnya — supaya angka di
   daftar bisa dicocokkan dengan kartu Indeks di Nominal Penggajian Staf. */
function jelaskanIndeks(r) {
  const kode = r.kelompok_tarif === 'kepala_tu' ? 'indeks_tata_usaha' : 'indeks_' + r.kelompok_tarif;
  const akhir = ui.rekapAkhir, mk = Number(r.masa_kerja) || 0;
  const versi = (D.tarifSemua || []).filter(t => t.kode === kode && t.berlaku_mulai <= akhir)
    .reduce((m, t) => t.berlaku_mulai > m ? t.berlaku_mulai : m, '');
  if (!versi) return 'Belum ada versi indeks yang berlaku pada ' + tglIndo(akhir);
  const jenjang = (D.tarifSemua || []).filter(t => t.kode === kode && t.berlaku_mulai === versi);
  const dasar = jenjang.find(t => mk >= (t.batas_min == null ? 0 : t.batas_min) && (t.batas_maks == null || mk <= t.batas_maks));
  const p = indeksPada(kode, akhir);
  const naik = p ? Math.max(0, mk - p.sejak_tahun) * Number(p.kenaikan) : 0;
  const mentah = (dasar ? Number(dasar.nilai) : 0) + naik;
  const hasil = p && p.maksimum != null ? Math.min(Number(p.maksimum), mentah) : mentah;
  return `Versi berlaku ${tglIndo(versi)} (dipakai karena periode berakhir ${tglIndo(akhir)}). `
    + `Dasar jenjang masa kerja ${mk} tahun = ${dasar ? angkaIndeks(dasar.nilai) : 'tidak ada jenjang yang cocok'}`
    + (p ? ` + ${angkaIndeks(p.kenaikan)} × (${mk} − ${p.sejak_tahun}) = ${angkaIndeks(mentah)}`
          + (p.maksimum != null ? `, maksimum ${angkaIndeks(p.maksimum)}` : '') : ' (kenaikan belum diisi)')
    + ` → ${angkaIndeks(hasil)}.`;
}
const teksIndeks = i => !i ? ''
  : `+ ${angkaIndeks(i.kenaikan)} per tahun masa kerja sejak tahun ke-${i.sejak_tahun}`
    + (i.maksimum != null ? `, maksimum ${angkaIndeks(i.maksimum)}` : ', tanpa batas atas');

/* Nominal Penggajian dipecah dua tab menurut PENERIMANYA (25 September 2026): guru
   atau staf. Pembagiannya kolom ip_jenis_tarif.penerima — guru, staf, atau
   semua (tampil di kedua tab) — bukan kelompok, karena satu kelompok bisa
   memuat keduanya (Tunjangan dan Potongan: TuSehat guru, TuKerja staf).
   Jenis tanpa nilai penerima (database lama) dianggap untuk guru. */
const GAJI_TAB = {
  guru: { nama: 'Nominal Penggajian Guru', judul: 'Nominal Penggajian Guru',
          keterangan: 'Nominal tiap jenis pembiayaan untuk guru: mengajar, pengganti, wali kelas, '
                    + 'diperbantukan, piket, dan pembina. Bawaan tunjangan dan potongan diatur di halaman '
                    + 'Tunjangan dan Potongan.' },
  staf: { nama: 'Nominal Penggajian Staf', judul: 'Nominal Penggajian Staf',
          keterangan: 'Formulasi honor staf (tenaga kependidikan) mengikuti berkas bendahara: gaji pokok per jam '
                    + 'menurut masa kerja, tunjangan jabatan per hari, lalu transport berdiri, transport HTM, dan '
                    + 'konsumsi yang dikalikan indeks kelompok jabatan (dasar + kenaikan per tahun masa kerja, '
                    + 'dibatasi maksimum). Juga piket parkiran.' }
};
const untukTab = (j, tab) => { const p = j.penerima || 'guru'; return p === 'semua' || p === tab; };

function halNominal() {
  const tab = GAJI_TAB[ui.gajiTab] ? ui.gajiTab : 'guru';
  const T = GAJI_TAB[tab];
  /* Kelompok Tunjangan dan Potongan (TuSehat, TuKerja, iuran koperasi) tidak
     digambar di sini sejak 25 September 2026: bawaannya diubah dari halaman
     Tunjangan dan Potongan lewat tombol Ubah bawaan, dengan formulir dan
     riwayat yang sama. */
  const aktif = D.jenis.filter(j => j.aktif && !KODE_POTONGAN.has(j.kode) && untukTab(j, tab)
    && j.kelompok !== 'Tunjangan dan Potongan');
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
    // Kartu ganda: nominal dari sekolah dan potongan porsi guru berdampingan.
    const pasangan = PASANGAN[j.kode];
    const kodePot = pasangan ? pasangan.kode : null;
    const pot = kodePot ? tarifDari(kodePot) : [];
    const nilaiGanda = (b, judul, fmt) => `<div><span class="pg-label">${esc(judul)}</span>
      <div class="pg-nilai${!b.length ? ' kosong' : Number(b[0].nilai) === 0 ? ' nol' : ''}">${
        b.length ? fmt(b[0].nilai) : 'belum diisi'}</div></div>`;
    const isi = !baris.length
      ? '<div class="pg-nilai kosong">belum diisi</div>'
      : j.berjenjang
        ? `<table class="pg-jenjang"><tbody>${baris.map(t => `<tr>
            <td>${t.batas_min == null ? '—' : t.batas_min}${
              t.batas_maks == null ? ' ke atas' : '–' + t.batas_maks} ${esc(j.satuan_jenjang)}</td>
            <td>${teksNilai(j, t.nilai)}</td></tr>`).join('')}</tbody></table>`
        : kodePot
          ? `<div class="pg-ganda">${nilaiGanda(baris, pasangan.utama, n => teksNilai(j, n))}${nilaiGanda(pot, pasangan.judul, n => teksPasangan(pasangan, n))}</div>`
          : `<div class="pg-nilai${nol ? ' nol' : ''}">${teksNilai(j, baris[0].nilai)}</div>`;

    /* Versi yang belum berlaku pada tanggal acuan. Tanpa ini, besaran yang
       baru disimpan untuk bulan depan tidak terlihat di mana pun dan tampak
       seolah tidak tersimpan. */
    const mendatang = (D.tarifSemua || []).filter(t => t.kode === j.kode && t.berlaku_mulai > ui.acuan);
    const tglBerikut = mendatang.length ? mendatang[0].berlaku_mulai : null;
    const versiBerikut = tglBerikut ? mendatang.filter(t => t.berlaku_mulai === tglBerikut) : [];
    const potBerikut = kodePot && tglBerikut
      ? (D.tarifSemua || []).find(t => t.kode === kodePot && t.berlaku_mulai === tglBerikut) : null;
    const teksBerikut = !versiBerikut.length ? ''
      : j.berjenjang ? `${versiBerikut.length} jenjang`
      : teksNilai(j, versiBerikut[0].nilai) + (potBerikut ? ` · ${pasangan.judul.toLowerCase()} ${teksPasangan(pasangan, potBerikut.nilai)}` : '');

    return `<article class="pg-kartu${!baris.length ? ' kosong' : ''}">
      <div class="pg-kartu-atas"><h3>${esc(j.nama)}</h3><span class="pg-satuan">${esc(j.satuan)}</span></div>
      ${isi}
      ${j.bentuk === 'indeks' ? `<div class="pg-rumus">${esc(teksIndeks(indeksPada(j.kode, ui.acuan)) || 'Kenaikan per tahun dan batasnya belum diisi.')}</div>` : ''}
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
    <div class="head"><div><h1>${esc(T.judul)}</h1>
      <p>${esc(T.keterangan)} Mengubah nominal tidak menimpa yang lama —
         yang tersimpan adalah nominal baru beserta tanggal mulai berlakunya.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih"><label class="kecil">Berlaku pada</label>
        <input class="field" type="date" id="acuan" value="${esc(ui.acuan)}" style="width:auto"></div></div>

    <div class="bar">${Object.entries(GAJI_TAB).map(([k, v]) =>
      `<button class="chip${k === tab ? ' on' : ''}" data-gaji="${k}">${esc(v.nama)}</button>`).join('')}
    </div>

    ${!aktif.length ? `<div class="panel"><div class="empty"><b>Belum ada jenis pembiayaan untuk tab ini.</b>
      Jenis pembiayaan dan penerimanya ditetapkan di database (ip_jenis_tarif).</div></div>` : ''}

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
    }).join('')}
    ${tab === 'staf' ? panelPendukung() : ''}`;

  $('#acuan').onchange = e => {
    ui.acuan = e.target.value || hariIniISO();
    jalankan('Memuat…', muatSemua);
  };
  $$('[data-gaji]').forEach(b => b.onclick = () => { ui.gajiTab = b.dataset.gaji; gambar(); });
  $$('[data-ubah]').forEach(b => b.onclick = () => formTarif(b.dataset.ubah));
  $$('[data-riwayat]').forEach(b => b.onclick = () => dialogRiwayat(b.dataset.riwayat));
  $$('[data-pd-tambah]').forEach(b => b.onclick = () => formPendukung(b.dataset.pdTambah, null));
  $$('[data-pd-ubah]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const p = D.pendukung.find(x => String(x.id) === a.dataset.pdUbah);
    if (p) formPendukung(p.guru_id, p);
  });
  $$('[data-pd-akhiri]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const p = D.pendukung.find(x => String(x.id) === a.dataset.pdAkhiri);
    if (p) akhiriPendukung(p);
  });
  $$('[data-pd-hapus]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const p = D.pendukung.find(x => String(x.id) === a.dataset.pdHapus);
    if (!p) return;
    if (!window.confirm(`Hapus komponen ${p.komponen} (${rupiah(p.nilai)} ${p.satuan}, berlaku ${tglIndo(p.berlaku_mulai)})? Tidak bisa dibatalkan.`)) return;
    jalankan('Menghapus…', async () => {
      await buang('ip_pendukung', `id=eq.${p.id}`);
      D.rekap = null; D.setoran = null;
      await muatSemua();
      toast(`Komponen ${p.komponen} dihapus`);
    });
  });
  if ($('[data-pd-orang]')) $('[data-pd-orang]').onclick = dialogTambahOrangPendukung;
}

/* ------------------------------------ honor tenaga pendukung per orang */
/* Tenaga pendukung (25 September 2026) tidak memakai formulasi umum staf,
   melainkan komponen per orang di ip_pendukung: per bulan, per jam hadir,
   atau per hari hadir. Yang tampil di sini: pemegang tugas Staf berkelompok
   tarif pendukung (Data Induk → Jam Kerja Staf) dan siapa pun yang sudah
   punya komponen — Firman, misalnya, tidak memegang tugas Staf. Komponen
   berversi: Ubah = versi baru sejak tanggal tertentu (versi lama diakhiri
   sehari sebelumnya), Akhiri = berhenti pada tanggal tertentu.           */
const SATUAN_PENDUKUNG = ['per bulan', 'per jam hadir', 'per hari hadir'];
const KOMPONEN_PENDUKUNG = ['Gaji', 'Gaji Bulanan', 'Gaji Mingguan', 'Tunjangan Pendidikan', 'Transpor Kedatangan'];
const isoLokal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const geserHari = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLokal(d); };
const akhirBulanDari = iso => { const d = new Date(iso + 'T00:00:00'); return isoLokal(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };

function orangPendukungSemua() {
  const peta = new Map();
  (D.orangPendukung || []).forEach(r => { if (!peta.has(r.guru_id)) peta.set(r.guru_id, { id: r.guru_id, nama: r.nama, jabatan: r.jabatan }); });
  (D.pendukung || []).forEach(p => {
    if (peta.has(p.guru_id)) return;
    const g = (D.guruAktif || []).find(x => x.id === p.guru_id);
    peta.set(p.guru_id, { id: p.guru_id, nama: g ? g.nama : p.guru_id, jabatan: null });
  });
  return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama));
}
// Komponen yang berlaku pada satu tanggal: per nama komponen, versi terbaru yang sudah mulai dan belum berakhir.
function komponenBerlaku(guruId, tgl) {
  const per = new Map();
  (D.pendukung || [])
    .filter(p => p.guru_id === guruId && p.berlaku_mulai <= tgl && (!p.berlaku_sampai || p.berlaku_sampai >= tgl))
    .forEach(p => { const l = per.get(p.komponen); if (!l || p.berlaku_mulai > l.berlaku_mulai) per.set(p.komponen, p); });
  return [...per.values()].sort((a, b) => SATUAN_PENDUKUNG.indexOf(a.satuan) - SATUAN_PENDUKUNG.indexOf(b.satuan) || a.komponen.localeCompare(b.komponen));
}

function panelPendukung() {
  const orang = orangPendukungSemua();
  return `<section class="pg-kelompok pg-emas">
    <header class="pg-kelompok-head"><span class="pg-titik"></span><h2>Honor Tenaga Pendukung (per orang)</h2>
      <span class="kecil">${orang.length} orang · komponen yang berlaku pada ${esc(tglIndo(ui.acuan))}</span>
      <div class="sp" style="flex:1"></div>
      <button class="btn btn-sm" data-pd-orang>+ Tambah orang</button></header>
    <p class="kecil" style="margin:0 0 12px;line-height:1.5">Tenaga pendukung tidak memakai formulasi umum staf (gaji pokok per jam, tunjangan
      jabatan, indeks), melainkan komponen per orang: <b>per bulan</b> (× bulan periode), <b>per jam hadir</b>, atau
      <b>per hari hadir</b> (× kehadiran fingerprint di Kehadiran Staf). Daftar pembayarannya di Honor dan Transpor → Staf →
      Pendukung. Yang termasuk: pemegang tugas Staf berkelompok tarif Tenaga Pendukung (Data Induk → Jam Kerja Staf) atau siapa
      pun yang diberi komponen di sini.</p>
    <div class="pg-grid">${orang.length ? orang.map(o => {
      const k = komponenBerlaku(o.id, ui.acuan);
      const nanti = (D.pendukung || []).filter(p => p.guru_id === o.id && p.berlaku_mulai > ui.acuan);
      const catatan = k.map(p => p.catatan).filter(Boolean)[0] || '';
      return `<article class="pg-kartu${k.length ? '' : ' kosong'}">
        <div class="pg-kartu-atas"><h3>${esc(o.nama)}</h3><span class="pg-satuan">${esc(o.jabatan || 'tanpa tugas Staf')}</span></div>
        ${k.length ? `<table class="pg-jenjang"><tbody>${k.map(p => `<tr>
            <td>${esc(p.komponen)}<div class="kecil">${esc(p.satuan)} · sejak ${esc(tglIndo(p.berlaku_mulai))}${
              p.berlaku_sampai ? ' s.d. ' + esc(tglIndo(p.berlaku_sampai)) : ''}</div></td>
            <td>${rupiah(p.nilai)}<div class="kecil" style="font-weight:400"><a href="#" data-pd-ubah="${p.id}">Ubah</a> ·
              <a href="#" data-pd-akhiri="${p.id}">Akhiri</a> ·
              <a href="#" data-pd-hapus="${p.id}">Hapus</a></div></td></tr>`).join('')}</tbody></table>`
          : '<div class="pg-nilai kosong">belum ada komponen</div>'}
        ${nanti.length ? `<div class="pg-berikut"><b>${nanti.length} versi berikutnya</b> mulai ${esc(tglIndo(nanti[0].berlaku_mulai))} —
          belum berlaku pada tanggal acuan.</div>` : ''}
        <p class="pg-penjelasan">${esc(catatan)}</p>
        <div class="pg-aksi"><button class="btn btn-sm btn-p" data-pd-tambah="${esc(o.id)}">+ Komponen</button></div></article>`;
    }).join('') : '<div class="empty" style="grid-column:1/-1"><b>Belum ada tenaga pendukung</b> Ketuk Tambah orang.</div>'}</div></section>`;
}

function formPendukung(guruId, lama) {
  const orang = orangPendukungSemua().find(o => o.id === guruId) || { nama: guruId };
  bukaModal(`<h2>${lama ? 'Ubah komponen' : 'Komponen baru'} — ${esc(orang.nama)}</h2><div class="body">
    ${lama ? `<p class="msg kecil">Nominal lama tidak dihapus: versi lama diakhiri sehari sebelum tanggal mulai
      yang baru, supaya rekap periode sebelumnya tetap memakai angka lama.</p>` : ''}
    <div class="fg"><label>Komponen <span style="color:var(--danger)">*</span></label>
      <input class="field" id="pd-komponen" list="pd-daftar" value="${esc(lama ? lama.komponen : '')}" ${lama ? 'readonly' : ''} autocomplete="off">
      <datalist id="pd-daftar">${KOMPONEN_PENDUKUNG.map(k => `<option value="${esc(k)}">`).join('')}</datalist>
      <div class="hint">Mis. Gaji, Tunjangan Pendidikan, Transpor Kedatangan. Nama ini yang tercetak di daftar.</div></div>
    <div class="fg"><label>Satuan <span style="color:var(--danger)">*</span></label>
      <select class="field" id="pd-satuan">${SATUAN_PENDUKUNG.map(x => `<option ${lama && lama.satuan === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <div class="hint">Per bulan dikalikan jumlah bulan periode; per jam hadir dan per hari hadir dikalikan kehadiran fingerprint di Kehadiran Staf.</div></div>
    <div class="fg"><label>Nominal <span style="color:var(--danger)">*</span></label>
      <input class="field num" type="number" min="0" step="500" id="pd-nilai" value="${lama ? Number(lama.nilai) : 0}"></div>
    <div class="fg"><label>Berlaku mulai <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="pd-mulai" value="${esc(awalBulan(ui.acuan))}">
      <div class="hint">Bawaannya tanggal 1 bulan acuan (${esc(tglIndo(awalBulan(ui.acuan)))}). Rekap sebuah periode memakai
        komponen yang berlaku pada tanggal AKHIR periode itu — bila tanggal mulainya sesudah akhir periode yang
        direkap, daftar periode itu masih memakai nominal lama.</div></div>
    <div class="fg penuh"><label>Catatan (opsional)</label>
      <input class="field" id="pd-catatan" value="${esc(lama && lama.catatan ? lama.catatan : '')}" placeholder="Mis. keputusan yayasan 1 Juli 2026"></div>
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-simpan">${lama ? 'Simpan sebagai versi baru' : 'Simpan'}</button></div>`, true);
  $('#m-batal').onclick = tutupModal;
  $('#m-simpan').onclick = () => {
    const komponen = $('#pd-komponen').value.trim(), mulai = $('#pd-mulai').value;
    if (!komponen) { $('#pd-komponen').focus(); return; }
    if (!mulai) { $('#pd-mulai').focus(); return; }
    const isi = { guru_id: guruId, komponen, satuan: $('#pd-satuan').value,
                  nilai: Math.max(0, Math.round(Number($('#pd-nilai').value) || 0)),
                  berlaku_mulai: mulai, catatan: $('#pd-catatan').value.trim() || null };
    tutupModal();
    jalankan('Menyimpan…', async () => {
      if (lama) {
        const sampai = geserHari(mulai, -1);
        // Versi lama berhenti sehari sebelum versi baru; bila versi baru mulai
        // lebih awal dari versi lama, versi lama tidak pernah berlaku — dibuang.
        if (sampai >= lama.berlaku_mulai) await ubah('ip_pendukung', `id=eq.${lama.id}`, { berlaku_sampai: sampai });
        else await buang('ip_pendukung', `id=eq.${lama.id}`);
      }
      await buang('ip_pendukung', `guru_id=eq.${enc(guruId)}&komponen=eq.${enc(komponen)}&berlaku_mulai=eq.${enc(mulai)}`);
      await simpanBaru('ip_pendukung', [isi]);
      const acuanPindah = mulai > ui.acuan;
      if (acuanPindah) ui.acuan = mulai;
      D.rekap = null; D.setoran = null;   // rekap yang sudah dihitung memakai komponen lama
      await muatSemua();
      toast(`${orang.nama}: ${komponen} ${rupiah(isi.nilai)} ${isi.satuan}, berlaku ${tglIndo(mulai)}`
        + (acuanPindah ? `. Tanggal acuan halaman dipindahkan ke ${tglIndo(mulai)}.` : ''));
    });
  };
}

function akhiriPendukung(p) {
  const orang = orangPendukungSemua().find(o => o.id === p.guru_id) || { nama: p.guru_id };
  bukaModal(`<h2>Akhiri komponen — ${esc(orang.nama)}</h2><div class="body">
    <p class="msg kecil"><b>${esc(p.komponen)}</b> ${esc(rupiah(p.nilai))} ${esc(p.satuan)}, berlaku sejak ${esc(tglIndo(p.berlaku_mulai))}.
      Sesudah tanggal di bawah, komponen ini tidak dihitung lagi; rekap periode sebelumnya tidak berubah.</p>
    <div class="fg"><label>Berlaku sampai <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="pd-sampai" value="${esc(akhirBulanDari(ui.acuan))}"></div>
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-d" id="m-simpan">Akhiri</button></div>`, true);
  $('#m-batal').onclick = tutupModal;
  $('#m-simpan').onclick = () => {
    const sampai = $('#pd-sampai').value;
    if (!sampai) { $('#pd-sampai').focus(); return; }
    if (sampai < p.berlaku_mulai) { toast('Tanggal akhir mendahului tanggal mulainya.', true); return; }
    tutupModal();
    jalankan('Menyimpan…', async () => {
      await ubah('ip_pendukung', `id=eq.${p.id}`, { berlaku_sampai: sampai });
      D.rekap = null; D.setoran = null;
      await muatSemua();
      toast(`${orang.nama}: ${p.komponen} berakhir ${tglIndo(sampai)}`);
    });
  };
}

function dialogTambahOrangPendukung() {
  const ada = new Set(orangPendukungSemua().map(o => o.id));
  const pilihan = (D.guruAktif || []).filter(g => !ada.has(g.id));
  bukaModal(`<h2>Tambah tenaga pendukung</h2><div class="body">
    <p class="msg kecil">Pilih orangnya, lalu isi komponen pertamanya. Bila ia memegang tugas Staf, kelompok tarifnya
      sebaiknya juga ditetapkan Tenaga Pendukung di Data Induk → Jam Kerja Staf agar tidak ikut daftar staf lain.</p>
    <div class="fg"><label>Orang</label>
      <select class="field" id="pd-orang">${pilihan.map(g => `<option value="${esc(g.id)}">${esc(g.nama)}</option>`).join('')}</select></div>
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-simpan" ${pilihan.length ? '' : 'disabled'}>Lanjut ke komponen</button></div>`, true);
  $('#m-batal').onclick = tutupModal;
  $('#m-simpan').onclick = () => { const id = $('#pd-orang').value; tutupModal(); if (id) formPendukung(id, null); };
}

/* Mengubah besaran = menambah versi baru, bukan menyunting yang lama.
   Karena itu formulirnya selalu menanyakan tanggal mulai berlakunya. */
function formTarif(kode) {
  const j = D.jenis.find(x => x.kode === kode);
  if (!j) return;
  /* Formulir diisi dari VERSI TERBARU yang tersimpan (termasuk yang belum
     berlaku pada tanggal acuan), bukan dari versi yang berlaku hari ini —
     supaya versi bulan depan yang baru disimpan terbaca utuh saat dibuka
     lagi (25 September 2026: 10 jenjang tersimpan untuk Oktober, formulir
     hanya memperlihatkan 6 jenjang versi September). Tanggal mulainya ikut
     versi itu bila masih di depan, sehingga menyimpan menimpa versi itu. */
  const versiTerbaru = kd => {
    const semua = (D.tarifSemua || []).filter(t => t.kode === kd);
    const tgl = semua.reduce((m, t) => t.berlaku_mulai > m ? t.berlaku_mulai : m, '');
    return { tgl, baris: semua.filter(t => t.berlaku_mulai === tgl) };
  };
  const vt = versiTerbaru(kode);
  const sekarang = vt.baris;
  // Kartu ganda (TuSehat, TuKerja, Tunjangan Wakasek): pasangannya diisi di formulir yang sama.
  const pasangan = PASANGAN[kode];
  const kodePot = pasangan ? pasangan.kode : null;
  const potSekarang = kodePot ? versiTerbaru(kodePot).baris : [];
  // Bentuk indeks: nilai berdesimal, dan ada parameter kenaikan/batas yang ikut disimpan.
  const indeks = j.bentuk === 'indeks';
  const ind = indeks ? indeksPada(kode, vt.tgl || ui.acuan) : null;
  const mulaiBawaan = vt.tgl && vt.tgl > awalBulan(ui.acuan) ? vt.tgl : awalBulan(ui.acuan);
  const langkah = indeks ? '0.005' : '500';

  const barisJenjang = () => (sekarang.length ? sekarang : [{ batas_min: 0, batas_maks: null, nilai: 0 }])
    .map((t, i) => `<tr>
      <td><input class="field num" type="number" min="0" step="1" data-j="min" data-i="${i}"
            value="${t.batas_min == null ? 0 : t.batas_min}"></td>
      <td><input class="field num" type="number" min="0" step="1" data-j="maks" data-i="${i}"
            value="${t.batas_maks == null ? '' : t.batas_maks}" placeholder="ke atas"></td>
      <td><input class="field num" type="number" min="0" step="${langkah}" data-j="nilai" data-i="${i}"
            value="${Number(t.nilai) || 0}"></td>
      <td style="text-align:right"><button class="btn btn-sm btn-d" data-hapus-j="${i}">Hapus</button></td>
    </tr>`).join('');

  bukaModal(`<h2>Ubah nominal — ${esc(j.nama)}</h2><div class="body">
    <p class="msg kecil">Besaran lama tidak dihapus. Yang tersimpan adalah besaran baru
      beserta tanggal mulai berlakunya, sehingga rekap periode sebelumnya tetap memakai
      angka yang lama.</p>

    <div class="fg"><label>Berlaku mulai <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="t-mulai" value="${esc(mulaiBawaan)}">
      <div class="hint">${vt.tgl ? `Isian di bawah diambil dari versi terbaru yang tersimpan, berlaku mulai ${esc(tglIndo(vt.tgl))}${
          vt.tgl > ui.acuan ? ' (belum berlaku pada tanggal acuan)' : ''}. Menyimpan dengan tanggal yang sama menimpa versi itu; tanggal lain membuat versi baru. ` : ''}Rekap sebuah periode
        memakai besaran yang berlaku pada tanggal AKHIR periode itu: bila tanggal mulainya sesudah akhir periode
        yang direkap, daftar periode itu masih memakai besaran lama.</div></div>

    ${j.berjenjang ? `
      <div class="fg penuh"><label>Jenjang menurut ${esc(j.satuan_jenjang)}</label>
        <table class="log"><thead><tr>
          <th style="width:110px">Dari</th><th style="width:110px">Sampai</th>
          <th>Besaran (${esc(j.satuan)})</th><th style="width:90px"></th>
        </tr></thead><tbody id="t-jenjang">${barisJenjang()}</tbody></table>
        <button class="btn btn-sm" id="t-tambah" style="margin-top:8px">+ Tambah jenjang</button>
        <div class="hint">Kosongkan kolom "Sampai" pada jenjang terakhir agar berlaku ke atas.</div></div>`
      : `
      <div class="fg"><label>${pasangan ? esc(pasangan.utama) : 'Besaran'} <span style="color:var(--danger)">*</span></label>
        <input class="field num" type="number" min="0" step="${langkah}" id="t-nilai"
          value="${sekarang.length ? Number(sekarang[0].nilai) : 0}">
        <div class="hint">${esc(j.satuan)}${pasangan ? esc(pasangan.hintUtama) : ''}</div></div>
      ${pasangan ? `
      <div class="fg"><label>${esc(pasangan.label)} <span style="color:var(--danger)">*</span></label>
        <input class="field num" type="number" min="0" step="${pasangan.step}" id="t-potongan"
          value="${potSekarang.length ? Number(potSekarang[0].nilai) : 0}">
        <div class="hint">${esc(pasangan.hint(j))}</div></div>` : ''}`}

    ${indeks ? `
      <div class="fg"><label>Kenaikan per tahun masa kerja <span style="color:var(--danger)">*</span></label>
        <input class="field num" type="number" min="0" step="0.001" id="t-kenaikan" value="${ind ? Number(ind.kenaikan) : 0}">
        <div class="hint">Ditambahkan ke dasar untuk tiap tahun masa kerja di atas tahun mulai; 0 bila indeks tidak naik.</div></div>
      <div class="fg"><label>Mulai dihitung sejak tahun ke- <span style="color:var(--danger)">*</span></label>
        <input class="field num" type="number" min="0" step="1" id="t-sejak" value="${ind ? ind.sejak_tahun : 2}">
        <div class="hint">Rumus bendahara: (masa kerja − 2) × kenaikan. Di bawah tahun ini kenaikannya nol, tidak minus.</div></div>
      <div class="fg"><label>Indeks maksimum</label>
        <input class="field num" type="number" min="0" step="0.05" id="t-maks" value="${ind && ind.maksimum != null ? Number(ind.maksimum) : ''}" placeholder="tanpa batas">
        <div class="hint">Indeks berhenti naik di angka ini. Kosongkan bila tidak dibatasi.</div></div>` : ''}

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
        <td><input class="field num" type="number" min="0" step="${langkah}" data-j="nilai" data-i="${i}" value="0"></td>
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
      // Potongan porsi guru disimpan sebagai kode sendiri, tanggal yang sama.
      if (kodePot) baris.push({ ...baris[0], kode: kodePot, nilai: Number($('#t-potongan').value) || 0 });
    }
    // Parameter indeks disimpan bersama dasarnya, tanggal berlaku yang sama.
    const barisIndeks = !indeks ? null : {
      kode, berlaku_mulai: mulai,
      kenaikan: Number($('#t-kenaikan').value) || 0,
      sejak_tahun: Math.max(0, Math.round(Number($('#t-sejak').value) || 0)),
      maksimum: $('#t-maks').value === '' ? null : Number($('#t-maks').value),
      catatan: $('#t-catatan').value.trim() || null
    };

    tutupModal();
    jalankan('Menyimpan…', async () => {
      // Versi dengan tanggal berlaku yang sama ditulis ulang seluruhnya,
      // supaya jenjang yang dihapus di formulir ikut hilang.
      const kodeSemua = kodePot ? `in.(${enc(kode)},${enc(kodePot)})` : `eq.${enc(kode)}`;
      await buang('ip_tarif', `kode=${kodeSemua}&berlaku_mulai=eq.${enc(mulai)}`);
      await simpanBaru('ip_tarif', baris);
      if (barisIndeks) {
        await buang('ip_indeks', `kode=eq.${enc(kode)}&berlaku_mulai=eq.${enc(mulai)}`);
        await simpanBaru('ip_indeks', [barisIndeks]);
      }
      /* Bila versi barunya belum berlaku pada tanggal acuan, halaman akan
         tetap menampilkan versi lama dan besaran yang baru saja disimpan
         tampak hilang. Tanggal acuannya dipindahkan ke tanggal berlakunya,
         dan pemindahan itu disebut di pesan. */
      const acuanPindah = mulai > ui.acuan;
      if (acuanPindah) ui.acuan = mulai;
      D.rekap = null; D.setoran = null;   // rekap yang sudah dihitung memakai besaran lama
      await muatSemua();
      toast(`${j.nama}: besaran baru berlaku ${tglIndo(mulai)}`
        + (acuanPindah ? `. Tanggal acuan halaman dipindahkan ke ${tglIndo(mulai)} supaya besaran itu terlihat.` : ''));
    });
  };
}

function dialogRiwayat(kode) {
  const j = D.jenis.find(x => x.kode === kode);
  const pasangan = PASANGAN[kode];
  const kodePot = pasangan ? pasangan.kode : null;   // kartu ganda: riwayat pasangannya ikut ditampilkan
  jalankan('Memuat riwayat…', async () => {
    const indeksSemua = j.bentuk === 'indeks'
      ? (await ambil('ip_indeks', `select=*&kode=eq.${enc(kode)}`)) || [] : [];
    const semua = await ambil('ip_tarif',
      `select=*&kode=${kodePot ? `in.(${enc(kode)},${enc(kodePot)})` : `eq.${enc(kode)}`}`
      + '&order=berlaku_mulai.desc,kode.asc,batas_min.asc');
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
            <td class="kecil">${kodePot ? esc(t.kode === kode ? pasangan.utama : pasangan.judul)
              : t.batas_min == null ? 'semua'
              : `${t.batas_min}${t.batas_maks == null ? ' ke atas' : '–' + t.batas_maks} ${esc(j.satuan_jenjang || '')}`}</td>
            <td style="text-align:right;font-weight:600">${kodePot && t.kode !== kode ? teksPasangan(pasangan, t.nilai) : teksNilai(j, t.nilai)}</td></tr>`).join('')}</tbody></table>
          ${(() => { const i = indeksSemua.find(x => x.berlaku_mulai === mulai);
                     return i ? `<div class="hint"><b>${esc(teksIndeks(i))}</b></div>` : ''; })()}
          ${baris[0].catatan ? `<div class="hint">${esc(baris[0].catatan)}</div>` : ''}
          <div style="margin-top:6px"><button class="btn btn-sm btn-d" data-hapus-versi="${esc(mulai)}">Hapus versi ini</button></div></div>`).join('')
        : '<p class="msg kecil">Belum ada besaran yang pernah disimpan.</p>'}
      </div>
      <div class="aksi"><button class="btn" id="m-batal">Tutup</button></div>`, true);
    $('#m-batal').onclick = tutupModal;
    /* Menghapus satu versi — untuk merapikan uji coba. Versi yang berlaku
       sebelumnya otomatis kembali dipakai; bila tidak ada versi lain, jenis
       itu kembali "belum diisi". Rekap yang tersimpan dibuang supaya dihitung
       ulang. */
    $$('[data-hapus-versi]').forEach(b => b.onclick = () => {
      const mulai = b.dataset.hapusVersi;
      if (!window.confirm(`Hapus versi ${j.nama} yang berlaku mulai ${tglIndo(mulai)}? Tidak bisa dibatalkan.`)) return;
      tutupModal();
      jalankan('Menghapus…', async () => {
        const kodeSemua = kodePot ? `in.(${enc(kode)},${enc(kodePot)})` : `eq.${enc(kode)}`;
        await buang('ip_tarif', `kode=${kodeSemua}&berlaku_mulai=eq.${enc(mulai)}`);
        if (j.bentuk === 'indeks') await buang('ip_indeks', `kode=eq.${enc(kode)}&berlaku_mulai=eq.${enc(mulai)}`);
        D.rekap = null; D.setoran = null;
        await muatSemua();
        toast(`${j.nama}: versi ${tglIndo(mulai)} dihapus`);
        dialogRiwayat(kode);
      });
    });
  });
}

/* --------------------------------------------- tunjangan dan potongan */
/* Empat tab dalam satu halaman:
   1–2. TuSehat dan TuKerja: penyaluran per orang (BPJS, Simponi BNI, DPLK
        BJB), nomor peserta, NOMINAL dari sekolah dan POTONGAN porsi guru
        per bulan. Bawaan keduanya diubah di halaman ini lewat tombol Ubah bawaan
        (kartunya tidak lagi di Nominal Penggajian sejak 25 September 2026); angka per orang
        yang berbeda disimpan di sini — berversi menurut tanggal berlaku,
        seperti besaran — dan berlaku sampai diubah lagi. Yang kosong
        mengikuti bawaan, jadi bila bawaannya berubah, yang mengikuti
        bawaan ikut berubah, sedangkan yang sudah ditetapkan sendiri tidak.
        Siapa yang BERHAK ditentukan Data Induk (kelayakan dihitung,
        pengesahan kepala sekolah) — di sini hanya penyalurannya.
   3–4. Potongan sekolah (pinjaman ke sekolah, lainnya) dan potongan
        koperasi (iuran keanggotaan, tabungan koperasi, pinjaman koperasi): satu
        baris satu potongan per orang, dengan bulan mulai dan bulan
        terakhir (kosong = sampai diubah). Seorang guru boleh punya
        beberapa sekaligus. Mengubah nominal = mengakhiri baris lama dan
        menambah baris baru, supaya rekap bulan lalu tidak berubah.
   Semua potongan dikurangkan dari pendapatan di Gabungan Keseluruhan.      */
const TUNJANGAN = { kesehatan: 'TuSehat', ketenagakerjaan: 'TuKerja' };
const BENTUK = {
  kesehatan:       ['BPJS Kesehatan', 'Simponi BNI', 'DPLK BJB'],
  ketenagakerjaan: ['BPJS Ketenagakerjaan', 'Simponi BNI', 'DPLK BJB']
};
// Kode besaran di Nominal Penggajian yang menjadi bawaan nominal dan potongan.
const KODE_TUNJANGAN = {
  kesehatan:       { nominal: 'bpjs_kesehatan',       potongan: 'potongan_bpjs_kesehatan' },
  ketenagakerjaan: { nominal: 'bpjs_ketenagakerjaan', potongan: 'potongan_bpjs_ketenagakerjaan' }
};
const TJ_TAB = {
  kesehatan:       { nama: 'Tunjangan Kesehatan',       jenis: 'kesehatan' },
  ketenagakerjaan: { nama: 'Tunjangan Ketenagakerjaan', jenis: 'ketenagakerjaan' },
  koperasi:        { nama: 'Potongan Koperasi',         kelompok: 'koperasi' },
  sekolah:         { nama: 'Potongan lain-lain',        kelompok: 'sekolah' }
};
const JENIS_POTONGAN = {
  sekolah:  ['Pinjaman ke sekolah', 'Lainnya'],
  koperasi: ['Iuran keanggotaan', 'Tabungan koperasi', 'Pinjaman koperasi', 'Lainnya']
};
/* Baris lama berjenis "Simpanan wajib" (koperasi) dan "Tabungan rutin"
   (lain-lain) tetap tersimpan dan tampil apa adanya; keduanya hanya tidak
   ditawarkan lagi saat menambah. Formulir Ubah tetap menampilkan jenis
   lamanya supaya baris itu bisa disunting tanpa berganti jenis. */
/* Iuran keanggotaan koperasi: bawaan dari Nominal Penggajian (kode iuran_koperasi)
   untuk SEMUA guru dan staf aktif, tanpa perlu dicatat per orang. Baris
   potongan berjenis 'Iuran keanggotaan' milik seseorang menggantikan bawaan
   itu selama berlaku (nol bila bukan anggota). Potongan jenis lain —
   tabungan, pinjaman — ditambahkan di atasnya. Fungsi rekap f_ip_potongan
   memakai aturan yang sama. */
const IURAN_KOPERASI = 'Iuran keanggotaan';
const KODE_IURAN = 'iuran_koperasi';
const iuranBawaan = kelompok => kelompok === 'koperasi' ? tarifBawaan(KODE_IURAN) : 0;

async function muatTunjangan() {
  try {
    const [hak, salur, potongan, guru] = await Promise.all([
      // Urut masa kerja (TMT sekolah, kosong paling akhir, nama pemecah seri) — kebiasaan semua aplikasi.
      ambil('v_guru_bpjs', 'select=id,nama,jenis,status,mulai,keterangan,tmt_dasar,tanggal_syarat,tmt_sekolah'
                          + '&status=in.(disahkan,terhenti)&order=tmt_sekolah.asc.nullslast,nama.asc'),
      ambil('ip_tunjangan_penyaluran', 'select=*&order=berlaku_mulai.desc,id.desc'),
      ambil('ip_potongan', 'select=*&order=berlaku_mulai.desc,id.desc'),
      // Urutan guru menurut masa kerja, seperti di semua aplikasi.
      ambil('v_guru', 'select=id,nama,tmt_sekolah,status_aktif&status_aktif=eq.Aktif'
                     + '&order=tmt_sekolah.asc.nullslast,nama.asc')
    ]);
    D.tunjangan = { hak: hak || [], salur: salur || [], potongan: potongan || [], guru: guru || [], galat: null };
  } catch (e) {
    // Disimpan sebagai galat, bukan dibiarkan kosong: halaman yang memuat
    // ulang terus-menerus lebih membingungkan daripada satu pesan.
    D.tunjangan = { hak: [], salur: [], potongan: [], guru: [], galat: e.message };
  }
}

// Penyaluran yang berlaku pada tanggal tertentu (baris terakhir yang <= tanggal).
const salurBerlaku = (guruId, jenis, tgl) =>
  D.tunjangan.salur.find(s => s.guru_id === guruId && s.jenis === jenis && s.berlaku_mulai <= tgl) || null;
const bentukBawaan = jenis => BENTUK[jenis][0];
// Bawaan dari Nominal Penggajian pada tanggal acuan (D.tarif dimuat untuk ui.acuan).
const tarifBawaan = kode => { const t = D.tarif.find(x => x.kode === kode); return t ? Number(t.nilai) || 0 : 0; };
/* Nominal dan potongan yang berlaku untuk seseorang: angka per orang bila
   ditetapkan, selebihnya bawaan Nominal Penggajian. `khusus` menandai mana yang
   ditetapkan sendiri, supaya di layar terlihat bedanya. */
function angkaTunjangan(jenis, s) {
  const k = KODE_TUNJANGAN[jenis];
  const nominalKhusus = !!(s && s.nominal != null), potonganKhusus = !!(s && s.potongan != null);
  return {
    nominal: nominalKhusus ? Number(s.nominal) : tarifBawaan(k.nominal), nominalKhusus,
    potongan: potonganKhusus ? Number(s.potongan) : tarifBawaan(k.potongan), potonganKhusus
  };
}
const blnIndo = iso => /^\d{4}-\d{2}/.test(iso || '') ? `${BULAN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : '—';
const awalBulan = iso => (iso || '').slice(0, 7) + '-01';
function geserBulan(iso, n) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const bulanSebelum = iso => geserBulan(iso, -1);
const bulanSesudah = iso => geserBulan(iso, 1);
// Potongan yang masih berjalan pada bulan tertentu (mulai <= bulan <= sampai).
const potonganAktif = (p, tgl) => p.berlaku_mulai <= awalBulan(tgl) && (!p.berlaku_sampai || p.berlaku_sampai >= awalBulan(tgl));

function halTunjangan() {
  if (!D.tunjangan) { jalankan('Memuat tunjangan…', muatTunjangan); return; }
  const tab = TJ_TAB[ui.tunjanganTab] ? ui.tunjanganTab : 'kesehatan';
  const spek = TJ_TAB[tab];
  const { galat } = D.tunjangan;

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Tunjangan dan Potongan</h1>
      <p>Penyaluran TuSehat (Tunjangan Kesehatan) dan TuKerja (Tunjangan Ketenagakerjaan) per orang,
         beserta nominal dari sekolah dan potongan porsi guru; lalu potongan lain dari pendapatan guru:
         tabungan dan pinjaman ke sekolah, serta iuran dan pinjaman koperasi. Semuanya dikurangkan
         pada struk gaji dari Gabungan Keseluruhan di Honor dan Transpor.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih">
        <label class="kecil">Berlaku pada</label>
        <input class="field" type="date" id="tjAcuan" value="${esc(ui.acuan)}" style="width:auto">
      </div></div>

    <div class="bar">${Object.entries(TJ_TAB).map(([k, v]) =>
      `<button class="chip${k === tab ? ' on' : ''}" data-tj="${k}">${esc(v.nama)}</button>`).join('')}
    </div>

    ${galat ? `<div class="info-box"><b>Data tunjangan tidak terbaca.</b> ${esc(galat)}</div>` : ''}
    <div id="tjIsi">${spek.jenis ? isiTabPenyaluran(spek.jenis) : isiTabPotongan(spek.kelompok)}</div>`;

  /* Tanggal acuan juga menentukan bawaan dari Nominal Penggajian, jadi besarannya
     dimuat ulang bersama — bukan hanya digambar ulang. */
  $('#tjAcuan').onchange = e => {
    if (!e.target.value) return;
    ui.acuan = e.target.value;
    jalankan('Memuat…', muatSemua);
  };
  $$('[data-tj]').forEach(b => b.onclick = () => { ui.tunjanganTab = b.dataset.tj; ui.tunjanganCari = ''; gambar(); });
  pasangAksiTunjangan();
}

/* Penyaluran satu jenis tunjangan: satu tab untuk TuSehat, satu untuk TuKerja. */
function isiTabPenyaluran(jenis) {
  const { hak, salur } = D.tunjangan;
  const q = (ui.tunjanganCari || '').trim().toLowerCase();
  const semua = hak.filter(h => h.jenis === jenis)
    .map(h => ({ ...h, s: salurBerlaku(h.id, jenis, ui.acuan),
                 versi: salur.filter(s => s.guru_id === h.id && s.jenis === jenis).length }))
    .map(h => ({ ...h, a: angkaTunjangan(jenis, h.s) }));
  const baris = semua.filter(h => !q || h.nama.toLowerCase().includes(q));
  const perBentuk = {};
  semua.forEach(h => {
    const b = (h.s || {}).bentuk || bentukBawaan(jenis);
    perBentuk[b] = (perBentuk[b] || 0) + 1;
  });
  const aktif = semua.filter(h => h.status === 'disahkan');
  const belumDiatur = aktif.filter(h => !h.s).length;
  const totalNominal = aktif.reduce((t, h) => t + h.a.nominal, 0);
  const totalPotongan = aktif.reduce((t, h) => t + h.a.potongan, 0);
  const k = KODE_TUNJANGAN[jenis];
  const sel = (nilai, khusus) => `${rupiah(nilai)}${khusus ? '' : ' <span class="kecil">(bawaan)</span>'}`;

  return `
    ${belumDiatur ? `<div class="info-box"><b>${belumDiatur} penerima belum diatur penyalurannya.</b>
      Selama belum diatur, dianggap ${esc(bentukBawaan(jenis))} dengan nominal dan potongan bawaan.
      Ketuk <b>Atur</b> pada barisnya.</div>` : ''}

    <div class="kartu-baris">
      <div class="kartu"><b>${aktif.length}</b><span>penerima ${TUNJANGAN[jenis]}</span></div>
      ${Object.entries(perBentuk).sort().map(([b, n]) => `<div class="kartu"><b>${n}</b><span>${esc(b)}</span></div>`).join('')}
      <div class="kartu"><b>${rupiah(totalNominal)}</b><span>dari sekolah per bulan</span></div>
      <div class="kartu"><b>${rupiah(totalPotongan)}</b><span>potongan guru per bulan</span></div>
    </div>

    <div class="panel"><div class="panel-head"><h3>${esc(TJ_TAB[jenis].nama)} — berlaku ${esc(tglIndo(ui.acuan))}</h3>
      <div class="sp" style="flex:1"></div>
      <input class="field" id="tjCari" placeholder="Cari nama…" value="${esc(ui.tunjanganCari || '')}" style="width:220px"></div>
      <div class="scroll gulir-tegak"><table><thead><tr>
        <th class="lekat">Nama</th><th style="width:150px">Status</th>
        <th style="width:160px">Bentuk</th><th style="width:130px">No. peserta</th>
        <th style="width:150px" class="num">Dari sekolah/bulan</th>
        <th style="width:150px" class="num">Potongan guru/bulan</th>
        <th style="width:120px">Berlaku mulai</th>
        <th style="width:80px"></th>
      </tr></thead><tbody>${
        baris.length ? baris.map(h => `<tr class="${h.status === 'terhenti' ? 'mati' : ''}" data-guru="${esc(h.id)}" data-jenis="${esc(jenis)}">
          <td class="lekat" style="font-weight:500">${esc(h.nama)}</td>
          <td class="kecil">${h.status === 'disahkan'
            ? `disahkan, sejak ${blnIndo(h.mulai)}`
            : `<span style="color:var(--warn)">terhenti: ${esc(h.keterangan || '')}</span>`}</td>
          <td>${h.s ? esc(h.s.bentuk) : `<span class="kecil">${esc(bentukBawaan(jenis))} (bawaan)</span>`}</td>
          <td>${h.s && h.s.nomor_peserta ? esc(h.s.nomor_peserta) : '<span class="kecil">—</span>'}</td>
          <td class="num">${sel(h.a.nominal, h.a.nominalKhusus)}</td>
          <td class="num">${sel(h.a.potongan, h.a.potonganKhusus)}</td>
          <td class="kecil">${h.s ? esc(tglIndo(h.s.berlaku_mulai)) : '—'}${h.versi > 1 ? ` <span class="kecil">(${h.versi} versi)</span>` : ''}</td>
          <td class="act"><button class="btn btn-sm bAtur">Atur</button></td></tr>`).join('')
        : `<tr><td colspan="8"><div class="empty"><b>Tidak ada penerima</b>
            ${semua.length ? 'Ubah pencarian.' : 'Belum ada yang disahkan di Data Induk.'}</div></td></tr>`
      }</tbody></table></div></div>

    <p class="kecil"><button class="btn btn-sm bBawaan" data-kode="${esc(k.nominal)}" style="float:right;margin-left:10px">Ubah bawaan</button>
      Bawaan pada ${esc(tglIndo(ui.acuan))}: dari sekolah ${esc(rupiah(tarifBawaan(k.nominal)))}/bulan,
      potongan guru ${esc(rupiah(tarifBawaan(k.potongan)))}/bulan — diubah lewat <b>Ubah bawaan</b>, berversi menurut
      tanggal berlaku. Angka bertanda <i>(bawaan)</i> mengikuti bawaan itu
      dan ikut berubah bila bawaannya diubah; yang ditetapkan sendiri lewat <b>Atur</b> tetap sampai diubah lagi.
      Potongan adalah porsi guru per bulan (termasuk anggota keluarga tambahan yang ditanggung guru), dicatat sebagai
      nominal — sistem tidak menghitung rumus BPJS — dan dikurangkan di Gabungan Keseluruhan. Mengubah penyaluran selalu
      menambah versi baru dengan tanggal berlaku, supaya rekap periode lama tetap memakai angka yang berlaku waktu itu.</p>`;
}

/* Keadaan satu potongan pada tanggal acuan: berjalan, mulai nanti, atau selesai. */
const keadaanPotongan = (p, tgl) => potonganAktif(p, tgl) ? 'berjalan'
  : p.berlaku_mulai > awalBulan(tgl) ? 'nanti' : 'selesai';

/* Potongan satu kelompok (koperasi / lain-lain): MATRIKS SEMUA GURU aktif
   urut masa kerja. Tiap orang satu BARIS UTAMA — nominal per bulan
   seluruhnya; di koperasi juga iuran keanggotaan dan tombol Anggota /
   Non-Anggota — lalu satu BARIS CICILAN di bawahnya untuk tiap potongan lain
   yang berjalan atau akan mulai (pinjaman, tabungan koperasi), dengan
   Mulai, Sampai, Ubah, dan Akhiri. Tombol Cicilan menambah baris baru;
   yang sudah berakhir hanya di riwayat. */
function isiTabPotongan(kelompok) {
  const { potongan, guru } = D.tunjangan;
  const q = (ui.tunjanganCari || '').trim().toLowerCase();
  const milik = potongan.filter(p => p.kelompok === kelompok);
  const bulanAcuan = awalBulan(ui.acuan);
  const iuran = iuranBawaan(kelompok);
  const koperasi = kelompok === 'koperasi';
  const semua = guru.map(g => {
    const punya = milik.filter(p => p.guru_id === g.id).map(p => ({ ...p, keadaan: keadaanPotongan(p, ui.acuan) }));
    const berjalan = punya.filter(p => p.keadaan === 'berjalan');
    // Iuran keanggotaan: baris milik sendiri menggantikan bawaan Nominal Penggajian;
    // Non-Anggota = baris iuran bernominal nol.
    const iuranSendiri = koperasi ? berjalan.find(p => p.jenis === IURAN_KOPERASI) : null;
    const iuranOrang = koperasi ? (iuranSendiri ? Number(iuranSendiri.nominal) : iuran) : 0;
    const anggota = !koperasi || !iuranSendiri || Number(iuranSendiri.nominal) > 0;
    // Cicilan: potongan selain iuran, yang berjalan atau akan mulai.
    const cicilan = punya.filter(p => !(koperasi && p.jenis === IURAN_KOPERASI) && p.keadaan !== 'selesai')
      .sort((a, b) => a.berlaku_mulai.localeCompare(b.berlaku_mulai));
    const cicilanJalan = cicilan.filter(p => p.keadaan === 'berjalan');
    // Cicilan yang bulan acuan adalah bulan terakhirnya: bulan depan tidak dipotong lagi.
    const terakhir = cicilanJalan.filter(p => p.berlaku_sampai === bulanAcuan);
    const nominal = iuranOrang + cicilanJalan.reduce((t, p) => t + Number(p.nominal), 0);
    return { ...g, iuranSendiri, iuranOrang, anggota, cicilan, cicilanJalan, terakhir, nominal,
             bulanDepan: nominal - terakhir.reduce((t, p) => t + Number(p.nominal), 0),
             selesai: punya.filter(p => p.keadaan === 'selesai').length };
  });
  const baris = semua.filter(g => !q || g.nama.toLowerCase().includes(q));
  const dipotong = semua.filter(g => g.nominal > 0);
  const total = dipotong.reduce((t, g) => t + g.nominal, 0);
  const perJenis = {};
  semua.forEach(g => {
    g.cicilanJalan.forEach(p => { perJenis[p.jenis] = (perJenis[p.jenis] || 0) + Number(p.nominal); });
    if (g.iuranOrang > 0) perJenis[IURAN_KOPERASI] = (perJenis[IURAN_KOPERASI] || 0) + g.iuranOrang;
  });
  const nonAnggota = koperasi ? semua.filter(g => !g.anggota).length : 0;
  const bulanTerakhir = semua.filter(g => g.terakhir.length).length;
  const nama = TJ_TAB[kelompok].nama;
  const selesaiTag = '<span class="kecil" style="color:var(--warn);font-weight:600">bulan terakhir</span>';
  // Guru yang punya potongan tetapi sudah nonaktif tidak ada di daftar guru; disebut supaya tidak hilang diam-diam.
  const tanpaBaris = new Set(milik.filter(p => !guru.some(g => g.id === p.guru_id) && potonganAktif(p, ui.acuan)).map(p => p.guru_id)).size;

  return `
    ${tanpaBaris ? `<div class="info-box"><b>${tanpaBaris} orang berpotongan tetapi sudah nonaktif di Data Induk.</b>
      Potongannya masih terhitung di Gabungan Keseluruhan selama belum diakhiri; aktifkan kembali orangnya untuk mengaturnya di sini.</div>` : ''}

    ${bulanTerakhir ? `<div class="info-box"><b>${bulanTerakhir} orang berada pada bulan terakhir potongannya.</b>
      Mulai ${esc(blnIndo(bulanSesudah(bulanAcuan)))} potongan itu tidak dipotong lagi — tidak perlu diakhiri lagi.
      Barisnya bertanda <i>bulan terakhir</i>.</div>` : ''}

    <div class="kartu-baris">
      <div class="kartu"><b>${semua.length}</b><span>guru / staf aktif</span></div>
      ${koperasi ? `<div class="kartu"><b>${semua.length - nonAnggota}</b><span>anggota koperasi</span></div>` : ''}
      <div class="kartu"><b>${dipotong.length}</b><span>orang dipotong</span></div>
      <div class="kartu"><b>${rupiah(total)}</b><span>${esc(nama.toLowerCase())} per bulan</span></div>
      ${Object.entries(perJenis).sort().map(([j, n]) => `<div class="kartu"><b>${rupiah(n)}</b><span>${esc(j)}</span></div>`).join('')}
    </div>

    <div class="panel"><div class="panel-head"><h3>${esc(nama)} — bulan ${esc(blnIndo(ui.acuan))}</h3>
      <div class="sp" style="flex:1"></div>
      <input class="field" id="tjCari" placeholder="Cari nama…" value="${esc(ui.tunjanganCari || '')}" style="width:220px"></div>
      <div class="scroll gulir-tegak"><table><thead><tr>
        <th style="width:40px" class="num lekat-no">No</th><th class="lekat">Nama</th><th style="width:100px">TMT</th>
        <th>Rincian</th>
        <th style="width:140px" class="num">Nominal/bulan</th>
        <th style="width:95px">Mulai</th><th style="width:130px">Sampai</th>
        <th style="width:${koperasi ? 200 : 150}px"></th>
      </tr></thead><tbody>${
        baris.length ? baris.map((g, i) => `<tr data-guru="${esc(g.id)}" data-kelompok="${esc(kelompok)}">
          <td class="num kecil lekat-no">${i + 1}</td>
          <td class="lekat" style="font-weight:500">${esc(g.nama)}</td>
          <td class="kecil">${esc(tglIndo(g.tmt_sekolah))}</td>
          <td class="kecil">${koperasi
            ? (g.anggota
                ? `${esc(IURAN_KOPERASI)} ${esc(rupiah(g.iuranOrang))}${g.iuranSendiri ? '' : ' (bawaan)'}`
                : '<span style="color:var(--warn)">bukan anggota koperasi</span>')
            : (g.cicilanJalan.length ? `${g.cicilanJalan.length} potongan berjalan` : '—')}${
            g.selesai ? ` · <a href="#" class="kecil bRiwayatPot">riwayat (${g.selesai})</a>` : ''}</td>
          <td class="num"${g.nominal ? ' style="font-weight:600"' : ''}>${g.nominal ? rupiah(g.nominal) : '<span class="kecil">Rp 0</span>'}${
            g.terakhir.length ? `<div class="kecil" style="font-weight:400;color:var(--warn)">bulan depan ${esc(rupiah(g.bulanDepan))}</div>` : ''}</td>
          <td class="kecil">—</td>
          <td class="kecil">${g.iuranOrang > 0 ? 'sampai diubah' : '—'}</td>
          <td class="act">${koperasi ? `<button class="btn btn-sm bAnggota${g.anggota ? '' : ' btn-d'}">${
              g.anggota ? 'Anggota' : 'Non-Anggota'}</button> ` : ''}<button class="btn btn-sm bCicilan">Cicilan</button></td></tr>${
          g.cicilan.map(p => `<tr class="cicilan" data-id="${p.id}" data-kelompok="${esc(kelompok)}" data-guru="${esc(g.id)}">
          <td></td>
          <td class="kecil">↳ ${esc(p.jenis)}</td>
          <td></td>
          <td class="kecil">${esc(p.keterangan || '')}${p.keadaan === 'nanti' ? ' <span class="tag tag-l">mulai nanti</span>' : ''}</td>
          <td class="num">${rupiah(p.nominal)}</td>
          <td class="kecil">${esc(blnIndo(p.berlaku_mulai))}</td>
          <td class="kecil">${p.berlaku_sampai ? esc(blnIndo(p.berlaku_sampai)) : 'sampai diubah'}${
            p.berlaku_sampai === bulanAcuan ? ' ' + selesaiTag : ''}</td>
          <td class="act"><button class="btn btn-sm bUbahPot">Ubah</button> <button class="btn btn-sm bAkhiriPot">Akhiri</button></td></tr>`).join('')}`).join('')
        : `<tr><td colspan="8"><div class="empty"><b>Tidak ada guru</b>
            ${semua.length ? 'Ubah pencarian.' : 'Belum ada guru aktif di Data Induk.'}</div></td></tr>`
      }</tbody></table></div></div>

    <p class="kecil">${kelompok === 'sekolah'
      ? 'Potongan lain-lain dari pendapatan guru: angsuran pinjaman ke sekolah, atau lainnya. '
        + 'Semua guru dan staf aktif tercantum, urut masa kerja, dengan nominal bawaan Rp 0.'
      : `<button class="btn btn-sm bBawaan" data-kode="iuran_koperasi" style="float:right;margin-left:10px">Ubah iuran bawaan</button>
        Potongan dari pendapatan guru untuk koperasi. Iuran keanggotaan bawaannya ${esc(rupiah(iuran))}/bulan
        untuk semua anggota, diubah lewat <b>Ubah iuran bawaan</b> (berversi menurut tanggal berlaku). Tombol <b>Anggota</b> menjadikan orang itu bukan anggota sejak bulan acuan (iurannya Rp 0),
        dan tombol <b>Non-Anggota</b> mengembalikannya menjadi anggota; bulan-bulan sebelumnya tidak berubah. Iuran seseorang
        yang berbeda dari bawaan dicatat lewat Cicilan berjenis Iuran keanggotaan.`}
      Tombol <b>Cicilan</b> menambah satu baris di bawah nama: nominal per bulan, jenisnya (pinjaman, tabungan koperasi, atau lainnya),
      bulan Mulai, dan bulan Sampai — dipotong tiap bulan dalam rentang itu (Sampai kosong = sampai diubah). Pada bulan
      terakhir barisnya bertanda dan bulan berikutnya berhenti sendiri. Semuanya dikurangkan di Gabungan Keseluruhan; mengubah
      nominal mengakhiri baris lama dan menambah baris baru, supaya rekap bulan lalu tidak berubah.</p>`;
}

/* Anggota ↔ Non-Anggota koperasi sejak bulan acuan. Non-anggota disimpan
   sebagai baris Iuran keanggotaan bernominal nol milik orang itu, yang
   menggantikan bawaan Nominal Penggajian. Baris iuran yang sedang berlaku (nol atau
   nominal sendiri) diakhiri pada bulan sebelumnya — atau dihapus bila belum
   mulai — supaya bulan-bulan lalu tidak berubah. */
function ubahKeanggotaan(guruId, jadiAnggota) {
  const g = D.tunjangan.guru.find(x => x.id === guruId);
  if (!g) return;
  const bulanAcuan = awalBulan(ui.acuan);
  const iuranRows = D.tunjangan.potongan.filter(p => p.kelompok === 'koperasi' && p.guru_id === guruId
    && p.jenis === IURAN_KOPERASI && (!p.berlaku_sampai || p.berlaku_sampai >= bulanAcuan));
  jalankan('Menyimpan…', async () => {
    for (const p of iuranRows) {
      if (p.berlaku_mulai < bulanAcuan) await ubah('ip_potongan', `id=eq.${p.id}`, { berlaku_sampai: bulanSebelum(bulanAcuan) });
      else await buang('ip_potongan', `id=eq.${p.id}`);
    }
    if (!jadiAnggota) await simpanBaru('ip_potongan', [{
      guru_id: guruId, kelompok: 'koperasi', jenis: IURAN_KOPERASI, nominal: 0,
      berlaku_mulai: bulanAcuan, berlaku_sampai: null, keterangan: 'Bukan anggota koperasi'
    }]);
    await muatTunjangan();
    D.rekap = null; D.setoran = null;
    toast(`${g.nama}: ${jadiAnggota ? 'anggota koperasi, iuran mengikuti bawaan' : 'bukan anggota koperasi, iuran Rp 0'} sejak ${blnIndo(bulanAcuan)}.`);
  });
}

function pasangAksiTunjangan() {
  const cari = $('#tjCari');
  if (cari) cari.oninput = e => {
    ui.tunjanganCari = e.target.value;
    clearTimeout(window._qt); window._qt = setTimeout(gambar, 200);
  };
  $$('.bAtur').forEach(b => b.onclick = () => {
    const tr = b.closest('tr');
    dialogPenyaluran(tr.dataset.guru, tr.dataset.jenis);
  });
  // Bawaan TuSehat/TuKerja (nominal + potongan) dan iuran koperasi: formulir versi baru yang sama dengan Nominal Penggajian.
  $$('.bBawaan').forEach(b => b.onclick = () => formTarif(b.dataset.kode));
  $$('.bRiwayatPot').forEach(b => b.onclick = e => {
    e.preventDefault();
    const tr = b.closest('tr');
    dialogAturPotongan(tr.dataset.kelompok, tr.dataset.guru);
  });
  $$('.bCicilan').forEach(b => b.onclick = () => {
    const tr = b.closest('tr');
    dialogPotongan(tr.dataset.kelompok, null, tr.dataset.guru);
  });
  $$('.bAnggota').forEach(b => b.onclick = () => {
    const tr = b.closest('tr');
    ubahKeanggotaan(tr.dataset.guru, b.classList.contains('btn-d'));   // Non-Anggota → jadi anggota
  });
  $$('#isi .bUbahPot').forEach(b => b.onclick = () => {
    const tr = b.closest('tr');
    dialogPotongan(tr.dataset.kelompok, Number(tr.dataset.id), tr.dataset.guru);
  });
  $$('#isi .bAkhiriPot').forEach(b => b.onclick = () => dialogAkhiriPotongan(Number(b.closest('tr').dataset.id)));
}

function dialogPenyaluran(guruId, jenis) {
  const h = D.tunjangan.hak.find(x => x.id === guruId && x.jenis === jenis);
  if (!h) return;
  const s = salurBerlaku(guruId, jenis, ui.acuan);
  const riwayat = D.tunjangan.salur.filter(x => x.guru_id === guruId && x.jenis === jenis);
  const k = KODE_TUNJANGAN[jenis];
  const bawaanNominal = tarifBawaan(k.nominal), bawaanPotongan = tarifBawaan(k.potongan);

  bukaModal(`<h2>Penyaluran ${TUNJANGAN[jenis]} — ${esc(h.nama)}</h2><div class="body">
    <div class="fg penuh"><label>Bentuk</label>
      <select class="field" id="p-bentuk">${BENTUK[jenis].map(b =>
        `<option value="${esc(b)}" ${(s ? s.bentuk : bentukBawaan(jenis)) === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>
      <div class="hint">BPJS bila ikut program BPJS; Simponi BNI atau DPLK BJB bila haknya dialihkan ke tabungan hari tua
        (mis. sudah ditanggung pasangan).</div></div>
    <div class="fg"><label>Nomor peserta</label>
      <input class="field" id="p-nomor" value="${esc(s ? s.nomor_peserta || '' : '')}" placeholder="nomor BPJS / rekening program">
      <div class="hint">Untuk daftar setoran ke penyalurnya.</div></div>
    <div class="fg"><label>Berlaku mulai</label>
      <input class="field" type="date" id="p-mulai" value="${esc(awalBulanDepan())}">
      <div class="hint">Tanggal 1 suatu bulan. Rekap sebuah periode memakai penyaluran yang berlaku pada tanggal akhir
        periode itu.</div></div>
    <div class="fg"><label>Dari sekolah per bulan</label>
      <input class="field num" type="number" min="0" step="1000" id="p-nominal"
        value="${s && s.nominal != null ? Number(s.nominal) : ''}" placeholder="${bawaanNominal}">
      <div class="hint">Kosongkan untuk mengikuti bawaan (${esc(rupiah(bawaanNominal))} pada ${esc(tglIndo(ui.acuan))}).
        Isi bila nominal orang ini berbeda; angka itu tetap sampai diubah lagi.</div></div>
    <div class="fg"><label>Potongan porsi guru per bulan</label>
      <input class="field num" type="number" min="0" step="1000" id="p-potongan"
        value="${s && s.potongan != null ? Number(s.potongan) : ''}" placeholder="${bawaanPotongan}">
      <div class="hint">Kosongkan untuk mengikuti bawaan (${esc(rupiah(bawaanPotongan))}). Isi bila potongan orang ini
        berbeda, mis. menanggung anggota keluarga tambahan; nol bila tidak ada potongan.</div></div>
    <div class="fg penuh"><label>Catatan (opsional)</label>
      <input class="field" id="p-catatan" placeholder="Mis. ditanggung suami sejak Agustus; menanggung ibu">
    </div>
    ${riwayat.length ? `<div class="fg penuh"><label>Riwayat</label>
      <table class="log"><thead><tr><th>Mulai</th><th>Bentuk</th><th>No. peserta</th>
        <th style="text-align:right">Dari sekolah</th><th style="text-align:right">Potongan</th><th>Catatan</th><th></th></tr></thead>
      <tbody>${riwayat.map(r => `<tr>
        <td class="kecil">${esc(tglIndo(r.berlaku_mulai))}</td><td>${esc(r.bentuk)}</td>
        <td class="kecil">${esc(r.nomor_peserta || '')}</td>
        <td style="text-align:right">${r.nominal == null ? '<span class="kecil">bawaan</span>' : rupiah(r.nominal)}</td>
        <td style="text-align:right">${r.potongan == null ? '<span class="kecil">bawaan</span>' : rupiah(r.potongan)}</td>
        <td class="kecil">${esc(r.catatan || '')}</td>
        <td><button class="btn btn-sm btn-d" data-hapus-salur="${r.id}">Hapus</button></td></tr>`).join('')}</tbody></table>
      <div class="hint">Hapus untuk merapikan uji coba. Versi sebelumnya kembali berlaku; bila semua dihapus,
        orang ini kembali ke bentuk dan nominal bawaan.</div></div>` : ''}
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-simpan">Simpan sebagai versi baru</button></div>`, true);

  $('#m-batal').onclick = tutupModal;
  // Hapus satu versi penyaluran (uji coba); dialog dibuka lagi dengan riwayat yang tersisa.
  $$('[data-hapus-salur]').forEach(b => b.onclick = () => {
    const r = riwayat.find(x => String(x.id) === b.dataset.hapusSalur);
    if (!r || !window.confirm(`Hapus versi ${TUNJANGAN[jenis]} ${h.nama} yang berlaku mulai ${tglIndo(r.berlaku_mulai)}? Tidak bisa dibatalkan.`)) return;
    tutupModal();
    jalankan('Menghapus…', async () => {
      await buang('ip_tunjangan_penyaluran', `id=eq.${r.id}`);
      await muatTunjangan();
      D.rekap = null; D.setoran = null;
      gambar();
      toast(`${h.nama}: versi ${tglIndo(r.berlaku_mulai)} dihapus`);
      dialogPenyaluran(guruId, jenis);
    });
  });
  $('#m-simpan').onclick = () => {
    const mulai = $('#p-mulai').value;
    if (!mulai) { $('#p-mulai').focus(); return; }
    const angka = id => { const v = $(id).value.trim(); return v === '' ? null : Math.max(0, Number(v) || 0); };
    const isi = {
      guru_id: guruId, jenis,
      berlaku_mulai: awalBulan(mulai),
      bentuk: $('#p-bentuk').value,
      nomor_peserta: $('#p-nomor').value.trim() || null,
      nominal: angka('#p-nominal'),
      potongan: angka('#p-potongan'),
      catatan: $('#p-catatan').value.trim() || null
    };
    tutupModal();
    jalankan('Menyimpan…', async () => {
      // Versi dengan tanggal berlaku yang sama ditulis ulang, seperti besaran.
      await buang('ip_tunjangan_penyaluran',
        `guru_id=eq.${enc(guruId)}&jenis=eq.${enc(jenis)}&berlaku_mulai=eq.${enc(isi.berlaku_mulai)}`);
      await simpanBaru('ip_tunjangan_penyaluran', [isi]);
      const acuanPindah = isi.berlaku_mulai > ui.acuan;
      if (acuanPindah) { ui.acuan = isi.berlaku_mulai; await muatSemua(); }
      await muatTunjangan();
      D.rekap = null; D.setoran = null;   // rekap yang sudah dihitung tidak lagi mencerminkan penyaluran baru
      const a = angkaTunjangan(jenis, isi);
      toast(`${h.nama}: ${isi.bentuk}, dari sekolah ${rupiah(a.nominal)}${a.nominalKhusus ? '' : ' (bawaan)'}, `
        + `potongan ${rupiah(a.potongan)}${a.potonganKhusus ? '' : ' (bawaan)'}/bulan, berlaku ${tglIndo(isi.berlaku_mulai)}`
        + (acuanPindah ? `. Tanggal acuan dipindahkan ke ${tglIndo(isi.berlaku_mulai)} supaya terlihat.` : ''));
    });
  };
}

/* Semua potongan satu orang dalam satu kelompok: yang berjalan, yang mulai
   nanti, dan riwayat yang sudah berakhir — dengan tombol tambah, ubah, dan
   akhiri. Dibuka dari tombol Atur pada matriks. */
function dialogAturPotongan(kelompok, guruId) {
  const g = D.tunjangan.guru.find(x => x.id === guruId);
  if (!g) return;
  const nama = TJ_TAB[kelompok].nama;
  const semua = D.tunjangan.potongan.filter(p => p.kelompok === kelompok && p.guru_id === guruId)
    .map(p => ({ ...p, keadaan: keadaanPotongan(p, ui.acuan) }))
    .sort((a, b) => b.berlaku_mulai.localeCompare(a.berlaku_mulai));
  const berjalan = semua.filter(p => p.keadaan === 'berjalan');
  const iuran = iuranBawaan(kelompok);
  const pakaiBawaan = kelompok === 'koperasi' && !berjalan.some(p => p.jenis === IURAN_KOPERASI);
  const total = berjalan.reduce((t, p) => t + Number(p.nominal), 0) + (pakaiBawaan ? iuran : 0);
  const bulanAcuan = awalBulan(ui.acuan);
  const TEKS = { berjalan: 'berjalan', nanti: 'mulai nanti', selesai: 'berakhir' };

  bukaModal(`<h2>${esc(nama)} — ${esc(g.nama)}</h2><div class="body">
    <p class="msg kecil">Nominal per bulan pada ${esc(blnIndo(ui.acuan))}: <b>${esc(rupiah(total))}</b>.
      Satu baris satu potongan — tabungan dan pinjaman boleh berjalan bersamaan. Mengubah nominal dengan
      tanggal mulai yang lebih baru mengakhiri baris lama dan menambah baris baru.${kelompok === 'koperasi'
        ? ` Iuran keanggotaan bawaan (${esc(rupiah(iuran))}) berlaku selama tidak ada baris
          Iuran keanggotaan miliknya; tambahkan baris itu bila iurannya berbeda, atau nol bila bukan anggota.` : ''}</p>
    <div class="fg penuh">
      <table class="log"><thead><tr><th>Jenis</th><th>Keterangan</th><th style="text-align:right">Nominal/bulan</th>
        <th>Mulai</th><th>Sampai</th><th></th><th></th></tr></thead>
      <tbody>${pakaiBawaan && iuran > 0 ? `<tr>
        <td>${esc(IURAN_KOPERASI)}</td><td class="kecil">bawaan</td>
        <td style="text-align:right;font-weight:600">${esc(rupiah(iuran))}</td>
        <td class="kecil">—</td><td class="kecil">sampai diubah</td>
        <td class="kecil"><span class="tag tag-l">berjalan</span></td><td></td></tr>` : ''}${
      semua.length ? semua.map(p => `<tr class="${p.keadaan === 'selesai' ? 'mati' : ''}" data-id="${p.id}">
        <td>${esc(p.jenis)}</td><td class="kecil">${esc(p.keterangan || '')}</td>
        <td style="text-align:right;font-weight:600">${esc(rupiah(p.nominal))}</td>
        <td class="kecil">${esc(blnIndo(p.berlaku_mulai))}</td>
        <td class="kecil">${p.berlaku_sampai ? esc(blnIndo(p.berlaku_sampai)) : 'sampai diubah'}</td>
        <td class="kecil">${p.keadaan === 'berjalan'
          ? (p.berlaku_sampai === bulanAcuan
              ? '<span class="kecil" style="color:var(--warn);font-weight:600">bulan terakhir</span>'
              : '<span class="tag tag-l">berjalan</span>')
          : esc(TEKS[p.keadaan])}</td>
        <td class="act"><button class="btn btn-sm bUbahPot">Ubah</button>${
          p.keadaan === 'selesai' ? '' : ' <button class="btn btn-sm bAkhiriPot">Akhiri</button>'
          } <button class="btn btn-sm btn-d bHapusPot" title="Hapus baris ini seluruhnya">Hapus</button></td></tr>`).join('')
        : (pakaiBawaan && iuran > 0) ? ''
        : `<tr><td colspan="7" class="kecil" style="text-align:center;padding:14px">Belum ada ${esc(nama.toLowerCase())} untuk ${esc(g.nama)}.</td></tr>`
      }</tbody></table></div>
    </div>
    <div class="aksi"><button class="btn btn-p" id="m-tambah">+ Tambah potongan</button>
      <div class="sp" style="flex:1"></div><button class="btn" id="m-batal">Tutup</button></div>`, true);

  $('#m-batal').onclick = tutupModal;
  $('#m-tambah').onclick = () => dialogPotongan(kelompok, null, guruId);
  $$('#modal-root .bUbahPot').forEach(b => b.onclick = () => dialogPotongan(kelompok, Number(b.closest('tr').dataset.id), guruId));
  $$('#modal-root .bAkhiriPot').forEach(b => b.onclick = () => dialogAkhiriPotongan(Number(b.closest('tr').dataset.id)));
  $$('#modal-root .bHapusPot').forEach(b => b.onclick = () => {
    const p = D.tunjangan.potongan.find(x => x.id === Number(b.closest('tr').dataset.id));
    if (p && hapusPotongan(p)) tutupModal();
  });
}

/* Menghapus satu baris potongan seluruhnya — dari riwayat maupun formulir
   Ubah. Dipakai untuk baris yang salah catat; potongan yang memang pernah
   berjalan sebaiknya di-Akhiri supaya rekap bulan lalu tetap benar.
   Mengembalikan true bila pengguna mengonfirmasi. */
function hapusPotongan(p) {
  const namaGuru = (D.tunjangan.guru.find(g => g.id === p.guru_id) || {}).nama || p.guru_id;
  if (!confirm(`Hapus ${p.jenis} ${rupiah(p.nominal)}/bulan milik ${namaGuru} (mulai ${blnIndo(p.berlaku_mulai)}) seluruhnya?\n\n`
    + 'Untuk menghentikan potongan yang memang pernah berjalan, pakai Akhiri — supaya rekap bulan lalu tetap benar.')) return false;
  jalankan('Menghapus…', async () => {
    await buang('ip_potongan', `id=eq.${p.id}`);
    await muatTunjangan();
    D.rekap = null; D.setoran = null;
    toast(`Potongan ${p.jenis} milik ${namaGuru} dihapus.`);
  });
  return true;
}

/* Tambah (id kosong) atau ubah satu potongan. Mengubah nominal dengan
   tanggal mulai yang lebih baru mengakhiri baris lama pada bulan sebelumnya
   dan menambah baris baru; tanggal mulai yang sama menulis ulang barisnya.
   guruId diisi bila dibuka dari matriks (orangnya sudah tertentu). */
function dialogPotongan(kelompok, id, guruTetap) {
  const lama = id ? D.tunjangan.potongan.find(p => p.id === id) : null;
  if (id && !lama) return;
  kelompok = lama ? lama.kelompok : kelompok;
  guruTetap = lama ? lama.guru_id : guruTetap;
  const { guru } = D.tunjangan;
  const nama = TJ_TAB[kelompok].nama;
  const jenisAda = JENIS_POTONGAN[kelompok].includes(lama ? lama.jenis : '') || !lama;
  const pilihanJenis = [...JENIS_POTONGAN[kelompok], ...(lama && !jenisAda ? [lama.jenis] : [])];

  bukaModal(`<h2>${lama ? 'Ubah' : 'Tambah'} ${esc(nama.toLowerCase())}${guruTetap ? ' — ' + esc((guru.find(g => g.id === guruTetap) || {}).nama || guruTetap) : ''}</h2>
    <div class="body">
    ${guruTetap ? '' : `<div class="fg penuh"><label>Guru / staf <span style="color:var(--danger)">*</span></label>
      <select class="field" id="q-guru"><option value="">— pilih —</option>${guru.map(g =>
        `<option value="${esc(g.id)}">${esc(g.nama)}</option>`).join('')}</select>
      <div class="hint">Guru dan staf aktif menurut Data Induk, urut masa kerja.</div></div>`}
    <div class="fg"><label>Jenis</label>
      <select class="field" id="q-jenis">${pilihanJenis.map(j =>
        `<option value="${esc(j)}" ${lama && lama.jenis === j ? 'selected' : ''}>${esc(j)}</option>`).join('')}</select>
      ${kelompok === 'koperasi' ? `<div class="hint">Iuran keanggotaan menggantikan bawaan
        (${esc(rupiah(iuranBawaan(kelompok)))}/bulan) selama berlaku — isi nol bila bukan anggota. Jenis lain
        ditambahkan di atas iuran.</div>` : ''}</div>
    <div class="fg"><label>Nominal per bulan <span style="color:var(--danger)">*</span></label>
      <input class="field num" type="number" min="0" step="1000" id="q-nominal" value="${lama ? Number(lama.nominal) : ''}">
      <div class="hint">Dipotong tiap bulan dari pendapatan di Gabungan Keseluruhan.</div></div>
    <div class="fg"><label>Mulai bulan <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="q-mulai" value="${esc(lama ? lama.berlaku_mulai : awalBulan(ui.acuan))}">
      <div class="hint">${lama
        ? 'Tanggal yang lebih baru dari mulai semula mengakhiri baris lama pada bulan sebelumnya dan menyimpan nominal baru sejak tanggal ini — rekap bulan sebelumnya tidak berubah. Tanggal yang sama atau lebih awal menulis ulang baris ini.'
        : `Tanggal 1 suatu bulan; bawaannya bulan acuan yang sedang dilihat (${esc(blnIndo(ui.acuan))}). Pilih bulan depan bila potongannya baru mulai nanti.`}</div></div>
    <div class="fg"><label>Sampai bulan (opsional)</label>
      <input class="field" type="date" id="q-sampai" value="${esc(lama && lama.berlaku_sampai ? lama.berlaku_sampai : '')}">
      <div class="hint">Bulan terakhir yang masih dipotong, mis. angsuran terakhir pinjaman. Kosongkan bila berjalan sampai diubah.</div></div>
    <div class="fg penuh"><label>Keterangan (opsional)</label>
      <input class="field" id="q-ket" value="${esc(lama ? lama.keterangan || '' : '')}" placeholder="Mis. pinjaman Rp 6.000.000, 12 angsuran">
    </div>
    </div>
    <div class="aksi">${lama ? '<button class="btn btn-d" id="m-hapus">Hapus</button><div class="sp" style="flex:1"></div>' : ''}
      <button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-simpan">Simpan</button></div>`, true);

  $('#m-batal').onclick = tutupModal;
  if ($('#m-hapus')) $('#m-hapus').onclick = () => { if (hapusPotongan(lama)) tutupModal(); };
  $('#m-simpan').onclick = () => {
    const guruId = guruTetap || $('#q-guru').value;
    if (!guruId) { $('#q-guru').focus(); return; }
    const nominalTeks = $('#q-nominal').value.trim();
    if (nominalTeks === '') { $('#q-nominal').focus(); return; }
    const mulaiTeks = $('#q-mulai').value;
    if (!mulaiTeks) { $('#q-mulai').focus(); return; }
    const mulai = awalBulan(mulaiTeks);
    const sampai = $('#q-sampai').value ? awalBulan($('#q-sampai').value) : null;
    if (sampai && sampai < mulai) { toast('Bulan Sampai mendahului bulan Mulai.', true); return; }
    const isi = {
      guru_id: guruId, kelompok,
      jenis: $('#q-jenis').value,
      nominal: Math.max(0, Number(nominalTeks) || 0),
      berlaku_mulai: mulai, berlaku_sampai: sampai,
      keterangan: $('#q-ket').value.trim() || null
    };
    const namaGuru = (guru.find(g => g.id === guruId) || {}).nama || guruId;
    tutupModal();
    jalankan('Menyimpan…', async () => {
      if (lama && mulai > lama.berlaku_mulai) {
        // Versi baru: baris lama berakhir pada bulan sebelum mulai yang baru.
        await ubah('ip_potongan', `id=eq.${lama.id}`, { berlaku_sampai: bulanSebelum(mulai) });
        await simpanBaru('ip_potongan', [isi]);
      } else if (lama) {
        await ubah('ip_potongan', `id=eq.${lama.id}`, isi);
      } else {
        await simpanBaru('ip_potongan', [isi]);
      }
      const acuanPindah = mulai > ui.acuan;
      if (acuanPindah) { ui.acuan = mulai; await muatSemua(); }
      await muatTunjangan();
      D.rekap = null; D.setoran = null;
      toast(`${namaGuru}: ${isi.jenis} ${rupiah(isi.nominal)}/bulan, mulai ${blnIndo(mulai)}`
        + (sampai ? ` sampai ${blnIndo(sampai)}` : '')
        + (acuanPindah ? `. Tanggal acuan dipindahkan ke ${tglIndo(mulai)} supaya terlihat.` : '')
        + `. Di Honor dan Transpor terhitung pada periode yang memuat ${blnIndo(mulai)}.`);
    });
  };
}

/* Mengakhiri potongan: menetapkan bulan terakhirnya, barisnya tetap ada. */
function dialogAkhiriPotongan(id) {
  const p = D.tunjangan.potongan.find(x => x.id === id);
  if (!p) return;
  const namaGuru = (D.tunjangan.guru.find(g => g.id === p.guru_id) || {}).nama || p.guru_id;
  const bawaan = awalBulan(ui.acuan) >= p.berlaku_mulai ? awalBulan(ui.acuan) : p.berlaku_mulai;

  bukaModal(`<h2>Akhiri potongan — ${esc(namaGuru)}</h2><div class="body">
    <p class="msg kecil">${esc(p.jenis)} ${esc(rupiah(p.nominal))}/bulan, mulai ${esc(blnIndo(p.berlaku_mulai))}.
      Barisnya tetap tersimpan sebagai riwayat; yang ditetapkan hanya bulan terakhirnya.</p>
    <div class="fg"><label>Bulan terakhir dipotong <span style="color:var(--danger)">*</span></label>
      <input class="field" type="date" id="q-sampai" value="${esc(bawaan)}">
      <div class="hint">Bulan ini masih dipotong; mulai bulan berikutnya tidak lagi.</div></div>
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-simpan">Akhiri</button></div>`);

  $('#m-batal').onclick = tutupModal;
  $('#m-simpan').onclick = () => {
    if (!$('#q-sampai').value) { $('#q-sampai').focus(); return; }
    const sampai = awalBulan($('#q-sampai').value);
    if (sampai < p.berlaku_mulai) { toast('Bulan terakhir mendahului bulan mulai.', true); return; }
    tutupModal();
    jalankan('Menyimpan…', async () => {
      await ubah('ip_potongan', `id=eq.${p.id}`, { berlaku_sampai: sampai });
      await muatTunjangan();
      D.rekap = null; D.setoran = null;
      toast(`${namaGuru}: ${p.jenis} berakhir ${blnIndo(sampai)}.`);
    });
  };
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
/* Tiga BAGIAN (tab induk) seperti Honor dan Transpor, 25 September 2026:
   Kehadiran Guru dan Kehadiran Staf dari aplikasi Kehadiran Guru, Absensi
   Ekskul dari aplikasi Absensi Ekskul. Tiap tab menyebut bagiannya. */
const HADIR_BAGIAN = { guru: 'Kehadiran Guru', staf: 'Kehadiran Staf', ekskul: 'Absensi Ekskul' };
const HADIR_TAB = {
  kehadiran: { nama: 'Kehadiran Guru', bagian: 'guru' },
  pengganti: { nama: 'Guru Pengganti', bagian: 'guru' },
  wali:      { nama: 'Wali Kelas',     bagian: 'guru' },
  piket_meja:     { nama: 'Piket Meja Sekolah',      bagian: 'guru' },
  piket_unit:     { nama: 'Piket Guru Diperbantukan', bagian: 'guru' },
  piket_parkiran: { nama: 'Piket Parkiran',          bagian: 'guru' },
  staf:      { nama: 'Hari Hadir Staf',     bagian: 'staf' },
  karyawan:  { nama: 'Kehadiran Karyawan',  bagian: 'staf' },
  kegiatan:  { nama: 'Per kegiatan',   bagian: 'ekskul' },
  pertemuan: { nama: 'Per pertemuan',  bagian: 'ekskul' },
  pembina:   { nama: 'Per pembina',    bagian: 'ekskul' }
};
const hadirDiBagian = b => Object.entries(HADIR_TAB).filter(([, v]) => v.bagian === b);
/* Nama kelompok tarif honor staf (guru_tugas.kelompok_tarif, diatur di Data
   Induk → Jam Kerja Staf). Karyawan = tiga kelompok terakhir. */
const KELOMPOK_TARIF_NAMA = {
  kepala_sekolah: 'Kepala Sekolah', wakasek: 'Wakil Kepala Sekolah', staf: 'Staf',
  kepala_tu: 'Kepala TU', tata_usaha: 'Tata Usaha dan Toolman', caraka_satpam: 'Caraka dan Satpam',
  pendukung: 'Tenaga Pendukung'
};
const namaKelompokTarif = k => KELOMPOK_TARIF_NAMA[k] || k || '—';

/* Semua daftar per orang diurutkan menurut masa kerja (25 September 2026):
   yang paling lama mengabdi di atas — TMT paling awal dulu, tanpa TMT di
   akhir, lalu nama. Kuncinya tmt_staf atau tmt_sekolah pada baris; bila
   baris hanya membawa guru_id/orang_id (pembina, pendukung), TMT diambil
   dari daftar guru; bila hanya masa_kerja, dipakai itu. Pengurutannya
   stabil: baris-baris orang yang sama (komponen pendukung) tetap urut. */
function urutMasaKerja(baris) {
  if (!Array.isArray(baris) || baris.length < 2) return baris;
  const tmtGuru = new Map((D.guruAktif || []).map(g => [g.id, g.tmt_sekolah || null]));
  const kunci = r => {
    const tmt = r.tmt_staf || r.tmt_sekolah || tmtGuru.get(r.guru_id || r.orang_id) || null;
    if (tmt) return tmt;                                   // ISO: urut naik = lebih lama dulu
    if (r.masa_kerja != null) return String(9999 - Number(r.masa_kerja)).padStart(4, '0');  // lebih lama = lebih kecil
    return '9999-99-99';
  };
  const nama = r => String(r.nama || '');
  return [...baris].sort((a, b) => kunci(a).localeCompare(kunci(b)) || nama(a).localeCompare(nama(b), 'id'));
}
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
  const [hariKerja, kehadiran, wali, pengganti, piket, staf, honorStaf, sesi, ekskul] = await Promise.all([
    rpc('f_ip_hari_kerja', arg),
    rpc('f_ip_kehadiran_guru', arg),
    rpc('f_ip_kehadiran_wali', arg),
    rpc('f_ip_pengganti_rinci', arg),
    rpc('f_ip_pelaksanaan_piket', arg),
    rpc('f_ip_kehadiran_staf', arg),
    rpc('f_ip_honor_staf', arg),   // hari/jam kerja dan hadir karyawan (tab Kehadiran Karyawan)
    rpc('f_ip_ekskul_pertemuan', arg),
    ambil('ekskul', 'select=id,nama,pembina_id,kategori,hari,jam_mulai,aktif&order=id')
  ]);
  D.hadir = { awal: ui.hadirAwal, akhir: ui.hadirAkhir, hariKerja: (hariKerja || []).length,
              kehadiran: kehadiran || [], wali: wali || [], pengganti: pengganti || [],
              piket: piket || [], staf: staf || [], honorStaf: honorStaf || [],
              sesi: sesi || [], ekskul: ekskul || [] };
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
    const baris = urutMasaKerja(saring(tanpaStaf(h.kehadiran)));
    const total = jumlahkan(baris, ['kontrak', 'terjadwal', 'hadir_tm', 'httm', 'st', 'it', 'tk', 'hari_terjadwal', 'hari_datang']);
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
        // Hari, bukan jam: dasar Konsumsi Kedatangan di Honor Mengajar.
        // Hitungannya sama persis dengan f_ip_honor_mengajar.
        angka('hari_terjadwal', 'Hari Terjadwal', 95), angka('hari_datang', 'Hari Datang', 85),
        angka('terjadwal', 'Jam Terjadwal', 95), angka('hadir_tm', 'Jam Hadir', 80), angka('httm', 'HTTM'),
        angka('st', 'ST', 55), angka('it', 'IT', 55), angka('tk', 'TK', 55),
        angka('hadir', 'Bobot Hadir', 90, fmtJam), kolPersen('persen', '% Kehadiran')
      ],
      baris, total, kosong: 'Tidak ada data pada rentang ini.',
      catatan: 'Kontrak Jam = jam mengajar per minggu menurut jadwal KBM pada semester tanggal akhir rentang; '
             + '(+n) = jam Tugas Tambahan per minggu dari Data Induk, di luar jadwal KBM. '
             + 'Jam Terjadwal = jam sepanjang rentang; Jam Hadir = jam hadir tatap muka. Bobot kehadiran per status: HTTM 100% · ST 20% · IT 10% · TK 0%. '
             + 'Bobot Hadir = Jam Hadir + HTTM + 20% ST + 10% IT; % Kehadiran = Bobot Hadir ÷ Jam Terjadwal. Sabtu–Minggu dan hari libur tidak dihitung '
             + 'sebagai hari kerja. Upacara dan Bimbingan Wali Kelas (Senin jam 1–2) tidak termasuk — '
             + 'lihat tab Wali Kelas. '
             + 'Hari terjadwal = hari kerja yang ada jam mengajarnya; Hari datang = hari terjadwal yang tidak absen pada seluruh jamnya '
             + '(HTTM dihitung tidak datang). Konsumsi Kedatangan di Honor Mengajar = Hari datang × tarif konsumsi; '
             + 'bagi guru berinsentif fingerprint dan staf di luar tupoksi konsumsinya nol walau hari datangnya tercatat.',
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
    const baris = urutMasaKerja(saring(tanpaStaf(h.wali)));
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
    const baris = urutMasaKerja(saring(J.staf ? tanpaStaf(semua) : semua));
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
    const baris = urutMasaKerja(saring(h.staf)).map(r => ({ ...r, pola: POLA[r.pola_honor] || r.pola_honor || '—',
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

  if (tab === 'karyawan') {
    /* Meniru sheet "Karyawan" (KEHADIRAN KARYAWAN) di struk bendahara: masa
       kerja staf, rencana rutin per minggu (hari, jam), efektif bulan ini
       (hari, jam kerja dalam rentang), kehadiran riil (hari, jam), persentase.
       Datanya dari f_ip_honor_staf — angka yang sama yang dipakai daftar
       honor karyawan di Honor dan Transpor. Karyawan = kelompok tarif Kepala
       TU, Tata Usaha dan Toolman, Caraka dan Satpam. */
    const baris = urutMasaKerja(saring(h.honorStaf.filter(r => r.karyawan))).map(r => ({ ...r,
      kelompok: namaKelompokTarif(r.kelompok_tarif),
      persen: persenDari(r.hari_hadir, r.hari_kerja),
      persenJam: persenDari(r.jam_hadir, r.jam_kerja) }));
    const total = jumlahkan(baris, ['hari_minggu', 'jam_minggu', 'hari_kerja', 'jam_kerja', 'hari_hadir', 'jam_hadir']);
    total.persen = persenDari(total.hari_hadir, total.hari_kerja);
    total.persenJam = persenDari(total.jam_hadir, total.jam_kerja);
    total.nama = `Total (${baris.length} karyawan)`;
    return {
      cari: 'Saring nama karyawan…', ringkas: periode,
      kolom: [
        { k: 'nama', t: 'Nama', lekat: true },
        { k: 'jabatan', t: 'Jabatan', w: 140, f: v => v || '—' },
        { k: 'kelompok', t: 'Kelompok tarif', w: 150 },
        angka('masa_kerja', 'Masa kerja', 80, v => v == null ? '—' : v),
        angka('hari_minggu', 'Hari/minggu', 85), angka('jam_minggu', 'Jam/minggu', 85, fmtJam),
        angka('hari_kerja', 'Hari efektif', 85), angka('jam_kerja', 'Jam efektif', 85, fmtJam),
        angka('hari_hadir', 'Hari hadir', 80), angka('jam_hadir', 'Jam hadir', 80, fmtJam),
        kolPersen('persen', '% Hari'), kolPersen('persenJam', '% Jam')
      ],
      baris, total,
      kosong: 'Belum ada karyawan: tetapkan kelompok tarif Kepala TU, Tata Usaha, atau Caraka/Satpam di Data Induk → Jam Kerja Staf.',
      catatan: 'Susunannya mengikuti sheet Kehadiran Karyawan pada struk bendahara. Hari dan jam per minggu dari '
             + 'ketentuan Jam Kerja Staf di Data Induk; hari dan jam efektif = hari kerja orang itu dalam rentang, di '
             + 'luar hari libur; hari dan jam hadir dari catatan Kehadiran Staf (fingerprint atau manual), jam hadir '
             + 'dipotong pada ketentuan masuk–pulang sehingga lembur tidak dihitung. Masa kerja dari TMT staf di Data '
             + 'Induk (bila kosong, TMT sekolah).',
      judul: 'REKAP KEHADIRAN KARYAWAN', berkas: 'Kehadiran Karyawan', ttd: 'kurikulum'
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
  const bagian = spek.bagian || 'guru';
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

    <div class="bagian-bar">${Object.entries(HADIR_BAGIAN).map(([k, nama]) =>
      `<button class="bagian${k === bagian ? ' on' : ''}" data-hbagian="${k}">${esc(nama)}</button>`).join('')}
    </div>
    <div class="anak-bar"><span class="induk">${esc(HADIR_BAGIAN[bagian])} ›</span>${hadirDiBagian(bagian).map(chip).join('')}</div>

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
      <div class="scroll gulir-tegak" id="hTabel">${tabelHadir(isi)}</div>
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
  // Pindah bagian = pindah ke tab pertama bagian itu.
  $$('[data-hbagian]').forEach(b => b.onclick = () => {
    const pertama = hadirDiBagian(b.dataset.hbagian)[0];
    if (!pertama || pertama[0] === ui.hadirTab) return;
    ui.hadirTab = pertama[0]; ui.hadirSaring = '';
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
     September 2026): satu tab untuk tiap golongan penerima. Sejak 25
     September 2026 tab-tab itu dikelompokkan dalam tiga BAGIAN (`tab`):
     guru, staf, dan gabungan — Gabungan Keseluruhan berdiri sendiri paling
     belakang sebagai dasar daftar pembayaran — lihat REKAP_BAGIAN.
     Tiap tab satu fungsi database, satu daftar kolom; menambah tab kelak
     cukup menambah satu entri di sini. `saring` menyaring baris hasil
     fungsi yang dipakai beberapa tab sekaligus (transport pembina:
     Internal, Eksternal, Tahfidz); `ubah` memetakan tiap baris (Potongan
     per Guru menukar kolomnya dari fungsi gabungan). */
  gabungan: { tab: 'gabungan',
    nama: 'Gabungan Keseluruhan',
    fungsi: 'f_ip_rekap_gabungan',
    struk: true,   // tombol Unduh struk (docx): struk gaji per penerima, lihat unduhStruk
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
      { k: 'ekskul', t: 'Transpor Pemb. Ekskul', w: 145, rp: true },
      { k: 'tahfidz', t: 'Transpor Pemb. Tahfidz', w: 150, rp: true },
      { k: 'parkiran', t: 'Transpor Parkiran', w: 130, rp: true },
      // Honor staf (25 September 2026): gaji + tunjangan jabatan; transpor berdiri + insentif + konsumsi; tenaga pendukung.
      { k: 'staf_gaji', t: 'Gaji & Tunj. Staf', w: 140, rp: true },
      { k: 'staf_transpor', t: 'Transpor Staf', w: 130, rp: true },
      { k: 'pendukung', t: 'Honor Pendukung', w: 140, rp: true },
      { k: 'bpjs', t: 'TuSehat', w: 120, rp: true },
      { k: 'bpjs_tk', t: 'TuKerja', w: 120, rp: true }
    ],
    /* Dua sub-tab (26 September 2026). Tanpa Potongan: yang DIBAYARKAN saja.
       Dengan Potongan: sesudah Jumlah, potongan dan yang diterima — susunannya
       sama dengan struk gaji: Jumlah − potongan = bersih; tunjangan (TuSehat +
       TuKerja) disetor sekolah langsung ke bank, jadi Diterima Tunai = bersih
       − tunjangan. */
    sub: {
      tanpa: { nama: 'Tanpa Potongan' },
      dengan: {
        nama: 'Dengan Potongan',
        judul: 'REKAPITULASI PEMBIAYAAN PER PENERIMA DENGAN POTONGAN',
        ubah: r => {
          const tunj = (Number(r.bpjs) || 0) + (Number(r.bpjs_tk) || 0);
          return { ...r, disetor: tunj, tunai: (Number(r.bersih) || 0) - tunj };
        },
        sesudah: [
          { k: 'potongan_bpjs', t: 'Pot. BPJS', w: 120, rp: true },
          { k: 'potongan_koperasi', t: 'Pot. Koperasi', w: 120, rp: true },
          { k: 'potongan_sekolah', t: 'Pot. Lain-lain', w: 120, rp: true },
          { k: 'potongan', t: 'Jumlah Potongan', w: 130, rp: true },
          { k: 'disetor', t: 'Tunj. Disetor ke Bank', w: 150, rp: true },
          { k: 'tunai', t: 'Diterima Tunai', w: 140, rp: true }
        ],
        catatan: 'Sama dengan Tanpa Potongan, ditambah potongan dan yang diterima, persis seperti struk gaji: '
               + 'Pot. BPJS (porsi guru TuSehat/TuKerja), Pot. Koperasi, dan Pot. Lain-lain dari halaman Tunjangan dan '
               + 'Potongan; Jumlah Potongan = ketiganya. Tunjangan (TuSehat + TuKerja) disetor sekolah langsung ke bank '
               + 'atau penyelenggara, jadi Diterima Tunai = Jumlah − Jumlah Potongan − Tunjangan Disetor ke Bank.'
      }
    }
  },
  mengajar: { tab: 'guru',
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
  wali: { tab: 'guru',
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
  diperbantukan: { tab: 'guru',
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
  piket_meja: { tab: 'guru',
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
  pengganti: { tab: 'guru',
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
  /* Honor Pembina OSIS dihapus 23 September 2026: pembinaan OSIS berada
     dalam jadwal kerja pembinanya. Kegiatannya tetap dicatat di Absensi
     Ekskul (kategori Pembinaan Kesiswaan), hanya tidak dihonor. */
  ...(() => {
    /* Transport pembina dibaca dari satu fungsi, lalu dipecah tiga tab
       menurut jenis tarifnya: Internal dan Eksternal untuk ekstrakurikuler
       (dipisah 25 September 2026 — dulu satu tab Pembina Ekskul dengan
       kolom Jenis; daftar bertanda tangannya memang dicetak terpisah untuk
       guru sekolah dan pelatih dari luar), Imtaq untuk pembimbing Tahfidz.
       Pembina OSIS tidak pernah ada di sini — pembinaan OSIS tidak dihonor. */
    const dasar = 'Besaran tiap pertemuan ditentukan jumlah siswa yang hadir pada pertemuan itu, '
                + 'jadi dihitung per pertemuan lalu dijumlahkan — bukan dari rata-rata kehadiran, '
                + 'yang akan memberi hasil berbeda. Yang dibayar hanya pertemuan yang benar-benar '
                + 'berjalan dan dihadiri pembinanya; pertemuan yang ditiadakan dan yang pembinanya '
                + 'tidak hadir sama-sama tidak dibayar. Kegiatan yang dibimbing beberapa orang '
                + 'sekaligus: nominal pertemuan dihitung dari SELURUH siswa yang hadir, lalu dibagi rata '
                + 'kepada pembimbing yang hadir pada pertemuan itu — yang tidak datang tidak kebagian. '
                + 'Karena itu kolom Siswa hadir adalah kehadiran PERTEMUANNYA, bukan bagian per orang, '
                + 'dan sengaja tidak dijumlahkan.';
    /* Tiap tab hanya memuat satu jenis tarif, jadi kolom Jenis tidak perlu
       lagi: yang membedakan Internal dari Eksternal adalah tabnya sendiri. */
    const kolom = [
      { k: 'pertemuan', t: 'Pertemuan', w: 90, num: true },
      { k: 'siswa_hadir', t: 'Siswa hadir', w: 100, num: true, jumlah: false }
    ];
    return {
      ekskul_internal: { tab: 'guru',
        nama: 'Pembina Internal', fungsi: 'f_ip_transport_pembina',
        saring: r => r.jenis === 'Internal',
        judul: 'DAFTAR PENERIMAAN TRANSPORT PEMBINA EKSTRAKURIKULER INTERNAL',
        catatan: dasar + ' Pembina internal adalah guru sekolah yang tercatat sebagai Pembina Ekskul '
               + 'di Data Induk; nominalnya Transport Pembina Internal di Nominal Penggajian. Pelatih dari '
               + 'luar ada di tab Pembina Eksternal.',
        kolom
      },
      ekskul_eksternal: { tab: 'guru',
        nama: 'Pembina Eksternal', fungsi: 'f_ip_transport_pembina',
        saring: r => r.jenis === 'Eksternal',
        judul: 'DAFTAR PENERIMAAN TRANSPORT PEMBINA EKSTRAKURIKULER EKSTERNAL',
        catatan: dasar + ' Pembina eksternal adalah pelatih dari luar sekolah yang tidak terdaftar '
               + 'sebagai guru; nominalnya Transport Pembina Eksternal di Nominal Penggajian. Guru sekolah '
               + 'ada di tab Pembina Internal.',
        kolom
      },
      tahfidz: { tab: 'guru',
        nama: 'Pembimbing Tahfidz', fungsi: 'f_ip_transport_pembina',
        saring: r => r.jenis === 'Imtaq',
        judul: 'DAFTAR PENERIMAAN TRANSPORT PEMBIMBING TAHFIDZ',
        catatan: dasar + ' Nominalnya tersendiri (Transport Pembimbing Imtaq), satu skala untuk '
               + 'pembimbing dari dalam maupun luar sekolah.',
        kolom
      }
    };
  })(),
  piket_parkiran: { tab: 'staf',
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
  /* ---- Bagian Staf (25 September 2026): Piket Parkiran, Pendukung, Karyawan,
     Staf Khusus, Pimpinan. Tiga yang terakhir dari satu fungsi
     f_ip_honor_staf, disaring menurut kelompok tarif, masing-masing dengan
     dua SUB-TAB meniru sheet (1) dan (2) struk bendahara: Gaji dan Tunjangan
     Jabatan; Transpor Berdiri, Insentif (HTM), dan Konsumsi. Pendukung dari
     f_ip_honor_pendukung: komponen per orang. ---- */
  pendukung: {
    tab: 'staf', nama: 'Pendukung', fungsi: 'f_ip_honor_pendukung',
    kartu: true,   // digambar sebagai kartu per orang (bukan tabel), tiap kartu dengan kuitansi
    kuitansiNama: 'Honor Tenaga Pendukung',
    judul: 'DAFTAR PENERIMAAN HONOR TENAGA PENDUKUNG',
    catatan: 'Honor tenaga pendukung disusun per orang menurut komponennya masing-masing (Nominal Penggajian Staf → '
           + 'Honor Tenaga Pendukung): komponen per bulan dikalikan jumlah bulan periode (bulan yang lebih dari '
           + 'setengah harinya masuk rentang); per jam hadir dan per hari hadir dikalikan kehadiran fingerprint '
           + 'di Kehadiran Staf, jam hadir dipotong pada ketentuan masuk–pulang. Satu baris satu komponen; nama '
           + 'yang sama berulang untuk tiap komponennya.',
    kolom: [
      { k: 'jabatan', t: 'Jabatan', w: 130, jumlah: false },
      { k: 'komponen', t: 'Komponen', w: 160, jumlah: false },
      { k: 'satuan', t: 'Satuan', w: 110, jumlah: false },
      { k: 'nilai', t: 'Nominal', w: 120, rp: true, jumlah: false },
      { k: 'ukuran', t: 'Bulan / jam / hari', w: 110, num: true, jumlah: false }
    ]
  },
  ...(() => {
    const kolomDasar = [
      { k: 'jabatan', t: 'Jabatan', w: 140, jumlah: false },
      { k: 'masa_kerja', t: 'Masa kerja', w: 80, num: true, jumlah: false },
      { k: 'hari_minggu', t: 'Hari/minggu', w: 85, num: true, jumlah: false },
      { k: 'jam_minggu', t: 'Jam/minggu', w: 85, num: true, jumlah: false }
    ];
    const honorStaf = (nama, siapa, saring, siapaTeks) => ({
      tab: 'staf', nama, fungsi: 'f_ip_honor_staf', saring,
      sub: {
        gaji: {
          nama: 'Gaji dan Tunjangan Jabatan',
          judul: `DAFTAR PENERIMAAN GAJI DAN TUNJANGAN JABATAN ${siapa}`,
          ubah: r => ({ ...r, jumlah: (Number(r.gaji_pokok) || 0) + (Number(r.tunjangan_jabatan) || 0) }),
          catatan: siapaTeks + ' Gaji = tarif per jam menurut masa kerja staf (Gaji Pokok Staf di Nominal Penggajian Staf) × jam '
                 + 'kerja per minggu, dibulatkan ke atas ke ribuan. Tunjangan jabatan = nominal per hari kelompok tarifnya × hari '
                 + 'kerja per minggu (Wakil Kepala Sekolah berkontrak kurang dari 5 hari: hari kerjanya ditambah Tambahan Hari '
                 + 'Tunjangan Wakasek, bawaan 0,5 — kolom Hari tunj.). Hari dan jam per minggu serta kelompok tarif dari Data Induk → Jam Kerja Staf; masa kerja '
                 + 'dari TMT staf (bila kosong, TMT sekolah). Keduanya tidak bergantung kehadiran dan tidak dikalikan indeks.',
          kolom: [...kolomDasar,
            { k: 'tarif_jam', t: 'Tarif/jam', w: 100, rp: true, jumlah: false },
            { k: 'gaji_pokok', t: 'Gaji', w: 130, rp: true },
            // Hari yang dibayar tunjangan: Wakasek berkontrak < 5 hari ditambah (mis. 4,5).
            { k: 'hari_tunjangan', t: 'Hari tunj.', w: 80, num: true, jumlah: false },
            { k: 'tunjangan_jabatan', t: 'Tunjangan Jabatan', w: 140, rp: true }]
        },
        transpor: {
          nama: 'Transpor Berdiri, Insentif, dan Konsumsi',
          judul: `DAFTAR PENERIMAAN TRANSPOR BERDIRI, INSENTIF, DAN KONSUMSI ${siapa}`,
          ubah: r => ({ ...r, jumlah: (Number(r.transport_berdiri) || 0) + (Number(r.transport_htm) || 0) + (Number(r.konsumsi) || 0) }),
          catatan: siapaTeks + ' Ketiganya dikalikan indeks kelompok tarif (Indeks Staf di Nominal Penggajian Staf, menurut masa '
                 + 'kerja). Kolom Indeks adalah HASIL rumus, bukan angka jenjang: dasar jenjang masa kerja + kenaikan per tahun × '
                 + '(masa kerja − tahun mulai), dibatasi maksimum, dari versi yang berlaku pada tanggal akhir periode — arahkan '
                 + 'tetikus ke angkanya untuk melihat hitungannya. Transpor berdiri = tarif per jam per minggu × jam kerja per minggu × indeks. Insentif (transport HTM) = '
                 + 'tarif per jam hadir × jam hadir sebulan × indeks, dibulatkan ke atas ke ribuan. Konsumsi = tarif per hari hadir '
                 + '× hari hadir × indeks. Jam dan hari hadir dari Kehadiran Staf; jam hadir dipotong pada ketentuan masuk–pulang.',
          kolom: [...kolomDasar,
            // Indeks tampil di layar sebagai pegangan, tidak ikut ke daftar bertanda tangan (layar: true).
            { k: 'indeks', t: 'Indeks', w: 70, num: true, jumlah: false, layar: true,
              html: r => `<span title="${esc(jelaskanIndeks(r))}" style="cursor:help;border-bottom:1px dotted var(--ink3)">${angkaIndeks(r.indeks)}</span>` },
            { k: 'hari_hadir', t: 'Hari/bulan', w: 80, num: true },
            { k: 'jam_hadir', t: 'Jam/bulan', w: 80, num: true },
            { k: 'transport_berdiri', t: 'Transpor Berdiri', w: 130, rp: true },
            { k: 'transport_htm', t: 'Insentif', w: 120, rp: true },
            { k: 'konsumsi', t: 'Konsumsi', w: 120, rp: true }]
        }
      }
    });
    return {
      karyawan: honorStaf('Karyawan', 'TENAGA KEPENDIDIKAN (KARYAWAN)', r => r.karyawan,
        'Karyawan = kelompok tarif Kepala TU, Tata Usaha dan Toolman, Caraka dan Satpam; transpor berdirinya memakai tarif '
        + 'Transport Berdiri Karyawan (30 % dari tarif staf, mengikuti rumus struk bendahara). Meniru sheet Karyawan (1) dan (2).'),
      staf_khusus: honorStaf('Staf Khusus', 'STAF KHUSUS', r => r.kelompok_tarif === 'staf',
        'Staf Khusus = guru berjabatan struktural dengan kelompok tarif Staf (staf kesiswaan, kurikulum, sarana, BK, laboratorium, '
        + 'dan sejenisnya); transpor berdirinya penuh. Meniru sheet Staf (1) dan (2).'),
      pimpinan: honorStaf('Pimpinan', 'PIMPINAN',
        r => r.jenis_ptk === 'Pimpinan' || r.kelompok_tarif === 'kepala_sekolah' || r.kelompok_tarif === 'wakasek',
        'Pimpinan = jenis PTK Pimpinan di Data Induk (apa pun jabatannya) serta kelompok tarif Kepala Sekolah dan '
        + 'Wakil Kepala Sekolah; transpor berdirinya penuh. Meniru sheet Wakasek (1) dan (2).')
    };
  })(),
  /* Daftar TuSehat, TuKerja, Potongan Koperasi, Potongan lain-lain, dan
     Potongan per Guru dihapus dari halaman ini 25 September 2026: tunjangan
     dan potongan diurus di halaman Tunjangan dan Potongan, dan pengurangannya
     tetap tercetak di struk gaji (fungsi gabungan masih membawanya). */
};

/* Tiga bagian Honor dan Transpor. Bagian Staf: Piket Parkiran, Pendukung, Karyawan, Staf Khusus, Pimpinan
   (petugasnya memang staf); daftar honor staf menyusul setelah fungsi
   rekapnya dibuat dari formulasi di Nominal Penggajian Staf. Gabungan
   Keseluruhan paling belakang: rangkuman semua bagian per orang. */
const REKAP_BAGIAN = { guru: 'Guru', staf: 'Staf', gabungan: 'Gabungan Keseluruhan' };
const rekapDiBagian = tab => Object.entries(REKAP).filter(([, v]) => (v.tab || 'guru') === tab);


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

/* Tab berbentuk kartu (Pendukung): baris komponen dari fungsi dikelompokkan
   per orang. `rincian` dipakai kuitansi ("Gaji 1 bulan × Rp …; Transpor
   Kedatangan 104,2 jam × Rp …"). */
const ukuranTeks = k => k.satuan === 'per bulan' ? `${Number(k.ukuran) || 0} bulan`
  : k.satuan === 'per jam hadir' ? `${fmtJam(k.ukuran)} jam hadir` : `${Number(k.ukuran) || 0} hari hadir`;
function orangDariKomponen(baris) {
  const per = new Map();
  (baris || []).forEach(b => {
    if (!per.has(b.guru_id)) per.set(b.guru_id, { guru_id: b.guru_id, nama: b.nama, jabatan: b.jabatan, komponen: [], jumlah: 0 });
    const o = per.get(b.guru_id);
    o.komponen.push(b);
    o.jumlah += Number(b.jumlah) || 0;
  });
  return [...per.values()].map(o => ({ ...o,
    rincian: o.komponen.map(k => `${k.komponen} ${ukuranTeks(k)} × ${rupiah(k.nilai)}`).join('; ') }));
}
function kartuRekapOrang(induk, spek, baris, total) {
  const orang = orangDariKomponen(baris);
  const periode = `${tglIndo(ui.rekapAwal)} – ${tglIndo(ui.rekapAkhir)}`;
  return `<div class="panel"><div class="panel-head"><h3>${esc(induk.nama)}</h3>
      <div class="sp" style="flex:1"></div>
      <div class="info">${esc(periode)}</div>
      <button class="btn btn-sm" id="rUnduh" style="margin-left:10px">Unduh Format (xlsx)</button>
      <button class="btn btn-sm" id="rKuitansi" style="margin-left:6px" ${orang.length ? '' : 'disabled'}>Unduh semua kuitansi (xlsx)</button></div>
      ${orang.length ? `<div class="pg-grid" style="padding:16px">${orang.map(o => `<article class="pg-kartu${o.jumlah > 0 ? '' : ' kosong'}">
        <div class="pg-kartu-atas"><h3>${esc(o.nama)}</h3><span class="pg-satuan">${esc(o.jabatan || 'tanpa tugas Staf')}</span></div>
        <table class="pg-jenjang"><tbody>${o.komponen.map(k => `<tr>
          <td>${esc(k.komponen)}<div class="kecil">${esc(ukuranTeks(k))} × ${esc(rupiah(k.nilai))} ${esc(k.satuan)}</div></td>
          <td>${esc(rupiah(k.jumlah))}</td></tr>`).join('')}</tbody></table>
        <div class="pg-nilai${o.jumlah > 0 ? '' : ' nol'}">${esc(rupiah(o.jumlah))}</div>
        <div class="pg-meta">${o.jumlah > 0 ? 'diterima untuk ' + esc(periode) : 'nominal komponennya masih Rp 0 — isi di Nominal Penggajian Staf'}</div>
        <div class="pg-aksi"><button class="btn btn-sm btn-p" data-kuitansi="${esc(o.guru_id)}">Unduh kuitansi (xlsx)</button></div>
      </article>`).join('')}</div>`
      : `<div class="empty"><b>Tidak ada tenaga pendukung</b> Belum ada komponen yang berlaku pada periode ini
        (Nominal Penggajian Staf → Honor Tenaga Pendukung).</div>`}
      <div class="foot"><div class="info">${orang.length} orang · Terbilang: ${esc(terbilang(total.jumlah || 0))}</div></div></div>`;
}

function halRekap() {
  const induk = REKAP[ui.rekapJenis];
  /* Tab bersub (Karyawan, Staf Khusus, Pimpinan): data satu fungsi,
     sub yang dipilih menimpa nama, judul, catatan, kolom, dan `ubah`. */
  const subKunci = !induk.sub ? null
    : induk.sub[ui.rekapSub[ui.rekapJenis]] ? ui.rekapSub[ui.rekapJenis] : Object.keys(induk.sub)[0];
  const spek = subKunci ? { ...induk, ...induk.sub[subKunci], nama: `${induk.nama} — ${induk.sub[subKunci].nama}` } : induk;
  const semua = urutMasaKerja(D.rekap && spek.ubah ? D.rekap.map(spek.ubah) : D.rekap);
  const bagian = spek.tab || 'guru';
  /* Pemegang tugas Staf berhonor nol di rekap ini — aturannya ditegakkan di
     fungsi database, bukan di layar. Yang disembunyikan hanya yang
     benar-benar nol; staf yang jam mengajarnya dinyatakan di luar tupoksi
     (mengajar_dibayar) tetap tampil karena memang dibayar. Saklar untuk
     menampilkan baris nol itu dihapus 25 September 2026: bagian Guru memang
     hanya guru. */
  const punyaStaf = semua && semua.some(r => 'staf' in r);
  // Staf yang toh menerima sesuatu (mis. transpor parkiran) bukan baris yang digugurkan.
  const digugurkan = r => r.staf && !r.mengajar_dibayar && !(Number(r.jumlah) > 0);
  // Tab yang bisa disaring per bentuk penyaluran (TuSehat, TuKerja).
  const bentukAda = spek.saringBentuk && semua ? [...new Set(semua.map(r => r.bentuk).filter(Boolean))].sort() : [];
  const bentukPilih = bentukAda.includes(ui.rekapBentuk) ? ui.rekapBentuk : '';
  const baris = !semua ? null : (!punyaStaf ? semua : semua.filter(r => !digugurkan(r)))
    .filter(r => !bentukPilih || r.bentuk === bentukPilih);
  const fp = baris ? baris.filter(r => r.fingerprint).length : 0;
  const sesudah = spek.sesudah || [];   // kolom yang berdiri SESUDAH Jumlah (potongan, diterima)

  const kunciJumlah = ['jumlah',
    ...spek.kolom.filter(k => k.jumlah !== false && (k.num || k.rp)).map(k => k.k),
    ...sesudah.map(k => k.k)];
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
  const tarifKosong = !spek.potongan && baris && baris.length && adaKegiatan && !(total.jumlah > 0);

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

    <div class="bagian-bar">${Object.entries(REKAP_BAGIAN).map(([k, nama]) =>
      `<button class="bagian${k === bagian ? ' on' : ''}" data-rbagian="${k}">${esc(nama)}</button>`).join('')}
    </div>
    <div class="anak-bar"><span class="induk">${esc(REKAP_BAGIAN[bagian])} ›</span>${rekapDiBagian(bagian).map(([k, v]) =>
      `<button class="chip${k === ui.rekapJenis ? ' on' : ''}" data-rekap="${k}">${esc(v.nama)}</button>`).join('')}
    </div>

    ${!semua ? `<div class="panel"><div class="empty"><b>Belum dihitung</b>
      Pilih periodenya lalu ketuk Hitung.</div></div>` : `

    <div class="kartu-baris">
      <div class="kartu"><b>${spek.kartu ? new Set(baris.map(b => b.guru_id)).size : baris.length}</b><span>${spek.potongan ? 'potongan' : 'penerima'}</span></div>
      <div class="kartu"><b>${rupiah(total.jumlah || 0)}</b><span>${spek.potongan ? 'jumlah dipotong' : 'jumlah dibayarkan'}</span></div>
    </div>

    ${tarifKosong ? `<div class="info-box"><b>Kegiatannya tercatat, tetapi jumlahnya Rp 0.</b>
      Besaran untuk jenis pembiayaan ini belum diisi. Isi di halaman
      <b>Nominal Penggajian</b>, lalu hitung ulang.</div>` : ''}
    ${fp ? `<div class="info-box"><b>${fp} guru berinsentif fingerprint.</b>
      Insentif tatap muka dan konsumsinya dibayarkan akhir bulan lewat mesin kehadiran,
      jadi di sini ditulis nol supaya jumlahnya sama dengan yang benar-benar dibayarkan.</div>` : ''}

    ${spek.kartu ? kartuRekapOrang(induk, spek, baris, total) : `
    <div class="panel"><div class="panel-head"><h3>${esc(induk.nama)}</h3>
      ${induk.sub ? `<div class="pg" style="margin-left:12px">${Object.entries(induk.sub).map(([k, v]) =>
        `<button data-rsub="${k}" class="${k === subKunci ? 'on' : ''}">${esc(v.nama)}</button>`).join('')}</div>` : ''}
      <div class="sp" style="flex:1"></div>
      <div class="info">${esc(tglIndo(ui.rekapAwal))} – ${esc(tglIndo(ui.rekapAkhir))}</div>
      ${spek.saringBentuk ? `<select class="field" id="rBentuk" style="width:auto;margin-left:10px">
        <option value="">Semua bentuk</option>
        ${bentukAda.map(b => `<option value="${esc(b)}" ${b === bentukPilih ? 'selected' : ''}>${esc(b)}</option>`).join('')}
      </select>` : ''}
      <button class="btn btn-sm" id="rUnduh" style="margin-left:10px">${spek.kuitansi ? 'Unduh kuitansi (xlsx)' : 'Unduh Format (xlsx)'}</button>${
        spek.struk ? '<button class="btn btn-sm" id="rStruk" style="margin-left:6px">Unduh struk (docx)</button>' : ''}</div>
      <div class="gulir-petunjuk">Tabel lebih lebar dari layar — geser mendatar untuk melihat
        seluruh kolom. Kolom nama tetap terlihat saat digeser.</div>
      <div class="scroll gulir-tegak"><table class="rekap"><thead><tr>
        <th style="width:40px" class="num lekat-no">No</th>
        <th class="lekat">Nama</th>
        ${spek.kolom.map(k => `<th style="width:${k.w}px" class="${k.num || k.rp ? 'num' : ''}">${esc(k.t)}</th>`).join('')}
        <th style="width:125px" class="num">Jumlah</th>
        ${sesudah.map(k => `<th style="width:${k.w}px" class="num">${esc(k.t)}</th>`).join('')}
        ${spek.struk ? '<th style="width:70px"></th>' : ''}
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
            b.seandainya != null && Number(b.seandainya) !== Number(b.jumlah) ? kecilRp(b.seandainya) : ''}</td>${
          sesudah.map(k => `<td class="num" style="${(k.k === 'bersih' || k.k === 'tunai') ? 'font-weight:600' : ''}">${rupiah(b[k.k])}</td>`).join('')}${
          spek.struk ? `<td>${adaStruk(b) ? `<button class="btn btn-sm" data-struk="${i}" title="Unduh struk gaji ${esc(b.nama)} (docx)">Struk</button>` : ''}</td>` : ''}</tr>`).join('')
        : `<tr><td colspan="${spek.kolom.length + 3 + sesudah.length + (spek.struk ? 1 : 0)}"><div class="empty"><b>Tidak ada penerima</b>
            Tidak ada catatan untuk jenis pembiayaan ini pada periode tersebut.</div></td></tr>`
      }</tbody>
      ${baris.length ? `<tfoot><tr>
        <td class="num lekat-no"></td><td class="lekat" style="font-weight:600">Jumlah</td>
        ${spek.kolom.map(k => `<td class="${k.num || k.rp ? 'num' : ''}" style="font-weight:600">${
          k.jumlah === false ? '—' : k.rp ? rupiah(total[k.k] || 0) + kecilTotal(k.k)
          // Jumlah desimal (jam hadir) dibulatkan seperti sel per baris — penjumlahan biner
          // JavaScript bisa menghasilkan 872,0799999999999.
          : angkaSel({ [k.k]: Math.round((total[k.k] || 0) * 100) / 100 }, k)}</td>`).join('')}
        <td class="num" style="font-weight:700">${rupiah(total.jumlah || 0)}${kecilTotal('jumlah')}</td>${
        sesudah.map(k => `<td class="num" style="font-weight:700">${rupiah(total[k.k] || 0)}</td>`).join('')}${
        spek.struk ? '<td></td>' : ''}</tr></tfoot>` : ''}
      </table></div>
      <div class="foot"><div class="info">Terbilang: ${esc(terbilang(total.jumlah || 0))}</div></div></div>
`}

    <p class="kecil">${esc(spek.catatan)}</p>`}`;

  $('#rHitung').onclick = () => {
    ui.rekapAwal = $('#rAwal').value || ui.rekapAwal;
    ui.rekapAkhir = $('#rAkhir').value || ui.rekapAkhir;
    if (ui.rekapAwal > ui.rekapAkhir) { toast('Tanggal awal melewati tanggal akhir.', true); return; }
    jalankan('Menghitung…', muatRekap);
  };
  $$('[data-rekap]').forEach(b => b.onclick = () => {
    ui.rekapJenis = b.dataset.rekap;
    D.rekap = null; D.setoran = null;
    jalankan('Menghitung…', muatRekap);
  });
  $$('[data-rsub]').forEach(b => b.onclick = () => { ui.rekapSub[ui.rekapJenis] = b.dataset.rsub; gambar(); });
  // Pindah bagian = pindah ke tab pertama bagian itu.
  $$('[data-rbagian]').forEach(b => b.onclick = () => {
    const pertama = rekapDiBagian(b.dataset.rbagian)[0];
    if (!pertama || pertama[0] === ui.rekapJenis) return;
    ui.rekapJenis = pertama[0];
    D.rekap = null; D.setoran = null;
    if (ui.rekapAwal && ui.rekapAkhir) jalankan('Menghitung…', muatRekap); else gambar();
  });
  if ($('#rBentuk')) $('#rBentuk').onchange = e => { ui.rekapBentuk = e.target.value; gambar(); };
  if ($('#rUnduh')) $('#rUnduh').onclick = () => jalankan('Menyiapkan berkas…',
    () => spek.kuitansi ? unduhKuitansi(spek, baris) : unduhRekap(spek, baris, total));
  // Tab berbentuk kartu: kuitansi per orang (komponennya dirinci di baris "Untuk pembayaran").
  const spekKuitansi = { ...spek, kuitansi: spek.kuitansiNama || spek.nama };
  if ($('#rKuitansi')) $('#rKuitansi').onclick = () => jalankan('Menyiapkan berkas…',
    () => unduhKuitansi(spekKuitansi, orangDariKomponen(baris)));
  $$('[data-kuitansi]').forEach(b => b.onclick = () => jalankan('Menyiapkan berkas…', () => {
    const o = orangDariKomponen(baris).find(x => x.guru_id === b.dataset.kuitansi);
    return unduhKuitansi(spekKuitansi, o ? [o] : [], o ? o.nama : '');
  }));
  if ($('#rStruk')) $('#rStruk').onclick = () => dialogPilihStruk(baris);
  // Struk satu orang: baris yang sama, berkasnya hanya memuat struk itu (sisi kanan halaman kosong).
  $$('[data-struk]').forEach(el => el.onclick = () =>
    jalankan('Menyiapkan struk…', () => unduhStruk([baris[Number(el.dataset.struk)]])));
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
  // `layar`: kolom yang hanya digambar di layar (mis. Indeks), tidak ikut diunduh.
  const kolom = spek.kolom.filter(k => !k.layar);
  const sesudah = spek.sesudah || [];  // kolom sesudah Jumlah (potongan, diterima)
  const KOL = kolom.length + 4 + sesudah.length;   // No, Nama, …kolom…, Jumlah, …sesudah…, Tanda tangan
  const kolTtd = KOL;

  ws.columns = [{ width: 5 }, { width: 30 },
                ...kolom.map(k => ({ width: Math.max(9, Math.round(k.w / 8)) })),
                { width: 15 },
                ...sesudah.map(k => ({ width: Math.max(9, Math.round(k.w / 8)) })),
                { width: 22 }];
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
  kepalaExcel(ws, r, ['NO', 'NAMA', ...kolom.map(k => k.t.toUpperCase()), 'JUMLAH',
                      ...sesudah.map(k => k.t.toUpperCase()), 'TANDA TANGAN'], F);
  r += 1;

  const sel = penulisSel(ws, F);

  baris.forEach((b, i) => {
    sel(r, 1, i + 1, { rata: 'center' });
    sel(r, 2, b.nama + (b.staf && b.seandainya != null ? ' (Staf — seandainya ' + rupiah(b.seandainya) + ')' : ''));
    kolom.forEach((k, j) => {
      // `xls`: nilai Excel yang berbeda dari kunci mentahnya (mis. nama kelompok tarif).
      const v = k.xls ? k.xls(b) : b[k.k];
      if (k.rp) sel(r, 3 + j, Number(v) || 0, { fmt: RP });
      else if (k.num) sel(r, 3 + j, Number(v) || 0, { rata: 'center' });
      else sel(r, 3 + j, v == null ? '—' : String(v), { rata: 'center' });
    });
    sel(r, kolom.length + 3, Number(b.jumlah) || 0, { fmt: RP, tebal: true });
    sesudah.forEach((k, j) => sel(r, kolom.length + 4 + j, Number(b[k.k]) || 0, { fmt: RP, tebal: k.k === 'bersih' || k.k === 'tunai' }));
    sel(r, kolTtd, `${i + 1}. ……………………`);
    ws.getRow(r).height = 26;
    r += 1;
  });

  sel(r, 1, 'JUMLAH', { rata: 'center', tebal: true, abu: true });
  ws.mergeCells(r, 1, r, 2);
  kolom.forEach((k, j) => {
    if (k.jumlah === false) sel(r, 3 + j, '', { abu: true });
    else if (k.rp) sel(r, 3 + j, total[k.k] || 0, { fmt: RP, tebal: true, abu: true });
    else sel(r, 3 + j, Math.round((total[k.k] || 0) * 100) / 100, { rata: 'center', tebal: true, abu: true });   // jumlah desimal dibulatkan 2 angka
  });
  sel(r, kolom.length + 3, total.jumlah || 0, { fmt: RP, tebal: true, abu: true });
  sesudah.forEach((k, j) => sel(r, kolom.length + 4 + j, total[k.k] || 0, { fmt: RP, tebal: true, abu: true }));
  sel(r, kolTtd, '', { abu: true });
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

async function unduhKuitansi(spek, baris, namaBerkas) {
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
      + (b.bulan != null ? ` (${b.bulan} bulan × ${rupiah(b.tarif)})` : '')
      + (b.rincian ? `: ${b.rincian}` : '');

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
    ws.getRow(r).height = b.rincian ? 15 * Math.max(2, Math.ceil(untuk.length / 55)) : 30;
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

  await simpanBuku(wb, `Kuitansi ${spek.kuitansi}${namaBerkas ? ' ' + namaBerkas : ''} ${ui.rekapAwal} sd ${ui.rekapAkhir}.xlsx`);
}

/* ------------------------------------------------ nominal setoran wajib */
/* Daftar uang yang disetorkan sekolah ke bank / penyelenggara tiap periode
   (26 September 2026): satu tab per tujuan setoran. Tiap orang: nominal dari
   sekolah + potongan porsi guru = setoran. Datanya fungsi tunjangan yang
   sama dengan halaman Tunjangan dan Potongan (TuSehat dan TuKerja),
   disaring menurut bentuk penyaluran yang ditetapkan di sana. Periodenya
   sama dengan Honor dan Transpor supaya angkanya sejalan dengan Gabungan. */
const SETORAN = {
  bpjs_kesehatan: { nama: 'BPJS Kesehatan',      jenis: ['kesehatan'],       bentuk: 'BPJS Kesehatan',
    judul: 'DAFTAR SETORAN BPJS KESEHATAN' },
  bpjs_tk:        { nama: 'BPJS Ketenagakerjaan', jenis: ['ketenagakerjaan'], bentuk: 'BPJS Ketenagakerjaan',
    judul: 'DAFTAR SETORAN BPJS KETENAGAKERJAAN' },
  dplk:           { nama: 'DPLK BJB',             jenis: ['kesehatan', 'ketenagakerjaan'], bentuk: 'DPLK BJB',
    judul: 'DAFTAR SETORAN DPLK BJB' },
  simponi:        { nama: 'Simponi BNI',          jenis: ['kesehatan', 'ketenagakerjaan'], bentuk: 'Simponi BNI',
    judul: 'DAFTAR SETORAN SIMPONI BNI' }
};
const KOLOM_SETORAN = [
  { k: 'program', t: 'Program', w: 90, jumlah: false },
  { k: 'nomor_peserta', t: 'No. peserta', w: 130, jumlah: false, html: r => esc(r.nomor_peserta || '—') },
  { k: 'bulan', t: 'Bulan', w: 65, num: true },
  { k: 'tarif', t: 'Dari sekolah/bulan', w: 130, rp: true, jumlah: false },
  { k: 'potongan_bulan', t: 'Potongan guru/bulan', w: 135, rp: true, jumlah: false },
  { k: 'sekolah', t: 'Dari sekolah', w: 130, rp: true },
  { k: 'potongan', t: 'Potongan guru', w: 130, rp: true }
];

async function muatSetoran() {
  const arg = { p_awal: ui.rekapAwal, p_akhir: ui.rekapAkhir };
  const [kesehatan, ketenagakerjaan] = await Promise.all([
    rpc('f_ip_tunjangan_bpjs', { ...arg, p_jenis: 'kesehatan' }),
    rpc('f_ip_tunjangan_bpjs', { ...arg, p_jenis: 'ketenagakerjaan' })
  ]);
  D.setoran = { awal: ui.rekapAwal, akhir: ui.rekapAkhir, kesehatan: kesehatan || [], ketenagakerjaan: ketenagakerjaan || [] };
}

function halSetoran() {
  const tab = SETORAN[ui.setoranTab] ? ui.setoranTab : 'bpjs_kesehatan';
  const spekTab = SETORAN[tab];
  const semua = D.setoran;
  // Baris: nominal dari sekolah dan potongan guru untuk periode; Jumlah = setoran ke bank.
  const baris = !semua ? null : urutMasaKerja(spekTab.jenis.flatMap(j => (semua[j] || [])
    .filter(r => r.bentuk === spekTab.bentuk)
    .map(r => ({ ...r, program: TUNJANGAN[j], sekolah: Number(r.jumlah) || 0,
                 jumlah: (Number(r.jumlah) || 0) + (Number(r.potongan) || 0) }))));
  const total = (baris || []).reduce((t, r) => {
    for (const k of ['bulan', 'sekolah', 'potongan', 'jumlah']) t[k] = (t[k] || 0) + (Number(r[k]) || 0);
    return t;
  }, {});
  const spek = { nama: spekTab.nama, judul: spekTab.judul, kolom: KOLOM_SETORAN,
    catatan: `Setoran ${spekTab.nama} untuk ${labelPeriodeRekap()}: nominal dari sekolah ditambah potongan porsi guru, `
           + 'keduanya dari penyaluran per orang di halaman Tunjangan dan Potongan (bila belum ditetapkan, bawaan dari '
           + 'Nominal Penggajian). Jumlah bulan mengikuti aturan bulan yang lebih dari setengah harinya masuk periode. '
           + 'Hanya orang yang bentuk penyalurannya ' + spekTab.nama + ' dan berhak pada periode ini.' };

  $('#isi').innerHTML = `
    <div class="head"><div><h1>Nominal Setoran Wajib</h1>
      <p>Uang yang harus disetorkan sekolah ke bank atau penyelenggara pada satu periode: nominal dari
         sekolah ditambah potongan porsi guru, per orang, menurut tujuan setorannya.</p></div>
      <div class="sp"></div>
      <div class="mx-pilih">
        <label class="kecil">Dari</label>
        <input class="field" type="date" id="sAwal" value="${esc(ui.rekapAwal)}" style="width:auto">
        <label class="kecil">sampai</label>
        <input class="field" type="date" id="sAkhir" value="${esc(ui.rekapAkhir)}" style="width:auto">
        <button class="btn btn-p" id="sHitung">Hitung</button>
      </div></div>

    <div class="bar">${Object.entries(SETORAN).map(([k, v]) =>
      `<button class="chip${k === tab ? ' on' : ''}" data-setoran="${k}">${esc(v.nama)}</button>`).join('')}</div>

    ${!semua ? `<div class="panel"><div class="empty"><b>Belum dihitung</b>
      Pilih periodenya lalu ketuk Hitung.</div></div>` : `
    <div class="kartu-baris">
      <div class="kartu"><b>${baris.length}</b><span>peserta</span></div>
      <div class="kartu"><b>${rupiah(total.sekolah || 0)}</b><span>dari sekolah</span></div>
      <div class="kartu"><b>${rupiah(total.potongan || 0)}</b><span>potongan guru</span></div>
      <div class="kartu"><b>${rupiah(total.jumlah || 0)}</b><span>setoran ke ${esc(spekTab.nama)}</span></div>
    </div>

    <div class="panel"><div class="panel-head"><h3>${esc(spekTab.nama)}</h3>
      <div class="sp" style="flex:1"></div>
      <div class="info">${esc(tglIndo(ui.rekapAwal))} – ${esc(tglIndo(ui.rekapAkhir))}</div>
      <button class="btn btn-sm" id="sUnduh" style="margin-left:10px">Unduh Format (xlsx)</button></div>
      <div class="gulir-petunjuk">Tabel lebih lebar dari layar — geser mendatar untuk melihat seluruh kolom.</div>
      <div class="scroll gulir-tegak"><table class="rekap"><thead><tr>
        <th style="width:40px" class="num lekat-no">No</th>
        <th class="lekat">Nama</th>
        ${KOLOM_SETORAN.map(k => `<th style="width:${k.w}px" class="${k.num || k.rp ? 'num' : ''}">${esc(k.t)}</th>`).join('')}
        <th style="width:135px" class="num">Setoran</th>
      </tr></thead><tbody>${
        baris.length ? baris.map((b, i) => `<tr>
          <td class="num lekat-no">${i + 1}</td>
          <td class="nama lekat" style="font-weight:500">${esc(b.nama)}</td>
          ${KOLOM_SETORAN.map(k => `<td class="${k.num || k.rp ? 'num' : ''}">${k.html ? k.html(b) : angkaSel(b, k)}</td>`).join('')}
          <td class="num" style="font-weight:600">${rupiah(b.jumlah)}</td></tr>`).join('')
        : `<tr><td colspan="${KOLOM_SETORAN.length + 3}"><div class="empty"><b>Tidak ada peserta</b>
            Tidak ada yang bentuk penyalurannya ${esc(spekTab.nama)} dan berhak pada periode ini.</div></td></tr>`
      }</tbody>
      ${baris.length ? `<tfoot><tr>
        <td class="num lekat-no"></td><td class="lekat" style="font-weight:600">Jumlah</td>
        ${KOLOM_SETORAN.map(k => `<td class="${k.num || k.rp ? 'num' : ''}" style="font-weight:600">${
          k.jumlah === false ? '—' : k.rp ? rupiah(total[k.k] || 0) : (total[k.k] || 0)}</td>`).join('')}
        <td class="num" style="font-weight:700">${rupiah(total.jumlah || 0)}</td></tr></tfoot>` : ''}
      </table></div>
      <div class="foot"><div class="info">Terbilang: ${esc(terbilang(total.jumlah || 0))}</div></div></div>

    <p class="kecil">${esc(spek.catatan)}</p>`}`;

  $('#sHitung').onclick = () => {
    ui.rekapAwal = $('#sAwal').value || ui.rekapAwal;
    ui.rekapAkhir = $('#sAkhir').value || ui.rekapAkhir;
    if (ui.rekapAwal > ui.rekapAkhir) { toast('Tanggal awal melewati tanggal akhir.', true); return; }
    D.rekap = null;   // periode Honor dan Transpor ikut berubah
    jalankan('Menghitung…', muatSetoran);
  };
  $$('[data-setoran]').forEach(b => b.onclick = () => { ui.setoranTab = b.dataset.setoran; gambar(); });
  if ($('#sUnduh')) $('#sUnduh').onclick = () => jalankan('Menyiapkan berkas…', () => unduhRekap(spek, baris, total));
}

/* ----------------------------------------------------------- struk gaji */
/* Struk gaji per penerima dalam satu berkas Word: dua struk per halaman A4
   mendatar, susunannya mengikuti dokumen/Struk_Gaji.docx. Angka tiap bagian
   diambil dari fungsi rincian yang sama dengan tab-tab di halaman ini, dan
   subtotal serta diterima bersihnya dari Gabungan Keseluruhan — sehingga struk
   tidak pernah berbeda dari daftar pembayarannya. Pembuat berkasnya (docx)
   dimuat hanya saat diperlukan, seperti ExcelJS. */
async function muatDocx() {
  if (window.docx) return window.docx;
  await new Promise((selesai, gagal) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/docx@9.7.2/dist/index.iife.js';
    sc.onload = selesai;
    sc.onerror = () => gagal(new Error('Pembuat Word gagal dimuat. Periksa sambungan internet.'));
    document.head.appendChild(sc);
  });
  return window.docx;
}

/* Nama periode untuk kotak di kop: "Agustus 2026" bila satu bulan penuh,
   selebihnya rentang tanggalnya. */
function judulPeriodeRekap() {
  const l = labelPeriodeRekap();
  return l.startsWith('bulan ') ? l.slice(6) : `${tglIndo(ui.rekapAwal)} – ${tglIndo(ui.rekapAkhir)}`;
}

/* Kumpulkan rincian semua tab, dikelompokkan per orang. Kunci orangnya sama
   dengan orang_id di Gabungan Keseluruhan: guru_id, atau 'PB:' + pembina_id
   untuk pelatih dari luar. Baris yang jumlahnya nol (staf yang honornya
   digugurkan) komponennya ikut dinolkan — kolom komponennya berisi angka
   seandainya, bukan yang dibayarkan. */
async function rincianStruk() {
  const arg = { p_awal: ui.rekapAwal, p_akhir: ui.rekapAkhir };
  const [mengajar, wali, diper, meja, pengganti, pembina, parkir, sehat, kerja, kop, sek, jadwal, mapel,
         hadirGuru, hadirWali, hadirPiket, honorStaf, honorPendukung] = await Promise.all([
    rpc('f_ip_honor_mengajar', arg),
    rpc('f_ip_honor_wali_kelas', arg),
    rpc('f_ip_honor_diperbantukan', arg),
    rpc('f_ip_transport_piket', { ...arg, p_jenis: 'Meja Sekolah' }),
    rpc('f_ip_honor_pengganti', arg),
    rpc('f_ip_transport_pembina', arg),
    rpc('f_ip_transport_piket', { ...arg, p_jenis: 'Parkiran' }),
    rpc('f_ip_tunjangan_bpjs', { ...arg, p_jenis: 'kesehatan' }),
    rpc('f_ip_tunjangan_bpjs', { ...arg, p_jenis: 'ketenagakerjaan' }),
    rpc('f_ip_potongan', { ...arg, p_kelompok: 'koperasi' }),
    rpc('f_ip_potongan', { ...arg, p_kelompok: 'sekolah' }),
    // Mata pelajaran hanya pelengkap; kegagalannya tidak menggagalkan struk.
    ambil('jadwal_kbm', 'select=guru_id,mapel_id').catch(() => []),
    ambil('mapel', 'select=id,nama_mapel').catch(() => []),
    // Persentase kehadiran untuk struk — fungsi yang sama dengan halaman
    // Kehadiran dan Piket, supaya angkanya tidak berbeda. Pelengkap: bila
    // gagal, struk tetap terbit tanpa persentase.
    rpc('f_ip_kehadiran_guru', arg).catch(() => []),
    rpc('f_ip_kehadiran_wali', arg).catch(() => []),
    rpc('f_ip_pelaksanaan_piket', arg).catch(() => []),
    // Honor staf (gaji, tunjangan jabatan, transpor, insentif, konsumsi) dan tenaga pendukung.
    rpc('f_ip_honor_staf', arg),
    rpc('f_ip_honor_pendukung', arg)
  ]);
  const R = {};
  const orang = id => (R[id] = R[id] || { diper: [], ekskul: [], tahfidz: [], koperasi: [], sekolah: [], pendukung: [] });
  const dibayar = b => Number(b.jumlah) > 0;
  (mengajar || []).forEach(b => { orang(b.guru_id).mengajar = b; });
  (wali || []).forEach(b => { orang(b.guru_id).wali = b; });
  (diper || []).forEach(b => orang(b.guru_id).diper.push(b));
  (meja || []).forEach(b => { orang(b.guru_id).meja = b; });
  (pengganti || []).forEach(b => { orang(b.guru_id).pengganti = b; });
  (pembina || []).forEach(b => {
    const o = orang(b.guru_id || 'PB:' + b.pembina_id);
    (b.jenis === 'Imtaq' ? o.tahfidz : o.ekskul).push(b);
  });
  (parkir || []).forEach(b => { orang(b.guru_id).parkir = b; });
  (sehat || []).forEach(b => { orang(b.guru_id).sehat = b; });
  (kerja || []).forEach(b => { orang(b.guru_id).kerja = b; });
  (kop || []).forEach(b => orang(b.guru_id).koperasi.push(b));
  (sek || []).forEach(b => orang(b.guru_id).sekolah.push(b));
  (honorStaf || []).forEach(b => { orang(b.guru_id).staf = b; });
  (honorPendukung || []).forEach(b => orang(b.guru_id).pendukung.push(b));

  /* Persentase kehadiran per orang: mengajar dan wali kelas sudah dihitung
     fungsi databasenya (berbobot: HTTM 100% · ST 20% · IT 10%); piket
     dihitung Jaga ÷ Terjadwal seperti di tab Piket. Null bila tidak ada
     yang terjadwal, dan struk tidak mencetaknya. Transport pembina ekskul
     dan tahfidz tidak punya jadwal pembanding per pembina di rekap ini,
     jadi tidak berpersentase. */
  (hadirGuru || []).forEach(b => { orang(b.guru_id).persenMengajar = b.persen; });
  (hadirWali || []).forEach(b => { orang(b.guru_id).persenWali = b.persen; });
  (hadirPiket || []).forEach(b => {
    const o = orang(b.guru_id);
    o.persenMeja = persenDari(b.meja_jaga, b.meja_terjadwal);
    o.persenUnit = persenDari(b.unit_jaga, b.unit_terjadwal);
    o.persenParkir = persenDari(b.parkiran_jaga, b.parkiran_terjadwal);
  });

  // Mata pelajaran dari jadwal KBM, tanpa Upacara dan Bimbingan Wali Kelas
  // (M08, M25) — sama dengan yang dikecualikan f_ip_honor_mengajar.
  const namaMapel = Object.fromEntries((mapel || []).map(m => [m.id, m.nama_mapel]));
  const mapelGuru = {};
  (jadwal || []).forEach(j => {
    if (j.mapel_id === 'M08' || j.mapel_id === 'M25' || !namaMapel[j.mapel_id]) return;
    (mapelGuru[j.guru_id] = mapelGuru[j.guru_id] || new Set()).add(namaMapel[j.mapel_id]);
  });
  Object.keys(mapelGuru).forEach(id => { orang(id).mapel = [...mapelGuru[id]].join(', '); });

  return { R, dibayar };
}

// Yang mendapat struk: menerima sesuatu atau ada potongannya pada periode ini.
const adaStruk = b => Number(b.jumlah) > 0 || Number(b.potongan) > 0;

/* Tombol Unduh struk di kepala panel: pilih penerimanya lebih dulu — semua,
   atau sebagian lewat kotak centang — supaya bendahara yang hanya perlu
   mencetak ulang beberapa struk tidak harus mengunduh satu berkas penuh.
   Daftarnya urut seperti tabel; yang tidak menerima apa pun tidak muncul. */
function dialogPilihStruk(baris) {
  const calon = (baris || []).filter(adaStruk);
  if (!calon.length) { toast('Tidak ada penerima pada periode ini.', true); return; }
  const pilih = new Set(calon.map((_, i) => i));   // bawaan: semua terpilih

  bukaModal(`<h2>Unduh struk — pilih penerima</h2><div class="body">
    <p class="msg kecil">Centang yang struknya akan diunduh. Semua yang dicentang masuk ke satu berkas Word,
      dua struk sehalaman; bila hanya satu, sisi kanan halamannya dikosongkan.</p>
    <input class="field" id="ps-cari" placeholder="Saring nama…" autocomplete="off" style="margin-bottom:8px">
    <label class="pilih-semua"><input type="checkbox" id="ps-semua"> <span id="ps-semua-teks"></span></label>
    <div class="pilih-daftar" id="ps-daftar">${calon.map((b, i) => `
      <label data-nama="${esc(String(b.nama || '').toLowerCase())}"><input type="checkbox" data-i="${i}" checked>
        <span class="nama">${esc(b.nama)}${b.jenis_orang ? ` <span class="kecil">${esc(b.jenis_orang)}</span>` : ''}</span>
        <span class="kecil">${esc(rupiah(b.bersih != null ? b.bersih : b.jumlah))}</span></label>`).join('')}</div>
    </div>
    <div class="aksi"><button class="btn" id="m-batal">Batal</button>
      <button class="btn btn-p" id="m-unduh"></button></div>`);

  const kotak = $$('#ps-daftar input[type=checkbox]');
  const segarkan = () => {
    const tampak = kotak.filter(k => k.closest('label').style.display !== 'none');
    const terpilihTampak = tampak.filter(k => pilih.has(Number(k.dataset.i))).length;
    $('#ps-semua').checked = tampak.length > 0 && terpilihTampak === tampak.length;
    $('#ps-semua').indeterminate = terpilihTampak > 0 && terpilihTampak < tampak.length;
    $('#ps-semua-teks').textContent = tampak.length === calon.length
      ? `Pilih semua (${calon.length} penerima)` : `Pilih semua yang tampil (${tampak.length})`;
    $('#m-unduh').textContent = pilih.size ? `Unduh ${pilih.size} struk` : 'Unduh struk';
    $('#m-unduh').disabled = !pilih.size;
  };
  kotak.forEach(k => k.onchange = () => { pilih[k.checked ? 'add' : 'delete'](Number(k.dataset.i)); segarkan(); });
  $('#ps-semua').onchange = e => {
    kotak.filter(k => k.closest('label').style.display !== 'none').forEach(k => {
      k.checked = e.target.checked;
      pilih[k.checked ? 'add' : 'delete'](Number(k.dataset.i));
    });
    segarkan();
  };
  $('#ps-cari').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    $$('#ps-daftar label').forEach(l => { l.style.display = !q || l.dataset.nama.includes(q) ? '' : 'none'; });
    segarkan();
  };
  $('#m-batal').onclick = tutupModal;
  $('#m-unduh').onclick = () => {
    const terpilih = calon.filter((_, i) => pilih.has(i));
    if (!terpilih.length) return;
    tutupModal();
    jalankan('Menyiapkan struk…', () => unduhStruk(terpilih));
  };
  segarkan();
  $('#ps-cari').focus();
}

/* `baris` boleh seluruh tabel (tombol Unduh struk di kepala panel) atau satu
   orang saja (tombol Struk pada barisnya): susunan halamannya sama, hanya
   sisi kanannya kosong dan nama berkasnya memuat nama penerima. */
async function unduhStruk(baris) {
  const penerima = (baris || []).filter(adaStruk);
  if (!penerima.length) throw new Error('Tidak ada penerima pada periode ini.');
  const [docx, { R, dibayar }, logo] = await Promise.all([muatDocx(), rincianStruk(), ambilLogo()]);
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, PageBreak,
          WidthType, AlignmentType, BorderStyle, ShadingType, VerticalAlign, PageOrientation, TableLayoutType } = docx;

  const F = 'Calibri';
  const NAVY = '1F3864', ABU = 'F2F2F2', BIRU = 'E9EEF6', HIJAU = 'E2EFDA', HIJAU_TUA = '375623', KELABU = '595959', GARIS = 'BFBFBF';
  const angka = n => Number(n || 0).toLocaleString('id-ID');
  const tanpa = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const polos = { top: tanpa, bottom: tanpa, left: tanpa, right: tanpa };
  const tipis = { style: BorderStyle.SINGLE, size: 4, color: GARIS };
  const bawah = { top: tanpa, bottom: tipis, left: tanpa, right: tanpa };
  const garisKop = { top: tanpa, left: tanpa, right: tanpa, bottom: { style: BorderStyle.SINGLE, size: 12, color: NAVY } };

  const run = (t, o = {}) => new TextRun({ text: t, font: F, size: o.size || 16, bold: o.bold, italics: o.italics, color: o.color });
  const par = (isi, o = {}) => new Paragraph({
    alignment: o.align || AlignmentType.LEFT,
    spacing: { before: o.before || 0, after: o.after || 0, line: 216 },
    children: Array.isArray(isi) ? isi : [isi]
  });
  const teks = (t, o = {}) => par(run(t, o), o);
  const sel = (isi, w, o = {}) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    columnSpan: o.span,
    borders: o.borders || polos,
    shading: o.shade ? { fill: o.shade, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    verticalAlign: o.valign || VerticalAlign.CENTER,
    margins: { top: o.mt ?? 14, bottom: o.mb ?? 14, left: o.ml ?? 60, right: o.mr ?? 60 },
    children: Array.isArray(isi) ? isi : [isi]
  });
  const tabel = (lebar, rows) => new Table({
    width: { size: lebar.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: lebar, layout: TableLayoutType.FIXED, borders: polos, rows
  });

  const LEBAR = 7500;
  const KOL = [360, 2900, 2340, 400, 1500];   // No | Uraian | Keterangan | Rp | Nominal
  /* "(kehadiran 95,25%)" — persentasenya tebal, sisanya mengikuti gaya
     teks di sekitarnya. Kosong bila persentasenya tidak ada. */
  const runPersen = (persen, o = {}) => persen == null ? [] : [
    run('(kehadiran ', o), run(fmtPersen(persen), { ...o, bold: true }), run(')', o)
  ];
  /* Kepala bagian. Bila ada persentase kehadiran, judulnya menempati kolom
     Uraian dan persentasenya sejajar kolom Keterangan di bawahnya. */
  const rowHeader = (kode, judul, persen) => new TableRow({ children: [
    sel(teks(kode, { bold: true, color: NAVY }), KOL[0], { shade: BIRU, borders: bawah }),
    ...(persen == null
      ? [sel(teks(judul, { bold: true, color: NAVY }), KOL[1] + KOL[2] + KOL[3] + KOL[4], { span: 4, shade: BIRU, borders: bawah })]
      : [sel(teks(judul, { bold: true, color: NAVY }), KOL[1], { shade: BIRU, borders: bawah }),
         sel(par(runPersen(persen, { color: NAVY })), KOL[2] + KOL[3] + KOL[4], { span: 3, shade: BIRU, borders: bawah })])
  ]});
  const rowInfo = (label, isi) => new TableRow({ children: [
    sel(teks(''), KOL[0]),
    sel(teks(label, { color: KELABU }), KOL[1]),
    sel(teks(': ' + isi, { color: KELABU }), KOL[2] + KOL[3] + KOL[4], { span: 3 })
  ]});
  const rowItem = (no, uraian, ket, nominal, persen) => new TableRow({ children: [
    sel(teks(no ? no + '.' : '', { align: AlignmentType.RIGHT }), KOL[0]),
    sel(teks(uraian), KOL[1]),
    sel(par([run(ket || '', { color: KELABU, italics: true }),
             ...(ket ? [run(' ', { color: KELABU, italics: true }), ...runPersen(persen, { color: KELABU, italics: true })] : [])]), KOL[2]),
    sel(teks('Rp'), KOL[3]),
    sel(teks(angka(nominal), { align: AlignmentType.RIGHT }), KOL[4])
  ]});
  const rowJumlah = (label, nominal, o = {}) => new TableRow({ children: [
    sel(teks(''), KOL[0], { shade: o.shade || ABU, borders: bawah }),
    sel(teks(label, { bold: true, italics: !o.tebal, color: o.color }), KOL[1] + KOL[2], { span: 2, shade: o.shade || ABU, borders: bawah }),
    sel(teks('Rp', { bold: true, color: o.color }), KOL[3], { shade: o.shade || ABU, borders: bawah }),
    sel(teks(angka(nominal), { bold: true, align: AlignmentType.RIGHT, color: o.color }), KOL[4], { shade: o.shade || ABU, borders: bawah })
  ]});

  const p = D.profil || {};
  const periode = judulPeriodeRekap();
  const tanggal = tglIndo(ui.rekapAkhir);
  const kota = p.kota || 'Soreang';
  const alamat = [p.alamat, p.kota, p.npsn ? 'NPSN ' + p.npsn : ''].filter(Boolean).join('  ·  ');
  const dataLogo = logo && logo.buffer ? new Uint8Array(logo.buffer) : null;

  /* Satu struk. Bagian yang tidak ada isinya (nominal maupun kegiatannya
     nol) tidak dicetak, supaya struk pelatih dari luar atau staf tidak
     dipenuhi baris Rp 0; Potongan dan Penerimaan Bersih selalu ada. */
  function buatStruk(b) {
    const r = R[b.orang_id] || { diper: [], ekskul: [], tahfidz: [], koperasi: [], sekolah: [], pendukung: [] };
    const m = r.mengajar && dibayar(r.mengajar) ? r.mengajar : null;
    const w = r.wali && dibayar(r.wali) ? r.wali : null;
    const meja = r.meja && dibayar(r.meja) ? r.meja : null;
    const diper = r.diper.filter(dibayar);
    const ekskul = r.ekskul.filter(dibayar), tahfidz = r.tahfidz.filter(dibayar);
    const jml = (arr, k) => arr.reduce((t, x) => t + (Number(x[k]) || 0), 0);
    const masaKerja = b.tmt_sekolah
      ? Math.max(0, Math.floor((new Date(ui.rekapAkhir) - new Date(b.tmt_sekolah)) / (365.25 * 86400000))) + ' tahun'
      : '—';
    /* Ringkasan persentase kehadiran di blok identitas — selain yang tercetak
       di tajuk tiap bagian — supaya terbaca sekilas. Hanya yang punya
       jadwal pembanding; kosong berarti barisnya tidak dicetak. */
    const ringkasHadir = [
      r.persenMengajar != null && `Mengajar ${fmtPersen(r.persenMengajar)}`,
      r.persenWali != null && `Wali kelas ${fmtPersen(r.persenWali)}`,
      r.persenUnit != null && `Piket unit ${fmtPersen(r.persenUnit)}`,
      r.persenMeja != null && `Piket meja ${fmtPersen(r.persenMeja)}`,
      r.persenParkir != null && `Parkiran ${fmtPersen(r.persenParkir)}`,
      r.staf && r.staf.hari_kerja > 0 && `Staf ${fmtPersen(persenDari(r.staf.hari_hadir, r.staf.hari_kerja))}`
    ].filter(Boolean).join(' · ');

    const bagian = [];
    const A = Number(b.mengajar) || 0, B = Number(b.wali) || 0, C = Number(b.diperbantukan) || 0;
    const D_ = ['piket_meja', 'pengganti', 'ekskul', 'tahfidz', 'parkiran'].reduce((t, k) => t + (Number(b[k]) || 0), 0);
    const S = (Number(b.staf_gaji) || 0) + (Number(b.staf_transpor) || 0);
    const P = Number(b.pendukung) || 0;
    const E = (Number(b.bpjs) || 0) + (Number(b.bpjs_tk) || 0);
    let huruf = 0;
    const kode = () => String.fromCharCode(65 + huruf++);   // A, B, C, … hanya untuk bagian yang dicetak

    if (A > 0 || m) {
      const k = kode();
      bagian.push(rowHeader(k, 'PENDAPATAN SEBAGAI GURU', r.persenMengajar));
      if (r.mapel) bagian.push(rowInfo('Mata Pelajaran', r.mapel));
      const jam = m ? `${m.jam_dibayar} jam/minggu` : '';
      bagian.push(rowItem(1, 'Honor Mengajar', jam, m ? m.honor_guru : 0));
      bagian.push(rowItem(2, 'Transpor Berdiri', jam, m ? m.transport : 0));
      bagian.push(rowItem(3, 'Insentif Tatap Muka', m ? `${m.jam_tm} jam hadir` : '', m ? m.insentif : 0));
      bagian.push(rowItem(4, 'Konsumsi Kedatangan', m ? `${m.hari_datang} hari hadir` : '', m ? m.konsumsi : 0));
      bagian.push(rowJumlah(`Jumlah ${k}`, A));
    }
    if (B > 0 || w) {
      const k = kode();
      bagian.push(rowHeader(k, 'HONOR WALI KELAS', r.persenWali));
      bagian.push(rowItem(1, 'Honor Wali Kelas', w ? `${w.bulan} bulan` : '', w ? w.honor_bulanan : 0));
      bagian.push(rowItem(2, 'Honor Upacara', w ? `${w.jam_upacara} jam hadir` : '', w ? w.honor_upacara : 0));
      bagian.push(rowItem(3, 'Honor Bimbingan Wali Kelas', w ? `${w.jam_bimbingan} jam hadir` : '', w ? w.honor_bimbingan : 0));
      bagian.push(rowJumlah(`Jumlah ${k}`, B));
    }
    if (C > 0 || diper.length) {
      const k = kode();
      bagian.push(rowHeader(k, 'HONOR GURU DIPERBANTUKAN', r.persenUnit));
      bagian.push(rowItem(1, 'Honor Diperbantukan', diper.map(x => x.unit).filter(Boolean).join(', '), jml(diper, 'honor')));
      bagian.push(rowItem(2, 'Transpor Piket Unit', `${jml(diper, 'jam_jaga')} jam jaga`, jml(diper, 'transport')));
      bagian.push(rowJumlah(`Jumlah ${k}`, C));
    }
    if (D_ > 0 || meja || r.pengganti || ekskul.length || tahfidz.length || r.parkir) {
      const k = kode();
      const pg = r.pengganti;
      bagian.push(rowHeader(k, 'TRANSPOR DAN KOMPENSASI LAIN'));
      bagian.push(rowItem(1, 'Transpor Piket Meja Sekolah', meja ? `${meja.ukuran} jam jaga` : '', b.piket_meja, meja ? r.persenMeja : null));
      bagian.push(rowItem(2, 'Transpor Guru Pengganti', pg ? `GT ${pg.jam_gt} · PT ${pg.jam_pt} · Inf ${pg.jam_inf} jam` : '', b.pengganti));
      bagian.push(rowItem(3, 'Transpor Pembina Ekstrakurikuler', ekskul.length ? `${jml(ekskul, 'pertemuan')} pertemuan` : '', b.ekskul));
      bagian.push(rowItem(4, 'Transpor Pembimbing Tahfidz', tahfidz.length ? `${jml(tahfidz, 'pertemuan')} pertemuan` : '', b.tahfidz));
      bagian.push(rowItem(5, 'Kompensasi Piket Parkiran', r.parkir ? `${r.parkir.ukuran} hari jaga` : '', b.parkiran, r.parkir ? r.persenParkir : null));
      bagian.push(rowJumlah(`Jumlah ${k}`, D_));
    }
    /* Pendapatan sebagai staf: lima komponen formulasi bendahara. Persentase
       kehadirannya hari hadir ÷ hari kerja (Kepala Sekolah 100 % bila
       dianggap penuh). */
    const st = r.staf;
    if (S > 0 || st) {
      const k = kode();
      bagian.push(rowHeader(k, 'PENDAPATAN SEBAGAI STAF', st && st.hari_kerja > 0 ? persenDari(st.hari_hadir, st.hari_kerja) : null));
      if (st && st.jabatan) bagian.push(rowInfo('Jabatan', st.jabatan));
      bagian.push(rowItem(1, 'Gaji Pokok Staf', st ? `${fmtJam(st.jam_minggu)} jam/minggu` : '', st ? st.gaji_pokok : 0));
      bagian.push(rowItem(2, 'Tunjangan Jabatan', st ? `${fmtJam(st.hari_tunjangan)} hari/minggu` : '', st ? st.tunjangan_jabatan : 0));
      bagian.push(rowItem(3, 'Transpor Berdiri', st ? `${fmtJam(st.jam_minggu)} jam/minggu` : ''   /* indeks tidak dicetak: bukan konsumsi publik */, st ? st.transport_berdiri : 0));
      bagian.push(rowItem(4, 'Insentif Kedatangan', st ? `${fmtJam(st.jam_hadir)} jam hadir` : '', st ? st.transport_htm : 0));
      bagian.push(rowItem(5, 'Konsumsi', st ? `${st.hari_hadir} hari hadir` : '', st ? st.konsumsi : 0));
      bagian.push(rowJumlah(`Jumlah ${k}`, S));
    }
    /* Honor tenaga pendukung: komponen per orang, satu baris satu komponen. */
    if (P > 0 || r.pendukung.length) {
      const k = kode();
      bagian.push(rowHeader(k, 'HONOR TENAGA PENDUKUNG'));
      r.pendukung.forEach((x, i) => bagian.push(rowItem(i + 1, x.komponen, `${ukuranTeks(x)} × ${rupiah(x.nilai)}`, x.jumlah)));
      bagian.push(rowJumlah(`Jumlah ${k}`, P));
    }
    if (E > 0) {
      const k = kode();
      bagian.push(rowHeader(k, 'TUNJANGAN'));
      bagian.push(rowItem(1, 'Tunjangan Kesehatan (TuSehat)', r.sehat ? [r.sehat.bentuk, `${r.sehat.bulan} bulan`].filter(Boolean).join(' · ') : '', b.bpjs));
      bagian.push(rowItem(2, 'Tunjangan Ketenagakerjaan (TuKerja)', r.kerja ? [r.kerja.bentuk, `${r.kerja.bulan} bulan`].filter(Boolean).join(' · ') : '', b.bpjs_tk));
      bagian.push(rowJumlah(`Jumlah ${k}`, E));
    }
    const rumus = huruf > 1 ? ` (${Array.from({ length: huruf }, (_, i) => String.fromCharCode(65 + i)).join(' + ')})` : '';
    bagian.push(rowJumlah('JUMLAH PENDAPATAN' + rumus, b.jumlah, { shade: BIRU, tebal: true, color: NAVY }));

    const k = kode();
    const sebut = arr => [...new Set(arr.map(x => x.jenis).filter(Boolean))].join(', ');
    bagian.push(rowHeader(k, 'POTONGAN'));
    bagian.push(rowItem(1, 'Potongan BPJS (porsi guru)', 'TuSehat & TuKerja', b.potongan_bpjs));
    bagian.push(rowItem(2, 'Potongan Koperasi', sebut(r.koperasi), b.potongan_koperasi));
    bagian.push(rowItem(3, 'Potongan Lain-lain', sebut(r.sekolah), b.potongan_sekolah));
    bagian.push(rowJumlah('Jumlah Potongan', b.potongan));
    /* Tunjangan (TuSehat, TuKerja) tidak diterima tunai: sekolah menyetorkannya
       langsung ke bank / penyelenggara. Ia tetap tercetak sebagai pendapatan
       (bagian Tunjangan) dan tetap terhitung di penerimaan bersih Gabungan,
       tetapi yang dibawa guru adalah bersih dikurangi tunjangan itu. Baris
       "Tunjangan disetor ke bank" sudah menjelaskannya; Catatan tidak
       mengulanginya. */
    const diterima = (Number(b.bersih) || 0) - E;
    if (E > 0) bagian.push(rowItem('', 'Tunjangan disetor ke bank', 'TuSehat & TuKerja, tidak diterima tunai', E));
    bagian.push(new TableRow({ children: [
      sel(teks(''), KOL[0], { shade: HIJAU, mt: 40, mb: 40 }),
      sel(teks('DITERIMA TUNAI OLEH GURU', { bold: true, size: 18, color: HIJAU_TUA }), KOL[1] + KOL[2], { span: 2, shade: HIJAU, mt: 40, mb: 40 }),
      sel(teks('Rp', { bold: true, size: 18, color: HIJAU_TUA }), KOL[3], { shade: HIJAU, mt: 40, mb: 40 }),
      sel(teks(angka(diterima), { bold: true, size: 18, align: AlignmentType.RIGHT, color: HIJAU_TUA }), KOL[4], { shade: HIJAU, mt: 40, mb: 40 })
    ]}));
    bagian.push(new TableRow({ children: [
      sel(teks(''), KOL[0]),
      sel(teks(`Terbilang: ${terbilang(diterima)}`, { italics: true, color: KELABU }), KOL[1] + KOL[2] + KOL[3] + KOL[4], { span: 4 })
    ]}));

    const kop = tabel([900, 4700, 1900], [new TableRow({ children: [
      sel(dataLogo ? par(new ImageRun({ type: 'png', data: dataLogo, transformation: { width: 40, height: 40 } })) : teks(''), 900, { borders: garisKop }),
      sel([
        teks(p.nama_sekolah || KONFIG.sekolah, { bold: true, size: 20, color: NAVY }),
        teks(alamat, { size: 14, color: KELABU })
      ], 4700, { borders: garisKop }),
      sel([
        teks('PERIODE', { size: 13, color: KELABU, align: AlignmentType.CENTER }),
        teks(periode.toUpperCase(), { bold: true, size: 18, color: NAVY, align: AlignmentType.CENTER })
      ], 1900, { shade: BIRU, borders: { top: tipis, left: tipis, right: tipis, bottom: garisKop.bottom } })
    ]})]);
    const identitas = tabel([1300, 200, 3000, 1100, 200, 1700], [
      new TableRow({ children: [
        sel(teks('Nama'), 1300), sel(teks(':'), 200), sel(teks(b.nama || '', { bold: true }), 3000),
        sel(teks('Jenis'), 1100), sel(teks(':'), 200), sel(teks(b.jenis_orang || '—', { bold: true }), 1700)
      ]}),
      new TableRow({ children: [
        sel(teks('TMT'), 1300), sel(teks(':'), 200), sel(teks(b.tmt_sekolah ? tglIndo(b.tmt_sekolah) : '—'), 3000),
        sel(teks('Masa Kerja'), 1100), sel(teks(':'), 200), sel(teks(masaKerja), 1700)
      ]}),
      ...(ringkasHadir ? [new TableRow({ children: [
        sel(teks('Kehadiran'), 1300), sel(teks(':'), 200),
        sel(teks(ringkasHadir, { bold: true }), 3000 + 1100 + 200 + 1700, { span: 4 })
      ]})] : [])
    ]);
    const ttd = tabel([3300, 2100, 2100], [new TableRow({ children: [
      sel([
        teks('Catatan:', { bold: true, size: 14, color: KELABU }),
        teks('Mohon konfirmasi kepada bendahara bila terdapat kekeliruan atau kekurangan pada struk ini.', { size: 14, color: KELABU })
      ], 3300, { valign: VerticalAlign.TOP }),
      sel([
        teks(`${kota}, ${tanggal}`, { size: 15, align: AlignmentType.CENTER }),
        teks('Bendahara', { size: 15, align: AlignmentType.CENTER }),
        teks('', { size: 15 }), teks('', { size: 15 }),
        teks(p.bendahara || '……………………', { bold: true, size: 15, align: AlignmentType.CENTER })
      ], 2100, { valign: VerticalAlign.TOP }),
      sel([
        teks('', { size: 15 }),
        teks('Penerima', { size: 15, align: AlignmentType.CENTER }),
        teks('', { size: 15 }), teks('', { size: 15 }),
        teks(b.nama || '……………………', { bold: true, size: 15, align: AlignmentType.CENTER })
      ], 2100, { valign: VerticalAlign.TOP })
    ]})]);

    return [
      kop,
      teks('STRUK GAJI', { bold: true, size: 24, color: NAVY, align: AlignmentType.CENTER, before: 80, after: 40 }),
      identitas,
      teks('', { size: 6, before: 40 }),
      tabel(KOL, bagian),
      teks('', { size: 6, before: 40 }),
      ttd
    ];
  }

  // Dua struk sehalaman, berdampingan, dipisah garis putus-putus untuk digunting.
  const isi = [];
  for (let i = 0; i < penerima.length; i += 2) {
    const kiri = penerima[i], kanan = penerima[i + 1];
    isi.push(tabel([LEBAR, 500, LEBAR], [new TableRow({ children: [
      sel(buatStruk(kiri), LEBAR, { valign: VerticalAlign.TOP, ml: 0, mr: 0, mt: 0, mb: 0 }),
      sel(teks(''), 500, { borders: { top: tanpa, bottom: tanpa, right: tanpa, left: { style: BorderStyle.DASHED, size: 4, color: GARIS } } }),
      sel(kanan ? buatStruk(kanan) : teks(''), LEBAR, { valign: VerticalAlign.TOP, ml: 0, mr: 0, mt: 0, mb: 0 })
    ]})]));
    if (i + 2 < penerima.length) isi.push(new Paragraph({ children: [new PageBreak()] }));
  }

  const doc = new Document({
    creator: p.nama_sekolah || KONFIG.sekolah,
    title: `Struk Gaji ${periode}`,
    styles: { default: { document: { run: { font: F, size: 16 } } } },
    sections: [{
      properties: { page: {
        size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
        margin: { top: 500, bottom: 400, left: 660, right: 660 }
      } },
      children: isi
    }]
  });
  const blob = await Packer.toBlob(doc);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const satu = penerima.length === 1 ? penerima[0] : null;
  const namaBerkas = satu ? ' ' + String(satu.nama || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  a.download = `Struk Gaji${namaBerkas} ${ui.rekapAwal} sd ${ui.rekapAkhir}.docx`;
  document.body.appendChild(a); a.click(); a.remove();
  toast(satu ? `Struk ${satu.nama} diunduh` : `${penerima.length} struk diunduh`);
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
