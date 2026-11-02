#!/usr/bin/env python3
"""州分け地図の枠へ地形図（地図2）を位置合わせし、派生画像と州別標高表を作る。
依存は Pillow のみ。実行場所はリポジトリ直下。
  python3 tools/地図位置合わせ.py            # 既定パラメータ（縮尺 0.21、回転 0）で派生画像と表を生成
  python3 tools/地図位置合わせ.py --search   # 海域一致率（IoU）を総当たりで最大化してパラメータを求め直す
"""
import json, math, sys
from PIL import Image, ImageChops, ImageEnhance, ImageDraw

STATE = '地図/wiki_ラフカ連邦_州分け.png'
RELIEF = '地図/02_周辺地形図.webp'
OUT_WARP = '地図/derived_地形図_州枠.png'
OUT_BG = '地図/derived_背景_州枠.png'
PARAMS = {'s': 0.21, 'th': 0, 'dx': 1062, 'dy': 258, 'cw': 654, 'ch': 458}  # 2026-10-02 の最良解（D=2 探索を原寸へ換算）
LABELS = {1: (1092, 651), 2: (812, 746), 3: (949, 949), 4: (1224, 949), 5: (1349, 722), 6: (1271, 460), 7: (1642, 651),
          8: (2060, 686), 9: (1910, 1009), 10: (1719, 919), 11: (1463, 1051), 12: (1463, 1337), 13: (979, 1391),
          14: (746, 1164), 15: (436, 1009)}

def seamask(im, f):
    out = Image.new('L', im.size, 0); po = out.load(); px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            if f(px[x, y]): po[x, y] = 255
    return out

cnt = lambda im: im.histogram()[255]
sea_state = lambda p: p[2] > 200 and p[0] < 215 and p[1] > 190 and p[2] - p[0] > 25
sea_relief = lambda p: p[2] > 205 and p[0] < 215 and p[2] - p[0] > 25

def search(S, M, D=2):
    Sd = S.resize((S.width // D, S.height // D)); Md = M.resize((M.width // D, M.height // D))
    sS, sM = seamask(Sd, sea_state), seamask(Md, sea_relief)
    ws, hs = sS.size; Wm, Hm = sM.size; ONE = Image.new('L', sS.size, 255); best = []
    for s in [0.18 + 0.0025 * i for i in range(25)]:
        for th in (-2, -1, 0, 1, 2):
            a = math.radians(th); cw, ch = int(ws * s * 1.3) + 2, int(hs * s * 1.3) + 2
            cx, cy = cw / 2, ch / 2; sx, sy = ws / 2, hs / 2; ca, sa = math.cos(a), math.sin(a)
            A = (ca / s, sa / s, sx - (ca * cx + sa * cy) / s, -sa / s, ca / s, sy - (-sa * cx + ca * cy) / s)
            T = sS.transform((cw, ch), Image.AFFINE, A, resample=Image.NEAREST, fillcolor=0)
            F = ONE.transform((cw, ch), Image.AFFINE, A, resample=Image.NEAREST, fillcolor=0)
            nT = cnt(T)
            for dx in range(400, Wm - cw, 2):
                for dy in range(0, Hm - ch, 2):
                    crop = ImageChops.multiply(sM.crop((dx, dy, dx + cw, dy + ch)), F)
                    inter = cnt(ImageChops.multiply(T, crop)); uni = nT + cnt(crop) - inter
                    if uni: best.append((inter / uni, s, th, dx * D, dy * D, cw * D, ch * D))
    best.sort(reverse=True); print('best', best[:3])
    iou, s, th, dx, dy, cw, ch = best[0]
    return {'s': s, 'th': th, 'dx': dx, 'dy': dy, 'cw': cw, 'ch': ch, 'iou': iou}

def warp(S, M, P):
    s, a = P['s'], math.radians(P['th']); ca, sa = math.cos(a), math.sin(a)
    sx, sy = S.width / 2, S.height / 2; offx, offy = P['cw'] / 2 + P['dx'], P['ch'] / 2 + P['dy']
    A = (ca * s, -sa * s, offx - (ca * s * sx - sa * s * sy), sa * s, ca * s, offy - (sa * s * sx + ca * s * sy))
    return M.transform(S.size, Image.AFFINE, A, resample=Image.NEAREST)

def elev_class(p):
    r, g, b = p
    if b > r + 30: return 'water'
    if g > r - 5 and g > b + 20 and r < 215: return '0-200'
    if r > 230 and g > 220 and b < 190: return '200-500'
    if r > 225 and 150 < g < 215 and b < 140: return '500-1000'
    if r > 180 and 110 < g < 175 and b < 120: return '1000-2000'
    return 'other'

def state_table(S, Wp):
    px = S.load(); Sw, Sh = S.size
    isgreen = lambda p: p[1] > p[0] + 15 and p[1] > p[2] + 10 and 130 < p[1] < 230
    tmp = S.copy()
    for k, (x, y) in LABELS.items():
        seed = None
        for r in range(40, 200, 5):
            for ang in range(0, 360, 15):
                qx, qy = int(x + r * math.cos(math.radians(ang))), int(y + r * math.sin(math.radians(ang)))
                if 3 < qx < Sw - 3 and 3 < qy < Sh - 3 and all(isgreen(px[qx + i, qy + j]) for i in range(-3, 4) for j in range(-3, 4)):
                    seed = (qx, qy); break
            if seed: break
        ImageDraw.floodfill(tmp, seed, (k, 0, 255), thresh=30)
    tp = tmp.load(); wp = Wp.load(); per = {}; tot = {}
    for y in range(0, Sh, 2):
        for x in range(0, Sw, 2):
            p = tp[x, y]
            if p[1] == 0 and p[2] == 255 and 1 <= p[0] <= 15:
                t = elev_class(wp[x, y]); per.setdefault(p[0], {}); per[p[0]][t] = per[p[0]].get(t, 0) + 1; tot[t] = tot.get(t, 0) + 1
    for k in sorted(per):
        n = sum(per[k].values()); print(k, n, {t: round(100 * v / n, 1) for t, v in sorted(per[k].items())})
    n = sum(tot.values()); print('ALL', n, {t: round(100 * v / n, 1) for t, v in sorted(tot.items())})
    print('注意：州境の線が細い 1/6、4/11 は塗りつぶしが合流することがある')

if __name__ == '__main__':
    S = Image.open(STATE).convert('RGB'); M = Image.open(RELIEF).convert('RGB')
    P = search(S, M) if '--search' in sys.argv else PARAMS
    print('params', json.dumps(P))
    Wp = warp(S, M, P); Wp.save(OUT_WARP)
    bg = Image.blend(Wp.convert('RGBA'), Image.open(STATE).convert('RGBA'), 0.35)
    bg = ImageEnhance.Color(ImageEnhance.Brightness(bg).enhance(1.08)).enhance(0.9)
    bg.convert('RGB').save(OUT_BG, optimize=True)
    state_table(S, Wp)
