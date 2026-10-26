# Claude Rápido

Um atalho global no KDE Plasma que abre uma caixinha de texto em qualquer lugar.
O que você digitar vira a primeira mensagem de uma sessão do **Claude Code** num
terminal novo.

```
Meta+Shift+C  →  [ Pergunte ao Claude… ]  →  Konsole com o claude já respondendo
```

## Abrir na pasta de um projeto

Comece com o nome do projeto e dois-pontos:

```
tumta: como eu gero o vídeo de uma música?
coworka: rode os testes e me diga o que quebrou
```

O projeto é procurado em `~/Documentos/Projetos/<Categoria>/<projeto>` (sem
diferenciar maiúsculas; outra pasta via `PROJETOS_ROOT`). Sem prefixo, ou com um
nome que não é projeto, o Claude abre na sua pasta pessoal.

## Instalar

```bash
./instalar.sh                 # atalho Meta+Shift+C
./instalar.sh "Ctrl+Alt+K"    # outro atalho
./instalar.sh --remover       # desinstala
```

Cria o comando `~/.local/bin/claude-rapido` (link pra este repositório, então
`git pull` já atualiza), o item **Claude Rápido** no menu e o atalho global. Dá
pra trocar o atalho depois em Configurações do Sistema → Atalhos.

Precisa de KDE Plasma (`kdialog`, `konsole`) e do [Claude Code](https://claude.com/claude-code).

## Usar pelo terminal

```bash
claude-rapido "pergunta"           # pula a caixinha
claude-rapido --dry-run "tumta: x" # mostra a pasta e a pergunta, sem abrir nada
```
