# NovelVoice v2 — EPUB Reader & Native Android TTS

**NovelVoice** adalah aplikasi pembaca buku EPUB (`.epub`) untuk Android & Web yang dibangun dengan **React + TypeScript + Vite + Tailwind CSS v4** dan dibungkus menggunakan **Capacitor 8**. Tanpa iklan, tanpa login, ringan, dan dirancang dengan fokus pada pengalaman baca yang nyaman serta Text-to-Speech (TTS) latar belakang yang mengalir alami.

---

## Fitur Utama (v2.0.0)

### 1. Perpustakaan & Detail Buku ("Tentang Dokumen")
- Impor satu file, banyak file sekaligus, pindai satu folder `.epub`, serta dukungan **Buka dengan (Open With)** berkas `.epub` di Android (`ACTION_VIEW`), lengkap dengan deteksi duplikat otomatis via **SHA-1**.
- Tab rak buku: **Semua**, **Terakhir**, **Favorit**, **Selesai**, dan **Koleksi**.
- Urutkan **Judul (Natural 1–200)** untuk urutan jilid bernomor (`{1} (1-200)`, `{2} (201-400)`, `{10}`), pengarang, terakhir dibaca, tanggal ditambahkan, dan ukuran file.
- Pengelompokan otomatis menurut **Seri**, tampilan Kisi/Daftar, pencarian cepat, dan halaman **Tentang Dokumen** lengkap dengan tombol **BACA**, tombol **TTS langsung**, editor metadata, SHA-1, lokasi berkas, dan aksi cepat.
- **Cadangan & Pemulihan (JSON)** untuk mengekspor/mengimpor progres baca, penanda, kutipan, catatan, preset tampilan, dan setelan suara.

### 2. Layar Baca & Tampilan Fleksibel
- Bilah atas ringkas (`Kembali`, `TTS`, `Cari dalam Buku`, `Daftar Isi`, `Setelan`, `Menu ⋮`), pengatur kecerahan yang bisa dilipat, serta mode layar penuh dengan ketuk tengah layar.
- Bilah bawah dengan penghitung halaman virtual seluruh buku (`176 dari 1086`), seekbar panjang berpenanda bab beserta tooltip, gulir otomatis (*auto-scroll*), kunci orientasi layar, dan garis progres bab tipis.
- Halaman virtual dihitung ulang otomatis setiap ukuran font, margin, jarak baris, atau tata letak 2 halaman berubah tanpa kehilangan posisi baca.
- **6 Tema Warna**: *Siang*, *Malam*, *Senja* (`#2b2b2b` / `#bac7d6`), *Sepia*, *AMOLED*, dan *Kustom*.
- **11+ Font Bawaan** (*Alice*, *Literata*, *Merriweather*, *Lora*, *Roboto*, *Noto Serif*, *Open Sans*, *Atkinson Hyperlegible*, dll.) + impor font `.ttf` / `.otf` sendiri + preset setelan tampilan.
- Mendukung teks *miring*/*tebal*, indentasi paragraf, pemenggalan kata bahasa Indonesia, seleksi teks (**Salin**, **Highlight 5 warna**, **Catatan**, **Terjemahkan**, **Baca dari sini**, **Bagikan**).

### 3. Daftar Isi, Penanda & Kutipan
- Drawer 3 tab: **KONTEN** (daftar bab tervirtualisasi, mulus untuk 200+ bab, pencarian bab & loncat ke nomor bab), **PENANDA**, dan **KUTIPAN** (ekspor ke `.txt` atau salin semua).

### 4. Text-to-Speech (TTS) Latar Belakang & Terjemahan
- **Unit Suara Mengalir**: Mengirim paragraf/potongan besar dengan antrean lookahead (`QUEUE_ADD`) tanpa celah dan jeda alami di koma (`0–500 ms`, default `200 ms`).
- **Sorotan Kata & Kalimat**: Menggunakan `UtteranceProgressListener.onRangeStart` bila didukung mesin TTS, dengan estimasi proporsional otomatis sebagai cadangan pada kecepatan `0.5×–3.0×`.
- **Kontrol Lanjutan**: Volume, kecepatan, nada, *Sleep Timer* (termasuk kustom + pengecilan suara perlahan sebelum berhenti), mode multi bahasa otomatis (ID/EN), kamus pelafalan, filter tanda kurung/simbol/catatan kaki/tajuk, serta Foreground Service + `MediaSession` (Play/Pause/Next/Prev dari notifikasi & layar kunci).
- **Terjemahan Langsung**: Deteksi otomatis bahasa sumber, pilih bahasa tujuan, cache lokal IndexedDB, penyedia yang dapat dipilih (**MyMemory** atau **LibreTranslate**), dan pemutaran suara terjemahan.

### 5. Ganti Teks Non-Destruktif (*Find & Replace* di Layar Baca)
- **Pemicu Fleksibel**: Pilih kata/frasa langsung saat membaca lalu tekan **Ganti teks**, atau buka dari menu **⋮ → Cari & ganti** dan **Aturan ganti teks**.
- **Opsi Lengkap**: *Peka huruf besar dan kecil*, *Kata utuh* (batas kata Unicode), *Pertahankan huruf kapital*, *Regex* (dengan grup tangkap `$1`, `$2` + validasi sintaks/keamanan loop), dan mode **Hanya untuk TTS** (layar tetap asli, hanya pembacaan suara yang diganti tanpa menggeser highlight).
- **Cakupan & Pratinjau**: Mulai dari satu kemunculan (*Hanya yang ini*), *Bab ini*, *Dari sini sampai akhir buku*, *Semua kemunculan di buku ini*, *Semua buku di seri ini*, hingga *Semua buku (global)* — dilengkapi hitungan langsung, daftar pratinjau yang dapat dicentang per item, serta tombol **BATALKAN** (Undo) cepat.
- **Manajemen Aturan & Ekspor Aman**: Atur urutan prioritas (↑/↓), aktif/nonaktifkan, ekspor/impor JSON aturan, serta buat **salinan EPUB hasil edit** tanpa mengubah berkas EPUB asli.

---

## Izin Android (`AndroidManifest.xml`)
- `INTERNET` — Hanya dipakai untuk terjemahan daring opsional.
- `FOREGROUND_SERVICE` & `FOREGROUND_SERVICE_MEDIA_PLAYBACK` — Mempertahankan pembacaan TTS saat layar mati atau aplikasi diminimalkan.
- `POST_NOTIFICATIONS` — Menampilkan notifikasi kontrol media TTS di Android 13+.
- `WAKE_LOCK` — Mencegah CPU tidur saat pemutaran TTS berlangsung.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` — Memudahkan pengguna membuka pengecualian baterai agar sistem tidak mematikan layanan latar belakang.

---


## Batasan Mesin TTS Android
- **Highlight per kata (`onRangeStart`)**: Dukungan event posisi karakter bergantung pada masing-masing mesin TTS yang terpasang di Android (misalnya Google Speech Services mendukungnya di sebagian besar voice lokal; beberapa mesin pihak ketiga tidak mengirim `onRangeStart`, sehingga NovelVoice otomatis menggunakan estimasi proporsional berdasarkan kecepatan bicara).
- **Voice Online vs Offline**: Voice bertanda *Network/Online* membutuhkan koneksi internet aktif dan dapat memiliki jeda awal jaringan. Gunakan voice *Lokal/Offline* di `Pengaturan TTS Android` untuk pembacaan tanpa jeda saat offline.
- **Pratinjau Web**: Pembukaan pengaturan TTS sistem (`com.android.settings.TTS_SETTINGS`), pengecualian optimasi baterai, dan layanan notifikasi media hanya aktif penuh ketika dijalankan sebagai APK Android.
