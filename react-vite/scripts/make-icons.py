#!/usr/bin/env python3
"""Generate brand-placeholder PNG icons for the PWA.

Pure-stdlib (zlib + struct) — no Pillow dependency required. Produces a
flat-color rounded square with a glyph silhouette baked into the alpha.
Designed to be REPLACED with a real brand asset before launch; the layout
below renders cleanly even at the small sizes (192/512).
"""
import os, struct, zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')
os.makedirs(OUT, exist_ok=True)

BG = (0x0b, 0x0d, 0x12, 0xff)        # surface
FG = (0x4d, 0xab, 0xf7, 0xff)        # accent

def in_rounded_square(x, y, size, radius):
    if x < radius and y < radius:
        return (radius - x) ** 2 + (radius - y) ** 2 <= radius ** 2
    if x >= size - radius and y < radius:
        return (x - (size - 1 - radius)) ** 2 + (radius - y) ** 2 <= radius ** 2
    if x < radius and y >= size - radius:
        return (radius - x) ** 2 + (y - (size - 1 - radius)) ** 2 <= radius ** 2
    if x >= size - radius and y >= size - radius:
        return (x - (size - 1 - radius)) ** 2 + (y - (size - 1 - radius)) ** 2 <= radius ** 2
    return True

def in_glyph(x, y, size):
    """Stylised arrow/joystick: a triangle pointing up + a stick base."""
    cx = size / 2
    # Triangle (top half)
    tri_top    = size * 0.30
    tri_bottom = size * 0.55
    tri_half_w = (size * 0.22) * ((y - tri_top) / (tri_bottom - tri_top)) if tri_bottom > tri_top else 0
    if tri_top <= y <= tri_bottom and abs(x - cx) <= tri_half_w:
        return True
    # Stick (rectangle)
    stick_top    = size * 0.55
    stick_bottom = size * 0.70
    if stick_top <= y <= stick_bottom and abs(x - cx) <= size * 0.06:
        return True
    # Base (rounded rectangle)
    base_top    = size * 0.70
    base_bottom = size * 0.80
    if base_top <= y <= base_bottom and abs(x - cx) <= size * 0.22:
        return True
    return False

def make_png(size, path, maskable=False):
    # Maskable icons need a safe area of 40% inset; we shrink the visual.
    pad = int(size * 0.10) if maskable else 0
    inner = size - 2 * pad
    radius = int(inner * (0.18 if not maskable else 0.50))  # full-circle for maskable safe area

    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # PNG filter byte
        for x in range(size):
            lx = x - pad
            ly = y - pad
            inside = 0 <= lx < inner and 0 <= ly < inner and in_rounded_square(lx, ly, inner, radius)
            if not inside:
                row.extend(BG if maskable else (0, 0, 0, 0))
                continue
            if in_glyph(lx, ly, inner):
                row.extend(FG)
            else:
                row.extend(BG)
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    sig = b'\x89PNG\r\n\x1a\n'
    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(raw, 9)
    png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print(f'wrote {path} ({len(png)} bytes)')

if __name__ == '__main__':
    make_png(192, os.path.join(OUT, 'icon-192.png'))
    make_png(512, os.path.join(OUT, 'icon-512.png'))
    make_png(512, os.path.join(OUT, 'icon-maskable-512.png'), maskable=True)
    make_png(180, os.path.join(OUT, 'apple-touch-icon.png'))
