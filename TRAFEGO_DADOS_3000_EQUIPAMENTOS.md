# Análise Honesta de Tráfego e Performance — 3000 Equipamentos

## Contexto

O app usa **arquivos JSON locais** como banco de dados. Toda requisição ao servidor
lê o arquivo do disco (ou do cache em memória), serializa como JSON e envia pela rede
interna (localhost). Com 3000 equipamentos, isso tem implicações diretas.

---

## Estimativa de Tamanho dos Arquivos

| Arquivo | Por item | 3000 itens | Com certificados |
|---|---|---|---|
| `equipamentos.json` | ~700 bytes | **~2 MB** | ~5–15 MB (com grandezas + certsPendentes) |
| `certificados.json` | ~3 KB (grade 2D) | **~9 MB** | ~20–40 MB (múltiplos por equipamento) |
| **Total em disco** | — | **~11 MB** | **~55 MB** |

---

## O Que Acontece Quando a Página de Equipamentos Carrega

```
1. Browser → GET /api/equipamentos  (requisição localhost)
2. Servidor → lerJSON('equipamentos.json')
   ├─ Cache hit (mtime igual): retorna objeto em memória  ← otimização feita ✓
   └─ Cache miss: fs.readFileSync (lê 2–15 MB do disco)  ← acontece 1× por processo
3. Servidor → JSON.stringify(todosOs3000Itens)          ← serializa TUDO
4. HTTP response → ~2–15 MB de JSON para o browser     ← sempre, sem paginação
5. Browser → JSON.parse(response)                       ← ~50–200 ms
6. React → renderiza 3000 linhas na tabela              ← GARGALO PRINCIPAL
```

### Tempos estimados (rede local, PC moderno)

| Etapa | Tempo |
|---|---|
| Cache hit + serialização | 30–80 ms |
| Transferência localhost (2 MB) | 5–20 ms |
| JSON.parse no browser | 20–80 ms |
| React renderizar 3000 linhas **sem virtualização** | **500 ms – 3 s** |
| **Total percebido pelo usuário** | **~1–4 segundos** |

> Com filtros ativos, o servidor já filtra antes de enviar (server-side filter foi implementado).
> Mas sem filtro ativo, ainda vai 3000 itens para o browser.

---

## Operações de Escrita

Salvar qualquer coisa (nome, status, classificação de um equipamento) reescreve
o arquivo inteiro:

```
escreverJSON('equipamentos.json', todosOs3000Objetos)
→ JSON.stringify(3000 itens)  ≈ 10–30 ms
→ fs.writeFileSync(2–15 MB)  ≈ 20–80 ms no disco local
                               ≈ 200–800 ms em rede lenta
```

Isso é funcional, mas aumenta conforme o arquivo cresce.

---

## O Que Foi Otimizado (E Ajuda de Verdade)

| Otimização | Impacto |
|---|---|
| Cache mtime em `lerJSON` | Elimina leitura de disco após o 1º acesso — grande ganho |
| JSON compacto (sem indentação) | Arquivo ~25% menor, escrita mais rápida |
| Filtros server-side na API | Com busca ativa, o browser recebe só os matches |
| `paginação` na API | **Implementada no servidor**, mas a UI ainda não usa — não ativa ainda |

---

## O Que Vai Travar de Verdade

### 1. Renderização sem virtualização — **crítico**
React renderiza TODAS as 3000 linhas no DOM, mesmo as fora da tela.
O browser cria ~30.000 elementos HTML. Em PCs lentos: congelamento de 3–8 segundos.

**Solução**: `@tanstack/react-virtual` — renderiza só as ~20 linhas visíveis.
Custo: 1–2 dias de implementação.

### 2. `certsPendentes` infla o JSON desnecessariamente
Após sincronizar a rede, cada equipamento carrega uma lista de caminhos de arquivo
(`\\servidor\labelo\...`). 3000 equipamentos × 3 PDFs × 60 chars = ~540 KB extra
no JSON de equipamentos — ainda gerenciável, mas cresce.

**Solução**: mover `certsPendentes` para um arquivo separado (`pendentes.json`)
lido só quando necessário.

### 3. Sem paginação real na UI
O botão "Sincronizar rede" cria 3000 skeletons. A lista vai mostrar 3000 linhas
de uma vez (com os filtros ativos funciona, sem filtro vai pesar).

**Solução imediata**: ativar paginação de 100 em 100 na UI usando os parâmetros
`?pagina=` e `?limite=` que já existem na API.

---

## Comparação Honesta com SQLite

| Cenário | JSON local (atual) | SQLite local |
|---|---|---|
| Listar 3000 equipamentos | ~1–4 s (sem filtro) | < 50 ms |
| Filtrar por TAG/nome | ~100 ms (server-side) | < 5 ms (índice) |
| Salvar 1 equipamento | reescreve 15 MB | atualiza 1 linha |
| Busca fulltext | não nativa | nativa com índice |
| Implementação | já feita | 3–5 dias de migração |

---

## Recomendação Honesta

**Para o curto prazo (sem mudar storage):**
1. Ativar virtualização de lista — resolve o gargalo mais visível
2. Ativar paginação na UI — 100 itens por página, busca no servidor
3. Mover `certsPendentes` para arquivo separado

**Com essas 3 mudanças**, o app funcionaria com 3000 equipamentos sem
travar, embora as escritas continuem lentas em rede.

**Para o médio prazo:**
Migrar para SQLite local (`better-sqlite3`). A migração pode ser feita com
compatibilidade total — os arquivos JSON continuam como backup, e o app
passa a usar o banco para leitura/escrita. Estimativa: 3–5 dias.

---

*Gerado em 2026-06-16 — análise baseada na arquitetura atual do app CISPR 15 LABELO.*
