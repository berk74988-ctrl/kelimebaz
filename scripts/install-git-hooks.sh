#!/usr/bin/env bash
# Depo git kancalarini .git/hooks/'a kurar (izlenmeyen dizin → her klonda tekrar).
set -e
root="$(git rev-parse --show-toplevel)"
src="$root/scripts/git-hooks"
dst="$root/.git/hooks"
for h in "$src"/*; do
  name="$(basename "$h")"
  cp "$h" "$dst/$name"
  chmod +x "$dst/$name"
  echo "kuruldu: .git/hooks/$name"
done
echo "OK: git kancalari kuruldu."
