"""Vercel Python webhook adapter for the preloaded ROLAX bot.

Telegram invokes this function for every update, so it does not need a
long-running polling process. The uploaded bot's real python-telegram-bot
handlers are initialized for one update and then shut down cleanly.
"""
from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import os
import sys
import traceback
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit, urlencode

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "hosted" / "ROLAX HOSTING FINAL.py"
# Vercel's /tmp is the safe default. A persistent volume/host can provide
# ROLAX_DATA_DIR without changing the bot source.
DATA_DIR = Path(os.environ.get("ROLAX_DATA_DIR") or "/tmp/rolax-main-data")
MODULE = None


def _token() -> str:
    return str(os.environ.get("ROLAX_MAIN_BOT_TOKEN") or os.environ.get("BOT_TOKEN") or "").strip()


def _secret(token: str) -> str:
    return hashlib.sha256(("rolax-webhook:" + token).encode()).hexdigest()[:32]


def _state_from_path(path: str) -> str:
    """Read the encrypted user snapshot carried by Telegram's webhook URL."""
    try:
        values = parse_qs(urlsplit(path or "").query, keep_blank_values=False)
        return str(values.get("state", [""])[0] or "").strip()
    except Exception:
        return ""


def _public_webhook_url(request_origin: str = "") -> str:
    configured = (
        os.environ.get("ROLAX_WEBHOOK_BASE_URL")
        or os.environ.get("VERCEL_PROJECT_PRODUCTION_URL")
        or os.environ.get("VERCEL_URL")
        or request_origin
    )
    value = str(configured or "").strip().rstrip("/")
    if not value:
        return ""
    if not value.startswith(("http://", "https://")):
        value = "https://" + value
    return value + "/api/rolax_webhook"


def _load_bot_module(state_token: str = ""):
    global MODULE
    if MODULE is not None:
        return MODULE
    if not SOURCE.exists():
        raise RuntimeError("hosted ROLAX Python file missing")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    os.environ["BOT_TOKEN"] = _token()
    os.environ["DATA_DIR"] = str(DATA_DIR)
    os.environ["PYTHONUNBUFFERED"] = "1"
    # The active Telegram webhook URL carries an authenticated, encrypted
    # snapshot. Restore it before the Python module creates users.json.
    if state_token:
        os.environ["ROLAX_WEBHOOK_STATE"] = state_token
    spec = importlib.util.spec_from_file_location("rolax_hosted_bot", SOURCE)
    if not spec or not spec.loader:
        raise RuntimeError("cannot load hosted ROLAX Python file")
    module = importlib.util.module_from_spec(spec)
    sys.modules["rolax_hosted_bot"] = module
    spec.loader.exec_module(module)
    MODULE = module
    return module


async def _sync_webhook_state(bot: Any, token: str, state_token: str, request_origin: str, current_state: str) -> None:
    """Persist the encrypted user list in Telegram's webhook configuration.

    Vercel's local filesystem is ephemeral. Telegram keeps the webhook URL
    across deployments, so this gives the manager bot a durable snapshot even
    when no external database is attached. The payload is authenticated and
    encrypted by the Python module with the bot token.
    """
    if not current_state or current_state == state_token:
        return
    url = _public_webhook_url(request_origin)
    if not url:
        return
    separator = "&" if "?" in url else "?"
    webhook_url = url + separator + urlencode({"state": current_state})
    if len(webhook_url) > 7500:
        print("ROLAX user snapshot skipped: webhook URL is too large", file=sys.stderr)
        return
    try:
        result = await bot.set_webhook(
            url=webhook_url,
            drop_pending_updates=False,
            max_connections=1,
            secret_token=_secret(token),
            allowed_updates=["message", "edited_message", "callback_query", "channel_post"],
        )
        if not result:
            print("ROLAX user snapshot webhook update returned false", file=sys.stderr)
    except Exception as exc:
        # User processing already succeeded; a transient state-write failure
        # must not make Telegram retry the same update forever.
        print("ROLAX user snapshot sync error:", type(exc).__name__, str(exc)[:300], file=sys.stderr)


async def _process_update(payload: dict[str, Any], state_token: str = "", request_origin: str = "") -> None:
    token = _token()
    if not token:
        raise RuntimeError("ROLAX_MAIN_BOT_TOKEN is not configured")
    module = _load_bot_module(state_token)
    from telegram import Update

    # No post_init/post_shutdown: those are for the persistent VPS polling
    # process and would send a startup ping on every serverless request.
    app = module.build_application(lifecycle=False)
    await app.initialize()
    try:
        # `post_init` is intentionally disabled for one-shot webhook requests,
        # but the bot identity is still needed by referral links and panel
        # screens. Populate it once after PTB has initialized the Bot object.
        if not getattr(module, "BOT_USERNAME", ""):
            try:
                me = await app.bot.get_me()
                module.BOT_USERNAME = (getattr(me, "username", "") or "").strip()
            except Exception:
                pass
        # Serverless functions cannot keep asyncio.sleep tasks alive after the
        # request ends. Drain any queued announcement before and after the
        # update so scheduled admin broadcasts survive webhook cold starts.
        process_due = getattr(module, "process_due_announcements", None)
        if process_due:
            await process_due(app.bot)
        update = Update.de_json(payload, app.bot)
        if update is not None:
            await app.process_update(update)
        if process_due:
            await process_due(app.bot)
        # Persist context.user_data before the short-lived webhook app is
        # closed. This is what carries a two-step panel action (button first,
        # user ID/message second) into the next Telegram update.
        try:
            await app.update_persistence()
        except Exception as exc:
            print("ROLAX persistence update error:", type(exc).__name__, str(exc)[:300], file=sys.stderr)

        # Save the latest user list after the update. On the next cold start or
        # redeploy, the request URL restores it before PTB handles /start.
        try:
            export_state = getattr(module, "export_webhook_state", None)
            current_state = export_state() if export_state else ""
            await _sync_webhook_state(app.bot, token, state_token, request_origin, current_state)
        except Exception as exc:
            print("ROLAX user snapshot export error:", type(exc).__name__, str(exc)[:300], file=sys.stderr)
    finally:
        await app.shutdown()


class handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict[str, Any]):
        raw = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self._send(200, {"ok": True, "service": "ROLAX Telegram webhook", "source": SOURCE.name})

    def do_POST(self):
        token = _token()
        expected = _secret(token) if token else ""
        supplied = self.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if expected and supplied != expected:
            self._send(401, {"ok": False, "error": "unauthorized"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size > 2_000_000:
                self._send(413, {"ok": False, "error": "update too large"})
                return
            payload = json.loads(self.rfile.read(size).decode("utf-8"))
            state_token = _state_from_path(self.path)
            forwarded_host = (self.headers.get("X-Forwarded-Host") or self.headers.get("Host") or "").split(",")[0].strip()
            forwarded_proto = (self.headers.get("X-Forwarded-Proto") or "https").split(",")[0].strip()
            request_origin = f"{forwarded_proto}://{forwarded_host}" if forwarded_host else ""
            asyncio.run(_process_update(payload, state_token, request_origin))
            self._send(200, {"ok": True})
        except Exception as exc:
            # Telegram retries non-2xx responses. Return 200 after logging so a
            # transient bot-side problem cannot create an update storm.
            print("ROLAX webhook error:", type(exc).__name__, str(exc)[:500], file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            self._send(200, {"ok": False, "error": str(exc)[:300]})
