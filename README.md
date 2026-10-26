# Claude Rápido

Um atalho global no KDE Plasma que abre uma barra flutuante, estilo Spotlight, em
qualquer lugar. O que você digitar vira a primeira mensagem de uma sessão do
**Claude Code** num terminal novo.

```
Meta+Shift+C  →  barra no centro da tela  →  Konsole com o claude já respondendo
```

- **`@` escolhe o projeto**: digite `@tum`, escolha na lista e o Claude abre na pasta
  dele (o chip mostra qual). `tumta: pergunta…` também funciona.
- **`↑` com o campo vazio** traz as perguntas recentes (o `×` esquece uma).
- **`Shift+Enter`** quebra linha, **`Esc`** fecha, clicar fora também.
- Saudação conforme a hora, o asterisco do Claude girando (mais rápido enquanto você
  digita) e frases de exemplo que se revezam no campo.

Os projetos vêm de `~/Documentos/Projetos/<Categoria>/<projeto>` (outra pasta via
`PROJETOS_ROOT`). Sem projeto, o Claude abre na sua pasta pessoal. O histórico fica
em `~/.local/state/claude-rapido/historico.json`.

## Instalar

```bash
./instalar.sh                 # atalho Meta+Shift+C
./instalar.sh "Ctrl+Alt+K"    # outro atalho
./instalar.sh --remover       # desinstala
```

Instala as dependências (um Electron pequeno), cria o comando
`~/.local/bin/claude-rapido` (link pra este repositório, então `git pull` atualiza),
o item **Claude Rápido** no menu, o atalho global e o início junto com o sistema —
o app fica escondido em segundo plano pra barra aparecer na hora. Dá pra trocar o
atalho em Configurações do Sistema → Atalhos.

Precisa de KDE Plasma (Konsole), Node.js e do [Claude Code](https://claude.com/claude-code).

## Como funciona

`main.js` é o processo do Electron: uma janela transparente que só esconde (nunca
fecha). O atalho roda `claude-rapido`, que tenta abrir o app de novo — a segunda
instância avisa a primeira, que mostra a barra no centro do monitor onde está o
mouse. No Linux roda pelo XWayland (`--ozone-platform=x11`) pra janela poder se
posicionar e pegar o foco. A interface inteira está em `index.html`.
