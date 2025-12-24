# Wake-n-Blake Installation Guide

Complete installation instructions for wake-n-blake and its optional dependencies.

## Quick Start

```bash
# Install wake-n-blake globally
npm install -g wake-n-blake

# Verify installation
wnb --version

# Check tool availability
wnb diagnose
```

---

## Core Installation

### Node.js Requirement

Wake-n-Blake requires Node.js 18.0.0 or later.

```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Install Node.js via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### Installing wake-n-blake

```bash
# Global installation (CLI access)
npm install -g wake-n-blake

# Or as a project dependency
npm install wake-n-blake
```

---

## Optional Dependencies

Wake-n-Blake has many optional dependencies that enhance functionality. Install only what you need.

### Tier Classification

| Tier | Purpose | Recommended For |
|------|---------|-----------------|
| Core | Basic metadata extraction | Everyone |
| Tier 1 | Text, hashing, media analysis | Media workflows |
| Tier 2 | Archives, email, fonts | Digital archives |
| Tier 3 | GIS, 3D models, calendars | Specialized use |

---

## macOS Installation

### Package Manager Setup

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Core Tools

```bash
# Native BLAKE3 (2-5x faster than WASM)
brew install b3sum

# Video/audio metadata
brew install ffmpeg        # Includes ffprobe
brew install mediainfo     # Alternative metadata extractor
```

### Tier 1: Text & Hash Extractors

```bash
# PDF text extraction
brew install poppler       # Provides pdftotext

# Ebook metadata
brew install calibre       # Provides ebook-meta

# Audio fingerprinting
brew install chromaprint   # Provides fpcalc

# Python tools (use pip or pipx)
pip install imagehash      # Perceptual hashing
pip install guessit        # Video filename parsing
pip install PyMuPDF        # PDF text (alternative to pdftotext)

# Office document text extraction
pip install python-docx python-pptx openpyxl
```

### Tier 2: Archive, Email, Font

```bash
# Archive analysis
brew install p7zip         # Provides 7z command

# Python tools
pip install extract-msg    # Outlook .msg files
pip install fonttools      # Font metadata
```

### Tier 3: GIS, 3D, Calendar

```bash
# Geospatial
brew install gdal          # Provides ogrinfo

# 3D models
npm install -g @gltf-transform/cli

# Python tools
pip install trimesh        # 3D model analysis
pip install vobject        # Calendar/contact parsing
pip install icalendar      # ICS parsing (alternative)
```

### All-in-One macOS Install

```bash
# Core + Tier 1 (most common)
brew install b3sum ffmpeg mediainfo poppler calibre chromaprint p7zip
pip install imagehash guessit PyMuPDF python-docx python-pptx openpyxl

# Add Tier 2
pip install extract-msg fonttools

# Add Tier 3
brew install gdal
npm install -g @gltf-transform/cli
pip install trimesh vobject icalendar
```

---

## Linux Installation

### Debian/Ubuntu

```bash
# Update package list
sudo apt update

# Core tools
sudo apt install ffmpeg mediainfo

# Native BLAKE3
cargo install b3sum
# Or download from https://github.com/BLAKE3-team/BLAKE3/releases

# Tier 1
sudo apt install poppler-utils     # pdftotext
sudo apt install calibre           # ebook-meta
sudo apt install libchromaprint-tools  # fpcalc

# Tier 2
sudo apt install p7zip-full        # 7z

# Tier 3
sudo apt install gdal-bin          # ogrinfo

# Python tools
pip install imagehash guessit PyMuPDF python-docx python-pptx openpyxl
pip install extract-msg fonttools trimesh vobject icalendar
```

### Fedora/RHEL

```bash
# Core tools
sudo dnf install ffmpeg mediainfo

# Tier 1
sudo dnf install poppler-utils
sudo dnf install calibre
sudo dnf install chromaprint-tools

# Tier 2
sudo dnf install p7zip p7zip-plugins

# Tier 3
sudo dnf install gdal

# Python tools (same as Debian)
pip install imagehash guessit PyMuPDF python-docx python-pptx openpyxl
pip install extract-msg fonttools trimesh vobject icalendar
```

### Arch Linux

```bash
# Core tools
sudo pacman -S ffmpeg mediainfo

# Tier 1
sudo pacman -S poppler
sudo pacman -S calibre
sudo pacman -S chromaprint

# Tier 2
sudo pacman -S p7zip

# Tier 3
sudo pacman -S gdal

# Python tools via pip
pip install imagehash guessit PyMuPDF python-docx python-pptx openpyxl
pip install extract-msg fonttools trimesh vobject icalendar
```

---

## Windows Installation

### Prerequisites

1. Install [Node.js LTS](https://nodejs.org/)
2. Install [Python 3.x](https://python.org/)

### Using Chocolatey

```powershell
# Install Chocolatey (run as Administrator)
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Core tools
choco install ffmpeg
choco install mediainfo

# Tier 1
choco install poppler      # pdftotext
choco install calibre      # ebook-meta

# Tier 2
choco install 7zip
```

### Using winget

```powershell
# Core tools
winget install FFmpeg
winget install MediaArea.MediaInfo.CLI

# Tier 1
winget install Calibre.Calibre
```

### Python Tools (Windows)

```powershell
# All Python dependencies
pip install imagehash guessit PyMuPDF python-docx python-pptx openpyxl
pip install extract-msg fonttools trimesh vobject icalendar
```

---

## Docker Installation

For reproducible environments:

```dockerfile
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    mediainfo \
    poppler-utils \
    calibre \
    libchromaprint-tools \
    p7zip-full \
    gdal-bin \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --no-cache-dir \
    imagehash guessit PyMuPDF \
    python-docx python-pptx openpyxl \
    extract-msg fonttools trimesh vobject icalendar

# Install Node.js tools
RUN npm install -g wake-n-blake @gltf-transform/cli

WORKDIR /data
ENTRYPOINT ["wnb"]
```

Build and use:

```bash
docker build -t wake-n-blake .
docker run -v $(pwd):/data wake-n-blake hash myfile.mp4
```

---

## Python Virtual Environment (Recommended)

To avoid conflicts with system Python:

```bash
# Create virtual environment
python3 -m venv ~/.wnb-venv

# Activate it
source ~/.wnb-venv/bin/activate  # Linux/macOS
# Or: .\.wnb-venv\Scripts\activate  # Windows

# Install all Python tools
pip install imagehash guessit PyMuPDF python-docx python-pptx openpyxl
pip install extract-msg fonttools trimesh vobject icalendar

# Add to shell profile for automatic activation
echo 'source ~/.wnb-venv/bin/activate' >> ~/.bashrc
```

---

## Verification

After installation, verify everything works:

```bash
# Full diagnostic
wnb diagnose

# Expected output:
# Tool Availability
#   Core:
#     exiftool ........ ✓ bundled via exiftool-vendored
#     mediainfo ....... ✓ /opt/homebrew/bin/mediainfo
#     ffprobe ......... ✓ /opt/homebrew/bin/ffprobe
#   Tier 1 (Text/Hash):
#     pdftotext ....... ✓ /opt/homebrew/bin/pdftotext
#     PyMuPDF ......... ✓ available
#     Office tools .... ✓ available
#     ...
```

### Testing Individual Tools

```bash
# Test PDF extraction
wnb analyze document.pdf --tools

# Test perceptual hash
wnb phash image.jpg

# Test archive analysis
wnb analyze archive.zip --tools

# Test calendar parsing
wnb analyze calendar.ics --tools
```

---

## Troubleshooting

### "command not found"

Ensure the tool is in your PATH:

```bash
# Check PATH
echo $PATH

# Find where a tool is installed
which ffprobe

# Add to PATH if needed (in ~/.bashrc or ~/.zshrc)
export PATH="/opt/homebrew/bin:$PATH"
```

### Python import errors

```bash
# Ensure correct Python is being used
which python3
python3 --version

# Reinstall in correct environment
pip install --force-reinstall imagehash
```

### Permission errors on macOS

```bash
# Grant Terminal full disk access
# System Preferences → Privacy & Security → Full Disk Access → Add Terminal

# Or run specific commands with sudo
sudo wnb import /Volumes/protected-drive /archive
```

### Native b3sum not detected

```bash
# Check if b3sum is installed
which b3sum
b3sum --version

# If installed but not detected, set environment variable
export WNB_NATIVE_B3SUM=/path/to/b3sum
```

---

## Minimal Installation

For basic usage without optional tools:

```bash
npm install -g wake-n-blake
```

This gives you:
- BLAKE3 hashing (WASM)
- SHA-256, SHA-512, MD5
- UUID, ULID generation
- Manifest creation/verification
- ExifTool (bundled) for photo/video metadata

Most features work without additional dependencies.

---

## Updating

```bash
# Update wake-n-blake
npm update -g wake-n-blake

# Update Python tools
pip install --upgrade imagehash guessit PyMuPDF

# Update via Homebrew
brew upgrade ffmpeg calibre chromaprint
```
