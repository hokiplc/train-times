#!/bin/bash
# =============================================================================
# Train Times Kiosk - Raspberry Pi 5 Setup
# =============================================================================
#
# Turns a fresh Raspberry Pi OS Lite (Bookworm) install into a dedicated
# train departure board kiosk.
#
# Prerequisites:
#   1. Flash Raspberry Pi OS Lite (64-bit, Bookworm) to a microSD card
#   2. On first boot, connect via Ethernet or preconfigure WiFi via rpi-imager
#   3. Copy this repo to the Pi (e.g. scp -r train-times/ pi@raspberrypi:~/)
#   4. Run: sudo bash ~/train-times/rpi/setup.sh
#   5. Reboot: sudo reboot
#
# What this script does:
#   - Installs cage (Wayland kiosk compositor), Chromium, and wlr-randr
#   - Creates a locked-down 'kiosk' user
#   - Copies the web app to /opt/train-times
#   - Runs a local web server on port 8080 (python3 http.server)
#   - Auto-logs in on tty1 and launches Chromium in fullscreen kiosk mode
#   - Configures WiFi (SSID: HOKI-HH)
#   - Rotates display to portrait mode
#   - Disables screen blanking
#
# =============================================================================

set -e

# Must run as root
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: run this script as root (sudo bash setup.sh)"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="/opt/train-times"
KIOSK_USER="kiosk"

echo ""
echo "========================================="
echo "  Train Times Kiosk Setup"
echo "========================================="
echo ""

# ── 1. Install packages ─────────────────────────────────────────────────────
echo "[1/7] Installing packages..."
apt-get update -qq
apt-get install -y --no-install-recommends \
  cage \
  chromium-browser \
  wlr-randr \
  python3 \
  curl \
  fonts-noto-core \
  > /dev/null

# ── 2. Create kiosk user ────────────────────────────────────────────────────
echo "[2/7] Creating kiosk user..."
if ! id "$KIOSK_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$KIOSK_USER"
fi
usermod -aG video,input,render "$KIOSK_USER"

# ── 3. Install web app ──────────────────────────────────────────────────────
echo "[3/7] Installing web app to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp "$REPO_DIR/index.html"    "$INSTALL_DIR/"
cp "$REPO_DIR/index.css"     "$INSTALL_DIR/"
cp "$REPO_DIR/main.js"       "$INSTALL_DIR/"
cp "$REPO_DIR/stations.json" "$INSTALL_DIR/"
chown -R "$KIOSK_USER":"$KIOSK_USER" "$INSTALL_DIR"

# ── 4. Install systemd service for local web server ─────────────────────────
echo "[4/7] Installing web server service..."
cp "$SCRIPT_DIR/train-times-web.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable train-times-web.service

# ── 5. Install kiosk launcher ───────────────────────────────────────────────
echo "[5/7] Configuring kiosk auto-start..."
cp "$SCRIPT_DIR/kiosk-start.sh" /usr/local/bin/kiosk-start.sh
cp "$SCRIPT_DIR/kiosk-browser.sh" /usr/local/bin/kiosk-browser.sh
chmod +x /usr/local/bin/kiosk-start.sh /usr/local/bin/kiosk-browser.sh

# Auto-login kiosk user on tty1
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << AUTOLOGIN
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $KIOSK_USER --noclear %I \$TERM
AUTOLOGIN

# Start kiosk on login (only on tty1)
BASH_PROFILE="/home/$KIOSK_USER/.bash_profile"
cat > "$BASH_PROFILE" << 'PROFILE'
if [ "$(tty)" = "/dev/tty1" ]; then
  exec /usr/local/bin/kiosk-start.sh
fi
PROFILE
chown "$KIOSK_USER":"$KIOSK_USER" "$BASH_PROFILE"

# ── 6. Configure WiFi ───────────────────────────────────────────────────────
echo "[6/7] Configuring WiFi (HOKI-HH)..."
cp "$SCRIPT_DIR/HOKI-HH.nmconnection" /etc/NetworkManager/system-connections/
chmod 600 /etc/NetworkManager/system-connections/HOKI-HH.nmconnection
nmcli connection reload 2>/dev/null || true

# ── 7. Display and power settings ───────────────────────────────────────────
echo "[7/7] Configuring display and power..."

# Disable console blanking so the screen never turns off
CMDLINE="/boot/firmware/cmdline.txt"
if [ -f "$CMDLINE" ] && ! grep -q "consoleblank=0" "$CMDLINE"; then
  sed -i 's/$/ consoleblank=0/' "$CMDLINE"
fi

# Disable kernel display power management
cat > /etc/udev/rules.d/99-dpms-off.rules << 'DPMS'
ACTION=="add", SUBSYSTEM=="drm", RUN+="/usr/bin/sh -c 'echo 0 > /sys/class/drm/%k/dpms_off 2>/dev/null || true'"
DPMS

echo ""
echo "========================================="
echo "  Setup complete!"
echo ""
echo "  Web app:  $INSTALL_DIR"
echo "  Server:   http://localhost:8080"
echo "  WiFi:     HOKI-HH"
echo "  Display:  Portrait (HDMI, 90 deg)"
echo "  User:     $KIOSK_USER (auto-login tty1)"
echo ""
echo "  Reboot now:  sudo reboot"
echo "========================================="
echo ""
