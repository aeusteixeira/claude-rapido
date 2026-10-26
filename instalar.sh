#!/usr/bin/env bash
# Instala o Claude Rápido no KDE Plasma: comando, atalho no menu e atalho global.
#
#   ./instalar.sh                 instala com o atalho Meta+Shift+C
#   ./instalar.sh "Ctrl+Alt+K"    instala com outro atalho
#   ./instalar.sh --remover       desinstala
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin/claude-rapido"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps/claude-rapido.svg"
DESKTOP="$APPS/claude-rapido.desktop"

recarregar_atalhos() {
    # o kglobalaccel só lê o kglobalshortcutsrc ao iniciar
    systemctl --user restart plasma-kglobalaccel.service 2>/dev/null || { kquitapp6 kglobalaccel 2>/dev/null; true; }
    kbuildsycoca6 >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--remover" ]]; then
    rm -f "$BIN" "$DESKTOP" "$ICONE"
    kwriteconfig6 --file kglobalshortcutsrc --group services --group claude-rapido.desktop --key _launch --delete
    recarregar_atalhos
    echo "Claude Rápido removido."
    exit 0
fi

ATALHO="${1:-Meta+Shift+C}"

for c in kdialog konsole kwriteconfig6; do
    command -v "$c" >/dev/null || { echo "Falta o $c (este instalador é para o KDE Plasma)." >&2; exit 1; }
done
command -v claude >/dev/null || [[ -x "$HOME/.local/bin/claude" ]] || echo "Aviso: o comando claude não foi encontrado — instale o Claude Code."

mkdir -p "$(dirname "$BIN")" "$APPS" "$(dirname "$ICONE")"
ln -sf "$RAIZ/claude-rapido" "$BIN"
install -m644 "$RAIZ/icone.svg" "$ICONE"

cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=Claude Rápido
Comment=Pergunte ao Claude Code de qualquer lugar
Exec=$BIN
Icon=claude-rapido
Terminal=false
Categories=Development;
Keywords=claude;ia;pergunta;terminal;
X-KDE-Shortcuts=$ATALHO
EOF

kwriteconfig6 --file kglobalshortcutsrc --group services --group claude-rapido.desktop --key _launch "$ATALHO"
recarregar_atalhos

echo "Pronto! Aperte $ATALHO em qualquer lugar e digite sua pergunta."
echo "Dica: comece com \"projeto:\" (ex.: tumta: ...) para abrir o Claude na pasta do projeto."
