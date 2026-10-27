# Saídas de DetectorCiclo/resumir_ciclos e dos formatos do app.py original (só leitura), para comparar com o TS.
import json, os, random, sys
sys.path.insert(0, os.path.join(sys.argv[1], "vigia7s"))
import app  # noqa: E402  (importar não abre janela: main() só roda como script)

rnd = random.Random(11)
seqs = []
for k in range(60):
    ref = None if k % 3 == 0 else 4.0
    dec = 3
    det = app.DetectorCiclo(ref, dec, estavel_s=rnd.choice([0.3, 1.0]), confirmar=rnd.choice([2, 3, 4]))
    t, eventos, valores = 0.0, [], []
    fase, v = "cong", 4.0
    for i in range(3000):
        t += rnd.choice([1 / 60, 1 / 30, 0.017, 0.05])
        r = rnd.random()
        if fase == "cong" and r < 0.012:
            fase, v = "ench", 0.0
        elif fase == "ench":
            v = min(4.0, v + rnd.uniform(0.01, 0.2))
            if v >= 4.0:
                fase = "cong"
        val = None if rnd.random() < 0.08 else round(v + (rnd.choice([0, 0, 0, 0.001, -0.001]) if rnd.random() < 0.05 else 0), 3)
        valores.append([t, val])
        ev = det.passo(t, val)
        if ev:
            eventos.append([ev[0], ev[1]])
    saidas = [e[1] for e in eventos if e[0] == "saida"]
    congs = [e[1] for e in eventos if e[0] == "chegada"]
    ciclos, per, ench, cong = app.resumir_ciclos(saidas, congs)
    seqs.append({"ref": ref, "dec": dec, "estavel": det.estavel_s, "conf": det.confirmar, "valores": valores,
                 "eventos": eventos, "per": per, "ench": ench, "cong": cong, "n_ciclos": len(ciclos)})

nums = [0, 0.0005, -0.0004, 0.125, 2.675, 1.005, -1.5, 2.5, 0.0015, 20.37, 20.6, 19.9995, 1234.5678, -0.125, 7.0625]
fmt = {"br2": [app.br(x, 2) for x in nums], "br3": [app.br(x, 3) for x in nums], "br1": [app.br(x, 1) for x in nums],
       "erro": [app.fmt_erro(app.erro_pct(x, 4.0)) for x in nums], "offset": [app.offset_inteiro(x) for x in nums],
       "ciclo": [app.ciclo_com_offset(x, 0.37) for x in nums], "fala": [app.fala_num(x, 2) for x in nums],
       "freq": [app.fala_freq(x) for x in [0, 86.55, 999.95, 1000, 1074.4, 2999.5]],
       "num": [app.num(s, None) for s in ["1,5", " 2.25 ", "−3,5", "abc", "", "1e3", "4,000"]]}
print(json.dumps({"seqs": seqs, "fmt": fmt, "nums": nums}, ensure_ascii=False))
