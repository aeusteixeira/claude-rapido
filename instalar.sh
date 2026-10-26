#!/usr/bin/env bash
# Instala o Claude Rápido no KDE Plasma: dependências, comando, item no menu, atalho global
# e início junto com o sistema (escondido, pra barra abrir na hora no primeiro atalho).
#
#   ./instalar.sh                 instala com os atalhos Meta+C (barra) e Meta+H (ditado)
#   ./instalar.sh "Ctrl+Alt+K"    instala com outro atalho pra barra
#   ATALHO_DITADO=Meta+D ./instalar.sh   outro atalho pro ditado
#   ./instalar.sh --remover       desinstala
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$HOME/.local/bin/claude-rapido"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/scalable/apps/claude-rapido.svg"
DESKTOP="$APPS/claude-rapido.desktop"
DESKTOP_DITADO="$APPS/claude-ditado.desktop"
AUTOSTART="${XDG_CONFIG_HOME:-$HOME/.config}/autostart/claude-rapido.desktop"

recarregar_atalhos() {
    # o kglobalaccel só lê o kglobalshortcutsrc ao iniciar
    systemctl --user restart plasma-kglobalaccel.service 2>/dev/null || { kquitapp6 kglobalaccel 2>/dev/null; true; }
    kbuildsycoca6 >/dev/null 2>&1 || true
}

if [[ "${1:-}" == "--remover" ]]; then
    pkill -f "$RAIZ/node_modules/electron" 2>/dev/null || true
    rm -f "$BIN" "$DESKTOP" "$DESKTOP_DITADO" "$ICONE" "$AUTOSTART"
    kwriteconfig6 --file kglobalshortcutsrc --group services --group claude-rapido.desktop --key _launch --delete
    kwriteconfig6 --file kglobalshortcutsrc --group services --group claude-ditado.desktop --key _launch --delete
    recarregar_atalhos
    echo "Claude Rápido removido."
    exit 0
fi

ATALHO="${1:-Meta+C}"
ATALHO_DITADO="${ATALHO_DITADO:-Meta+H}"

for c in konsole kwriteconfig6 npm; do
    command -v "$c" >/dev/null || { echo "Falta o $c (precisa do KDE Plasma e do Node.js)." >&2; exit 1; }
done
command -v claude >/dev/null || [[ -x "$HOME/.local/bin/claude" ]] || echo "Aviso: o comando claude não foi encontrado — instale o Claude Code."

# a barra é um app Electron pequeno; o binário vem do cache do npm quando já existe
(cd "$RAIZ" && npm install --no-audit --no-fund --silent)
[[ -x "$RAIZ/node_modules/electron/dist/electron" ]] || node "$RAIZ/node_modules/electron/install.js"

mkdir -p "$(dirname "$BIN")" "$APPS" "$(dirname "$ICONE")" "$(dirname "$AUTOSTART")"
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

cat > "$DESKTOP_DITADO" <<EOF
[Desktop Entry]
Type=Application
Name=Ditado (Claude Rápido)
Comment=Fale e o texto vai pra área de transferência
Exec=$BIN --ditado
Icon=audio-input-microphone
Terminal=false
Categories=Utility;
Keywords=ditado;voz;transcrever;microfone;whisper;
X-KDE-Shortcuts=$ATALHO_DITADO
EOF

cat > "$AUTOSTART" <<EOF
[Desktop Entry]
Type=Application
Name=Claude Rápido (em segundo plano)
Exec=$BIN --oculto
Icon=claude-rapido
NoDisplay=true
X-GNOME-Autostart-enabled=true
EOF

kwriteconfig6 --file kglobalshortcutsrc --group services --group claude-rapido.desktop --key _launch "$ATALHO"
kwriteconfig6 --file kglobalshortcutsrc --group services --group claude-ditado.desktop --key _launch "$ATALHO_DITADO"
recarregar_atalhos

# ditado: whisper.cpp compilado em ~/.local/src + modelo small (rápido no processador)
WHISPER_SRC="$HOME/.local/src/whisper.cpp"
MODELO="${XDG_DATA_HOME:-$HOME/.local/share}/whisper/ggml-small-q5_1.bin"
if ! command -v whisper-cli >/dev/null && [[ ! -x "$HOME/.local/bin/whisper-cli" ]]; then
    if command -v cmake >/dev/null && command -v g++ >/dev/null; then
        echo "Compilando o whisper.cpp (uns 2 minutos)…"
        [[ -d "$WHISPER_SRC" ]] || git clone -q --depth 1 https://github.com/ggml-org/whisper.cpp "$WHISPER_SRC"
        cmake -S "$WHISPER_SRC" -B "$WHISPER_SRC/build" -DCMAKE_BUILD_TYPE=Release >/dev/null
        cmake --build "$WHISPER_SRC/build" -j"$(nproc)" --target whisper-cli >/dev/null
        ln -sf "$WHISPER_SRC/build/bin/whisper-cli" "$HOME/.local/bin/whisper-cli"
    else
        echo "Aviso: pro ditado funcionar instale cmake e gcc-c++ e rode de novo."
    fi
fi
if [[ ! -f "$MODELO" ]]; then
    mkdir -p "$(dirname "$MODELO")"
    curl -fL --progress-bar -o "$MODELO" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
fi

# já deixa rodando escondido, sem esperar o próximo login
pgrep -f "$RAIZ/node_modules/electron" >/dev/null || (setsid "$BIN" --oculto >/dev/null 2>&1 < /dev/null &)

echo "Pronto! Aperte $ATALHO em qualquer lugar e digite sua pergunta."
echo "Aperte $ATALHO_DITADO pra ditar: fale, aperte Espaço e o texto vai pra área de transferência."
echo "Dica: comece com \"projeto:\" (ex.: tumta: ...) para abrir o Claude na pasta do projeto."
