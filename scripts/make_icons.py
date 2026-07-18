#!/usr/bin/env python3
"""Generuje PNG ikony pro PWA bez externích knihoven (jen stdlib zlib/struct).
Vykreslí jednoduché stylizované slunce + obláček na tmavém gradientu."""
import zlib, struct, math, os

def png(width, height, pixels):
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        for x in range(width):
            raw += bytes(pixels[y * width + x])
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def over(bg, fg, alpha):
    return tuple(int(fg[i] * alpha + bg[i] * (1 - alpha)) for i in range(3))

def gen(size, maskable=False):
    px = [None] * (size * size)
    cx, cy = size / 2, size / 2
    # slunce mírně vlevo nahoře, obláček dole vpravo
    sun_x, sun_y = size * 0.40, size * 0.42
    sun_r = size * 0.20
    for y in range(size):
        for x in range(size):
            # pozadí: radiální gradient tmavá -> mírně teplá
            d = math.hypot(x - cx, y - cy) / (size * 0.75)
            bg = lerp((26, 32, 48), (13, 16, 23), min(d, 1))
            r, g, b = bg
            a = 255

            # slunce (měkký kruh)
            ds = math.hypot(x - sun_x, y - sun_y)
            edge = sun_r - ds
            if edge > -2:
                al = max(0, min(1, (edge + 1) / 2))
                r, g, b = over((r, g, b), (255, 159, 67), al)

            # sluneční paprsky
            ang = math.atan2(y - sun_y, x - sun_x)
            ray_d = ds
            if sun_r * 1.25 < ray_d < sun_r * 1.7:
                seg = (ang + math.pi) / (2 * math.pi) * 8
                frac = abs(seg - round(seg))
                if frac < 0.10:
                    al = max(0, min(1, (0.10 - frac) / 0.10)) * 0.9
                    r, g, b = over((r, g, b), (255, 190, 90), al)

            # obláček (dva překryté kruhy) dole vpravo
            c1 = math.hypot(x - size * 0.62, y - size * 0.66) - size * 0.15
            c2 = math.hypot(x - size * 0.74, y - size * 0.68) - size * 0.12
            cloud = min(c1, c2)
            if cloud < 1:
                al = max(0, min(1, (1 - cloud) / 2))
                r, g, b = over((r, g, b), (225, 232, 245), al)

            if not maskable:
                # zaoblené rohy (jen pro "any" ikonu)
                rad = size * 0.22
                inx = min(x, size - 1 - x)
                iny = min(y, size - 1 - y)
                if inx < rad and iny < rad:
                    cd = math.hypot(rad - inx, rad - iny)
                    if cd > rad:
                        a = max(0, int(255 * max(0, (rad + 1 - cd))))
            px[y * size + x] = (r, g, b, a)
    return png(size, size, px)

def main():
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    out = os.path.abspath(out)
    os.makedirs(out, exist_ok=True)
    specs = [("icon-192.png", 192, False),
             ("icon-512.png", 512, False),
             ("icon-maskable-512.png", 512, True)]
    for name, size, mask in specs:
        data = gen(size, mask)
        with open(os.path.join(out, name), "wb") as f:
            f.write(data)
        print(f"  {name}: {len(data)} B")

if __name__ == "__main__":
    main()
