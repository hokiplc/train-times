#!/bin/bash
# Kiosk startup script for Train Times departure board
# Launched automatically on tty1 login via .bash_profile

# Wait for the local web server to be ready
echo "Waiting for web server..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:8080 2>/dev/null; then
    break
  fi
  sleep 1
done

# Rotate the display to portrait after cage starts.
# Tries HDMI-A-1 then HDMI-A-2 to cover different connector configs.
(
  sleep 3
  wlr-randr --output HDMI-A-1 --transform 90 2>/dev/null || \
  wlr-randr --output HDMI-A-2 --transform 90 2>/dev/null || true
) &

# Launch cage (minimal Wayland kiosk compositor) with Chromium
exec cage -- chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --no-first-run \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --disable-component-update \
  http://localhost:8080
