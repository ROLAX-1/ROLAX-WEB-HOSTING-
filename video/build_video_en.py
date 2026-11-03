#!/usr/bin/env python3
"""ROLAX HOST — English promo video (stylish), ~35 sec, 1080x1920."""
import os, subprocess, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SHOTS = "/home/user/video/shots"
WORK = "/home/user/video/build-en"
os.makedirs(WORK, exist_ok=True)
W, H, FPS = 1080, 1920, 30

F_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

NEON = (108, 92, 231)
CYAN = (0, 212, 255)
GREEN = (0, 255, 136)

SCENES = [
    dict(img="e01-landing.png", dur=2.8, kicker="ROLAX HOST",  title="Your project, LIVE", sub="Python • Node.js • HTML • ZIP"),
    dict(img="e04-dashboard.png", dur=2.6, kicker="STEP 1", title="Free account", sub="Email or Google sign-in"),
    dict(img="e09-upload.png",   dur=2.6, kicker="STEP 2", title="Upload your file", sub=".py  .js  .html  or full ZIP"),
    dict(img="e10-deploy-ok.png", dur=3.0, kicker="STEP 3", title="Deploy → LIVE", sub="6 checks verified automatically"),
    dict(img="e05-websites.png", dur=2.6, kicker="HOSTING", title="Every project in one place", sub="Open site • Run Python • Logs"),
    dict(img="e07-store.png",    dur=2.8, kicker="SCRIPT STORE", title="Ready-made bots for sale", sub="Search • Price • Buy • Download"),
    dict(img="e06-tools.png",    dur=2.8, kicker="TOOLS", title="Backup • Logs • SSL • Analytics", sub="Env vars • API token • Custom domain"),
    dict(img="e19-coupon.png",   dur=2.8, kicker="BILLING", title="Coupon = instant discount", sub="$4.99 → $2.50 with DIWALI50 • crypto pay"),
    dict(img="e02-offers.png",   dur=2.6, kicker="OFFERS", title="Diwali 50% OFF", sub="Code: DIWALI50 • free gift offers too"),
    dict(img="e11-admin.png",    dur=2.6, kicker="ADMIN", title="Full admin control", sub="Revenue • plans • users • features"),
    dict(img="e15-ai-analysis.png", dur=2.6, kicker="AI ANALYSIS", title="Know any uploaded project", sub="Commands • routes • risk flags • ZIP download"),
    dict(img="e16-customizer.png", dur=2.6, kicker="BRANDING", title="One place, whole site", sub="Logo • name • colors • text"),
    dict(img="e01-landing.png",  dur=4.8, kicker="JOIN FREE", title="Start hosting today", sub="rolax.host • 24/7 hosting", endcard=True),
]
TOTAL = sum(s["dur"] for s in SCENES)
print("total", TOTAL)


def cover(src, zoom=1.03, focus=0.42):
    im = Image.open(os.path.join(SHOTS, src)).convert("RGB")
    im = im.resize((int(W * zoom), int(H * zoom)), Image.LANCZOS)
    top = int((im.height - H) * focus)
    return im.crop(((im.width - W) // 2, top, (im.width - W) // 2 + W, top + H))


def wrap(d, text, font, maxw):
    out, cur = [], ""
    for w_ in text.split():
        t = (cur + " " + w_).strip()
        if d.textlength(t, font=font) > maxw:
            out.append(cur); cur = w_
        else:
            cur = t
    out.append(cur)
    return out


def make_overlay(i, sc):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # vignette + bottom gradient
    grad = Image.new("RGBA", (W, 1250), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(1250):
        gd.line([(0, y), (W, y)], fill=(0, 0, 0, min(253, int(255 * (y / 1250) ** 1.2))))
    ov.alpha_composite(grad, (0, H - 1250))

    # top brand bar
    bf = ImageFont.truetype(F_B, 32)
    d.rounded_rectangle([44, 56, 44 + d.textlength("ROLAX HOST", font=bf) + 76, 122], radius=28,
                        fill=(12, 12, 18, 220), outline=(150, 140, 255, 190), width=2)
    d.ellipse([60, 74, 92, 106], fill=NEON)
    d.ellipse([78, 74, 110, 106], fill=(*CYAN, 190))
    d.text((122, 70), "ROLAX HOST", font=bf, fill=(255, 255, 255, 255))

    if sc.get("endcard"):
        # ===== END CARD =====
        card_top = H - 1150
        d.rounded_rectangle([44, card_top, W - 44, card_top + 1080], radius=40,
                            fill=(8, 8, 14, 232), outline=(120, 105, 255, 220), width=3)
        k = ImageFont.truetype(F_B, 34)
        d.text((90, card_top + 44), "THANK YOU FOR WATCHING", font=k, fill=(*GREEN, 255))

        t1 = ImageFont.truetype(F_B, 92)
        d.text((90, card_top + 108), "BUILT BY", font=t1, fill=(255, 255, 255, 255))
        n1 = ImageFont.truetype(F_B, 82)
        d.text((90, card_top + 218), "YANSH KUMAR", font=n1, fill=(*GREEN, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))

        d.line([90, card_top + 330, W - 90, card_top + 330], fill=(90, 90, 130, 220), width=2)

        lb = ImageFont.truetype(F_R, 30)
        d.text((90, card_top + 352), "OFFICIAL NAME", font=lb, fill=(160, 160, 190, 255))
        t2 = ImageFont.truetype(F_B, 76)
        d.text((90, card_top + 394), "AGENT ROLAX", font=t2, fill=(*CYAN, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))

        d.line([90, card_top + 512, W - 90, card_top + 512], fill=(90, 90, 130, 220), width=2)

        meta = ImageFont.truetype(F_R, 34)
        d.text((90, card_top + 540), "Real name: YANSH KUMAR", font=meta, fill=(225, 225, 235, 255))
        d.text((90, card_top + 590), "Brand identity: AGENT ROLAX", font=meta, fill=(225, 225, 235, 255))
        d.text((90, card_top + 640), "Platform: ROLAX HOST", font=meta, fill=(225, 225, 235, 255))
        d.text((90, card_top + 700), "Support: t.me/Rolax112", font=meta, fill=(*CYAN, 255))

        d.rounded_rectangle([90, card_top + 790, W - 90, card_top + 900], radius=26, fill=(*GREEN, 255))
        cta = ImageFont.truetype(F_B, 46)
        txt = "JOIN FREE — ROLAX HOST"
        d.text(((W - d.textlength(txt, font=cta)) / 2, card_top + 818), txt, font=cta, fill=(0, 0, 0, 255))

        d.text((90, card_top + 930), "Python • Node.js • HTML • ZIP  |  24/7 hosting", font=meta, fill=(170, 170, 190, 255))
    else:
        # kicker chip
        kf = ImageFont.truetype(F_B, 30)
        kw = d.textlength(sc["kicker"], font=kf)
        d.rounded_rectangle([60, H - 480, 60 + kw + 54, H - 418], radius=16, fill=(*GREEN, 255))
        d.text((86, H - 472), sc["kicker"], font=kf, fill=(0, 0, 0, 255))

        tf = ImageFont.truetype(F_B, 74)
        y = H - 380
        for ln in wrap(d, sc["title"], tf, W - 120):
            d.text((60, y), ln, font=tf, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
            y += 86
        sf = ImageFont.truetype(F_R, 38)
        d.text((62, y + 4), sc["sub"], font=sf, fill=(188, 188, 212, 255))

    # progress segments (stylish)
    n = len(SCENES)
    gap = 8
    bw = (W - 120 - gap * (n - 1)) / n
    for idx in range(n):
        x0 = 60 + idx * (bw + gap)
        done = idx < i
        cur = idx == i
        col = GREEN if done else ((255, 255, 255, 235) if cur else (255, 255, 255, 55))
        d.rounded_rectangle([x0, H - 96, x0 + bw, H - 90], radius=3, fill=col)

    # creator watermark (bottom-right, subtle)
    wf = ImageFont.truetype(F_B, 24)
    wm = "YANSH KUMAR  •  AGENT ROLAX"
    ww = d.textlength(wm, font=wf)
    d.rounded_rectangle([W - ww - 84, 60, W - 44, 104], radius=20, fill=(0, 0, 0, 150))
    d.text((W - ww - 64, 70), wm, font=wf, fill=(255, 255, 255, 165))

    path = os.path.join(WORK, f"cap_{i}.png")
    ov.save(path)
    return path


clips = []
for i, sc in enumerate(SCENES):
    cap = make_overlay(i, sc)
    base = os.path.join(WORK, f"frame_{i}.png")
    cover(sc["img"], zoom=1.05, focus=0.0 if i in (0, len(SCENES) - 1) else 0.40).save(base)
    dur, frames = sc["dur"], int(sc["dur"] * FPS)
    out = os.path.join(WORK, f"clip_{i}.mp4")
    zoom_dir = "in" if i % 2 == 0 else "out"
    zexpr = ("min(zoom+0.00045,1.12)" if zoom_dir == "in" else "max(zoom-0.00045,1.0)")
    vf = (
        f"[0:v]scale={W*2}:-2,zoompan=z='{zexpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={frames}:s={W}x{H}:fps={FPS}[bg];"
        f"[bg][1:v]overlay=0:0,fade=t=in:st=0:d=0.3,fade=t=out:st={dur-0.3}:d=0.3,format=yuv420p[v]"
    )
    subprocess.run(["ffmpeg", "-y", "-loop", "1", "-i", base, "-loop", "1", "-i", cap,
                    "-filter_complex", vf, "-map", "[v]", "-t", str(dur), "-r", str(FPS),
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", out],
                   check=True, capture_output=True)
    clips.append(out)
    print("clip", i, "ok")

with open(os.path.join(WORK, "list.txt"), "w") as f:
    for c in clips:
        f.write(f"file '{c}'\n")
silent = os.path.join(WORK, "silent.mp4")
subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(WORK, "list.txt"), "-c", "copy", silent],
               check=True, capture_output=True)

vdur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", silent],
                            capture_output=True, text=True).stdout.strip())
print("silent dur", vdur)

final = "/home/user/video/rolax-tutorial-english.mp4"
af = f"[1:a]adelay=700|700,volume=1.7,apad,afade=t=out:st={vdur-1.2}:d=1.2[a]"
subprocess.run(["ffmpeg", "-y", "-i", silent, "-i", "/home/user/video/vo-en.mp3",
                "-filter_complex", af, "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-t", str(vdur), final],
               check=True, capture_output=True)
print("DONE", final)
