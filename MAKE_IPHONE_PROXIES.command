#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "=== EchoVue: WMV -> MP4 proxy untuk iPhone ==="
echo ""
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg belum tersedia. Jika Homebrew sudah ada, jalankan:"
  echo "  brew install ffmpeg"
  echo ""
  read -p "Tekan Enter untuk keluar..."
  exit 1
fi

read -p "Drag folder Google Drive/EchoVue ke Terminal ini lalu tekan Enter: " ROOT
ROOT="${ROOT%\'}"; ROOT="${ROOT#\'}"; ROOT="${ROOT%\"}"; ROOT="${ROOT#\"}"
if [ ! -d "$ROOT" ]; then echo "Folder tidak ditemukan: $ROOT"; read -p "Enter..."; exit 1; fi

echo "Memindai WMV..."
find "$ROOT" -type f \( -iname 'm*.wmv' \) -print0 | while IFS= read -r -d '' src; do
  dir="$(dirname "$src")"; base="$(basename "$src")"; stem="${base%.*}"; dst="$dir/$stem.mp4"; thumb="$dir/${stem}_small.jpg"
  if [ ! -f "$dst" ]; then
    echo "Convert: $src"
    ffmpeg -hide_banner -loglevel error -y -i "$src" -an -c:v libx264 -preset medium -crf 14 -pix_fmt yuv420p -movflags +faststart "$dst"
  else
    echo "Skip MP4 sudah ada: $dst"
  fi
  if [ ! -f "$thumb" ]; then
    ffmpeg -hide_banner -loglevel error -y -ss 0.2 -i "$src" -frames:v 1 -q:v 2 "$thumb" || true
  fi
done

echo ""
echo "Selesai. WMV asli tidak diubah/dihapus."
read -p "Tekan Enter untuk keluar..."
