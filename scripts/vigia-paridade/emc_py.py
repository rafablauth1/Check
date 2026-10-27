# Saída do emc.py original (só leitura) para comparar com lib/vigia/emc.ts
import json, os, sys
sys.path.insert(0, os.path.join(sys.argv[1], "vigia7s"))
import emc  # noqa: E402
out = {"perfis": {}, "fmt_freq": [], "fmt_tempo": [], "no_tempo": []}
for nome, segs in emc.PERFIS_PADRAO.items():
    ss = [emc.Segmento.de_dict(s) for s in segs]
    out["perfis"][nome] = [{"rotulo": s.rotulo, "aguardar": s.aguardar, "n": len(s.frequencias()),
                            "fs": [round(f, 9) for f in s.frequencias()[:5]] + [round(f, 9) for f in s.frequencias()[-3:]],
                            "dur": round(s.duracao(), 9)} for s in ss]
for f in [0.0005, 0.15, 0.999, 1, 12.345, 80, 299.995, 999.999, 1000, 2999.99999, 3000]:
    out["fmt_freq"].append(emc.fmt_freq(f))
for t in [0, 0.4, 0.5, 1.5, 2.5, 59.5, 60, 3599.5, 3600, 7322.7]:
    out["fmt_tempo"].append(emc.fmt_tempo(t))
s = emc.Segmento(f_ini=80, f_fim=1000, passo_pct=1, dwell_s=1.37, extra_s=0.1)
for t in [0, 1.46, 1.47, 10, 100.3, 500, 10000]:
    out["no_tempo"].append(list(s.no_tempo(t)))
print(json.dumps(out, ensure_ascii=False))
