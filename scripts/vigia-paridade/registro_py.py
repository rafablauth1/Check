"""Saídas da lógica do Registro (vigia7s/registro.py) sobre os ensaios salvos do VIGIA — só lê, não altera nada.

    python registro_py.py "<pasta do VIGIA>" [registro.json] > registro_py.json
"""
import copy
import json
import os
import sys

vigia = sys.argv[1]
sys.path.insert(0, os.path.join(vigia, "vigia7s"))
import registro as R  # noqa: E402

raiz = vigia
lista = R.ensaios_salvos(raiz, [os.path.join(raiz, "resultados")])
out = {"ensaios_salvos": [], "importar": {}, "montar": {}, "proxima": [], "fmt": [], "stats_inicial": None}
for e in lista:
    out["ensaios_salvos"].append({k: e[k] for k in ("rel", "nome", "quando", "ordem", "totais", "defs")} |
                                 {"segmentos": {k: len(v) for k, v in e["segmentos"].items()}})


def resumo(reg, ens_nome):
    ens = reg["ensaios"][ens_nome]
    ref = R.stats_inicial(reg["iniciais"][ens["ref"]])["media"]
    blocos = []
    for b in ens["blocos"]:
        fx = b.get("faixas", [])
        blocos.append({"bloco": b, "stats": R.stats_bloco(b, ref), "idx": R.indices_faixa(b["linhas"], fx),
                       "faixas": [R.stats_faixa(b, x, i == len(fx) - 1) for i, x in enumerate(fx)]})
    return blocos


# cada ensaio salvo importado sozinho num registro novo (4-3 automático pela face e 4-4 preenchendo em ordem)
for e in lista:
    arq = os.path.join(e["pasta"], "estado_ensaio.json")
    est = json.load(open(arq, encoding="utf-8"))
    ls, tt = R.leituras_e_totais(est, e["rel"])
    ls = R.ordenar_leituras([l for l in ls if l.get("volume") is not None])
    for ens_nome, modo in (("1.2 - IEC 61000-4-3", "acrescentar"), ("1.5 - IEC 61000-4-4", "preencher")):
        reg = R.novo_registro()
        reg["dados"]["preco"] = "5,79"
        for i, l in enumerate(reg["iniciais"]["INICIAL (RF-Irradiada)"]["linhas"]):
            l["volume"] = 4.0 + (i % 3 - 1) * 0.002
        cont = R.importar(reg, ens_nome, ls, None, modo)
        n_tot = R.preencher_totalizadores(reg, ens_nome, ls, tt, None)
        out["importar"][f"{e['rel']} | {ens_nome}"] = {"cont": cont, "n_tot": n_tot, "blocos": resumo(reg, ens_nome)}

# montar por segmento com todos os segmentos de todos os ensaios
reg = R.novo_registro()
for i, l in enumerate(reg["iniciais"]["INICIAL (RF-Irradiada)"]["linhas"]):
    l["volume"] = 4.0 + (i % 3 - 1) * 0.002
partes = [(ls, e["totais"]) for e in lista for ls in e["segmentos"].values()]
cont, n_tot, avisos = R.montar_por_segmento(reg, "1.2 - IEC 61000-4-3", copy.deepcopy(partes), True)
out["montar"] = {"cont": cont, "n_tot": n_tot, "avisos": avisos, "blocos": resumo(reg, "1.2 - IEC 61000-4-3")}

fx43 = R.novo_registro()["ensaios"]["1.2 - IEC 61000-4-3"]["blocos"][0]["faixas"]
for fs in ([], [80], [80, 81.5], [299.5], [300], [999], [2990], [3000], [0.15, 79.9]):
    linhas = [{"rotulo": R.rotulo_freq(f), "volume": None, "obs": ""} for f in fs]
    out["proxima"].append([R.proxima_freq(linhas, None, fx43), R.proxima_freq(linhas, 0 if linhas else None, fx43)])
for v in (None, "", "x", 0.0, -0.0004, 1.2345, 2.5, 0.125, 1234.5678, -3.14159):
    out["fmt"].append([R.fmt(v, 2), R.fmt(v, 3)] if not isinstance(v, str) or v else [R.fmt(v)])
for f in (0.15, 80, 80.8, 1000, 1010.0, 2999.99, 3000, None):
    out["fmt"].append([R._fmt_mhz(f), R.rotulo_freq(f) if f else ""])
for s in ("1.234,56", "92,11", " 4 ", "", None, "abc", "1,5e3", 3):
    out["fmt"].append(R.num(s))
if len(sys.argv) > 2:
    reg = R.completar(json.load(open(sys.argv[2], encoding="utf-8")))
    out["stats_inicial"] = {n: R.stats_inicial(reg["iniciais"][n]) for n in R.INICIAIS}
json.dump(out, sys.stdout, ensure_ascii=False)
