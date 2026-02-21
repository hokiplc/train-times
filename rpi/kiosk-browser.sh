#!/bin/bash
# Browser wrapper - runs INSIDE the cage Wayland session
# so wlr-randr has access to the compositor's display socket

# Rotate display to portrait mode
# Try both HDMI outputs to cover different connector configs
wlr-randr --output HDMI-A-1 --transform 90 2>/dev/null || \
wlr-randr --output HDMI-A-2 --transform 90 2>/dev/null || true

# Small pause for the rotation to settle
sleep 1

# Launch Chromium in kiosk mode
exec chromium-browser \
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
