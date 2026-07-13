#!/bin/sh
# Instala hooks git versionados em tools/hooks/ no .git/hooks/ deste clone.
# Rode uma vez por clone. Idempotente — sobrescreve hooks existentes.
#
# Uso: sh tools/install-hooks.sh

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
HOOKS_SRC="$REPO_ROOT/tools/hooks"
# git-dir resolve corretamente em worktrees (.git e arquivo, nao pasta).
HOOKS_DST="$(git rev-parse --git-common-dir)/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
  echo "tools/hooks/ nao existe — nada a instalar."
  exit 1
fi

mkdir -p "$HOOKS_DST"
for hook in "$HOOKS_SRC"/*; do
  name=$(basename "$hook")
  cp "$hook" "$HOOKS_DST/$name"
  chmod +x "$HOOKS_DST/$name"
  echo "  instalado: .git/hooks/$name"
done

echo "OK."
