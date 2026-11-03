#!/usr/bin/env python3
"""ROLAX HOST — 30 sec vertical tutorial video builder."""
import os, subprocess, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SHOTS = "/home/user/video/shots"
WORK = "/home/user/video/build"
os.makedirs(WORK, exist_ok=True)
W, H = 1080, 1920

F_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

SCENES = [
    dict(img="01-landing.png",  dur=3.2, step="ROLAX HOST",   cap="Apna project LIVE karo", sub="Python  •  Node.js  •  HTML"),
    dict(img="04-dashboard.png", dur=3.6, step="STEP 1",        cap="Free account banao",     sub="Email ya Google se login"),
    dict(img="05-deploy-modal.png", dur=3.6, step="STEP 2",     cap="File upload karo",       sub=".py   .js   .html   .zip"),
    dict(img="06-deploy-report.png", dur=3.8, step="STEP 3",    cap="Deploy dabao",           sub="Site turant LIVE + verified"),
    dict(img="09-store.png",    dur=3.8, step="BONUS",          cap="Script Store",           sub="Ready-made bots kharido"),
    dict(img="11-admin-offers.png", dur=3.6, step="ADMIN",      cap="Poora control tumhare paas", sub="Offers, logo, price, plans"),
    dict(img="03-pricing.png",  dur=3.4, step="OFFER",          cap="Diwali 50% OFF",         sub="Coupon: DIWALI50"),
    dict(img="01-landing.png",  dur=4.2, step="JOIN NOW",       cap="Aaj hi start karo",      sub="rolax.host  •  24/7 hosting"),
]
FPS = 30
TOTAL = sum(s["dur"] for s in SCENES)
print("total duration:", TOTAL)


def cover(src, w=W, h=H, zoom=1.0, focus=0.5):
    im = Image.open(os.path.join(SHOTS, src)).convert("RGB")
    im = im.resize((int(w * zoom), int(h * zoom)), Image.LANCZOS)
    left = (im.width - w) // 2
    top = int((im.height - h) * focus)
    top = max(0, min(top, im.height - h))
    return im.crop((left, top, left + w, top + h))


def caption_overlay(idx, scene):
    """Bottom caption card + brand chip + progress bar (transparent PNG)."""
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # top brand chip
    brand_f = ImageFont.truetype(F_BOLD, 34)
    label = "ROLAX HOST"
    tw = d.textlength(label, font=brand_f)
    d.rounded_rectangle([48, 60, 48 + tw + 78, 128], radius=30, fill=(10, 10, 15, 215), outline=(120, 120, 255, 200), width=2)
    d.ellipse([68, 78, 104, 114], fill=(108, 92, 231, 255))
    d.ellipse([86, 78, 122, 114], fill=(0, 212, 255, 180))
    d.text((132, 74), label, font=brand_f, fill=(255, 255, 255, 255))

    # bottom gradient for readability
    grad = Image.new("RGBA", (W, 1150), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(1150):
        a = min(252, int(255 * (y / 1150) ** 1.25))
        gd.line([(0, y), (W, y)], fill=(0, 0, 0, a))
    ov.alpha_composite(grad, (0, H - 1150))

    # step chip
    step_f = ImageFont.truetype(F_BOLD, 30)
    stw = d.textlength(scene["step"], font=step_f)
    d.rounded_rectangle([60, H - 470, 60 + stw + 52, H - 410], radius=16, fill=(0, 255, 136, 255))
    d.text((86, H - 464), scene["step"], font=step_f, fill=(0, 0, 0, 255))

    # caption
    cap_f = ImageFont.truetype(F_BOLD, 76)
    lines, cur = [], ""
    for word in scene["cap"].split():
        test = (cur + " " + word).strip()
        if d.textlength(test, font=cap_f) > W - 120:
            lines.append(cur); cur = word
        else:
            cur = test
    lines.append(cur)
    y = H - 370
    for ln in lines:
        d.text((60, y), ln, font=cap_f, fill=(255, 255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))
        y += 88

    # subtitle
    sub_f = ImageFont.truetype(F_REG, 40)
    d.text((62, y + 6), scene["sub"], font=sub_f, fill=(190, 190, 210, 255))

    # progress bar
    d.rounded_rectangle([60, H - 120, W - 60, H - 112], radius=4, fill=(255, 255, 255, 60))
    prog = sum(s["dur"] for s in SCENES[: idx]) / TOTAL
    span = SCENES[idx]["dur"] / TOTAL
    d.rounded_rectangle([60, H - 120, 60 + int((W - 120) * (prog + span)), H - 112], radius=4, fill=(0, 255, 136, 235))

    # CTA line on last scene
    if idx == len(SCENES) - 1:
        d.rounded_rectangle([60, H - 1050, W - 60, H - 930], radius=24, fill=(108, 92, 231, 235))
        cta_f = ImageFont.truetype(F_BOLD, 44)
        t = "rolax.host — Free me shuru karo"
        tw2 = d.textlength(t, font=cta_f)
        d.text(((W - tw2) / 2, H - 1010), t, font=cta_f, fill=(255, 255, 255, 255))

    path = os.path.join(WORK, f"cap_{idx}.png")
    ov.save(path)
    return path


clips = []
for i, sc in enumerate(SCENES):
    cap = caption_overlay(i, sc)
    img = os.path.join(WORK, f"frame_{i}.png")
    # slight ken-burns base
    cover(sc["img"], zoom=1.02, focus=0.0 if i in (0, 7) else 0.42).save(img)
    dur = sc["dur"]
    frames = int(dur * FPS)
    out = os.path.join(WORK, f"clip_{i}.mp4")
    vf = (
        f"[0:v]scale={W*2}:-2,zoompan=z='min(zoom+0.00035,1.10)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':"
        f"d={frames}:s={W}x{H}:fps={FPS}[bg];"
        f"[bg][1:v]overlay=0:0,fade=t=in:st=0:d=0.35,fade=t=out:st={dur-0.35}:d=0.35,format=yuv420p[v]"
    )
    subprocess.run([
        "ffmpeg", "-y", "-loop", "1", "-i", img, "-loop", "1", "-i", cap,
        "-filter_complex", vf, "-map", "[v]", "-t", str(dur), "-r", str(FPS),
        "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", out
    ], check=True, capture_output=True)
    clips.append(out)
    print("clip", i, "ok")

# concat
with open(os.path.join(WORK, "list.txt"), "w") as f:
    for c in clips:
        f.write(f"file '{c}'\n")

silent = "/home/user/video/build/video_silent.mp4"
subprocess.run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", os.path.join(WORK, "list.txt"),
                "-c", "copy", silent], check=True, capture_output=True)

# audio: VO delayed 0.8s, padded to video length, gentle fade
final = "/home/user/video/rolax-tutorial.mp4"
vdur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", silent],
                            capture_output=True, text=True).stdout.strip())
print("video silent dur:", vdur)
af = (f"[1:a]adelay=800|800,volume=1.6,apad,afade=t=out:st={vdur-1.2}:d=1.2[a]")
subprocess.run(["ffmpeg", "-y", "-i", silent, "-i", "/home/user/video/vo.mp3",
                "-filter_complex", af, "-map", "0:v", "-map", "[a]",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-t", str(vdur), final],
               check=True, capture_output=True)
print("DONE:", final)
