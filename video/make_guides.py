from PIL import Image, ImageDraw, ImageFont
F_B="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
F_R="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
W,H=1080,1920
# ---------- THUMBNAIL ----------
im = Image.open("/home/user/video/shots/01-landing.png").convert("RGB").resize((W,H))
ov = Image.new("RGBA",(W,H),(0,0,0,0)); d=ImageDraw.Draw(ov)
d.rectangle([0,0,W,H], fill=(0,0,0,110))
d.rounded_rectangle([50,90,240,160], radius=22, fill=(0,255,136,255))
d.text((78,104),"FREE", font=ImageFont.truetype(F_B,40), fill=(0,0,0,255))
f1=ImageFont.truetype(F_B,110); f2=ImageFont.truetype(F_B,74); f3=ImageFont.truetype(F_R,44)
d.text((50,240),"BOT & SITE", font=f1, fill=(255,255,255,255), stroke_width=3, stroke_fill=(0,0,0,255))
d.text((50,360),"HOSTING", font=f1, fill=(255,255,255,255), stroke_width=3, stroke_fill=(0,0,0,255))
d.text((50,510),"30 SECOND ME LIVE", font=f2, fill=(0,212,255,255), stroke_width=3, stroke_fill=(0,0,0,255))
d.rounded_rectangle([50,650,W-50,760], radius=26, fill=(108,92,231,240))
t="Python • Node.js • HTML • ZIP"; tw=d.textlength(t,font=f3)
d.text(((W-tw)/2,690), t, font=f3, fill=(255,255,255,255))
d.rounded_rectangle([50,H-330,W-50,H-180], radius=30, fill=(0,255,136,255))
t2="ROLAAX HOST — FREE JOIN".replace("ROLAAX","ROLAX"); tw2=d.textlength(t2,font=ImageFont.truetype(F_B,62))
d.text(((W-tw2)/2,H-290), t2, font=ImageFont.truetype(F_B,62), fill=(0,0,0,255))
im2 = Image.alpha_composite(im.convert("RGBA"), ov)
im2.convert("RGB").save("/home/user/video/rolax-thumbnail.png")
print("thumb ok")

# ---------- GUIDE 1: user website (phone) ----------
PW,PH=1080,2600
pg = Image.new("RGB",(PW,PH),(10,10,15)); dd=ImageDraw.Draw(pg)
hb=ImageFont.truetype(F_B,64); h2=ImageFont.truetype(F_B,44); tx=ImageFont.truetype(F_R,34); sm=ImageFont.truetype(F_R,30)
y=50
dd.text((50,y),"ROLAX HOST — User Guide", font=hb, fill=(255,255,255)); y+=90
dd.text((50,y),"Mobile / Website se kaise use karein", font=tx, fill=(160,160,180)); y+=70
steps=[
 ("1","Website kholo","Browser me rolax.host kholo (Chrome / Safari / koi bhi)."),
 ("2","Account banao","Sign up → naam, email, password. Ya 'Continue with Google' dabao."),
 ("3","Login karo","Email + password, ya Google. Login ke baad Dashboard khulega."),
 ("4","Deploy New Project","Dashboard me upar '+ Deploy New Project' button dabao."),
 ("5","File upload karo","Project ka naam likho → single file (.py / .js / .html) ya poora ZIP upload karo."),
 ("6","Deploy & Verify","Button dabao. Site check hoke turant live ho jayegi (approved checks green)."),
 ("7","Open Site / Run Python","HTML site ke liye 'Open Site', Python bot ke liye 'Run Python' — terminal me command chalao."),
 ("8","Tools","Har site ke saamne 'Tools': Daily Backup, Live Logs, SSL, Analytics, Env variables, API token, Custom Domain."),
 ("9","Script Store","Ready-made bot/website kharido — search karo, price dekho, Buy → Download."),
 ("10","Billing + Coupon","Plan select karo → offer code (jaise DIWALI50) daalo → discount lag jayega → crypto se pay."),
 ("11","Support","Ticket banao. Priority support Telegram: t.me/Rolax112"),
]
for n,t,dsc in steps:
    dd.ellipse([50,y,110,y+60], fill=(108,92,231))
    tw=dd.textlength(n,font=h2); dd.text((80-tw/2,y+6), n, font=h2, fill=(255,255,255))
    dd.text((135,y+2), t, font=h2, fill=(0,255,136))
    y+=62
    words=dsc.split(); line=""
    for w_ in words:
        test=(line+" "+w_).strip()
        if dd.textlength(test,font=tx)>PW-230: dd.text((135,y),line,font=tx,fill=(200,200,210)); y+=44; line=w_
        else: line=test
    dd.text((135,y),line,font=tx,fill=(200,200,210)); y+=80
dd.rounded_rectangle([50,y+10,PW-50,y+150], radius=24, fill=(0,255,136,255))
dd.text((80,y+50),"Free plan se shuru karo — card ki zaroorat nahi", font=sm, fill=(0,0,0))
pg.save("/home/user/video/guide-1-website-mobile.png")
print("guide1 ok")

# ---------- GUIDE 2: computer ----------
PGW,PGH=1400,2050
p2 = Image.new("RGB",(PGW,PGH),(10,10,15)); d2=ImageDraw.Draw(p2)
hb2=ImageFont.truetype(F_B,58); h22=ImageFont.truetype(F_B,38); tx2=ImageFont.truetype(F_R,29); sm2=ImageFont.truetype(F_R,26)
y=40
d2.text((40,y),"ROLAX HOST — Computer (Desktop) Guide", font=hb2, fill=(255,255,255)); y+=78
d2.text((40,y),"Laptop / PC se poori website aise chalayein", font=tx2, fill=(160,160,180)); y+=64
cols=[("CHROME / EDGE / BRAVE",["1. Address bar me rolax.host likho","2. Sign up → email ya Google","3. Dashboard khulega (desktop layout)","4. + Deploy New Project","5. Drag & drop file ya ZIP (folder bhi)","6. Deploy & Verify → green checks","7. Open Site / Run Python","8. Tools → backup, logs, SSL, env","9. Script Store → search + buy","10. Billing → coupon → pay (BEP-20)","Shortcut: Ctrl+Shift+N se naya window"]),
      ("LOCAL TEST (optional)",["1. Code VS Code me kholo","2. Terminal: python bot.py ya npm start","3. Error aaye to AI Auto-Fix (Ultra Pro)","4. requirements.txt / .env khud ban jayega","5. Fir website pe upload karo"])]
colw=(PGW-120)//2
for i,(title,items) in enumerate(cols):
    x=40+i*(colw+40)
    d2.rounded_rectangle([x,y,x+colw,y+70], radius=16, fill=(108,92,231))
    d2.text((x+20,y+16), title, font=h22, fill=(255,255,255))
    yy=y+100
    for it in items:
        lines=[]; cur=""
        for w_ in it.split():
            t=(cur+" "+w_).strip()
            if d2.textlength(t,font=tx2)>colw-40: lines.append(cur); cur=w_
            else: cur=t
        lines.append(cur)
        for ln in lines:
            d2.text((x+16,yy), ln, font=tx2, fill=(205,205,215)); yy+=38
        yy+=12
p2.save("/home/user/video/guide-2-computer.png")
print("guide2 ok")
