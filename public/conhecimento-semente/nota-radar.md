---
titulo: Ensaios de EMC do radar (medidor de velocidade)
tipo: nota
pergunta: Quais ensaios de EMC o radar faz?
fonte: Portaria Inmetro 158/2022 — Anexo C
tags: radar, medidor de velocidade, 4-2, 4-5, fixo
---

Depende da **instalação** (fixo, estático, portátil, móvel) e da **alimentação** (CA/CC):

- **4-3** (RF irradiada): sempre (1.13).
- **4-6** (RF conduzida): se tiver cabo de alimentação ou de sinal (1.14.2).
- **4-2** (ESD): sempre, **exceto radar fixo** (1.12.2).
- **4-4** (burst): CA ou CC (1.16).
- **4-5** (surto): **só radar fixo com componentes ao ar livre** (1.15.2).
- **4-11** (quedas/interrupções CA): só alimentação CA (1.18).
- **Variação de tensão (OIML D11)**: CA item 12.2 / CC item 12.1 (1.17 / 1.22).

O laboratório **não faz** os ensaios veiculares (ISO 16750-2, ISO 7637-2/3) nem o 4-29 (quedas em CC).
