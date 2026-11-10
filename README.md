# ROLAX HOST - Premium Full-Stack Hosting Platform

Production-ready Next.js 14 hosting platform with glassmorphism dark theme (Vercel + Linear style).

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel dashboard
3. Build command: `npm run build`
4. Set `DATABASE_URL` in the Vercel project for durable accounts; without it the app deliberately runs in local/demo mode and reports that cross-device persistence is unavailable
5. Deploy with `npm run build` (Prisma Client is generated during install)

## Admin Credentials

- **Email:** yanshkumar9090@gmail.com
- **Password:** ROLAX@11
- Admin auto-redirects to `/admin`, normal users to `/dashboard`

## Features

- Landing page with editable pricing (from DB)
- Auth (register/login) with admin protection
- User Dashboard: Deploy (ZIP/GitHub), My Websites (CPU/RAM, File Manager, Logs), Crypto Billing (BEP-20 QR), Support Tickets
- Super Admin CMS: Overview stats, Site Customizer, Plan/Stack/Crypto managers, Payment approvals, User/Website/Ticket managers
- Crypto Only: BNB & USDT BEP-20 at 0xdB5e1b18C90166eeFc77C9C404AB84a078a069E8
- Durable auth/user records: `/api/users` uses Prisma/PostgreSQL when `DATABASE_URL` is configured. It creates the additive `User` table/columns on first use and never exposes stored password hashes; no DELETE path exists for users.
- Browser storage remains a fast recovery cache with backup/merge semantics. It is not presented as cross-device durability when `DATABASE_URL` is absent.
- A single `.py` upload is accepted, entry-detected, syntax/runtime-tested through `/api/py/run`, and normal imports such as `requests`, `aiohttp`, `dotenv`, and Telegram libraries are included in generated requirements.

## Local Dev

```bash
npm install
npm run dev
```

Open http://localhost:3000
