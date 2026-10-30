# Média temporal do VIGIA-7S (Camera._loop: cv2.accumulateWeighted + convertScaleAbs) em quadros aleatórios.
# Uso: python media_py.py quadros.bin media_py.bin   (depois: media_ts.mjs quadros.bin media_py.bin)
import cv2, numpy as np, sys
print(cv2.__version__, file=sys.stderr)
rng = np.random.default_rng(7)
H, W = 180, 320
frames = [rng.integers(0, 256, (H, W, 3), dtype=np.uint8) for _ in range(12)]
out = []
for n in (2, 3, 5, 7):
    media = None
    for f in frames:
        if media is None: media = f.astype(np.float32)
        else: cv2.accumulateWeighted(f, media, 1.0 / n)
    out.append(media.tobytes()); out.append(cv2.convertScaleAbs(media).tobytes())
open(sys.argv[1], 'wb').write(b''.join(f.tobytes() for f in frames))
open(sys.argv[2], 'wb').write(b''.join(out))
