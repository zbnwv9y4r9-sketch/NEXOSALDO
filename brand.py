"""Identidad visual de NexoSaldo (herramienta) — no confundir con la empresa emisora."""
from reportlab.graphics.shapes import Circle, Drawing, PolyLine, Rect
from reportlab.lib.colors import HexColor

DEEP_GREEN = HexColor("#103C32")
LIME = HexColor("#91C83E")
BG = HexColor("#F7F9F7")
TEXT = HexColor("#202B27")
MUTED = HexColor("#6B7671")
RULE = HexColor("#DDE3DF")
ALERT = HexColor("#C2473A")

# Isotipo: tres nodos conectados en trazo ascendente (ingresos → ahorro → utilidad).
LOGO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="NexoSaldo">
  <rect width="64" height="64" rx="14" fill="#103C32"/>
  <polyline points="14,44 28,32 36,38 50,20" fill="none" stroke="#91C83E" stroke-width="5"
            stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="14" cy="44" r="5" fill="#F7F9F7"/>
  <circle cx="50" cy="20" r="5" fill="#91C83E"/>
</svg>"""


def logo_drawing(size: float = 28) -> Drawing:
    s = size / 64.0
    d = Drawing(size, size)
    d.add(Rect(0, 0, size, size, rx=14 * s, ry=14 * s, fillColor=DEEP_GREEN, strokeColor=None))
    # coordenadas SVG (y hacia abajo) -> ReportLab (y hacia arriba)
    pts = [(14, 44), (28, 32), (36, 38), (50, 20)]
    flat = []
    for x, y in pts:
        flat += [x * s, (64 - y) * s]
    d.add(PolyLine(flat, strokeColor=LIME, strokeWidth=5 * s, strokeLineCap=1, strokeLineJoin=1))
    d.add(Circle(14 * s, (64 - 44) * s, 5 * s, fillColor=BG, strokeColor=None))
    d.add(Circle(50 * s, (64 - 20) * s, 5 * s, fillColor=LIME, strokeColor=None))
    return d
