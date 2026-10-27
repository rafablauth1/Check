# Casos para comparar a leitura do VIGIA-7S (Python, só leitura) com o porte em TypeScript.
# Uso: python gerar_paridade.py <pasta-vigia> <pasta-saida> [n]
# Grava, por caso: imagem crua BGR (.bin) + JSON com o campo e o resultado do seg7.py original.
import json, math, os, random, sys
import numpy as np, cv2

VIGIA, SAIDA = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 300
sys.path.insert(0, os.path.join(VIGIA, "vigia7s"))
import seg7  # noqa: E402  (só importa; não altera nada)

INV = {}
for k, v in seg7.TABELA.items():
    INV.setdefault(v, k)


def gerar_display(digitos, lcd=False, slant=0.0, ruido=8.0, dw=90, dh=160, gap=30, esp=22, blur=5, seed=None):
    """Cópia do gerador de validacao/validar.py (display sintético)."""
    rng = np.random.default_rng(seed)
    pads = [INV[c] if isinstance(c, str) else c for c in digitos]
    n = len(pads)
    x0, y0 = 60, 50
    W = int(2 * x0 + n * dw + (n - 1) * gap + slant * dh)
    H = int(dh + 2 * y0)
    fundo, cor = ((190, 200, 185), (40, 40, 40)) if lcd else ((20, 20, 20), (60, 60, 255))
    img = np.full((H, W, 3), fundo, np.uint8)
    hm = dh / 2
    for i, est in enumerate(pads):
        x = x0 + i * (dw + gap)
        t = esp
        segs = [(t, 0, dw - t, t), (dw - t, t, dw, hm), (dw - t, hm, dw, dh - t), (t, dh - t, dw - t, dh),
                (0, hm, t, dh - t), (0, t, t, hm), (t, hm - t / 2, dw - t, hm + t / 2)]
        for on, (a, b, c, d) in zip(est, segs):
            if on:
                pts = np.array([[a + 2, b + 2], [c - 2, b + 2], [c - 2, d - 2], [a + 2, d - 2]], float)
                pts[:, 0] += slant * (dh - pts[:, 1])
                pts += [x, y0]
                cv2.fillPoly(img, [pts.astype(np.int32)], cor)
    if blur:
        img = cv2.GaussianBlur(img, (blur, blur), 0)
    img = np.clip(img + rng.normal(0, ruido, img.shape), 0, 255).astype(np.uint8)
    roi = [x0, y0, n * dw + (n - 1) * gap + int(slant * dh), dh]
    return img, roi, dw / (dw + gap)


os.makedirs(SAIDA, exist_ok=True)
rnd = random.Random(7)
casos = []
for i in range(N):
    n = rnd.choice([4, 5, 6])
    texto = "".join(rnd.choice("0123456789") for _ in range(n))
    if rnd.random() < 0.15:  # zeros à esquerda apagados / traço / dígito estranho
        texto = " " + texto[1:]
    lcd = rnd.random() < 0.3
    slant = rnd.choice([0.0, 0.0, 0.05, 0.1, 0.15, -0.05])
    ruido = rnd.choice([2.0, 8.0, 15.0, 25.0, 40.0])
    blur = rnd.choice([0, 3, 5, 7])
    img, roi, r = gerar_display(texto, lcd=lcd, slant=slant, ruido=ruido, blur=blur, seed=i)
    if rnd.random() < 0.3:  # perturba a área marcada (operador não marca perfeito)
        roi = [roi[0] + rnd.randint(-8, 8), roi[1] + rnd.randint(-6, 6), roi[2] + rnd.randint(-12, 12), roi[3] + rnd.randint(-8, 8)]
    campo = seg7.CampoDisplay(nome="Litros", roi=roi, digitos=n, decimais=rnd.choice([0, 2, 3]),
                              largura_digito=round(r + rnd.uniform(-0.05, 0.05), 3),
                              inclinacao=math.degrees(math.atan(slant)) + rnd.choice([0, 0, 0.7, -0.7]),
                              espessura=rnd.choice([0.12, 0.15, 0.18]), limiar_segmento=rnd.choice([0.3, 0.38, 0.4, 0.5]),
                              binarizacao=rnd.choice(["otsu", "adaptativa", "fixa"]), limiar_fixo=rnd.choice([90, 118, 128, 160]),
                              inverter=lcd, dilatar=rnd.choice([0, 1, 2]))
    if rnd.random() < 0.15:  # células manuais
        cels = seg7.celulas_abs(campo)
        campo.celulas_manuais = [[c[0] + rnd.uniform(-3, 3), c[1] + rnd.uniform(-3, 3), c[2] + rnd.uniform(-4, 4), c[3]] for c in cels]
    res = seg7.ler_campo(img, campo)
    nome = f"caso_{i:04d}"
    img.tofile(os.path.join(SAIDA, nome + ".bin"))
    casos.append({"nome": nome, "w": img.shape[1], "h": img.shape[0], "texto_gerado": texto, "campo": campo.para_dict(),
                  "py": {"texto": res.texto, "valor": res.valor,
                         "segmentos": [[[s[0], s[1], s[2], s[3], s[4], bool(s[5])] for s in d] for d in res.segmentos]}})

# quadro real da câmera do laboratório (foto salva pelo VIGIA) + calibração em uso
real = os.path.join(VIGIA, "resultados", "foto_20261022_083246.png")
cfg = json.load(open(os.path.join(VIGIA, "config.json"), encoding="utf-8"))
if os.path.exists(real):
    img = cv2.imdecode(np.fromfile(real, np.uint8), cv2.IMREAD_COLOR)
    for j, c in enumerate(cfg["campos"]):
        campo = seg7.CampoDisplay.de_dict(c)
        for binz in ["adaptativa", "otsu", "fixa"]:
            campo.binarizacao = binz
            res = seg7.ler_campo(img, campo)
            nome = f"real_{j}_{binz}"
            img.tofile(os.path.join(SAIDA, nome + ".bin"))
            casos.append({"nome": nome, "w": img.shape[1], "h": img.shape[0], "texto_gerado": None, "campo": campo.para_dict(),
                          "py": {"texto": res.texto, "valor": res.valor,
                                 "segmentos": [[[s[0], s[1], s[2], s[3], s[4], bool(s[5])] for s in d] for d in res.segmentos]}})

json.dump(casos, open(os.path.join(SAIDA, "casos.json"), "w", encoding="utf-8"))
acertos = sum(1 for c in casos if c["texto_gerado"] and c["py"]["texto"] == c["texto_gerado"])
print(f"{len(casos)} casos gravados; Python leu certo {acertos} de {sum(1 for c in casos if c['texto_gerado'])} sintéticos")
