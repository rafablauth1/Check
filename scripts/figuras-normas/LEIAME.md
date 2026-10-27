# Figuras e tabelas das normas IEC → Base de Conhecimento

Ferramenta usada uma vez por norma (não roda dentro do app). Recorta figuras e
tabelas dos PDFs IEC bilíngues (só páginas em inglês), remonta as tabelas como
markdown e coloca tudo no `.md` da norma, antes da legenda.

Precisa do pdf.js 3.11 numa pasta `pdftools` ao lado desta
(`npm i --prefix ../pdftools pdfjs-dist@3.11.174`) e do Chrome instalado.

1. `node extrair.js <repo-app> out <docId>=<arquivo.pdf> …` → `out/<docId>/{fig|tab}-N.png` + `meta.json`
2. `node tabelas.js out` → remonta as tabelas (campo `md` no `meta.json`); `node tabelas.js out <docId> tab-1` mostra uma
3. `node faltando.js out <pasta-base>` → legendas do texto sem imagem e recortes pequenos (conferir)
4. `node inserir.js out <pasta-base> previa` → `.md` novos em `previa/` (idempotente)
5. Conferir a prévia; copiar `out/<docId>/*.png` para `<base>/img/<docId>/` e os `.md` para a base (e o espelho),
   guardando o `.md` anterior.

`pagina.js` renderiza uma página inteira (para conferir um recorte).
