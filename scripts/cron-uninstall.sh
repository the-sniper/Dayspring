#!/bin/sh
set -e
DST="$HOME/Library/LaunchAgents/com.dayspring.daily.plist"
launchctl bootout "gui/$(id -u)" "$DST" 2>/dev/null || true
rm -f "$DST"
echo "Removed the Dayspring daily launchd agent."
