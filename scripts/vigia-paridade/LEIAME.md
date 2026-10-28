# Paridade VIGIA-7S (Python) × porte TypeScript (lib/vigia)

Cada par roda a MESMA entrada no código original do VIGIA-7S (só importa, não altera nada)
e no porte em TypeScript, e compara a saída. Precisa do VIGIA-7S (pasta com `vigia7s/`) e do
Python dele (cv2 5.0.0, numpy).

```bat
set VIGIA=C:\Users\10088132\Desktop\Ensaio via Cam
set REPO_APP=C:\Users\10088132\dev\Check
set PYTHONIOENCODING=utf-8

rem leitura dos 7 segmentos: 300 displays sintéticos + quadro real com a calibração em uso
python gerar_paridade.py "%VIGIA%" casos 300
node --experimental-transform-types --import ./loader-alias.mjs comparar_seg7.mjs casos

rem cronograma EMC (perfis, frequências, durações, formatação)
python emc_py.py "%VIGIA%" > emc_py.json
node --experimental-transform-types --import ./loader-alias.mjs emc_ts.mjs emc_py.json

rem detector de ciclo da bomba + formatos/arredondamentos
python ciclo_py.py "%VIGIA%" > ciclo_py.json
node --experimental-transform-types --import ./loader-alias.mjs ciclo_ts.mjs ciclo_py.json

rem Registro (FOR EMC38): importar, totalizadores, montar por segmento, cálculos — sobre os ensaios salvos (só lê)
python registro_py.py "%VIGIA%" registro.json > registro_py.json
set VIGIA_PASTA=%VIGIA%
node --experimental-transform-types --import ./loader-alias.mjs registro_ts.mjs registro_py.json registro.json

rem planilha FOR EMC38: célula por célula (valor, fórmula, formato, cores, bordas, mesclagens, formatação condicional, gráficos)
node --experimental-transform-types --import ./loader-alias.mjs registro_excel_ts.mjs registro.json saida_ts.xlsx
python registro_excel_cmp.py "%VIGIA%" registro.json saida_ts.xlsx
```

Resultado em 28/10/2026 (Registro): 6 ensaios salvos, 12 importações (1.474 linhas), montagem por segmento
(722 leituras) e formatos iguais; planilha FOR EMC38 igual em 15.998 células e 4 gráficos.

Resultado em 27/10/2026: 303/303 leituras idênticas (inclusive frações de cada segmento),
10 perfis / 72 segmentos iguais, 60 sequências de bomba (2.916 eventos) iguais.
