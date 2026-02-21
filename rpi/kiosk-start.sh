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

# Launch cage with the browser wrapper (rotation happens inside cage's session)
exec cage -- /usr/local/bin/kiosk-browser.sh
