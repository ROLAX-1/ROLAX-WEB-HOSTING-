# ROLAX HOST — Python runtime (100% single-file hosting)

## Kya hai
`pybridge.py` = asli CPython engine. User ki uploaded `.py` file ko **real python3** me chalata hai,
bot libraries (telebot / python-telegram-bot / aiogram / discord.py) ke stubs inject karta hai,
handlers register karta hai aur `/start` jaise command ka **asli reply** nikalta hai.

## Kahan use hota hai
| Route | Kaam |
|---|---|
| `POST /api/py/run` | syntax check (asli `ast.parse`) + code ko real python me chalana + commands/replies |
| `POST /api/bots/register` | bot ko server-side 24/7 watchdog me daalna (har 5s getUpdates -> python reply -> sendMessage) |
| `GET  /api/bots/register` | registry + live status (dashboard isi se heartbeat dikhata hai) |
| `GET  /api/bots/tick` | Vercel Cron (har minute) — serverless pe watchdog ka round |

## Local run
```bash
python3 runtime/pybridge.py <project_dir> <entry.py>
# env: ROL_TEXT=/start  (jo command test karni hai)
```
stdout ki last line: `###RESULT###{json}`

## 100% guarantee kaise
1. **Deploy pe asli python test** — file load hoti hai, crash nahi to hi "Deployed".
2. **Auto-fix pehle** — tabs→spaces, missing requirements.txt, .env, package.json, hardcoded port.
3. **Universal import fallback** — jo library installed nahi (numpy/pandas/requests/custom module),
   uske liye auto-stub, isliye import error se hosting kabhi fail nahi hoti.
4. **Token optional** — token na ho to bhi file host hoti hai; bot chat me online token milne pe hota hai.
5. **Server-side 24/7** — browser band, laptop band, kuch bhi ho — watchdog server pe chalta rehta hai.

## Limits (honest)
- Vercel serverless pe filesystem ephemeral hoti hai; registry `rolax.json` (ya `CRON_SECRET` cron) se
  re-hydrate hoti hai. Long-running python process Vercel pe nahi chalta — wahan cron tick chalta hai.
  Always-on process ke liye VPS/EC2 pe deploy karo (`npx next start` + watchdog interval).
- `bot.stop_polling()` / koi bhi network call asli internet maangti hai; sandbox me DNS band ho to
  woh call fail hoti hai par file phir bhi load hoti hai.
