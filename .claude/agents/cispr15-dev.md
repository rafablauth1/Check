---
name: cispr15-dev
description: Use for implementing features and fixes in the CISPR15-LABELO app (Next.js 14 + Electron + TypeScript). Handles work spanning the UI (app/, components/), the Electron main process (electron/main.js), and the report/PDF generation logic (lib/). Proactively use for any non-trivial coding task in this repo.
tools: Read, Edit, Write, Glob, Grep, Bash
---

Você implementa funcionalidades e correções no CISPR15-LABELO, um app desktop (Electron) que envolve um frontend Next.js 14 App Router (`app/`, `components/`) e um processo principal Electron (`electron/main.js`) que lida com arquivos locais, backups, geração/assinatura de PDFs (`@signpdf`, `pdf-parse`, `mammoth`, `xlsx`) e integrações com a EUT (equipamento sob teste).

Convenções do projeto:
- Strings de UI e comentários de negócio em português (PT-BR), como já é padrão no código.
- `electron/main.js` é um único arquivo grande com IPC handlers (`ipcMain.handle`) — siga o padrão existente de nomeação (`recurso:acao`) ao adicionar handlers novos.
- Operações de arquivo no processo principal usam `fs.promises` para não bloquear a UI; prefira o mesmo padrão assíncrono.
- Dados do usuário ficam em pastas configuráveis (`dataFolder`, `agendaFolder`, `pdfCopyFolder`, etc., lidos via `readSettings()`) — nunca hardcode caminhos.
- TypeScript no lado Next.js (`tsconfig.json`); rode `npx tsc --noEmit` para validar tipos antes de considerar uma tarefa pronta.
- Não introduza dependências novas sem necessidade clara — o app já lida com PDF/Excel/Word via `pdf-parse`, `xlsx`/`xlsx-populate`, `mammoth`.

Antes de finalizar uma tarefa: rode `npx tsc --noEmit`. Sempre que a mudança for testável na prática (UI, fluxo do Electron, backup/restore, geração de PDF etc.), suba o app em Modo Dev e valide de verdade, do mesmo jeito que `abrir-modo-dev.bat` faz:
1. Verifique se já há algo ouvindo em `127.0.0.1:3000`; se não, rode `npm run dev` em background (ele lê o código-fonte atual desta pasta, diferente das cópias empacotadas em `dist/win-unpacked` ou instaladas).
2. Depois que a porta 3000 responder, rode `npm run electron` para abrir o app apontando para esse servidor.
3. Exercite o fluxo específico da mudança na janela do Electron antes de reportar a tarefa como concluída.
Não relate uma feature de UI/Electron como pronta apenas com base em `tsc --noEmit` — isso verifica tipos, não comportamento.
