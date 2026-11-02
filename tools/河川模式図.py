#!/usr/bin/env python3
"""ラフカ河川_水文地理誌.md（第2版）に対応する模式図を SVG で生成する。
下絵は 地図/derived_背景_州枠.png（亜空世界Wikiの州分け地図の枠へ、作者提示の地形図=地図2 を
海岸線一致で位置合わせして変換したもの）。座標系は州分け地図と同じ 2388×1668。
依存なし（標準ライブラリのみ）。出力: ../ラフカ河川_模式図.svg
PNG 化（macOS）:
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
    --hide-scrollbars --window-size=2388,1668 --screenshot=ラフカ河川_模式図.png file://$PWD/ラフカ河川_模式図.svg
"""
import os
K = 1.2  # 入力座標（1990×1390 の確認画像）→ 州枠 2388×1668
W, H = 2388, 1668

def P(seq):
    return [(round(x * K, 1), round(y * K, 1)) for x, y in seq]

def smooth(seq, closed=False):
    p = P(seq)
    p = ([p[-1]] + p + [p[0], p[1]]) if closed else ([p[0]] + p + [p[-1]])
    d = [f"M{p[1][0]},{p[1][1]}"]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f"C{c1[0]:.0f},{c1[1]:.0f} {c2[0]:.0f},{c2[1]:.0f} {p2[0]},{p2[1]}")
    if closed: d.append("Z")
    return " ".join(d)

svg = []; A = svg.append
A(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
  f'font-family="Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans CJK JP, sans-serif">')
A('''<defs>
<pattern id="peat" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
  <line x1="0" y1="0" x2="0" y2="14" stroke="#6b4e2e" stroke-width="2" opacity="0.6"/></pattern>
<pattern id="marsh" width="16" height="12" patternUnits="userSpaceOnUse">
  <path d="M2,10 l3,-6 M5,4 l3,6 M9,10 l3,-6 M12,4 l3,6" stroke="#2f7d4f" stroke-width="1.6" fill="none"/></pattern>
<marker id="arw" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7f8c8d"/></marker>
</defs>''')
A(f'<image href="地図/derived_背景_州枠.png" x="0" y="0" width="{W}" height="{H}"/>')
A(f'<rect x="0" y="0" width="{W}" height="{H}" fill="#ffffff" opacity="0.12"/>')

def label(x, y, s, size=22, fill="#1b4f8a", weight="500", anchor="start", rot=0, halo=True):
    x, y = x * K, y * K
    tr = f' transform="rotate({rot} {x} {y})"' if rot else ''
    if halo:
        A(f'<text x="{x}" y="{y}" font-size="{size}" fill="#fff" stroke="#fff" stroke-width="5" stroke-linejoin="round" font-weight="{weight}" text-anchor="{anchor}"{tr} opacity="0.85">{s}</text>')
    A(f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" text-anchor="{anchor}"{tr}>{s}</text>')

# ---- 面：湿原・泥炭地・平野 ----
peat_nw = [(560, 480), (640, 470), (720, 520), (740, 580), (690, 620), (600, 600), (545, 540)]
peat_ne = [(1230, 440), (1340, 430), (1450, 450), (1520, 500), (1470, 540), (1350, 540), (1250, 510)]
beldina = [(1120, 630), (1200, 610), (1290, 625), (1320, 680), (1250, 715), (1150, 705), (1105, 670)]
estuary_marsh = [(690, 560), (740, 555), (770, 600), (760, 660), (720, 670), (690, 620)]
verkrem = [(1340, 1040), (1450, 1030), (1540, 1080), (1500, 1150), (1400, 1160), (1330, 1110)]
for poly, fill, pat in ((peat_nw, "#e7dcc3", "peat"), (peat_ne, "#e7dcc3", "peat"), (beldina, "#cfe8cf", "marsh"), (estuary_marsh, "#cfe8cf", "marsh")):
    A(f'<path d="{smooth(poly, True)}" fill="{fill}" opacity="0.85"/><path d="{smooth(poly, True)}" fill="url(#{pat})"/>')
A(f'<path d="{smooth(verkrem, True)}" fill="#e3ecd3" opacity="0.6" stroke="#9db47a" stroke-width="2" stroke-dasharray="6 6"/>')

# ---- 氷縁谷（サルヴァシュ川の東西区間）と西部高地の縁 ----
urstrom = [(-20, 1255), (120, 1252), (300, 1258), (450, 1265), (560, 1300), (680, 1285), (820, 1255), (920, 1255)]
A(f'<path d="{smooth(urstrom)}" fill="none" stroke="#c9a96a" stroke-width="60" stroke-linecap="round" opacity="0.4"/>')
# ---- モレーン帯 ----
moraines = [
    [(880, 470), (1000, 450), (1150, 470), (1300, 500), (1450, 560), (1580, 640)],            # 新期
    [(560, 680), (700, 690), (850, 720), (1000, 740), (1150, 770), (1330, 820), (1480, 900), (1560, 980)],  # 中間
    [(430, 1000), (560, 1020), (700, 1060), (820, 1080), (1060, 1050), (1200, 1000), (1330, 1000), (1470, 1050)],  # 古期
]
for m in moraines:
    A(f'<path d="{smooth(m)}" fill="none" stroke="#8a5a2b" stroke-width="7" stroke-dasharray="18 12" opacity="0.8"/>')
# エスカー（カーラルク）
for e in ([(1330, 470), (1360, 520), (1380, 560)], [(1400, 455), (1420, 505), (1440, 550)], [(1460, 470), (1480, 520)]):
    A(f'<path d="{smooth(e)}" fill="none" stroke="#6f6f6f" stroke-width="5"/>')
# ---- 湖 ----
lakes = [(1270, 1150, 40, 18, -20), (980, 1060, 14, 8, 0), (1130, 500, 12, 7, 0), (1200, 470, 12, 7, 0), (1420, 600, 12, 7, 0),
         (1480, 650, 12, 7, 0), (1560, 740, 10, 6, 0), (1020, 300, 10, 6, 0), (1100, 250, 10, 6, 0), (1180, 330, 9, 5, 0),
         (1300, 900, 12, 7, 0), (1380, 950, 12, 7, 0), (640, 560, 10, 6, 0), (1760, 560, 9, 5, 0), (1850, 590, 9, 5, 0)]
for x, y, rx, ry, rot in lakes:
    A(f'<ellipse cx="{x*K}" cy="{y*K}" rx="{rx*K}" ry="{ry*K}" transform="rotate({rot} {x*K} {y*K})" fill="#5aa9dc" stroke="#2c6f9e" stroke-width="2"/>')

# ---- 河川 ----
salvash = [(-20, 1256), (100, 1250), (250, 1256), (380, 1262), (470, 1268), (540, 1300), (620, 1292), (720, 1272), (820, 1252),
           (900, 1262), (960, 1240), (1010, 1180), (1040, 1105), (1035, 1030), (990, 965), (920, 920), (860, 880), (820, 835),
           (795, 780), (785, 710), (780, 640), (760, 590), (735, 555)]
branch_s = [(900, 1262), (940, 1310), (970, 1390)]         # 分水界の向こうへ下る川（地図5の南枝）
farluss = [(330, 830), (420, 880), (520, 925), (620, 905), (720, 870), (800, 830)]
lurluss = [(760, 1230), (800, 1160), (840, 1090), (880, 1010), (905, 935)]
solzluss = [(560, 605), (620, 640), (690, 650), (750, 640), (778, 650)]
ralbres = [(970, 860), (955, 900), (935, 935)]
ovluss = [(1265, 1130), (1240, 1040), (1215, 940), (1195, 840), (1185, 740), (1180, 660), (1240, 640), (1330, 650), (1430, 690),
          (1520, 700), (1600, 705)]
ov_delta = [[(1600, 705), (1625, 690), (1650, 680)], [(1600, 705), (1630, 705), (1655, 712)], [(1600, 705), (1620, 725), (1640, 740)]]
ov_trib_w = [(1000, 700), (1080, 690), (1180, 660)]
odluss = [(1350, 520), (1365, 580), (1380, 650)]
carluss = [(1440, 560), (1460, 500), (1480, 430)]
pen_rivers = [[(1000, 250), (1030, 300), (1060, 350)], [(1150, 200), (1170, 260), (1200, 320)]]
nw_rivers = [[(380, 760), (430, 700), (520, 640), (600, 560)], [(300, 700), (330, 640), (380, 560)]]
se_river = [(1400, 1090), (1480, 1150), (1540, 1220)]
canal = [(790, 700), (1000, 700)]
A(f'<path d="{smooth(branch_s)}" fill="none" stroke="#2c6f9e" stroke-width="4" stroke-dasharray="10 6"/>')
for r in pen_rivers + nw_rivers:
    A(f'<path d="{smooth(r)}" fill="none" stroke="#2c6f9e" stroke-width="3"/>')
for r, w in ((farluss, 5), (lurluss, 4.5), (solzluss, 5), (ralbres, 3), (ov_trib_w, 4), (odluss, 3.5), (carluss, 4), (se_river, 3.5)):
    A(f'<path d="{smooth(r)}" fill="none" stroke="#2c6f9e" stroke-width="{w}" stroke-linecap="round"/>')
A(f'<path d="{smooth(ovluss)}" fill="none" stroke="#1b4f8a" stroke-width="9" stroke-linecap="round"/>')
A(f'<path d="{smooth(ovluss)}" fill="none" stroke="#5aa9dc" stroke-width="4" stroke-linecap="round"/>')
for d in ov_delta:
    A(f'<path d="{smooth(d)}" fill="none" stroke="#1b4f8a" stroke-width="5" stroke-linecap="round"/>')
A(f'<path d="{smooth(salvash)}" fill="none" stroke="#1b4f8a" stroke-width="14" stroke-linecap="round"/>')
A(f'<path d="{smooth(salvash)}" fill="none" stroke="#4d9be0" stroke-width="7" stroke-linecap="round"/>')
A(f'<path d="{smooth(canal)}" fill="none" stroke="#c0392b" stroke-width="4" stroke-dasharray="8 6"/>')
# 記号
A(f'<polygon points="{935*K},{935*K} {955*K},{935*K} {945*K},{957*K}" fill="#1b4f8a"/>')          # 滝
A(f'<rect x="{862*K}" y="{878*K}" width="18" height="7" transform="rotate(40 {870*K} {882*K})" fill="#c0392b"/>')  # 可動堰
for x, y in ((1000, 1175), (860, 880), (780, 640), (1180, 665), (1600, 705)):
    x, y = x * K, y * K
    A(f'<path d="M{x-11},{y+8} l11,-18 l11,18 z" fill="none" stroke="#c0392b" stroke-width="3"/>')  # 氷塞
for x, y in ((1400, 820), (1480, 880), (1560, 850), (1350, 880)):
    x, y = x * K, y * K
    A(f'<rect x="{x}" y="{y}" width="10" height="10" fill="#444" transform="rotate(45 {x+5} {y+5})"/>')  # 留め石
A(f'<path d="{smooth([(590,500),(620,480),(660,470),(700,480)])}" fill="none" stroke="#e8d27a" stroke-width="9" stroke-linecap="round"/>')  # 砂嘴
# 都市
cities = [("アルダン", 735, 548, 9, -118, -10), ("バルゼン", 640, 512, 6, -12, -14), ("デドレン", 1180, 652, 6, 12, 30),
          ("ランヴェス", 1520, 700, 6, -20, 32), ("ベクヴレン", 1655, 690, 6, 12, -10), ("ダンゴヴ", 1060, 350, 5, 12, 5),
          ("ニルデン", 1270, 1180, 5, -10, 30), ("レルベル", 905, 935, 5, -115, 30)]
for name, x, y, r, dx, dy in cities:
    A(f'<circle cx="{x*K}" cy="{y*K}" r="{r}" fill="#222" stroke="#fff" stroke-width="2"/>')
    label(x + dx / K, y + dy / K, name, 22, "#222", "600")

# ---- ラベル ----
label(300, 240, "血  海", 48, "#2c6f9e", "700"); label(300, 285, "南の湾入（アルダン湾）", 22, "#2c6f9e")
label(1230, 150, "グレノム海", 48, "#2c6f9e", "700"); label(1230, 190, "閉鎖海・低塩分・平均水深 73 m", 20, "#2c6f9e")
label(1690, 790, "東の湾（Ovluss デルタ前湾）", 18, "#2c6f9e")
label(130, 650, "ヨートルミア", 24, "#5a4a3a"); label(150, 1140, "ストラヴォイナ", 24, "#5a4a3a")
label(1250, 1330, "ナレジア", 24, "#5a4a3a"); label(1800, 940, "東の隣国", 22, "#5a4a3a")
label(-10, 1225, "←ホトリガ山系から", 18, "#1b4f8a")
label(330, 1230, "サルヴァシュ川 Salvaš（氷縁谷区間）", 28, "#1b4f8a", "700")
label(1060, 1000, "サルヴァシュ川", 26, "#1b4f8a", "700", rot=-75)
label(1050, 1215, "大屈曲 Salvašen Coh", 20, "#c0392b", "700")
label(990, 1368, "分水界の向こうへ下る川（地図5の南枝）", 15, "#5a4a3a")
label(1060, 1092, "ラエラッハ峡谷区間", 15, "#1b4f8a"); label(905, 965, "Rälbres 滝", 14, "#1b4f8a")
label(640, 890, "Farluss（西部高地から）", 18); label(760, 1120, "Lurluss", 18, rot=-62); label(560, 590, "Šolžluss", 18)
label(640, 470, "Fosbarz 砂嘴", 14, "#8a6d1a"); label(600, 440, "高層湿原（泥炭切り）", 14, "#6b4e2e")
label(800, 690, "運河（案）", 14, "#c0392b"); label(1010, 690, "Ovluss 西支流", 14)
label(1225, 905, "Ovluss（東部水系の本流）", 22, "#1b4f8a", "700", rot=-80)
label(1230, 730, "Beldina 氾濫原湿地", 16, "#2f7d4f"); label(1190, 622, "合流点（ded＋ok）", 14, "#222")
label(1350, 500, "Odluss", 14); label(1300, 410, "エスカー群", 14, "#555"); label(1485, 480, "Carluss", 14, rot=-70)
label(1370, 1040, "ヴェルクレム平野", 18, "#5a4a3a"); label(1180, 1150, "Befnir 湖", 16)
label(1420, 860, "◆ 留め石（迷子石）の帯", 14, "#444")
label(1480, 690, "河湾群", 14); label(1560, 740, "干潟（風成）", 13, "#555")
label(860, 455, "新期モレーン帯", 14, "#8a5a2b", rot=-8); label(530, 700, "中間モレーン帯", 14, "#8a5a2b"); label(430, 1020, "古期モレーン帯", 14, "#8a5a2b")
label(330, 900, "西部高地（500–1,000 m）", 18, "#5a3a1a", "700"); label(330, 925, "ホトリガ山系の東翼", 14, "#5a3a1a")
label(1080, 880, "南部台地（200–500 m）", 18, "#7a6a3a", "700")
label(1000, 560, "北部低地（0–200 m）", 18, "#4a6a3a", "700")
label(1000, 150, "ダンゲニア半島（楯状地）", 16, "#333")
label(1760, 520, "東端の島", 14, "#333")
label(1660, 650, "Ovluss デルタ", 16, "#1b4f8a")
for a, b in (((1500, 230), (1400, 330)), ((1600, 290), (1520, 390))):
    A(f'<line x1="{a[0]*K}" y1="{a[1]*K}" x2="{b[0]*K}" y2="{b[1]*K}" stroke="#7f8c8d" stroke-width="6" marker-end="url(#arw)"/>')
label(1430, 215, "最終氷期の氷床の流動方向", 15, "#5d6d7e")

# ---- 凡例 ----
lx, ly = 1640, 60
A(f'<rect x="{lx*K-20}" y="{ly*K-36}" width="560" height="430" fill="#fff" opacity="0.93" stroke="#888"/>')
label(lx, ly, "凡例", 22, "#222", "700", halo=False)
rows = [
    ('<path d="M0,0 h60" stroke="#1b4f8a" stroke-width="12"/><path d="M0,0 h60" stroke="#4d9be0" stroke-width="5"/>', "サルヴァシュ川本流"),
    ('<path d="M0,0 h60" stroke="#1b4f8a" stroke-width="8"/><path d="M0,0 h60" stroke="#5aa9dc" stroke-width="3"/>', "Ovluss（東部水系の本流）"),
    ('<path d="M0,0 h60" stroke="#2c6f9e" stroke-width="4"/>', "支流・その他の河川"),
    ('<path d="M0,0 h60" stroke="#c0392b" stroke-width="4" stroke-dasharray="8 6"/>', "運河（案）"),
    ('<path d="M0,0 h60" stroke="#8a5a2b" stroke-width="7" stroke-dasharray="18 12"/>', "終堆石（モレーン）の帯"),
    ('<path d="M0,0 h60" stroke="#c9a96a" stroke-width="20" opacity="0.5"/>', "氷縁谷（ウルシュトロームタール）"),
    ('<rect x="0" y="-12" width="60" height="24" fill="#e7dcc3"/><rect x="0" y="-12" width="60" height="24" fill="url(#peat)"/>', "高層湿原・泥炭地"),
    ('<rect x="0" y="-12" width="60" height="24" fill="#cfe8cf"/><rect x="0" y="-12" width="60" height="24" fill="url(#marsh)"/>', "氾濫原湿地・低層湿原"),
    ('<path d="M20,8 l11,-18 l11,18 z" fill="none" stroke="#c0392b" stroke-width="3"/>', "氷塞（アイスジャム）常習地"),
    ('<path d="M0,0 h60" stroke="#6f6f6f" stroke-width="5"/>', "エスカー"),
    ('<rect x="20" y="-6" width="12" height="12" fill="#444" transform="rotate(45 26 0)"/>', "留め石（迷子石）"),
    ('<text x="0" y="6" font-size="14" fill="#333">緑 0–200 m／黄 200–500／橙 500–1,000（下絵＝地図2）</text>', ""),
]
for i, (sym, txt) in enumerate(rows):
    y = ly * K + 32 + i * 29
    A(f'<g transform="translate({lx*K},{y})">{sym}</g>')
    if txt: label((lx * K + 75) / K, (y + 7) / K, txt, 17, "#222", halo=False)
# スケール：州枠 1 px ≈ 0.497 km → 200 km ≈ 402 px
sx, sy = lx * K - 60, ly * K + 32 + len(rows) * 29 + 12
A(f'<rect x="{sx}" y="{sy}" width="402" height="8" fill="#222"/><rect x="{sx}" y="{sy}" width="201" height="8" fill="#fff" stroke="#222"/>')
label(sx / K, (sy + 30) / K, "0", 15, "#222", halo=False); label((sx + 201) / K, (sy + 30) / K, "100", 15, "#222", anchor="middle", halo=False)
label((sx + 402) / K, (sy + 30) / K, "200 km", 15, "#222", anchor="middle", halo=False)
# 表題
label(20, 45, "ラフカの水系 模式図（第2版・創作案）", 40, "#222", "700")
label(20, 78, "下絵：亜空世界Wiki「ラフカ連邦 州分け」の枠に、作者提示の地形図（地図2）を海岸線一致で変換して重ねたもの（一致率 IoU 0.91）。河川・地形区分は『ラフカ河川_水文地理誌』第2版の配置案。", 16, "#333")
label(20, 100, "サルヴァシュ川の経路は地図5（ラフ）を同じ枠へ変換した線に沿わせた。固有名はサルヴァシュ以外すべて未採用の候補。", 16, "#333")
A('</svg>')
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "ラフカ河川_模式図.svg")
open(out, "w", encoding="utf-8").write("\n".join(svg)); print(out)
