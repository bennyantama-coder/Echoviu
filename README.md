# EchoVue Drive PWA 0.1

Prototype PWA untuk membaca pemeriksaan echo dari Google Drive pada iPhone, iPad, dan MacBook.

## Arsitektur
- Google Drive: `Exam.ini`, WMV master, MP4 proxy, thumbnail.
- PWA: hanya kode aplikasi; tidak menyimpan data pasien di GitHub/hosting.
- Browser mengakses Drive langsung via Google OAuth.
- Service worker hanya cache shell aplikasi; respons Google Drive tidak dicache.

## Struktur folder yang didukung
```text
EchoVue/
  Pasien-A/
    Exam.ini
    m0.wmv
    m0.mp4
    m0_small.jpg
    m1.wmv
    m1.mp4
    ...
```
Folder boleh bersarang lebih dalam. Aplikasi mencari `Exam.ini` secara rekursif dari Folder ID yang dipilih.

## 1. Buat proxy MP4 untuk iPhone
WMV tetap menjadi master/original. iPhone/Safari memakai MP4 H.264.

Di Mac, install FFmpeg:
```bash
brew install ffmpeg
```
Lalu double-click `MAKE_IPHONE_PROXIES.command`, drag folder Google Drive/EchoVue ke Terminal, dan Enter.

Default proxy memakai H.264 CRF 14, kualitas tinggi, tanpa audio. Untuk penggunaan diagnostik, WMV asli tetap dipertahankan sebagai referensi/master.

## 2. Google OAuth
MVP ini memakai scope `drive.readonly` agar dapat membaca folder Drive yang sudah ada. Ini read-only tetapi aksesnya luas. Untuk versi produksi, sebaiknya pindah ke Google Picker + `drive.file` agar aplikasi hanya mendapat akses ke folder/file yang pengguna pilih.

Buat OAuth Client ID untuk Web application di Google Cloud Console:
1. Buat/select project.
2. Enable Google Drive API.
3. Configure OAuth consent screen.
4. Create Credentials -> OAuth client ID -> Web application.
5. Tambahkan Authorized JavaScript origin sesuai hosting, contoh:
   - `https://USERNAME.github.io`
   - untuk custom domain: `https://echo.domainanda.com`
6. Copy Client ID.
7. Buka `config.js`, ganti `PASTE_YOUR_GOOGLE_OAUTH_CLIENT_ID...` dengan Client ID tersebut.

JANGAN masukkan Client Secret ke file PWA. Client ID boleh terlihat publik; Client Secret tidak boleh ada di frontend.

## 3. Hosting GitHub Pages
Upload isi folder ini ke repository GitHub, lalu Settings -> Pages -> Deploy from a branch -> `main` / root.

Setelah live, buka URL Pages pada iPhone Safari. Pilih Share -> Add to Home Screen.

## 4. Folder ID Drive
Buka folder EchoVue di Google Drive. URL biasanya:
`https://drive.google.com/drive/folders/FOLDER_ID`

Tempel URL itu ke EchoVue, Simpan Folder, login Google, lalu Scan Folder Echo.

## 5. Face ID / Biometrik
Tombol `Aktifkan Face ID / Biometrik` menggunakan WebAuthn platform authenticator. Pada perangkat yang mendukung, iPhone dapat memanggil Face ID. Ini adalah lock layar lokal, bukan pengganti otorisasi Google Drive. Google OAuth tetap menjadi boundary akses ke data.

## Catatan penting
- PWA ini prototype, bukan perangkat medis tersertifikasi.
- Jangan jadikan proxy H.264 hasil konversi sebagai satu-satunya arsip. Pertahankan WMV original.
- Jangan membuat folder pasien `Anyone with the link`.
- Jangan upload data pasien ke repository GitHub.
- Token Google berada di memory browser dan hilang saat reload; prototype sengaja tidak menyimpan token ke localStorage.
- Service worker tidak cache respons Google Drive atau media pasien.
