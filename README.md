# ROLAX HOST - Premium Full-Stack Hosting Platform

Production-ready Next.js 14 hosting platform with glassmorphism dark theme (Vercel + Linear style).

## Deploy to Vercel

1. Push to GitHub
2. Import in Vercel dashboard
3. Build command: `npm run build`
4. Deploys instantly - no env vars required (uses localStorage for demo; Prisma schema included for Supabase upgrade)

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
- Prisma + Supabase schema in `/prisma/schema.prisma` for production upgrade

## Local Dev

```bash
npm install
npm run dev
```

Open http://localhost:3000
