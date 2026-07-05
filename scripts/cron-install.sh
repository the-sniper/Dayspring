#!/bin/sh
# Install the 7:30am daily run as a launchd agent. Missed runs (laptop asleep)
# fire on the next wake. Re-run any time — replaces the existing agent.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DST="$HOME/Library/LaunchAgents/com.dayspring.daily.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$DIR/data"
sed -e "s|__DAYSPRING_DIR__|$DIR|g" -e "s|__HOME__|$HOME|g" \
  "$DIR/scripts/launchd/com.dayspring.daily.plist" > "$DST"

launchctl bootout "gui/$(id -u)" "$DST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$DST"

echo "Installed: daily run at 07:30 (log: $DIR/data/daily.log)"
echo "Test now:  launchctl kickstart gui/$(id -u)/com.dayspring.daily"
echo "Remove:    npm run cron:uninstall"
