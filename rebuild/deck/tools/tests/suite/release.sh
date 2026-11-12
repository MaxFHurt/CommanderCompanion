#!/bin/sh
# Version bumps for a release (skill release). Usage: sh release.sh <app N> <deck build> <deck version>
# e.g. sh release.sh 103 213 0.9.68
set -e
N=$1; B=$2; V=$3; [ -z "$V" ] && { echo "usage: sh release.sh <app N> <deck build> <deck version>"; exit 1; }
R=$(cd "$(dirname "$0")/../../../.." && pwd)   # rebuild/
cd "$R"
sed -i "s/VERSION = '1.0.0-rebuild.[0-9]*'/VERSION = '1.0.0-rebuild.$N'/; s/BUILD_DATE = '[0-9-]*'/BUILD_DATE = '$(date +%Y-%m-%d)'/" src/version.js
sed -i "s/commander-companion-v[0-9]*'/commander-companion-v$N'/" sw.js
sed -i "s/window.BUILD = [0-9]*; window.VERSION = '[0-9.]*';/window.BUILD = $B; window.VERSION = '$V';/" deck/index.html
printf '{"build": %s, "version": "%s"}\n' "$B" "$V" > deck/version.json
node tools/stamp.mjs
sh deck/tools/build.sh | tail -2
git diff --stat | tail -1
