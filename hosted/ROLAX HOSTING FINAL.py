#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# =====================================================================
#  ROLAX HOSTING V2  -  v3.24   (SINGLE FILE BUILD)
# ---------------------------------------------------------------------
#  Chalane ka tarika:
#       python3 ROLAX_HOSTING_FINAL.py
#
#  - Config isi file ke andar hai (neeche CONFIG section).
#  - OPTIONAL: isi folder me .env rakh do to wahan se BOT_TOKEN /
#    ADMIN_ID / DATA_DIR / FORCE_JOIN_CHANNELS utha liye jayenge.
#    (Hosting panels ki env variables hamesha jeetati hain.)
#  - python-telegram-bot + psutil pehli baar khud install ho jaate hain.
#  - Check karne ke liye:  python3 ROLAX_HOSTING_FINAL.py --check
# =====================================================================

import sys as _sys

# ---------------------------------------------------------------------
#  GUARD: agar galti se Python 2 ya bahut purana Python chala de to
#  "SyntaxError" ki jagah saaf message mile. (Yeh code Python 2 me bhi
#  valid hai, isliye error aage nahi jaata.)
# ---------------------------------------------------------------------
if _sys.version_info < (3, 6):
    _sys.stderr.write(
        "\n[FATAL] Is bot ko Python 3.6+ chahiye.\n"
        "        Aapka Python: " + _sys.version.split()[0] + "\n"
        "        Chalane ka sahi tarika:  python3 ROLAX_HOSTING_FINAL.py\n\n")
    raise SystemExit(1)

del _sys

import os
import sys
import subprocess


# ---------------------------------------------------------------------
#  OPTIONAL .env SUPPORT
#  Bot ke folder me ".env" file ho to usse values utha lo. Yeh hosting
#  panels ke liye hai (Docker compose, pm2, VPS) - agar wahan variable
#  pehle se set hai to wo hi chalta rahega (env > .env > file ke andar).
# ---------------------------------------------------------------------
def _load_env_file(*candidates):
    for path in candidates:
        if not path or not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    if line.lower().startswith("export "):
                        line = line[7:].strip()
                    key, value = line.split("=", 1)
                    key = key.strip()
                    value = value.strip().strip('"').strip("'")
                    # asli environment variable ki value kabhi overwrite nahi hoti
                    if key and key not in os.environ:
                        os.environ[key] = value
        except Exception:
            pass


_HERE = os.path.dirname(os.path.abspath(__file__))
# .env ke saath-saath visible naam bhi chalte hain (phone pe dotfile chhup
# jaati hai, isliye env.txt bhi support kiya hai).
_ENV_NAMES = (".env", "env.txt", "ENV.txt", ".env.txt", "environment.txt", "env")
_load_env_file(*[os.path.join(_HERE, name) for name in _ENV_NAMES],
               *[os.path.join(os.getcwd(), name) for name in _ENV_NAMES])


# =====================================================================
#  ##  CONFIG  ##   <-- SIRF YAHAN VALUES BADLO
# =====================================================================
BOT_TOKEN = ""  # Hosting me BOT_TOKEN environment variable se inject hoga
ADMIN_ID = 8472327599
OWNER_USERNAME = "@Rolax112"
OFFICIAL_CHANNEL_URL = "https://t.me/rolaxexploitsz"

# Force join channels (@username ya -100... id). Khali list = force join off.
FORCE_JOIN_CHANNELS = ["-1003968777224", "-1003971286585"]

# Data folder. Khali = isi file ke folder me (users.json, bots.json, hosted_bots).
# Docker / Render / Fly volume ke liye e.g. "/data" likho.
DATA_DIR_SETTING = ""

VERSION = "3.24"
# =====================================================================
#   (isse neeche kuch badalne ki zaroorat nahi)
# =====================================================================

# Environment variables still win, so a host can keep the token secret.
BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip() or BOT_TOKEN
try:
    ADMIN_ID = int(os.environ.get("ADMIN_ID", "").strip() or ADMIN_ID)
except (TypeError, ValueError):
    ADMIN_ID = int(ADMIN_ID)
OWNER_USERNAME = os.environ.get("OWNER_USERNAME", "").strip() or OWNER_USERNAME
OFFICIAL_CHANNEL_URL = os.environ.get("OFFICIAL_CHANNEL_URL", "").strip() or OFFICIAL_CHANNEL_URL
DATA_DIR_SETTING = os.environ.get("DATA_DIR", "").strip() or DATA_DIR_SETTING
_fj_env = [c.strip() for c in os.environ.get("FORCE_JOIN_CHANNELS", "").split(",") if c.strip()]
if _fj_env:
    FORCE_JOIN_CHANNELS = _fj_env

BOT_USERNAME = ""   # startup pe get_me() se bhar jaata hai
_LAST_CONFLICT_ALERT = 0.0   # 409 Conflict alert spam rok
REQUIRED_FORCE_JOIN_CHANNELS = list(FORCE_JOIN_CHANNELS)
FORCE_JOIN_CHANNEL = FORCE_JOIN_CHANNELS[0] if FORCE_JOIN_CHANNELS else ""


# ---------------------------------------------------------------------
#  Dependencies: ek hi file chale, isliye missing packages khud install
# ---------------------------------------------------------------------
def _ensure_dependencies() -> None:
    import importlib
    needed = []
    for module, package in (("telegram", "python-telegram-bot==21.11.1"),
                            ("psutil", "psutil")):
        try:
            importlib.import_module(module)
        except Exception:
            needed.append(package)
    if not needed:
        return
    print("[setup] Installing: " + ", ".join(needed))
    for extra in ([], ["--user"], ["--break-system-packages"]):
        try:
            subprocess.check_call(
                [sys.executable, "-m", "pip", "install",
                 "--disable-pip-version-check", "--quiet", *extra, *needed])
            print("[setup] Done.")
            return
        except Exception:
            continue
    print("[setup] Auto install failed. Manually run:")
    print("        pip install " + " ".join(needed))


_ensure_dependencies()

import json
import time
import shutil
import logging
import asyncio
import datetime
import signal
import re
import psutil
from typing import Dict, Any, Optional

try:
    from telegram import (
        Update,
        InlineKeyboardButton,
        InlineKeyboardMarkup,
    )
    from telegram.error import BadRequest, RetryAfter, InvalidToken
    from telegram.ext import (
        Application,
        CommandHandler,
        CallbackQueryHandler,
        MessageHandler,
        ContextTypes,
        filters,
    )
except ImportError as _imp_err:      # clearer message than a raw traceback
    print("\n[FATAL] python-telegram-bot install nahi hua:", _imp_err)
    print("        Run:  pip install python-telegram-bot==21.11.1 psutil")
    sys.exit(1)

# File System Directories
# DATA_DIR lets you keep users.json / bots.json / hosted_bots on a mounted
# persistent volume (Render disk, Fly volume, Docker -v ...) while code stays
# read-only. Falls back to the script folder, i.e. old behaviour.
BASE_DIR = os.path.abspath(os.path.expanduser(
    DATA_DIR_SETTING or os.path.dirname(os.path.abspath(__file__))))
os.makedirs(BASE_DIR, exist_ok=True)
USERS_FILE = os.path.join(BASE_DIR, "users.json")
BOTS_FILE = os.path.join(BASE_DIR, "bots.json")
PENDING_FILE = os.path.join(BASE_DIR, "pending.json")
CONFIG_FILE = os.path.join(BASE_DIR, "config.json")
ADMINS_FILE = os.path.join(BASE_DIR, "admins.json")
FORCE_JOIN_FILE = os.path.join(BASE_DIR, "force_join.json")
FORCE_JOIN_MIGRATION_FILE = os.path.join(BASE_DIR, ".force_join_channels_migrated")
REDEEM_FILE = os.path.join(BASE_DIR, "redeem_codes.json")
AUDIT_LOG_FILE = os.path.join(BASE_DIR, "audit_logs.txt")
SESSION_LOG_FILE = os.path.join(BASE_DIR, "session_logs.txt")
BUTTON_CLICK_LOG_FILE = os.path.join(BASE_DIR, "button_clicks.txt")
SCHEDULE_FILE = os.path.join(BASE_DIR, "scheduled_announcements.json")
HOSTED_DIR = os.path.join(BASE_DIR, "hosted_bots")
LOGS_DIR = os.path.join(BASE_DIR, "bot_logs")

os.makedirs(HOSTED_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

RUNNING_PROCESSES: Dict[str, Dict[str, Any]] = {}

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)
try:
    _file_handler = logging.FileHandler(os.path.join(BASE_DIR, "hosting_bot.log"), encoding="utf-8")
    _file_handler.setFormatter(logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s"))
    logging.getLogger().addHandler(_file_handler)
except Exception:
    pass

# ==================== DATABASE HELPERS ====================

def load_json(filename: str, default: Any) -> Any:
    if not os.path.exists(filename):
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(default, f, indent=4)
        return default
    try:
        with open(filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading {filename}: {e}")
        return default

def save_json(filename: str, data: Any) -> None:
    """Atomic write: a crash mid-save can never truncate the database files."""
    tmp = f"{filename}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, filename)
    except Exception as e:
        logger.error(f"Error saving {filename}: {e}")
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except OSError:
            pass

def get_users() -> dict: return load_json(USERS_FILE, {})
def save_users(data: dict) -> None: save_json(USERS_FILE, data)
def get_bots() -> dict: return load_json(BOTS_FILE, {})
def save_bots(data: dict) -> None: save_json(BOTS_FILE, data)
def get_pending() -> dict: return load_json(PENDING_FILE, {})
def save_pending(data: dict) -> None: save_json(PENDING_FILE, data)
def get_redeem_codes() -> dict: return load_json(REDEEM_FILE, {})
def save_redeem_codes(data: dict) -> None: save_json(REDEEM_FILE, data)

def get_admins() -> list:
    admins = load_json(ADMINS_FILE, [ADMIN_ID])
    if ADMIN_ID not in admins:
        admins.append(ADMIN_ID)
    return [int(a) for a in admins]

def save_admins(admins: list) -> list:
    if ADMIN_ID not in admins:
        admins.append(ADMIN_ID)
    cleaned_admins = list(set([int(a) for a in admins]))
    save_json(ADMINS_FILE, cleaned_admins)
    return cleaned_admins

def is_admin(user_id: int) -> bool:
    if int(user_id) == int(ADMIN_ID):
        return True
    return int(user_id) in get_admins()

def get_force_join() -> list:
    channels = load_json(FORCE_JOIN_FILE, [])
    if not isinstance(channels, list):
        channels = []
    normalized = []
    for channel in channels:
        value = str(channel).strip()
        if value and value not in normalized:
            normalized.append(value)

    # One-time migration: add the two requested channels without resetting the
    # existing list. After migration, admin add/remove choices remain persistent.
    if not os.path.exists(FORCE_JOIN_MIGRATION_FILE):
        for channel in REQUIRED_FORCE_JOIN_CHANNELS:
            if channel not in normalized:
                normalized.append(channel)
        save_json(FORCE_JOIN_FILE, normalized)
        try:
            with open(FORCE_JOIN_MIGRATION_FILE, "w", encoding="utf-8") as marker:
                marker.write("done")
        except OSError:
            logger.exception("Could not write force-join migration marker")
    return normalized

def save_force_join(channels: list) -> None:
    normalized = []
    for channel in channels:
        value = str(channel).strip()
        if value and value not in normalized:
            normalized.append(value)
    save_json(FORCE_JOIN_FILE, normalized)

def get_config() -> dict:
    default_cfg = {
        "bot_status": "ON",
        "default_cpu_limit": 8.0,
        "default_ram_limit": 8192,
        "maintenance_mode": False,
        "referral_reward": 0.25,
        "daily_reminder_active": True
    }
    return load_json(CONFIG_FILE, default_cfg)

def save_config(data: dict) -> None: save_json(CONFIG_FILE, data)

def get_scheduled_announcements() -> list:
    """Read pending admin announcements from a small durable queue.

    A delayed asyncio task alone disappears when a webhook function is frozen
    after one Telegram update. The queue survives that request and is drained
    by the polling guardian or by the next webhook update. Malformed queue
    records are ignored so one bad schedule can never break the admin panel.
    """
    value = load_json(SCHEDULE_FILE, [])
    if not isinstance(value, list):
        return []
    clean = []
    for item in value:
        if not isinstance(item, dict) or not item.get("id") or not item.get("message"):
            continue
        try:
            item["run_at"] = float(item.get("run_at", 0) or 0)
        except (TypeError, ValueError):
            logger.warning("Ignoring malformed scheduled announcement %r", item.get("id"))
            continue
        clean.append(item)
    return clean


def save_scheduled_announcements(items: list) -> None:
    save_json(SCHEDULE_FILE, items)


def schedule_announcement(delay_minutes: float, message: str, created_by: int) -> dict:
    now = time.time()
    item = {
        "id": "ann_" + str(int(now * 1000)),
        "run_at": now + (delay_minutes * 60),
        "message": message[:3900],
        "created_by": int(created_by),
        "created_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    pending = get_scheduled_announcements()
    pending.append(item)
    save_scheduled_announcements(pending)
    return item


async def process_due_announcements(bot) -> int:
    """Deliver due announcements once and remove them from the queue first.

    Removing before sending prevents duplicate broadcasts after a warm-runtime
    retry. Individual blocked/deleted chats are skipped, while the audit log
    records the attempted and successful counts.
    """
    pending = get_scheduled_announcements()
    now = time.time()
    due = [item for item in pending if float(item.get("run_at", 0) or 0) <= now]
    if not due:
        return 0
    remaining = [item for item in pending if item not in due]
    save_scheduled_announcements(remaining)
    users = get_users()
    delivered = 0
    for item in due:
        attempted = 0
        sent = 0
        for uid in users:
            attempted += 1
            try:
                await bot.send_message(chat_id=int(uid), text="Scheduled Announcement:\n\n" + str(item.get("message", ""))[:3900])
                sent += 1
            except Exception:
                pass
            await asyncio.sleep(0.05)
        delivered += sent
        log_audit_action(
            f"Executed Scheduled Announcement {item.get('id')} to {sent}/{attempted} users",
            int(item.get("created_by") or ADMIN_ID),
        )
    return delivered


def log_audit_action(action: str, admin_id: int = ADMIN_ID) -> None:
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] ADMIN (ID: {admin_id}) ACTION: {action}\n"
    with open(AUDIT_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

def log_session_action(user_id: int, username: str, action: str) -> None:
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] User: @{username} (ID: {user_id}) -> {action}\n"
    with open(SESSION_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

def log_button_click(user_id: int, username: str, button_data: str) -> None:
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    entry = f"[{timestamp}] User @{username} (ID: {user_id}) clicked button: {button_data}\n"
    with open(BUTTON_CLICK_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(entry)

FORCE_JOIN_CACHE: Dict[tuple, float] = {}
FORCE_JOIN_CACHE_TTL = 60.0          # seconds a successful check is trusted
_FJ_BROKEN_CHANNELS: set = set()     # channels Telegram will not let us verify


def _to_chat_id(raw_value: Any):
    raw = str(raw_value).strip()
    return int(raw) if raw.lstrip("-").isdigit() else raw


async def check_force_join(user_id: int, bot) -> bool:
    """Return True when the user may use the bot.

    FIX: the old version failed *closed*, so a single channel where the bot is
    not an administrator (Telegram answers CHAT_ADMIN_REQUIRED) or a wrong/old
    channel id ("chat not found") blocked EVERY normal user forever. Now only a
    genuine "user is not a member" answer blocks; channels we cannot verify are
    skipped with a warning so the bot keeps working.
    """
    if is_admin(user_id):
        return True
    channels = get_force_join()
    if not channels:
        return True

    now = time.time()
    cache_key = (int(user_id),)
    if FORCE_JOIN_CACHE.get(cache_key, 0) > now:
        return True

    for ch in channels:
        if ch in _FJ_BROKEN_CHANNELS:
            continue
        try:
            member = await bot.get_chat_member(chat_id=_to_chat_id(ch), user_id=user_id)
            status = str(getattr(member, "status", "unknown")).lower()
            is_member = getattr(member, "is_member", True)
            if status in ("left", "kicked", "banned"):
                return False
            if status == "restricted" and not is_member:
                return False
            if status not in ("creator", "administrator", "member", "restricted"):
                return False
        except Exception as e:
            err = str(e)
            err_l = err.lower()
            # Configuration problem (bot not admin / channel id wrong) -> skip
            # this channel instead of locking the whole userbase out.
            # NOTE: PTB lower-cases Telegram descriptions ("Chat_admin_required"),
            # so the match must be case-insensitive.
            if any(k in err_l for k in ("chat_admin_required", "chat not found",
                                        "forbidden", "not enough rights",
                                        "peer_id_invalid", "user not found",
                                        "chat_write_forbidden", "bot is not a member")):
                if ch not in _FJ_BROKEN_CHANNELS:
                    _FJ_BROKEN_CHANNELS.add(ch)
                    logger.warning(
                        "Force-join channel %s cannot be verified (%s). Skipping it - "
                        "make the bot an administrator there to enforce it.", ch, err)
                continue
            # Flood control / network hiccup: do not punish the user for it.
            logger.warning("Force-join check skipped for %s: %s", ch, err)
            continue

    FORCE_JOIN_CACHE[cache_key] = now + FORCE_JOIN_CACHE_TTL
    return True


async def audit_force_join_config(bot) -> list:
    """Startup self-check: returns a list of broken force-join channels."""
    problems = []
    for ch in get_force_join():
        try:
            chat = await bot.get_chat(_to_chat_id(ch))
            me = await bot.get_me()
            member = await bot.get_chat_member(chat_id=chat.id, user_id=me.id)
            if str(getattr(member, "status", "")).lower() not in ("administrator", "creator"):
                problems.append(f"{ch} ({getattr(chat, 'title', ch)}): bot is not admin")
        except Exception as e:
            problems.append(f"{ch}: {e}")
    return problems

# ==================== BACKGROUND GUARDIANS ====================

async def background_expiry_guardian(app: Application):
    while True:
        try:
            now = time.time()
            users = get_users()
            updated = False

            for uid, uinfo in users.items():
                if uinfo.get("premium", False) and uinfo.get("premium_expiry"):
                    if now >= uinfo["premium_expiry"]:
                        uinfo["premium"] = False
                        uinfo["premium_expiry"] = None
                        updated = True
                        try:
                            await app.bot.send_message(
                                chat_id=int(uid),
                                text="Your Premium VIP membership has expired! You are now on the Free tier.",
                                parse_mode="Markdown"
                            )
                        except Exception:
                            pass
            if updated:
                save_users(users)
            await asyncio.sleep(30)
        except Exception as e:
            logger.error(f"Error in Expiry Guardian: {e}")
            await asyncio.sleep(30)

async def daily_reminder_guardian(app: Application):
    while True:
        try:
            await asyncio.sleep(86400)
            config = get_config()
            if config.get("daily_reminder_active", True):
                users = get_users()
                for uid in users:
                    try:
                        await app.bot.send_message(
                            chat_id=int(uid),
                            text="Daily Reminder: Your Python and Node.js bots are running 24/7 on Exclusive Rolax Hosting. Send /start to deploy a new bot!",
                            parse_mode="Markdown"
                        )
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"Error in Daily Reminder Guardian: {e}")

# ==================== PROCESS ENGINE ====================

def start_bot_process(bot_id: str) -> bool:
    bots = get_bots()
    if bot_id not in bots:
        return False

    binfo = bots[bot_id]

    users = get_users()
    owner_id = str(binfo.get("owner_id"))
    if owner_id in users and users[owner_id].get("restricted", False):
        binfo["status"] = "STOPPED"
        save_bots(bots)
        return False

    path = binfo["path"]
    if not os.path.exists(path):
        return False

    stop_bot_process(bot_id)

    log_path = os.path.join(LOGS_DIR, f"bot_{bot_id}.log")
    log_file = open(log_path, "a", encoding="utf-8")

    try:
        bot_dir = os.path.dirname(path)
        runtime = binfo.get("runtime", "python")
        python_bin = binfo.get("python") or sys.executable
        cmd = [python_bin, path] if runtime == "python" else ["node", path]

        # FIX: the .env feature wrote variables to disk but never passed them to
        # the child process, so uploaded bots never actually saw them.
        child_env = os.environ.copy()
        child_env.update(read_dotenv(bot_dir))
        child_env.setdefault("PYTHONUNBUFFERED", "1")
        child_env.setdefault("PYTHONDONTWRITEBYTECODE", "1")

        proc = subprocess.Popen(
            cmd,
            cwd=bot_dir,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            env=child_env,
            start_new_session=True,
            text=True
        )

        RUNNING_PROCESSES[bot_id] = {
            "process": proc,
            "log_file_obj": log_file,
            "log_path": log_path,
            "last_crash_notify": 0,
            "started_at": time.time()
        }

        binfo["status"] = "RUNNING"
        binfo["start_time"] = time.time()
        save_bots(bots)
        return True
    except Exception as e:
        logger.error(f"Failed to start bot {bot_id}: {e}")
        log_file.close()
        return False

def stop_bot_process(bot_id: str) -> bool:
    if bot_id in RUNNING_PROCESSES:
        item = RUNNING_PROCESSES[bot_id]
        p = item["process"]
        if p.poll() is None:
            # FIX: children (node/npm/pip helpers) survived a stop, kept the port
            # and the RAM, and made restarts fail with "port already in use".
            try:
                for child in psutil.Process(p.pid).children(recursive=True):
                    try:
                        child.terminate()
                    except psutil.Error:
                        pass
            except psutil.Error:
                pass
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except Exception:
                p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(p.pid), signal.SIGKILL)
                except Exception:
                    p.kill()
            try:
                p.wait(timeout=3)
            except Exception:
                pass
        try:
            item["log_file_obj"].close()
        except Exception:
            pass
        del RUNNING_PROCESSES[bot_id]

    bots = get_bots()
    if bot_id in bots:
        bots[bot_id]["status"] = "STOPPED"
        bots[bot_id]["start_time"] = None
        save_bots(bots)
    return True

def get_bot_resource_usage(bot_id: str) -> tuple:
    if bot_id in RUNNING_PROCESSES:
        p = RUNNING_PROCESSES[bot_id]["process"]
        if p.poll() is None:
            try:
                ps = psutil.Process(p.pid)
                cpu = ps.cpu_percent(interval=None)  # was blocking the event loop 50ms per bot
                mem = ps.memory_info().rss / (1024 * 1024)
                return round(cpu, 1), round(mem, 1)
            except Exception:
                pass
    return 0.0, 0.0

async def auto_fix_guardian_task(app: Application):
    while True:
        try:
            bots = get_bots()
            users = get_users()
            now = time.time()

            for bot_id, binfo in list(bots.items()):
                owner_id = str(binfo.get("owner_id"))
                if owner_id in users and users[owner_id].get("restricted", False):
                    if binfo.get("status") == "RUNNING":
                        stop_bot_process(bot_id)
                    continue

                if binfo.get("status") == "RUNNING" and binfo.get("autofix", True):
                    if bot_id in RUNNING_PROCESSES:
                        proc = RUNNING_PROCESSES[bot_id]["process"]
                        # FIX: crash_count never reset, so a bot that crashed once
                        # months ago was deleted on its next two unrelated restarts.
                        started_at = RUNNING_PROCESSES[bot_id].get("started_at", now)
                        if proc.poll() is None and binfo.get("crash_count") and (now - started_at) > 180:
                            binfo["crash_count"] = 0
                            save_bots(bots)
                        if proc.poll() is not None:
                            # Crash-loop protection: back off, but NEVER delete the
                            # user's file/database. A later retry or manual fix can
                            # bring the same bot back online permanently.
                            retry_at = float(binfo.get("next_restart_at", 0) or 0)
                            if retry_at > now:
                                continue
                            crash_count = binfo.get("crash_count", 0) + 1
                            binfo["crash_count"] = crash_count
                            save_bots(bots)

                            log_path = RUNNING_PROCESSES[bot_id]["log_path"]
                            missing_module = None
                            if os.path.exists(log_path):
                                with open(log_path, "r", encoding="utf-8", errors="ignore") as lf:
                                    content = lf.read()
                                    match = re.search(r"No module named ['\"]([^'\"]+)['\"]", content)
                                    if match:
                                        missing_module = match.group(1)

                            if missing_module:
                                logger.info(f"Auto-Fixing bot #{bot_id}: Installing {missing_module}")
                                try:
                                    subprocess.run(
                                        [sys.executable, "-m", "pip", "install",
                                         "--disable-pip-version-check", "--no-input", missing_module],
                                        capture_output=True, timeout=180)
                                except Exception as pip_err:
                                    logger.warning("pip install %s failed: %s", missing_module, pip_err)

                            start_bot_process(bot_id)
                            if crash_count >= 3:
                                # Keep retrying every minute instead of deleting
                                # the deployment after the third crash.
                                binfo["next_restart_at"] = time.time() + 60
                                save_bots(bots)

                            u_info = users.get(owner_id, {})
                            if owner_id and u_info.get("crash_alerts", True):
                                safe_name = str(binfo['name']).replace("_", "\\_")
                                msg = f"⚠️ Crash Alert (#{crash_count})\nYour Bot #{bot_id} ({safe_name}) crashed."
                                if missing_module:
                                    msg += f"\nAuto-installed missing module: {missing_module}."
                                if crash_count >= 3:
                                    msg += "\nCrash-loop backoff: file/database safe rakhe hain; next retry 60s me hoga."
                                else:
                                    msg += "\nBot automatically restarted!"
                                try:
                                    await app.bot.send_message(chat_id=int(owner_id), text=msg)
                                except Exception:
                                    pass
            await asyncio.sleep(10)
        except Exception as e:
            logger.error(f"Error in Auto-Fix Task: {e}")
            await asyncio.sleep(10)

# ==================== SMALL HELPERS ====================

BACKGROUND_TASKS: set = set()


def spawn_background(coro) -> "asyncio.Task":
    """Keep a strong reference so scheduled work is never garbage collected."""
    task = asyncio.create_task(coro)
    BACKGROUND_TASKS.add(task)
    task.add_done_callback(BACKGROUND_TASKS.discard)
    return task


async def scheduled_announcement_guardian(app: Application):
    """Drain scheduled announcements in persistent polling mode.

    On the Vercel webhook path the adapter calls process_due_announcements
    around every update because serverless functions must not keep a sleeping
    task alive between requests.
    """
    while True:
        try:
            await process_due_announcements(app.bot)
            await asyncio.sleep(5)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("Error in Scheduled Announcement Guardian: %s", e)
            await asyncio.sleep(5)


def next_bot_id(bots: dict) -> str:
    """FIX: ids used to be len(bots)+101, so deleting a bot and hosting a new one
    produced a duplicate id and silently overwrote another user's bot."""
    highest = 100
    for key in bots:
        try:
            highest = max(highest, int(str(key).strip()))
        except (TypeError, ValueError):
            continue
    return str(highest + 1)


def sanitize_filename(name: Optional[str]) -> str:
    """FIX: a file named '../../x.py' could escape the user's own directory."""
    base = os.path.basename(str(name or "").replace("\\", "/"))
    base = re.sub(r"[^A-Za-z0-9._\- ]", "_", base).strip(". ")
    return base or "bot.py"


TELEGRAM_TEXT_LIMIT = 4096
TELEGRAM_ALERT_LIMIT = 200


def _telegram_text(value: Optional[str], limit: int = TELEGRAM_TEXT_LIMIT) -> str:
    """Keep every panel response inside Telegram's hard message limit.

    Large audit/log/file panels used to fail with Telegram's 400
    ``Message_too_long`` response. That made the button look completely dead.
    Long screens are now visibly truncated instead of failing silently.
    """
    text = str(value or "")
    if len(text) <= limit:
        return text
    suffix = "\n\n… output truncated"
    return text[:max(0, limit - len(suffix))] + suffix


async def safe_answer(query, text: Optional[str] = None, show_alert: bool = False) -> None:
    """Answer a callback safely, including repeated/oversized answers."""
    try:
        answer = _telegram_text(text, TELEGRAM_ALERT_LIMIT) if text else text
        await query.answer(text=answer, show_alert=show_alert)
    except Exception:
        pass


async def safe_edit(query, text: Optional[str] = None, reply_markup=None, parse_mode=None) -> bool:
    """Edit a callback message without leaving Telegram's loading spinner.

    The old router answered every callback immediately with an empty answer.
    Action-only buttons then tried to show their real success alert a second
    time; Telegram rejects that second answer, so buttons like Stats, Restart,
    Backup and admin toggles looked dead. Edit screens answer here, while
    alert-only branches answer themselves exactly when the action finishes.
    Oversized log/file panels are clipped before Telegram rejects them.
    """
    await safe_answer(query)
    rendered = _telegram_text(text)
    # A clipped Markdown message can end in an unmatched formatting marker.
    # Send it as plain text so the user still receives the panel response.
    rendered_parse_mode = parse_mode if rendered == str(text or "") else None
    try:
        await query.edit_message_text(text=rendered, reply_markup=reply_markup, parse_mode=rendered_parse_mode)
        return True
    except BadRequest as e:
        low = str(e).lower()
        if "not modified" in low:
            return True
        # BACK BUTTON FIX: backup/DB screens are documents (caption, not text).
        # Editing their "text" always fails, so the Back button looked dead.
        # Try editing the caption first, then fall back to a brand new message.
        try:
            await query.edit_message_caption(caption=rendered, reply_markup=reply_markup, parse_mode=rendered_parse_mode)
            return True
        except Exception:
            pass
        try:
            await query.message.chat.send_message(
                text=rendered, reply_markup=reply_markup, parse_mode=rendered_parse_mode)
            return True
        except Exception as inner:
            logger.warning("Could not edit or resend message: %s", inner)
            return False
    except RetryAfter as e:
        logger.warning("Flood control on edit, retrying after %s", e.retry_after)
        try:
            await asyncio.sleep(float(e.retry_after))
            await query.edit_message_text(text=rendered, reply_markup=reply_markup, parse_mode=rendered_parse_mode)
            return True
        except Exception:
            return False
    except Exception as e:
        logger.warning("edit_message_text failed: %s", e)
        return False


def main_menu_kb() -> InlineKeyboardMarkup:
    """Small helper so Back always has somewhere valid to go."""
    return InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]])


def admin_back_kb(with_main: bool = True) -> InlineKeyboardMarkup:
    row = [InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]
    if with_main:
        row.append(InlineKeyboardButton("🏠 Main Menu", callback_data="menu_start"))
    return InlineKeyboardMarkup([row])


_TRANSIENT_EXACT = {"editing_env_bot", "dm_mode", "pending_action"}


def pending_state_keys(context) -> list:
    data = getattr(context, "user_data", None) or {}
    return [k for k in list(data.keys())
            if isinstance(k, str)
            and (k.startswith("awaiting_") or k.startswith("expecting_") or k in _TRANSIENT_EXACT)]


def clear_user_flow(context) -> None:
    """BACK BUTTON FIX (root cause).

    Every screen that asks you to *type* something stores a flag in user_data
    (redeem code, .env editor, "send user id to ban", credits, broadcast...).
    Pressing Back used to change the screen but leave that flag set, so the bot
    kept swallowing your next messages as if you were still on the old screen -
    exactly "back dabta hai par back nahi hota". Now ANY button press (and
    /start, /back, /cancel) clears those flags first.
    """
    data = getattr(context, "user_data", None)
    if not data:
        return
    for key in pending_state_keys(context):
        data.pop(key, None)


async def render_main_menu(query, user, context) -> None:
    """Re-render the home screen from anywhere (used by Back + stale buttons)."""
    clear_user_flow(context)
    users = get_users()
    u_data = users.get(str(user.id), {})
    bots = get_bots()
    user_bot_count = sum(1 for b in bots.values() if b.get("owner_id") == user.id)
    max_bots = get_user_max_bots(user.id)
    is_prem = u_data.get("premium", False)
    credits = u_data.get("credits", 1.0)

    expiry_str = ""
    if is_prem and u_data.get("premium_expiry"):
        rem_secs = u_data["premium_expiry"] - time.time()
        if rem_secs > 0:
            days = int(rem_secs // 86400)
            hours = int((rem_secs % 86400) // 3600)
            expiry_str = f" (Expires in {days}d {hours}h)"

    await safe_edit(
        query,
        get_start_text(user.first_name, user_bot_count, max_bots, is_prem, credits, expiry_str),
        parse_mode="Markdown",
        reply_markup=main_menu_keyboard(),
    )


async def safe_reply(message, text: Optional[str] = None, reply_markup=None, parse_mode=None):
    """Reply safely when the original message is gone or the panel is large."""
    rendered = _telegram_text(text)
    rendered_parse_mode = parse_mode if rendered == str(text or "") else None
    try:
        return await message.reply_text(rendered, reply_markup=reply_markup, parse_mode=rendered_parse_mode)
    except Exception as first_err:
        try:
            bot_obj = message.get_bot()
            if asyncio.iscoroutine(bot_obj):
                bot_obj = await bot_obj
            return await bot_obj.send_message(
                chat_id=message.chat_id, text=rendered,
                reply_markup=reply_markup, parse_mode=rendered_parse_mode)
        except Exception as second_err:
            logger.warning("safe_reply failed (%s / %s)", first_err, second_err)
            return None


def read_dotenv(bot_dir: str) -> dict:
    """Load KEY=VALUE pairs from the project's .env so uploaded bots get them."""
    env = {}
    env_path = os.path.join(bot_dir, ".env")
    if not os.path.exists(env_path):
        return env
    try:
        with open(env_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key.lower().startswith("export "):
                    key = key[7:].strip()
                if key:
                    env[key] = value.strip().strip('"').strip("'")
    except Exception as e:
        logger.warning("Could not read %s: %s", env_path, e)
    return env


# ==================== KEYBOARDS ====================

def main_menu_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("🚀 Host New Bot", callback_data="menu_host")],
        [InlineKeyboardButton("🤖 My Bots", callback_data="menu_mybots"), InlineKeyboardButton("📁 File Manager", callback_data="menu_files")],
        [InlineKeyboardButton("📊 Dashboard", callback_data="menu_dashboard"), InlineKeyboardButton("🎁 Refer & Earn", callback_data="menu_referral")],
        [InlineKeyboardButton("🎟️ Redeem Code", callback_data="menu_redeem_prompt"), InlineKeyboardButton("⚙️ Settings", callback_data="menu_settings")],
        [InlineKeyboardButton("💾 Backup Data", callback_data="menu_backup"), InlineKeyboardButton("👤 My Account", callback_data="menu_account")],
        [InlineKeyboardButton("📢 Official Channel ↗", url=OFFICIAL_CHANNEL_URL), InlineKeyboardButton("👨‍💻 Contact Owner ↗", url="https://t.me/Rolax112")]
    ]
    return InlineKeyboardMarkup(keyboard)

def host_options_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("🐍 Upload Python Script (.py)", callback_data="upload_py")],
        [InlineKeyboardButton("🟨 Upload JS Script (.js)", callback_data="upload_js")],
        [InlineKeyboardButton("🐙 Deploy from GitHub Repo", callback_data="upload_github")],
        [InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]
    ]
    return InlineKeyboardMarkup(keyboard)

def admin_panel_keyboard(user_id: int) -> InlineKeyboardMarkup:
    config = get_config()
    bot_status = config.get("bot_status", "ON")
    m_mode = "ON 🟡" if config.get("maintenance_mode", False) else "OFF 🟢"
    rem_status = "ON 🟢" if config.get("daily_reminder_active", True) else "OFF 🔴"

    if int(user_id) == int(ADMIN_ID):
        keyboard = [
            [InlineKeyboardButton(f"🤖 System: {bot_status}", callback_data="adm_toggle_status"), InlineKeyboardButton(f"🛠️ Maint: {m_mode}", callback_data="adm_toggle_maint")],
            [InlineKeyboardButton("🏆 Top Users", callback_data="adm_top_users"), InlineKeyboardButton("📈 Analytics", callback_data="adm_user_analytics")],
            [InlineKeyboardButton("👑 All Admins", callback_data="adm_all_admins"), InlineKeyboardButton("📝 Changelogs", callback_data="adm_changelogs")],
            [InlineKeyboardButton("👆 User Clicks", callback_data="adm_user_clicks"), InlineKeyboardButton("✉️ DM User", callback_data="adm_dm_user")],
            [InlineKeyboardButton(f"⏰ Daily Reminder: {rem_status}", callback_data="adm_toggle_reminder")],
            [InlineKeyboardButton("➕ Add Credit", callback_data="adm_add_credit"), InlineKeyboardButton("➖ Remove Credit", callback_data="adm_rem_credit")],
            [InlineKeyboardButton("🎁 Set Referral", callback_data="adm_set_ref_reward"), InlineKeyboardButton("🎟️ Create Redeem", callback_data="adm_create_redeem")],
            [InlineKeyboardButton("📢 Instant Broadcast", callback_data="adm_broadcast"), InlineKeyboardButton("🖼️ Media Broadcast", callback_data="adm_broadcast_media")],
            [InlineKeyboardButton("⏰ Schedule Announce", callback_data="adm_schedule_announcement")],
            [InlineKeyboardButton("📥 Download DB", callback_data="adm_download_backup"), InlineKeyboardButton("📤 Restore DB", callback_data="adm_restore_backup")],
            [InlineKeyboardButton("👥 User Management", callback_data="adm_user_mgmt"), InlineKeyboardButton("👤 View Profile", callback_data="adm_view_user")],
            [InlineKeyboardButton("🚫 Ban User", callback_data="adm_ban"), InlineKeyboardButton("✅ Unban User", callback_data="adm_unban")],
            [InlineKeyboardButton("🔒 Restrict User", callback_data="adm_restrict_user"), InlineKeyboardButton("🔓 Unrestrict User", callback_data="adm_unrestrict_user")],
            [InlineKeyboardButton("🛑 Stop Any Bot", callback_data="adm_stop_any_bot"), InlineKeyboardButton("🗑️ Delete Any Bot", callback_data="adm_del_any_bot")],
            [InlineKeyboardButton("💎 Give Premium", callback_data="adm_give_premium"), InlineKeyboardButton("❌ Remove Premium", callback_data="adm_rem_premium")],
            [InlineKeyboardButton("📢 Force Join", callback_data="adm_force_join"), InlineKeyboardButton("💻 Server Monitor", callback_data="adm_vps_monitor")],
            [InlineKeyboardButton("➕ Add Admin", callback_data="adm_add_admin"), InlineKeyboardButton("➖ Remove Admin", callback_data="adm_remove_admin")],
            [InlineKeyboardButton("📁 Hosted Files", callback_data="adm_all_files"), InlineKeyboardButton("📋 Audit Logs", callback_data="adm_audit_logs")],
            [InlineKeyboardButton("🔍 DB Query", callback_data="adm_db_query"), InlineKeyboardButton("☁️ Cloud Backup", callback_data="adm_cloud_backup")],
            [InlineKeyboardButton("🧹 Clear Logs", callback_data="adm_clean_cache"), InlineKeyboardButton("📜 Live Logs", callback_data="adm_live_logs")],
            [InlineKeyboardButton("⚡ RAM/CPU Limits", callback_data="adm_resource_limits"), InlineKeyboardButton("🔔 Pending Requests", callback_data="adm_pending")],
            [InlineKeyboardButton("📊 Stats", callback_data="adm_stats"), InlineKeyboardButton("📋 Session Logs", callback_data="adm_session_logs")],
            [InlineKeyboardButton("⛔ Stop All Bots", callback_data="adm_stop_all"), InlineKeyboardButton("🔄 Restart All", callback_data="adm_restart_all")],
            [InlineKeyboardButton("🏠 User Main Menu", callback_data="menu_start")]
        ]
    else:
        keyboard = [
            [InlineKeyboardButton("👑 All Admins", callback_data="adm_all_admins"), InlineKeyboardButton("📝 Changelogs", callback_data="adm_changelogs")],
            [InlineKeyboardButton("👆 User Clicks", callback_data="adm_user_clicks"), InlineKeyboardButton("⚡ RAM/CPU Limits", callback_data="adm_resource_limits")],
            [InlineKeyboardButton("🧹 Clear Logs", callback_data="adm_clean_cache"), InlineKeyboardButton("📜 Live Logs", callback_data="adm_live_logs")],
            [InlineKeyboardButton("📊 Stats", callback_data="adm_stats"), InlineKeyboardButton("💎 Give Premium", callback_data="adm_give_premium")],
            [InlineKeyboardButton("📋 Session Logs", callback_data="adm_session_logs"), InlineKeyboardButton("💻 Server Monitor", callback_data="adm_vps_monitor")],
            [InlineKeyboardButton("📋 Audit Logs", callback_data="adm_audit_logs")],
            [InlineKeyboardButton("🏠 User Main Menu", callback_data="menu_start")]
        ]
    return InlineKeyboardMarkup(keyboard)

# ==================== HELPERS ====================

def get_start_text(user_first_name: str, user_bot_count: int, max_bots: int, is_premium: bool, credits: float, expiry_str: str = "") -> str:
    plan_name = f"Premium VIP (Infinity Host){expiry_str}" if is_premium else f"Free Member (Max Bots: {max_bots})"
    return (
        f"✨ **EXCLUSIVE ROLAX HOSTING V2** ✨\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"👋 Hello **{user_first_name}**, Welcome!\n\n"
        f"⚡ Here you can host and manage your Python and Node.js bots 24/7 without interruption.\n\n"
        f"📊 **Account Summary:**\n"
        f"• **Status:** `{plan_name}`\n"
        f"• **Credits:** `{round(credits, 2)} Credits` (1 Credit = 1 Bot Slot)\n"
        f"• **Active Bots:** `{user_bot_count} / {max_bots}`\n"
        f"• **Support:** `{OWNER_USERNAME}`\n\n"
        f"👇 Select an option using the interactive buttons below:\n\n"
        f"v{VERSION}" + ((" · @" + BOT_USERNAME) if BOT_USERNAME else "")
    )

def register_user(user, referrer_id: Optional[str] = None) -> dict:
    users = get_users()
    uid = str(user.id)
    config = get_config()
    ref_reward = config.get("referral_reward", 0.25)

    if uid not in users:
        users[uid] = {
            "username": user.username or "N/A",
            "name": user.first_name,
            "joined": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "banned": False,
            "restricted": False,
            "premium": False,
            "premium_expiry": None,
            "crash_alerts": True,
            "autofix": True,
            "referred_by": None,
            "credits": 1.0
        }
        if referrer_id and referrer_id != uid and referrer_id in users:
            referred_user_data = users[uid]
            if not referred_user_data.get("referred_by_checked"):
                users[uid]["referred_by"] = referrer_id
                users[uid]["referred_by_checked"] = True
                users[referrer_id]["credits"] = users[referrer_id].get("credits", 1.0) + ref_reward
                log_session_action(int(referrer_id), users[referrer_id].get("username", "N/A"), f"Received referral bonus (+{ref_reward}) from User {uid}")
        log_session_action(user.id, user.username or "N/A", "New User Registered")
    else:
        users[uid]["username"] = user.username or "N/A"
        users[uid]["name"] = user.first_name
        if "credits" not in users[uid]:
            users[uid]["credits"] = 1.0
        if "restricted" not in users[uid]:
            users[uid]["restricted"] = False
        if "premium_expiry" not in users[uid]:
            users[uid]["premium_expiry"] = None
        log_session_action(user.id, user.username or "N/A", "User Session Started / /start")

    save_users(users)
    return users[uid]

def get_user_max_bots(user_id: int) -> int:
    users = get_users()
    u_data = users.get(str(user_id), {})
    if u_data.get("premium", False):
        return 999999
    credits = u_data.get("credits", 1.0)
    return max(1, int(credits))

# ==================== COMMAND HANDLERS ====================

# =====================================================================
#  ##  /START HANDLER  ##   <-- yahi hai /start ka handler
#      Function : start_command()   (neeche)
#      Register : CommandHandler("start", start_command)
#                 -> main() ke andar "HANDLER REGISTRATION" section me
# =====================================================================
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    clear_user_flow(context)
    args = context.args
    referrer_id = args[0] if args and args[0].isdigit() else None

    u_data = register_user(user, referrer_id)

    if u_data.get("banned", False):
        await safe_reply(update.message, "Access Denied: You are banned from using this hosting bot.")
        return

    if u_data.get("restricted", False):
        await safe_reply(update.message, "⚠️ **Account Restricted:** Your hosting capabilities have been restricted by the administrator.")
        return

    if not await check_force_join(user.id, context.bot):
        buttons = []
        for ch in get_force_join():
            try:
                raw = str(ch).strip()
                chat_id = int(raw) if raw.lstrip("-").isdigit() else raw
                chat = await context.bot.get_chat(chat_id)
                if getattr(chat, "username", None):
                    buttons.append([InlineKeyboardButton(f"📢 Join {getattr(chat, 'title', None) or chat.username}", url=f"https://t.me/{chat.username}")])
            except Exception:
                logger.warning("Unable to resolve join URL for force-join channel %s", ch)
        if not buttons:
            buttons.append([InlineKeyboardButton("📢 Join Official Channel", url=OFFICIAL_CHANNEL_URL)])
        buttons.append([InlineKeyboardButton("🔄 Verify Membership", callback_data="menu_start")])
        await safe_reply(update.message,
            "Force Join Required\n\nPlease join BOTH required channels to use bot hosting features. If a channel is private, ask the admin for its invite link. Then tap Verify Membership.",
            reply_markup=InlineKeyboardMarkup(buttons)
        )
        return

    config = get_config()
    if config.get("bot_status") == "OFF" and not is_admin(user.id):
        await safe_reply(update.message, "EXCLUSIVE ROLAX HOSTING V2 is currently offline for maintenance by @Rolax112.")
        return

    if config.get("maintenance_mode", False) and not is_admin(user.id):
        await safe_reply(update.message, "System is undergoing scheduled maintenance. Please check back shortly.")
        return

    bots = get_bots()
    user_bot_count = sum(1 for b in bots.values() if b.get("owner_id") == user.id)
    max_bots = get_user_max_bots(user.id)
    is_prem = u_data.get("premium", False)
    credits = u_data.get("credits", 1.0)

    expiry_str = ""
    if is_prem and u_data.get("premium_expiry"):
        rem_secs = u_data["premium_expiry"] - time.time()
        if rem_secs > 0:
            days = int(rem_secs // 86400)
            hours = int((rem_secs % 86400) // 3600)
            expiry_str = f" (Expires in {days}d {hours}h)"

    await safe_reply(update.message,
        get_start_text(user.first_name, user_bot_count, max_bots, is_prem, credits, expiry_str),
        parse_mode="Markdown",
        reply_markup=main_menu_keyboard()
    )

async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Escape hatch: /back, /home, /cancel always return home, even if a
    button did not work or a text flow was half-finished.

    NOTE: menu wali slash-command hata di gayi hai (user request) -
    uski jagah /back aur /start hain, aur back button har screen pe chalta hai."""
    clear_user_flow(context)
    if update.callback_query:
        await render_main_menu(update.callback_query, update.effective_user, context)
        return
    await start_command(update, context)


async def redeem_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    args = context.args
    if not args:
        await safe_reply(update.message, "Usage: /redeem <code>")
        return

    code = args[0].strip()
    codes = get_redeem_codes()
    users = get_users()
    uid = str(user.id)

    # FIX: /redeem before /start raised KeyError(users[uid]) and crashed.
    if uid not in users:
        users[uid] = {
            "username": user.username or "N/A",
            "name": user.first_name or "N/A",
            "joined": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "banned": False, "restricted": False, "premium": False,
            "premium_expiry": None, "crash_alerts": True, "autofix": True,
            "referred_by": None, "credits": 1.0
        }
        save_users(users)

    if code not in codes:
        await safe_reply(update.message, "Invalid or expired redeem code.")
        return

    cinfo = codes[code]
    if cinfo.get("used", False):
        await safe_reply(update.message, "This redeem code has already been used or expired.")
        return

    max_limit = cinfo.get("max_uses", 1)
    redeemed_list = cinfo.get("redeemed_by_users", [])
    if uid in redeemed_list:
        await safe_reply(update.message, "You have already used this redeem code!")
        return

    if len(redeemed_list) >= max_limit:
        cinfo["used"] = True
        save_redeem_codes(codes)
        await safe_reply(update.message, "This redeem code has reached its maximum usage limit.")
        return

    if cinfo.get("expiry_time") and time.time() >= cinfo["expiry_time"]:
        cinfo["used"] = True
        save_redeem_codes(codes)
        await safe_reply(update.message, "This redeem code has expired.")
        return

    reward_credits = cinfo["credits"]
    users[uid]["credits"] = users[uid].get("credits", 1.0) + reward_credits

    redeemed_list.append(uid)
    cinfo["redeemed_by_users"] = redeemed_list
    if len(redeemed_list) >= max_limit:
        cinfo["used"] = True

    save_users(users)
    save_redeem_codes(codes)

    log_audit_action(f"User {user.id} redeemed code {code} for {reward_credits} credits", user.id)
    log_session_action(user.id, user.username or "N/A", f"Redeemed code {code} for {reward_credits} credits")
    await safe_reply(update.message, f"Redeem Successful!\n\nAdded +{reward_credits} Credits to your account wallet. Enjoy hosting!")

async def admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not is_admin(user.id):
        await safe_reply(update.message, "You are not authorized to use the admin panel.")
        return

    users = get_users()
    bots = get_bots()
    config = get_config()

    vps_mem = psutil.virtual_memory()
    vps_cpu = psutil.cpu_percent(interval=None)

    role_title = "SUPER ADMIN" if int(user.id) == int(ADMIN_ID) else "SUB-ADMIN"

    text = (
        f"EXCLUSIVE ROLAX {role_title} CONTROL CENTER v{VERSION}\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"Administrator: @{user.username or user.id} (ID: {user.id})\n"
        f"Registered Users: {len(users)}\n"
        f"Total Deployed Bots: {len(bots)}\n"
        f"Active Running Bots: {sum(1 for b in bots.values() if b.get('status') == 'RUNNING')}\n"
        f"Referral Reward Rate: {config.get('referral_reward', 0.25)} Credits\n"
        f"Core System Status: {config.get('bot_status', 'ON')}\n\n"
        f"Dedicated Server Metrics:\n"
        f"RAM Utilization: {round(vps_mem.used / (1024**3), 2)} GB / {round(vps_mem.total / (1024**3), 2)} GB ({vps_mem.percent}%)\n"
        f"CPU Load Average: {vps_cpu}%"
    )

    if update.message:
        await safe_reply(update.message, text, reply_markup=admin_panel_keyboard(user.id))
    elif update.callback_query:
        await safe_edit(update.callback_query, text, reply_markup=admin_panel_keyboard(user.id))

async def add_admin_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if int(user.id) != int(ADMIN_ID):
        await safe_reply(update.message, "Only Super Owner can add new admins.")
        return

    args = context.args
    if not args:
        await safe_reply(update.message, "Usage: /addadmin <user_chat_id>")
        return

    try:
        new_adm_id = int(args[0])
        admins = get_admins()
        if new_adm_id not in admins:
            admins.append(new_adm_id)
            save_admins(admins)
            log_audit_action(f"Added Sub-Admin via command: {new_adm_id}", user.id)
            await safe_reply(update.message, f"User {new_adm_id} has been successfully added as a Sub-Admin!")
            try:
                await context.bot.send_message(new_adm_id, "Congratulations!\nYou have been promoted to Sub-Admin by the owner. Send /admin to open your secured admin panel.")
            except Exception:
                pass
        else:
            await safe_reply(update.message, "This user is already an admin.")
    except ValueError:
        await safe_reply(update.message, "Invalid Chat ID. Provide numbers only.")

async def add_premium_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if not is_admin(user.id):
        return

    args = context.args
    if len(args) < 2:
        await safe_reply(update.message, "Usage: /addpremium <user_chat_id> <days>\nExample: /addpremium 8472327599 30")
        return

    try:
        target_uid = str(int(args[0]))
        days = int(args[1])
        users = get_users()

        if target_uid in users:
            expiry_timestamp = time.time() + (days * 86400)
            users[target_uid]["premium"] = True
            users[target_uid]["premium_expiry"] = expiry_timestamp
            save_users(users)

            log_audit_action(f"Granted Premium VIP status to User ID {target_uid} for {days} days", user.id)
            await safe_reply(update.message, f"Success! User {target_uid} has been upgraded to Premium VIP for {days} Days.")
            try:
                await context.bot.send_message(int(target_uid), f"Congratulations!\nYou have been upgraded to Premium VIP for {days} Days by Admin! 🚀")
            except Exception:
                pass
        else:
            await safe_reply(update.message, "User ID not found in database.")
    except ValueError:
        await safe_reply(update.message, "Invalid format. Provide numbers only for User ID and Days.")

# ==================== CALLBACK ROUTER ====================

async def _route_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Actual routing. Returns True when the callback should be re-routed
    (e.g. after restart/stop the control screen must be redrawn)."""
    query = update.callback_query
    user = query.from_user
    data = query.data

    log_button_click(user.id, user.username or "N/A", data)

    users = get_users()
    u_data = users.get(str(user.id), {})

    if u_data.get("banned", False):
        await safe_answer(query, "Access Denied: You are banned.", show_alert=True)
        return

    if u_data.get("restricted", False):
        await safe_answer(query, "Access Denied: Your account is restricted.", show_alert=True)
        return

    if not await check_force_join(user.id, context.bot) and data != "menu_start":
        await safe_answer(query, "Please join our official channel first!", show_alert=True)
        return

    config = get_config()
    nav_only = data in ("menu_start", "adm_back")
    if config.get("bot_status") == "OFF" and not is_admin(user.id) and not nav_only:
        await safe_answer(query, "Bot is currently offline.", show_alert=True)
        return

    if config.get("maintenance_mode", False) and not is_admin(user.id) and not nav_only:
        await safe_answer(query, "System is under maintenance mode.", show_alert=True)
        return

    # BACK BUTTON FIX: a button press always ends any "type something" flow,
    # so Back can never leave the bot stuck in the previous screen's mode.
    clear_user_flow(context)

    if data == "menu_start":
        if not await check_force_join(user.id, context.bot):
            buttons = []
            for ch in get_force_join():
                try:
                    raw = str(ch).strip()
                    chat_id = int(raw) if raw.lstrip("-").isdigit() else raw
                    chat = await context.bot.get_chat(chat_id)
                    if getattr(chat, "username", None):
                        buttons.append([InlineKeyboardButton(f"📢 Join {getattr(chat, 'title', None) or chat.username}", url=f"https://t.me/{chat.username}")])
                except Exception:
                    logger.warning("Unable to resolve join URL for force-join channel %s", ch)
            if not buttons:
                buttons.append([InlineKeyboardButton("📢 Join Official Channel", url=OFFICIAL_CHANNEL_URL)])
            buttons.append([InlineKeyboardButton("🔄 Verify Membership", callback_data="menu_start")])
            await safe_edit(query,
                "Force Join Required\n\nPlease join BOTH required channels to proceed. If a channel is private, ask the admin for its invite link. Then tap Verify Membership.",
                reply_markup=InlineKeyboardMarkup(buttons)
            )
            return
        bots = get_bots()
        user_bot_count = sum(1 for b in bots.values() if b.get("owner_id") == user.id)
        max_bots = get_user_max_bots(user.id)
        is_prem = u_data.get("premium", False)
        credits = u_data.get("credits", 1.0)

        expiry_str = ""
        if is_prem and u_data.get("premium_expiry"):
            rem_secs = u_data["premium_expiry"] - time.time()
            if rem_secs > 0:
                days = int(rem_secs // 86400)
                hours = int((rem_secs % 86400) // 3600)
                expiry_str = f" (Expires in {days}d {hours}h)"

        log_session_action(user.id, user.username or "N/A", "Navigated to Main Menu")
        await safe_edit(query, get_start_text(user.first_name, user_bot_count, max_bots, is_prem, credits, expiry_str), parse_mode="Markdown", reply_markup=main_menu_keyboard())

    elif data == "menu_referral":
        bot_username = context.bot.username
        ref_link = f"https://t.me/{bot_username}?start={user.id}"
        config = get_config()
        ref_reward = config.get("referral_reward", 0.25)
        credits = u_data.get("credits", 1.0)

        referred_count = sum(1 for u in users.values() if str(u.get("referred_by")) == str(user.id))

        text = (
            f"🎁 **Refer & Earn Credits**\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"🔗 Your Unique Referral Link:\n`{ref_link}`\n\n"
            f"📌 **Rule:** For every 1 successful invite you get **+{ref_reward} Credits**!\n"
            f"👥 **Total Referred Users:** `{referred_count}`\n"
            f"💡 **1 Credit** = **1 Bot Host Slot**\n\n"
            f"📊 **Your Wallet:** `{round(credits, 2)} Credits`\n\n"
            f"Share the link with your friends and expand your free hosting slots!"
        )
        keyboard = [
            [InlineKeyboardButton("📤 Share Link", url=f"https://t.me/share/url?url={ref_link}&text=🚀%20Host%20your%20Python%20and%20Node.js%20bots%2024/7%20for%20FREE%20on%20Exclusive%20Rolax%20Hosting!")],
            [InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]
        ]
        log_session_action(user.id, user.username or "N/A", "Opened Referral Menu")
        await safe_edit(query, text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup(keyboard))

    elif data == "menu_redeem_prompt":
        context.user_data["expecting_redeem_code"] = True
        await safe_edit(query,
            "🎟️ Redeem Gift Code\n\nPlease send your redeem code in chat (e.g. ROLAX2026):",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="menu_start")]])
        )

    elif data == "menu_host":
        text = f"🚀 Deploy New Script\n\nChoose your preferred deployment vector below:\n\nPowered by {OWNER_USERNAME}"
        await safe_edit(query, text, reply_markup=host_options_keyboard())

    elif data in ["upload_py", "upload_js"]:
        ext = ".py" if data == "upload_py" else ".js"
        context.user_data["expecting_file_type"] = ext
        await safe_edit(query,
            f"📤 Please upload your {ext} script file as a document attachment.\n\n{OWNER_USERNAME}",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="menu_host")]])
        )

    elif data == "upload_github":
        context.user_data["expecting_github"] = True
        await safe_edit(query,
            f"🐙 Send your public GitHub Repository Clone URL (e.g., https://github.com/user/repo):\n\n{OWNER_USERNAME}",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="menu_host")]])
        )

    elif data == "menu_mybots":
        bots = get_bots()
        user_bots = {bid: b for bid, b in bots.items() if b.get("owner_id") == user.id}
        total = len(user_bots)
        running = sum(1 for b in user_bots.values() if b.get("status") == "RUNNING")
        stopped = total - running

        if total == 0:
            text = (
                f"🤖 Your Hosted Applications\n"
                f"━━━━━━━━━━━━━━━━━━━━━━\n"
                f"No active deployments found.\n\n"
                f"Click \"Host New Bot\" to upload your source code or link a GitHub repository!\n\n"
                f"{OWNER_USERNAME}"
            )
            keyboard = [
                [InlineKeyboardButton("🚀 Host New Bot", callback_data="menu_host")],
                [InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]
            ]
        else:
            text = (
                f"🤖 Active Bots Fleet Management\n"
                f"Total Deployed: {total} | Running: {running} | Stopped: {stopped}\n\n"
                f"Select an application to access controls:\n\n"
                f"{OWNER_USERNAME}"
            )
            keyboard = []
            for bid, binfo in user_bots.items():
                status_icon = "🟢" if binfo.get("status") == "RUNNING" else "🔴"
                keyboard.append([InlineKeyboardButton(f"🤖 {binfo['name']} [{binfo.get('runtime', 'python')}] {status_icon}", callback_data=f"bot_control_{bid}")])

            keyboard.append([InlineKeyboardButton("🚀 Host New Bot", callback_data="menu_host")])
            keyboard.append([InlineKeyboardButton("📊 Dashboard", callback_data="menu_dashboard"), InlineKeyboardButton("🔙 Main Menu", callback_data="menu_start")])

        log_session_action(user.id, user.username or "N/A", "Viewed My Bots Fleet")
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup(keyboard))

    elif data.startswith("bot_control_"):
        bot_id = data.split("_")[2]
        bots = get_bots()
        binfo = bots.get(bot_id)

        if not binfo or binfo.get("owner_id") != user.id:
            # BACK BUTTON FIX: a deleted bot left a dead screen with dead buttons.
            await safe_answer(query, "This bot no longer exists. Opening your fleet...", show_alert=True)
            query.data = "menu_mybots"
            return True
            return

        status = binfo.get("status", "STOPPED")
        status_text = "RUNNING 🟢" if status == "RUNNING" else "STOPPED 🔴"

        uptime_str = "0m"
        if status == "RUNNING" and binfo.get("start_time"):
            elapsed = int(time.time() - binfo["start_time"])
            mins, secs = divmod(elapsed, 60)
            hours, mins = divmod(mins, 60)
            uptime_str = f"{hours}h {mins}m {secs}s" if hours else f"{mins}m {secs}s"

        autofix_state = "ON 🟢" if binfo.get("autofix", True) else "OFF 🔴"

        text = (
            f"⚡ Application Control Terminal\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Name: {binfo['name']}\n"
            f"Instance ID: #{bot_id}\n"
            f"Operational State: {status_text}\n"
            f"Uptime Session: {uptime_str}\n"
            f"Runtime Engine: {binfo.get('runtime', 'python')}\n"
            f"Vector Source: {binfo.get('source', 'upload')}\n"
            f"Deployment Date: {binfo.get('deployed', 'N/A')}\n\n"
            f"Select management tool below:"
        )

        keyboard = [
            [InlineKeyboardButton("🔄 Restart Instance", callback_data=f"bot_act_restart_{bot_id}"), InlineKeyboardButton("⏹️ Terminate", callback_data=f"bot_act_stop_{bot_id}")],
            [InlineKeyboardButton("🔑 Environment Variables (.env)", callback_data=f"bot_act_env_{bot_id}"), InlineKeyboardButton("📜 Live Stdout Logs", callback_data=f"bot_act_logs_{bot_id}")],
            [InlineKeyboardButton("📊 Telemetry Stats", callback_data=f"bot_act_stats_{bot_id}"), InlineKeyboardButton(f"🤖 Auto-Fixer: {autofix_state}", callback_data=f"bot_act_autofix_{bot_id}")],
            [InlineKeyboardButton("📁 Project Files", callback_data=f"bot_act_files_{bot_id}"), InlineKeyboardButton("💾 Backup Source", callback_data="menu_backup")],
            [InlineKeyboardButton("🗑️ Purge & Delete", callback_data=f"bot_act_delete_{bot_id}")],
            [InlineKeyboardButton("🔙 Back to Fleet", callback_data="menu_mybots")]
        ]

        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup(keyboard))

    elif data.startswith("bot_act_"):
        parts = data.split("_")
        action = parts[2]
        bot_id = parts[3]
        bots = get_bots()
        binfo = bots.get(bot_id)

        if not binfo or binfo.get("owner_id") != user.id:
            await safe_answer(query, "This bot no longer exists. Opening your fleet...", show_alert=True)
            query.data = "menu_mybots"
            return True
            return

        if action == "restart":
            start_bot_process(bot_id)
            log_session_action(user.id, user.username or "N/A", f"Restarted Bot #{bot_id}")
            await safe_answer(query, "Application successfully restarted!", show_alert=True)
            query.data = f"bot_control_{bot_id}"
            return True

        elif action == "stop":
            stop_bot_process(bot_id)
            log_session_action(user.id, user.username or "N/A", f"Stopped Bot #{bot_id}")
            await safe_answer(query, "Application stopped.", show_alert=True)
            query.data = f"bot_control_{bot_id}"
            return True

        elif action == "delete":
            stop_bot_process(bot_id)
            if os.path.exists(binfo["path"]):
                try:
                    os.remove(binfo["path"])
                except Exception:
                    pass
            del bots[bot_id]
            save_bots(bots)
            log_session_action(user.id, user.username or "N/A", f"Deleted Bot #{bot_id}")
            await safe_answer(query, "Application purged completely.", show_alert=True)
            query.data = "menu_mybots"
            return True

        elif action == "stats":
            cpu, ram = get_bot_resource_usage(bot_id)
            await safe_answer(query, f"Real-time Metrics:\nCPU Load: {cpu}%\nRAM Consumption: {ram} MB", show_alert=True)

        elif action == "logs":
            log_path = os.path.join(LOGS_DIR, f"bot_{bot_id}.log")
            if os.path.exists(log_path):
                with open(log_path, "r", encoding="utf-8", errors="ignore") as lf:
                    lines = lf.readlines()[-20:]
                log_content = "".join(lines) or "Log buffer empty."
            else:
                log_content = "No logs recorded yet."
            await safe_edit(query,
                f"📜 Live Console Output (Last 20 Lines):\n\n{log_content[-3500:]}",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back to Instance", callback_data=f"bot_control_{bot_id}")]])
            )

        elif action == "env":
            context.user_data["editing_env_bot"] = bot_id
            env_path = os.path.join(os.path.dirname(binfo["path"]), ".env")
            curr_env = "None"
            if os.path.exists(env_path):
                with open(env_path, "r", encoding="utf-8") as ef:
                    curr_env = ef.read()
            await safe_edit(query,
                f"🔑 Environment Configuration (.env)\n\nCurrent Variables:\n{curr_env}\n\nSend new variable in format KEY=VALUE:",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data=f"bot_control_{bot_id}")]])
            )

        elif action == "autofix":
            binfo["autofix"] = not binfo.get("autofix", True)
            save_bots(bots)
            state_str = "ENABLED 🟢" if binfo["autofix"] else "DISABLED 🔴"
            await safe_answer(query, f"Auto-Fix guardian set to {state_str}", show_alert=True)
            query.data = f"bot_control_{bot_id}"
            return True

        elif action == "files":
            bot_dir = os.path.dirname(binfo["path"])
            files_list = os.listdir(bot_dir) if os.path.exists(bot_dir) else []
            f_str = "\n".join([f"📄 {f}" for f in files_list]) or "No additional files."
            await safe_edit(query,
                f"📁 Directory File Explorer (#{bot_id}):\n\n{f_str}",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back to Instance", callback_data=f"bot_control_{bot_id}")]])
            )

    elif data == "menu_files":
        bots = get_bots()
        user_bots = {bid: b for bid, b in bots.items() if b.get("owner_id") == user.id}
        if not user_bots:
            await safe_edit(query, "📁 File Manager\n\nYou have no hosted projects.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="menu_start")]]))
            return

        kb = [[InlineKeyboardButton(f"📁 Files: {b['name']}", callback_data=f"bot_act_files_{bid}")] for bid, b in user_bots.items()]
        kb.append([InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")])
        await safe_edit(query, "📁 Project File Manager\n\nSelect a deployed bot workspace:", reply_markup=InlineKeyboardMarkup(kb))

    elif data == "menu_settings":
        u_info = users.get(str(user.id), {})
        ca = "ON 🟢" if u_info.get("crash_alerts", True) else "OFF 🔴"
        af = "ON 🟢" if u_info.get("autofix", True) else "OFF 🔴"

        text = f"⚙️ User Preferences & Controls\n\n🔔 Crash Notification Alerts: {ca}\n🤖 Auto-Fix Guardian: {af}"
        keyboard = [
            [InlineKeyboardButton(f"🔔 Crash Alerts: {ca}", callback_data="toggle_setting_ca")],
            [InlineKeyboardButton(f"🤖 Auto-Fix: {af}", callback_data="toggle_setting_af")],
            [InlineKeyboardButton("👤 View My Profile", callback_data="menu_account")],
            [InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]
        ]
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup(keyboard))

    elif data.startswith("toggle_setting_"):
        stype = data.split("_")[2]
        u_info = users.get(str(user.id), {})
        if stype == "ca":
            u_info["crash_alerts"] = not u_info.get("crash_alerts", True)
        elif stype == "af":
            u_info["autofix"] = not u_info.get("autofix", True)
        save_users(users)
        query.data = "menu_settings"
        return True

    elif data == "menu_account":
        bots = get_bots()
        user_bots_count = sum(1 for b in bots.values() if b.get("owner_id") == user.id)
        max_bots = get_user_max_bots(user.id)
        is_prem = u_data.get("premium", False)
        plan_str = "Premium VIP (Infinity Host)" if is_prem else f"Free Member (Max Bots: {max_bots})"
        credits = u_data.get("credits", 1.0)
        cfg = get_config()
        text = (
            f"👤 Account Profile Matrix\n\n"
            f"🆔 Telegram Chat ID: {user.id}\n"
            f"🏷️ Username: @{user.username or 'N/A'}\n"
            f"💎 Current Membership: {plan_str}\n"
            f"💰 Wallet Credits: {round(credits, 2)} Credits\n\n"
            f"📊 Resource Quota Allocations:\n"
            f"🤖 Deployed Instances: {user_bots_count} / {max_bots}\n"
            f"⚡ CPU Limit Per Core: {cfg.get('default_cpu_limit', 8.0)}\n"
            f"🧠 RAM Limit Cap: {cfg.get('default_ram_limit', 8192)} MB\n"
            f"💾 Cloud Backups: Enabled ✅\n"
            f"🤖 Auto-Fix Engine: Enabled ✅"
        )
        keyboard = [
            [InlineKeyboardButton("🎁 Refer & Earn", callback_data="menu_referral"), InlineKeyboardButton("🎟️ Redeem Code", callback_data="menu_redeem_prompt")],
            [InlineKeyboardButton("🤖 My Fleet", callback_data="menu_mybots"), InlineKeyboardButton("📊 Dashboard", callback_data="menu_dashboard")],
            [InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]
        ]
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup(keyboard))

    elif data == "menu_dashboard":
        bots = get_bots()
        user_bots = {bid: b for bid, b in bots.items() if b.get("owner_id") == user.id}
        running_cnt = sum(1 for b in user_bots.values() if b.get("status") == "RUNNING")
        stopped_cnt = len(user_bots) - running_cnt

        tot_cpu, tot_ram = 0.0, 0.0
        bots_info_str = ""

        for bid, binfo in user_bots.items():
            cpu, ram = get_bot_resource_usage(bid)
            tot_cpu += cpu
            tot_ram += ram
            status_desc = f"CPU: {cpu}% | RAM: {ram} MB | State: " + ("Running 🟢" if binfo.get("status") == "RUNNING" else "Stopped 🔴")
            bots_info_str += f"\n\n🤖 {binfo['name']} (#{bid})\n└ {status_desc}"

        if not user_bots:
            bots_info_str = "\n\nHosted Applications: None"

        is_prem = u_data.get("premium", False)
        plan_str = "Premium VIP" if is_prem else "Free Member"
        text = (
            f"📊 Live Telemetry Dashboard\n\n"
            f"💎 Plan Tier: {plan_str} | Bots: {len(user_bots)}\n"
            f"🟢 Active: {running_cnt} | 🔴 Inactive: {stopped_cnt}\n"
            f"⚡ Aggregate CPU Utilization: {round(tot_cpu, 1)}%\n"
            f"🧠 Aggregate RAM Consumption: {round(tot_ram, 1)} MB"
            f"{bots_info_str}"
        )
        keyboard = [[InlineKeyboardButton("🔙 Back to Main Menu", callback_data="menu_start")]]
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup(keyboard))

    elif data == "menu_backup":
        user_dir = os.path.join(HOSTED_DIR, str(user.id))
        if not os.path.exists(user_dir) or not os.listdir(user_dir):
            await safe_answer(query, "No workspace files found to archive.", show_alert=True)
            return

        zip_path = os.path.join(BASE_DIR, f"backup_{user.id}")
        archive_file = shutil.make_archive(zip_path, 'zip', user_dir)

        with open(archive_file, 'rb') as f:
            await context.bot.send_document(
                chat_id=user.id,
                document=f,
                filename=f"ROLAX_WORKSPACE_BACKUP_{user.id}.zip",
                caption="💾 Here is your secure project source archive backup.",
                reply_markup=main_menu_kb()
            )
        if os.path.exists(archive_file):
            os.remove(archive_file)
        await safe_answer(query, "Backup archive dispatched to chat!", show_alert=True)

    # ==================== ADMIN ACTIONS ====================

    elif data == "adm_all_admins" and is_admin(user.id):
        admins = get_admins()
        admin_lines = []
        for aid in admins:
            role = "👑 Super Owner" if aid == ADMIN_ID else "🛡️ Sub-Admin"
            admin_lines.append(f"• ID: `{aid}` | {role}")
        text = "👑 ALL ADMINS LIST:\n\n" + ("\n".join(admin_lines) if admin_lines else "No admins found.")
        await safe_edit(query, text, parse_mode="Markdown", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_changelogs" and is_admin(user.id):
        changelog_text = (
            "📝 ADMIN PANEL CHANGELOGS & UPDATES (v3.19):\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            "• Back button fully rebuilt: every screen (including Ban/Unban, backups,\n"
            "  old messages and deleted bots) now returns correctly.\n"
            "• Back / any button now cancels a half-typed input (redeem, .env, admin\n"
            "  prompts) - earlier the bot stayed stuck in the old screen's mode.\n"
            "• Unmatched or expired buttons open the main menu instead of doing nothing.\n"
            "• /back, /cancel commands added as a universal escape hatch.\n"
            "• Force-join no longer locks everyone out when a channel is unverifiable.\n"
            "• Double-answer + 'message not modified' crashes fixed (safe_answer/safe_edit).\n"
            "• Bot IDs no longer collide; crash counter resets after stable uptime.\n"
            "• .env now really reaches hosted bots; child processes are killed on stop.\n"
            "• Atomic JSON saves, atomic module installs, admin-only approve/reject."
        )
        await safe_edit(query, changelog_text, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_user_clicks" and is_admin(user.id):
        click_content = "No button clicks recorded yet."
        if os.path.exists(BUTTON_CLICK_LOG_FILE):
            with open(BUTTON_CLICK_LOG_FILE, "r", encoding="utf-8") as f:
                click_content = f.read()[-3500:]
        await safe_edit(query,
            f"👆 User Button Activity Logs:\n\n{click_content}",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_top_users" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        users = get_users()
        sorted_users = sorted(users.items(), key=lambda x: x[1].get("credits", 1.0), reverse=True)
        top_lines = []
        for rank, (uid, uinfo) in enumerate(sorted_users[:15], start=1):
            name = uinfo.get("name", "N/A")
            username = uinfo.get("username", "N/A")
            credits = round(uinfo.get("credits", 1.0), 2)
            top_lines.append(f"{rank}. {name} (@{username}) | ID: {uid} | 💰 {credits} Credits")
        text = "🏆 TOP USERS LEADERBOARD (By Credits):\n\n" + ("\n".join(top_lines) if top_lines else "No users found.")
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_user_analytics" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        users = get_users()
        bots = get_bots()
        lines = []
        for uid, uinfo in list(users.items())[:20]:
            ubot_cnt = sum(1 for b in bots.values() if b.get("owner_id") == int(uid))
            joined_date = uinfo.get("joined", "N/A")
            credits = round(uinfo.get("credits", 1.0), 2)
            lines.append(f"📈 @{uinfo.get('username', 'N/A')}\n   └ ID: {uid} | Bots: {ubot_cnt} | Credits: {credits} | Joined: {joined_date}")
        text = "📈 USER ACTIVITY ANALYTICS & CHAT IDs:\n\n" + ("\n\n".join(lines) if lines else "No analytics data.")
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_dm_user" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_dm_user"] = True
        await safe_edit(query,
            "✉️ Direct Message User\n\nSend format: USER_ID MESSAGE\nExample: 8472327599 Hello, your bot is running fine!",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_toggle_reminder" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        cfg = get_config()
        cfg["daily_reminder_active"] = not cfg.get("daily_reminder_active", True)
        save_config(cfg)
        status_msg = "ENABLED 🟢" if cfg["daily_reminder_active"] else "DISABLED 🔴"
        log_audit_action(f"Toggled Daily Reminder to {status_msg}", user.id)
        await safe_answer(query, f"Daily Reminder is now {status_msg}", show_alert=True)
        await admin_command(update, context)

    elif data == "adm_toggle_status" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        cfg = get_config()
        cfg["bot_status"] = "OFF" if cfg.get("bot_status") == "ON" else "ON"
        save_config(cfg)
        log_audit_action(f"Toggled Bot System Status to {cfg['bot_status']}", user.id)
        await safe_answer(query, f"System Status updated to {cfg['bot_status']}", show_alert=True)
        await admin_command(update, context)

    elif data == "adm_toggle_maint" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        cfg = get_config()
        cfg["maintenance_mode"] = not cfg.get("maintenance_mode", False)
        save_config(cfg)
        state_text = "ENABLED" if cfg["maintenance_mode"] else "DISABLED"
        log_audit_action(f"Toggled Maintenance Mode to {state_text}", user.id)
        await safe_answer(query, f"Maintenance Mode is now {state_text}", show_alert=True)
        await admin_command(update, context)

    elif data == "adm_add_credit" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_add_credit"] = True
        await safe_edit(query,
            "➕ Add Credits to User / All\n\nFormat 1 (Particular User): USER_ID CREDITS\nFormat 2 (All Users): all CREDITS\n\nSend your command below:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_rem_credit" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_rem_credit"] = True
        await safe_edit(query,
            "➖ Remove Credits from User / All\n\nFormat 1: USER_ID CREDITS\nFormat 2: all CREDITS\n\nSend your command below:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_set_ref_reward" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_ref_reward"] = True
        cfg = get_config()
        await safe_edit(query,
            f"🎁 Set Referral Reward Credits\nCurrent reward per referral: {cfg.get('referral_reward', 0.25)}\n\nSend new numeric value:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_create_redeem" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_redeem_create"] = True
        await safe_edit(query,
            "🎟️ Create Redeem Code (With Max Users Limit)\n\n"
            "Format: CODE CREDITS DURATION_DAYS MAX_USERS\n"
            "Example: ROLAX30 5.0 30 100\n\n"
            "Send format below:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_download_backup" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        db_files = [USERS_FILE, BOTS_FILE, PENDING_FILE, CONFIG_FILE, ADMINS_FILE, FORCE_JOIN_FILE, REDEEM_FILE]
        zip_path = os.path.join(BASE_DIR, "db_backup_archive")
        temp_dir = os.path.join(BASE_DIR, "temp_db_backup")
        os.makedirs(temp_dir, exist_ok=True)
        for fpath in db_files:
            if os.path.exists(fpath):
                shutil.copy(fpath, temp_dir)
        archive_file = shutil.make_archive(zip_path, 'zip', temp_dir)
        shutil.rmtree(temp_dir)
        with open(archive_file, 'rb') as f:
            await context.bot.send_document(
                chat_id=user.id,
                document=f,
                filename="ROLAX_DATABASE_BACKUP.zip",
                caption="📥 Admin Database Backup File",
                reply_markup=admin_back_kb()
            )
        if os.path.exists(archive_file):
            os.remove(archive_file)
        log_audit_action("Downloaded Database Backup via Bot", user.id)
        await safe_answer(query, "Database backup sent to chat!", show_alert=True)

    elif data == "adm_restore_backup" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_db_restore"] = True
        await safe_edit(query,
            "📤 Restore Database Backup\n\nPlease send the .zip backup file containing your database JSON files as a document attachment:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_schedule_announcement" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_schedule_announcement"] = True
        await safe_edit(query,
            "⏰ Announcement Scheduler\n\nFormat: DELAY_MINUTES | MESSAGE\nSend announcement format below:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_session_logs" and is_admin(user.id):
        session_content = "No session logs recorded yet."
        if os.path.exists(SESSION_LOG_FILE):
            with open(SESSION_LOG_FILE, "r", encoding="utf-8") as f:
                session_content = f.read()[-3500:]
        await safe_edit(query,
            f"📋 User Activity Logs & Chat ID Session Manager:\n\n{session_content}",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]])
        )

    elif data == "adm_vps_monitor" and is_admin(user.id):
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        cpu = psutil.cpu_percent(interval=0.5)
        text = (
            f"💻 DEDICATED HARDWARE TELEMETRY\n\n"
            f"⚡ CPU Usage: {cpu}%\n"
            f"🧠 System RAM: {round(mem.used / (1024**3), 2)} GB / {round(mem.total / (1024**3), 2)} GB ({mem.percent}%)\n"
            f"💽 Disk Storage: {round(disk.used / (1024**3), 2)} GB / {round(disk.total / (1024**3), 2)} GB ({disk.percent}%)\n"
            f"⚙️ Active OS Processes: {len(psutil.pids())}"
        )
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔄 Refresh Metrics", callback_data="adm_vps_monitor"), InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_broadcast_media" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_media_broadcast"] = True
        await safe_edit(query, "🖼️ Media Broadcast Mode\nSend photo, video, or document with a caption to push broadcast to ALL registered users:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_broadcast" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_broadcast"] = True
        await safe_edit(query, "📢 Global Text Broadcast\nSend broadcast message text below:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_user_mgmt" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        await safe_edit(query,
            "👥 User Administration Suite\n\nSelect action or input parameters:",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🚫 Ban User", callback_data="adm_ban"), InlineKeyboardButton("✅ Unban User", callback_data="adm_unban")],
                [InlineKeyboardButton("🔒 Restrict User", callback_data="adm_restrict_user"), InlineKeyboardButton("🔓 Unrestrict User", callback_data="adm_unrestrict_user")],
                [InlineKeyboardButton("🛑 Stop Any Bot", callback_data="adm_stop_any_bot"), InlineKeyboardButton("🗑️ Delete Any Bot", callback_data="adm_del_any_bot")],
                [InlineKeyboardButton("👤 View Profile", callback_data="adm_view_user"), InlineKeyboardButton("💎 Grant Premium", callback_data="adm_give_premium")],
                [InlineKeyboardButton("❌ Remove Premium", callback_data="adm_rem_premium"), InlineKeyboardButton("📋 Users List", callback_data="adm_users_list")],
                [InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]
            ])
        )

    elif data == "adm_view_user" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_view_user"] = True
        await safe_edit(query, "👤 View User Profile\nSend User Chat ID below:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_give_premium" and is_admin(user.id):
        context.user_data["awaiting_give_prem"] = True
        await safe_edit(query, "💎 Grant Timed Premium VIP\nSend format: USER_ID DAYS\nExample: 8472327599 30", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_rem_premium" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_rem_prem"] = True
        await safe_edit(query, "❌ Remove Premium VIP\nSend User Chat ID below:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_restrict_user" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_restrict_id"] = True
        await safe_edit(query, "🔒 Restrict User Hosting & Bots\nSend User ID to restrict and shut down their bots:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_unrestrict_user" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_unrestrict_id"] = True
        await safe_edit(query, "🔓 Unrestrict User\nSend User ID to lift hosting restrictions:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_stop_any_bot" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_stop_bot_id"] = True
        await safe_edit(query, "🛑 Stop Any Hosted Bot\nSend the Bot ID (e.g. 101) to stop it immediately:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_del_any_bot" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_del_bot_id"] = True
        await safe_edit(query, "🗑️ Delete Any Hosted Bot & Files\nSend the Bot ID (e.g. 101) to delete it permanently:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_force_join" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        channels = get_force_join()
        ch_list = "\n".join([f"• {ch}" for ch in channels]) or "No channels configured."
        await safe_edit(query,
            f"📢 Force Join Configuration\n\nActive Channels:\n{ch_list}\n\nChoose an action:",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("➕ Add Channel", callback_data="adm_fj_add"), InlineKeyboardButton("➖ Remove Channel", callback_data="adm_fj_rem")],
                [InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]
            ])
        )

    elif data == "adm_fj_add" and is_admin(user.id):
        context.user_data["awaiting_fj_add"] = True
        await safe_edit(query, "➕ Send channel username or ID to add:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="adm_force_join")]]))

    elif data == "adm_fj_rem" and is_admin(user.id):
        context.user_data["awaiting_fj_rem"] = True
        await safe_edit(query, "➖ Send channel username or ID to remove:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back", callback_data="adm_force_join")]]))

    elif data == "adm_add_admin" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_add_admin"] = True
        await safe_edit(query, "➕ Add Sub-Administrator\nSend Chat ID of the user to grant safe sub-admin rights:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_remove_admin" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_remove_admin"] = True
        admins = get_admins()
        await safe_edit(query, f"➖ Revoke Admin\nCurrent Admins: {admins}\n\nSend Chat ID to remove:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_users_list" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        all_users = get_users()
        bots = get_bots()
        lines = []
        for uid, uinfo in all_users.items():
            ubot_cnt = sum(1 for b in bots.values() if b.get("owner_id") == int(uid))
            prem_tag = "💎" if uinfo.get("premium") else "🆓"
            restr_tag = " [RESTRICTED 🔒]" if uinfo.get("restricted") else ""
            lines.append(f"{prem_tag} @{uinfo.get('username', 'N/A')} | ID:{uid}{restr_tag} | Bots:{ubot_cnt} | Credits:{round(uinfo.get('credits', 1.0), 2)}")
        res_text = "👥 ALL REGISTERED USERS:\n\n" + ("\n".join(lines[:30]) if lines else "No registered users.")
        await safe_edit(query, res_text, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_all_files" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        bots = get_bots()
        if not bots:
            await safe_edit(query, "📁 Hosted Files Directory:\n\nNo files hosted.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))
            return
        kb = []
        for bid, b in bots.items():
            kb.append([
                InlineKeyboardButton(f"📥 Get: {b['name']} (#{bid})", callback_data=f"adm_get_file_{bid}"),
                InlineKeyboardButton("📁 Dir", callback_data=f"adm_files_bot_{bid}")
            ])
        kb.append([InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")])
        lines = [f"📄 #{bid} - {b['name']} | Owner: @{b.get('owner_username')} ({b.get('owner_id')})" for bid, b in bots.items()]
        text = "📁 All Hosted Files Directory:\n\n" + "\n".join(lines)
        await safe_edit(query, text, reply_markup=InlineKeyboardMarkup(kb))

    elif data.startswith("adm_get_file_") and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        bot_id = data.split("_")[3]
        bots = get_bots()
        binfo = bots.get(bot_id)
        if not binfo or not os.path.exists(binfo["path"]):
            await safe_answer(query, "File not found.", show_alert=True)
            return
        with open(binfo["path"], "rb") as f:
            await context.bot.send_document(
                chat_id=user.id,
                document=f,
                filename=os.path.basename(binfo["path"]),
                caption=f"📄 Hosted File Archive\nBot ID: #{bot_id}"
            )
        await safe_answer(query, "File sent!", show_alert=True)

    elif data.startswith("adm_files_bot_") and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        bot_id = data.split("_")[3]
        bots = get_bots()
        binfo = bots.get(bot_id)
        if not binfo:
            await safe_answer(query, "Bot not found.", show_alert=True)
            return
        bot_dir = os.path.dirname(binfo["path"])
        files_list = os.listdir(bot_dir) if os.path.exists(bot_dir) else []
        f_str = "\n".join([f"📄 {f}" for f in files_list]) or "No extra files."
        kb = [
            [InlineKeyboardButton("📥 Download Main File", callback_data=f"adm_get_file_{bot_id}")],
            [InlineKeyboardButton("⬅️ Back to Files Directory", callback_data="adm_all_files")]
        ]
        await safe_edit(query, f"📁 Bot #{bot_id} Workspace:\n{f_str}", reply_markup=InlineKeyboardMarkup(kb))

    elif data == "adm_audit_logs" and is_admin(user.id):
        log_content = "No logs recorded."
        if os.path.exists(AUDIT_LOG_FILE):
            with open(AUDIT_LOG_FILE, "r", encoding="utf-8") as f:
                log_content = f.read()[-3000:]
        await safe_edit(query, f"📋 Admin Audit Logs (Actions & Changes):\n\n{log_content}", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_db_query" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_db_query"] = True
        await safe_edit(query, "🔍 DB Query Handler\nType search keyword or user ID:", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_cloud_backup" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        zip_path = os.path.join(BASE_DIR, "system_cloud_backup")
        archive_file = shutil.make_archive(zip_path, 'zip', HOSTED_DIR)
        with open(archive_file, 'rb') as f:
            await context.bot.send_document(
                chat_id=user.id,
                document=f,
                filename="ROLAX_SYSTEM_CLOUD_BACKUP.zip",
                caption="☁️ Full system cloud archive backup generated successfully.",
                reply_markup=admin_back_kb()
            )
        if os.path.exists(archive_file):
            os.remove(archive_file)
        log_audit_action("Triggered 1-Click Cloud Backup", user.id)
        await safe_answer(query, "Full system backup dispatched!", show_alert=True)

    elif data == "adm_clean_cache" and is_admin(user.id):
        cleaned = 0
        for f in os.listdir(LOGS_DIR):
            fp = os.path.join(LOGS_DIR, f)
            if os.path.isfile(fp) and f.endswith(".log"):
                open(fp, 'w').close()
                cleaned += 1
        log_audit_action("Cleared System Cache & Log Files", user.id)
        await safe_answer(query, f"🧹 Cleaned {cleaned} cache log files!", show_alert=True)

    elif data == "adm_live_logs" and is_admin(user.id):
        all_logs = ""
        for f in os.listdir(LOGS_DIR)[:5]:
            fp = os.path.join(LOGS_DIR, f)
            if os.path.isfile(fp):
                with open(fp, 'r', encoding='utf-8', errors='ignore') as lf:
                    all_logs += f"\n--- {f} ---\n" + "".join(lf.readlines()[-5:])
        await safe_edit(query, f"📜 Live System Logs Viewer:\n\n{all_logs[-3500:] or 'No active logs.'}", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_resource_limits" and is_admin(user.id):
        context.user_data["awaiting_res_limit"] = True
        cfg = get_config()
        await safe_edit(query,
            f"⚡ RAM & CPU Limits Config\n\nCurrent Defaults:\nCPU Cores Limit: {cfg.get('default_cpu_limit', 8.0)}\nRAM Limit: {cfg.get('default_ram_limit', 8192)} MB\n\nTo update, send format: RAM_MB CPU_CORES:",
            reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_pending" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        pending = get_pending()
        if not pending:
            await safe_edit(query, "🔔 No pending approval requests.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))
            return
        for req_uid, path in list(pending.items()):
            kb = InlineKeyboardMarkup([[InlineKeyboardButton("✅ Approve", callback_data=f"approve_{req_uid}"), InlineKeyboardButton("❌ Reject", callback_data=f"reject_{req_uid}")]])
            await context.bot.send_message(user.id, f"🔔 Pending Request:\nUser ID: {req_uid}\nFile: {os.path.basename(path)}", reply_markup=kb)
        await context.bot.send_message(user.id, "⬆️ Approve or reject above.", reply_markup=admin_back_kb())

    elif data == "adm_stats" and is_admin(user.id):
        bots = get_bots()
        txt = f"📊 SYSTEM METRICS STATS:\n\nRegistered Users: {len(get_users())}\nTotal Hosted Bots: {len(bots)}\nRunning Processes: {sum(1 for b in bots.values() if b.get('status') == 'RUNNING')}\nPending Approvals: {len(get_pending())}"
        await safe_edit(query, txt, reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Admin Menu", callback_data="adm_back")]]))

    elif data == "adm_stop_all" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        for bid in list(get_bots().keys()):
            stop_bot_process(bid)
        log_audit_action("Stopped all running bot processes", user.id)
        await safe_answer(query, "All running bot instances terminated.", show_alert=True)

    elif data == "adm_restart_all" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        for bid in list(get_bots().keys()):
            start_bot_process(bid)
        log_audit_action("Restarted all registered processes", user.id)
        await safe_answer(query, "All bot instances restarted.", show_alert=True)

    elif data == "adm_ban" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_ban_id"] = True
        await safe_edit(query, "🚫 Ban User\n\nSend the User ID to ban:", reply_markup=admin_back_kb())

    elif data == "adm_unban" and is_admin(user.id):
        if int(user.id) != int(ADMIN_ID):
            await safe_answer(query, "Restricted to Super Owner.", show_alert=True)
            return
        context.user_data["awaiting_unban_id"] = True
        await safe_edit(query, "✅ Unban User\n\nSend the User ID to unban:", reply_markup=admin_back_kb())

    elif data == "adm_back" and is_admin(user.id):
        # Clear any pending admin input mode before returning to the menu.
        # FIX: the hard-coded list used wrong key names, so some input modes
        # (e.g. awaiting_stop_bot_id) stayed active after leaving the panel.
        for pending_key in [k for k in list(context.user_data) if str(k).startswith("awaiting_")]:
            context.user_data.pop(pending_key, None)
        await safe_answer(query)
        users = get_users()
        bots = get_bots()
        config = get_config()
        vps_mem = psutil.virtual_memory()
        vps_cpu = psutil.cpu_percent(interval=None)
        role_title = "SUPER ADMIN" if int(user.id) == int(ADMIN_ID) else "SUB-ADMIN"

        text = (
            f"EXCLUSIVE ROLAX {role_title} CONTROL CENTER v{VERSION}\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Administrator: @{user.username or user.id} (ID: {user.id})\n"
            f"Registered Users: {len(users)}\n"
            f"Total Deployed Bots: {len(bots)}\n"
            f"Active Running Bots: {sum(1 for b in bots.values() if b.get('status') == 'RUNNING')}\n"
            f"Referral Reward Rate: {config.get('referral_reward', 0.25)} Credits\n"
            f"Core System Status: {config.get('bot_status', 'ON')}\n\n"
            f"Dedicated Server Metrics:\n"
            f"RAM Utilization: {round(vps_mem.used / (1024**3), 2)} GB / {round(vps_mem.total / (1024**3), 2)} GB ({vps_mem.percent}%)\n"
            f"CPU Load Average: {vps_cpu}%"
        )
        await safe_edit(query, text, reply_markup=admin_panel_keyboard(user.id))

    elif data.startswith("approve_"):
        if not is_admin(user.id):
            await safe_answer(query, "Admin only action.", show_alert=True)
            return
        target_uid = data.split("_")[1]
        pending = get_pending()
        if target_uid in pending:
            file_path = pending[target_uid]
            filename = os.path.basename(file_path)
            bots = get_bots()
            new_id = next_bot_id(bots)
            all_u = get_users()
            runtime = "javascript" if filename.endswith(".js") else "python"

            bots[new_id] = {
                "name": filename,
                "owner_id": int(target_uid),
                "owner_username": all_u.get(target_uid, {}).get("username", "N/A"),
                "status": "STOPPED",
                "path": file_path,
                "start_time": None,
                "deployed": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "runtime": runtime,
                "source": "upload",
                "autofix": True,
                "crash_count": 0
            }
            save_bots(bots)
            start_bot_process(new_id)
            del pending[target_uid]
            save_pending(pending)

            log_audit_action(f"Approved Bot #{new_id} for User {target_uid}", user.id)
            await safe_edit(query, f"Approved & Deployed Bot #{new_id}")
            try:
                await context.bot.send_message(int(target_uid), f"Admin approved! Your application {filename} is now running 🟢")
            except Exception:
                pass

    elif data.startswith("reject_"):
        if not is_admin(user.id):
            await safe_answer(query, "Admin only action.", show_alert=True)
            return
        target_uid = data.split("_")[1]
        pending = get_pending()
        if target_uid in pending:
            del pending[target_uid]
            save_pending(pending)
            log_audit_action(f"Rejected Bot request for User {target_uid}", user.id)
            await safe_edit(query, "Request Rejected.")
            try:
                await context.bot.send_message(int(target_uid), "Admin declined your additional bot deployment request.")
            except Exception:
                pass

    else:
        # BACK BUTTON FIX: any button that no longer matches (old message from a
        # previous version, bot deleted, menu rebuilt, ...) used to do NOTHING.
        # Now it always lands somewhere useful instead of looking broken.
        logger.info("Unknown/stale callback data %r from user %s", data, user.id)
        await safe_answer(query, "This menu was outdated - opened the main menu.", show_alert=False)
        await render_main_menu(query, user, context)


# ==================== INPUT HANDLERS ====================

async def callback_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Bounded dispatcher.

    The old code called itself recursively for every redirect. That worked for
    one level but any unexpected chain (deleted bot -> fleet -> ...) risked a
    RecursionError, and a RecursionError inside an async handler is silent. Here
    the redirect is a small loop with a hard limit instead of recursion.
    """
    for _ in range(5):
        if not await _route_callback(update, context):
            return
    logger.warning("Callback re-dispatch limit reached, stopping")


HELP_TEXT = (
    "🤖 **ROLAX HOSTING V2 — Help / Commands**\n"
    "━━━━━━━━━━━━━━━━━━━━\n\n"
    "**Commands**\n"
    "• /start — Main menu\n"
    "• /back — Peeche / main menu\n"
    "• /cancel — Adhoora kaam cancel\n"
    "• /redeem CODE — Redeem code se credits\n"
    "• /help — Yeh help list\n"
    "• /admin — Admin panel (sirf admins)\n\n"
    "**Kaise use karein**\n"
    "1️⃣ 🚀 Host New Bot → apni `.py` ya `.js` file bhejo\n"
    "2️⃣ File bhejne ke baad 12-char token dedo (BotFather se)\n"
    "3️⃣ Bot start ho jayega — 🤖 My Bots me sab control milta hai\n"
    "4️⃣ 📁 File Manager se files dekho / edit karo\n"
    "5️⃣ 🛑 Stop se bot band, 🗑️ Delete se hamesha ke liye hatao\n\n"
    "**Buttons kaam na karein to:** neeche ki keyboard me Main Menu ka button dabao (ya /start bhejo) — sab reset ho jayega.\n\n"
    "**Support:** @Rolax112\n"
    "**Channel:** " + OFFICIAL_CHANNEL_URL + "\n"
    "**Version:** v" + VERSION
)

# Har command ka sahi handler (typo / case / @botname / extra space sab handled)
_COMMAND_ROUTES = {
    "start": "start", "s": "start", "begin": "start", "new": "start",
    "restart": "start", "main": "start", "mainmenu": "start",
    "back": "start", "home": "start", "cancel": "start", "exit": "start",
    "close": "start", "reset": "start", "hi": "start", "hello": "start", "hey": "start",
    "help": "help", "h": "help", "hlp": "help", "halp": "help", "helpme": "help",
    "commands": "help", "command": "help", "cmds": "help", "cmd": "help",
    "support": "help", "faq": "help", "info": "help", "about": "help",
    "redeem": "redeem", "code": "redeem", "gift": "redeem", "coupon": "redeem",
    "admin": "admin", "panel": "admin", "adminpanel": "admin", "dashboard": "admin",
    "addadmin": "addadmin", "addpremium": "addpremium",
}


def _resolve_command_name(text: str) -> Optional[str]:
    """Raw message se command ka asli naam nikaalo (/Start@ROLAXHOSTINGv2bot -> start)."""
    raw = (text or "").strip()
    if not raw:
        return None
    parts = raw.split()
    first = parts[0]
    # "/start" dono tarah se chale: slash ke saath aur bina slash (plain "help")
    name = first.lstrip("/").split("@")[0].strip().lower()
    if not name and len(parts) > 1:
        # "/ start" jaisa typo bhi kaam kare
        name = parts[1].lstrip("/").split("@")[0].strip().lower()
    if not name:
        return None
    if name in _COMMAND_ROUTES:
        return _COMMAND_ROUTES[name]
    try:
        import difflib
        close = difflib.get_close_matches(name, list(_COMMAND_ROUTES.keys()), n=1, cutoff=0.7)
        if close:
            return _COMMAND_ROUTES[close[0]]
    except Exception:
        pass
    return None


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """`/help` — hamesha kaam karta hai, poori list + main menu."""
    clear_user_flow(context)
    text = HELP_TEXT + (("\n\n🤖 **Bot:** @" + BOT_USERNAME) if BOT_USERNAME else "")
    await safe_reply(
        update.message,
        text,
        parse_mode="Markdown",
        reply_markup=main_menu_keyboard(),
    )


async def unknown_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Koi bhi command jo seedha match nahi hui (/START, /start@bot, /help, typo).

    FIX (v3.20): pehle yeh ek rejection message bhejta tha - ab kabhi bhi
    rejection nahi jaata. Har command kisi na kisi sahi handler pe
    route hoti hai, aur agar bilkul samajh na aaye to seedha main menu khul
    jaata hai. Isliye "/help" ya "/start" kabhi bhi fail nahi ho sakta.
    """
    clear_user_flow(context)
    raw = (update.message.text or "") if update.message else ""
    target = _resolve_command_name(raw)

    try:
        if target == "help":
            await help_command(update, context)
            return
        if target == "redeem":
            await redeem_command(update, context)
            return
        if target == "admin":
            await admin_command(update, context)
            return
        if target == "addadmin":
            await add_admin_command(update, context)
            return
        if target == "addpremium":
            await add_premium_command(update, context)
            return
    except Exception as e:
        logger.warning("Command route '%s' failed (%s) - falling back to main menu", target, e)

    # start / samajh na aaye / koi bhi unknown command -> seedha main menu.
    await start_command(update, context)


async def handle_document(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    users = get_users()
    u_data = users.get(str(user.id), {})

    if u_data.get("banned", False) or u_data.get("restricted", False):
        await safe_reply(update.message, "Access Denied: Your account is restricted or banned.")
        return

    if is_admin(user.id) and context.user_data.pop("awaiting_db_restore", False):
        if int(user.id) != int(ADMIN_ID):
            await safe_reply(update.message, "Restricted to Super Owner.")
            return
        doc = update.message.document
        if not doc or not (doc.file_name or "").endswith(".zip"):
            await safe_reply(update.message, "Please upload a valid .zip database backup file.")
            return

        zip_path = os.path.join(BASE_DIR, "restore_temp.zip")
        tfile = await context.bot.get_file(doc.file_id)
        await tfile.download_to_drive(zip_path)

        extract_dir = os.path.join(BASE_DIR, "extracted_restore")
        os.makedirs(extract_dir, exist_ok=True)
        shutil.unpack_archive(zip_path, extract_dir)

        for f in os.listdir(extract_dir):
            if f.endswith(".json"):
                shutil.move(os.path.join(extract_dir, f), BASE_DIR)

        shutil.rmtree(extract_dir, ignore_errors=True)
        if os.path.exists(zip_path):
            os.remove(zip_path)

        log_audit_action("Restored Database successfully via Bot Document Upload", user.id)
        await safe_reply(update.message, "Database Restored Successfully! All records have been updated from the backup.")
        return

    if is_admin(user.id) and context.user_data.pop("awaiting_media_broadcast", False):
        if int(user.id) != int(ADMIN_ID):
            await safe_reply(update.message, "Restricted to Super Owner.")
            return
        all_u = get_users()
        cnt = 0
        doc = update.message.document
        caption = update.message.caption or ""
        for uid in all_u:
            try:
                await context.bot.send_document(int(uid), document=doc.file_id, caption=caption)
                cnt += 1
            except Exception:
                pass
        log_audit_action(f"Sent Media Document Broadcast to {cnt} users", user.id)
        await safe_reply(update.message, f"Media Broadcast sent to {cnt} users successfully!")
        return

    doc = update.message.document
    file_name = sanitize_filename(doc.file_name) if doc and doc.file_name else ""
    if not doc or not (file_name.endswith(".py") or file_name.endswith(".js")):
        await safe_reply(update.message, "Only .py and .js source files are supported.")
        return

    bots = get_bots()
    user_bot_count = sum(1 for b in bots.values() if b.get("owner_id") == user.id)
    max_allowed_bots = get_user_max_bots(user.id)

    user_dir = os.path.join(HOSTED_DIR, str(user.id))
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, file_name)

    telegram_file = await context.bot.get_file(doc.file_id)
    await telegram_file.download_to_drive(file_path)

    if user_bot_count >= max_allowed_bots:
        pending = get_pending()
        pending[str(user.id)] = file_path
        save_pending(pending)

        await safe_reply(update.message,
            f"Your bot limit ({max_allowed_bots}) has been reached (1 Credit = 1 Bot). Use a redeem code or refer friends to get more credits."
        )

        kb = InlineKeyboardMarkup([[InlineKeyboardButton("✅ Approve", callback_data=f"approve_{user.id}"), InlineKeyboardButton("❌ Reject", callback_data=f"reject_{user.id}")]])
        try:
            await context.bot.send_message(
                ADMIN_ID,
                f"New Host Request (Credit Limit Reached)\nUser: @{user.username or 'N/A'} (ID: {user.id})\nFile: {file_name}\nActive/Max: {user_bot_count}/{max_allowed_bots}",
                reply_markup=kb
            )
        except Exception:
            pass
    else:
        new_id = next_bot_id(bots)
        runtime = "javascript" if file_name.endswith(".js") else "python"

        bots[new_id] = {
            "name": file_name,
            "owner_id": user.id,
            "owner_username": user.username or "N/A",
            "status": "STOPPED",
            "path": file_path,
            "start_time": None,
            "deployed": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "runtime": runtime,
            "source": "upload",
            "autofix": True,
            "crash_count": 0
        }
        save_bots(bots)
        log_session_action(user.id, user.username or "N/A", f"Uploaded and Deployed Bot #{new_id} ({file_name})")

        if start_bot_process(new_id):
            await safe_reply(update.message, f"Success! Your application {file_name} is deployed and RUNNING 🟢 (Instance ID: #{new_id})")
        else:
            await safe_reply(update.message, f"Saved file as ID #{new_id}, but process launch failed (Account might be restricted).")

async def handle_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    if is_admin(user.id) and context.user_data.pop("awaiting_media_broadcast", False):
        if int(user.id) != int(ADMIN_ID):
            return
        all_u = get_users()
        cnt = 0
        photo = update.message.photo[-1].file_id
        caption = update.message.caption or ""
        for uid in all_u:
            try:
                await context.bot.send_photo(int(uid), photo=photo, caption=caption)
                cnt += 1
            except Exception:
                pass
        log_audit_action(f"Sent Media Photo Broadcast to {cnt} users", user.id)
        await safe_reply(update.message, f"Photo Broadcast sent to {cnt} users successfully!")

async def handle_video(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """FIX: the Media Broadcast prompt offered video, but no video handler existed."""
    user = update.effective_user
    if is_admin(user.id) and context.user_data.pop("awaiting_media_broadcast", False):
        if int(user.id) != int(ADMIN_ID):
            return
        msg = update.message
        video = msg.video or msg.animation
        note = msg.video_note
        if not video and not note:
            await safe_reply(msg, "Please send a video or animation.")
            return
        all_u = get_users()
        cnt = 0
        caption = msg.caption or ""
        for uid in all_u:
            try:
                if note:
                    await context.bot.send_video_note(int(uid), video_note=note.file_id)
                else:
                    await context.bot.send_video(int(uid), video=video.file_id, caption=caption)
                cnt += 1
            except Exception:
                pass
            await asyncio.sleep(0.05)
        log_audit_action(f"Sent Video Broadcast to {cnt} users", user.id)
        await safe_reply(msg, f"Video Broadcast sent to {cnt} users successfully!")


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    text = (update.message.text or "").strip()
    if not text:
        return
    had_pending_state = bool(pending_state_keys(context))

    # FIX (v3.20): kabhi kabhi "/ start" ya "/start  extra" jaisa text command
    # entity ke bina aata hai - usko bhi sahi command pe bhejo, warna user ko
    # "kuch nahi hua" jaisa lagta hai.
    _first_word = text.split()[0].lstrip("/").split("@")[0].strip().lower() if text.split() else ""
    if not had_pending_state and (
        text.startswith("/") or text.lower().strip() in _COMMAND_ROUTES
        or _first_word in _COMMAND_ROUTES
    ):
        await unknown_command(update, context)
        return

    # FIX: banned/restricted users could still drive admin-style text flows.
    _u = get_users().get(str(user.id), {})
    if _u.get("banned", False):
        await safe_reply(update.message, "Access Denied: You are banned from using this hosting bot.")
        return
    if _u.get("restricted", False) and not is_admin(user.id):
        await safe_reply(update.message, "⚠️ Your hosting account is restricted by the administrator.")
        return

    if context.user_data.pop("expecting_redeem_code", False):
        codes = get_redeem_codes()
        users = get_users()
        uid = str(user.id)
        if uid not in users:
            await safe_reply(update.message, "Please send /start first, then try the redeem code again.")
            return

        if text not in codes:
            await safe_reply(update.message, "Invalid or expired redeem code.")
            return

        cinfo = codes[text]
        if cinfo.get("used", False):
            await safe_reply(update.message, "This redeem code has already been used.")
            return

        redeemed_list = cinfo.get("redeemed_by_users", [])
        if uid in redeemed_list:
            await safe_reply(update.message, "You have already used this redeem code!")
            return

        max_limit = cinfo.get("max_uses", 1)
        if len(redeemed_list) >= max_limit:
            cinfo["used"] = True
            save_redeem_codes(codes)
            await safe_reply(update.message, "This redeem code has reached its maximum usage limit.")
            return

        if cinfo.get("expiry_time") and time.time() >= cinfo["expiry_time"]:
            cinfo["used"] = True
            save_redeem_codes(codes)
            await safe_reply(update.message, "This redeem code has expired.")
            return

        reward_credits = cinfo["credits"]
        users[uid]["credits"] = users[uid].get("credits", 1.0) + reward_credits

        redeemed_list.append(uid)
        cinfo["redeemed_by_users"] = redeemed_list
        if len(redeemed_list) >= max_limit:
            cinfo["used"] = True

        save_users(users)
        save_redeem_codes(codes)

        log_audit_action(f"User {user.id} redeemed code {text} for {reward_credits} credits", user.id)
        log_session_action(user.id, user.username or "N/A", f"Redeemed code {text}")
        await safe_reply(update.message, f"Redeem Successful!\n\nAdded +{reward_credits} Credits to your wallet.")
        return

    if "editing_env_bot" in context.user_data:
        bot_id = context.user_data.pop("editing_env_bot")
        bots = get_bots()
        if bot_id in bots:
            env_path = os.path.join(os.path.dirname(bots[bot_id]["path"]), ".env")
            with open(env_path, "a", encoding="utf-8") as ef:
                ef.write(f"\n{text}")
            log_session_action(user.id, user.username or "N/A", f"Updated .env for Bot #{bot_id}")
            await safe_reply(update.message, "Environment variable appended to .env file successfully!")
            return

    if context.user_data.pop("expecting_github", False):
        if not text.startswith("http"):
            await safe_reply(update.message, "Invalid GitHub URL format.")
            return

        bots = get_bots()
        user_bot_count = sum(1 for b in bots.values() if b.get("owner_id") == user.id)
        max_allowed_bots = get_user_max_bots(user.id)
        if user_bot_count >= max_allowed_bots:
            await safe_reply(update.message, f"Bot limit reached ({max_allowed_bots}). Redeem credits to unlock more slots.")
            return

        user_dir = os.path.join(HOSTED_DIR, str(user.id))
        os.makedirs(user_dir, exist_ok=True)
        repo_name = text.split("/")[-1].replace(".git", "")
        repo_dir = os.path.join(user_dir, repo_name)

        await safe_reply(update.message, "Cloning GitHub Repository...")
        proc = subprocess.run(["git", "clone", text, repo_dir], capture_output=True, text=True)

        if proc.returncode == 0:
            py_files = [f for f in os.listdir(repo_dir) if f.endswith(".py")]
            if py_files:
                entry_file = py_files[0]
                entry_path = os.path.join(repo_dir, entry_file)
                new_id = next_bot_id(bots)

                bots[new_id] = {
                    "name": f"{repo_name}/{entry_file}",
                    "owner_id": user.id,
                    "owner_username": user.username or "N/A",
                    "status": "STOPPED",
                    "path": entry_path,
                    "start_time": None,
                    "deployed": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "runtime": "python",
                    "source": "github",
                    "autofix": True,
                    "crash_count": 0
                }
                save_bots(bots)
                start_bot_process(new_id)
                log_session_action(user.id, user.username or "N/A", f"Deployed GitHub repo as Bot #{new_id}")
                await safe_reply(update.message, f"GitHub Repository Deployed Successfully as Instance #{new_id}!")
            else:
                await safe_reply(update.message, "Repository cloned, but no .py executable entrypoint was detected.")
        else:
            await safe_reply(update.message, f"Git clone failed: {proc.stderr}")
        return

    if is_admin(user.id):
        if context.user_data.pop("awaiting_dm_user", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                parts = text.split(maxsplit=1)
                target_uid = int(parts[0])
                dm_msg = parts[1]
                await context.bot.send_message(chat_id=target_uid, text=f"Message from Admin:\n\n{dm_msg}")
                await safe_reply(update.message, f"Message sent successfully to user {target_uid}!")
            except Exception as e:
                await safe_reply(update.message, f"Failed to send DM. Error: {e}\nUse format: USER_ID MESSAGE")
            return

        if context.user_data.pop("awaiting_schedule_announcement", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                parts = text.split("|", 1)
                if len(parts) != 2 or not parts[1].strip():
                    raise ValueError("message missing")
                delay_mins = float(parts[0].strip())
                ann_msg = parts[1].strip()
                if delay_mins < 0 or delay_mins > 60 * 24 * 30:
                    raise ValueError("delay out of range")

                item = schedule_announcement(delay_mins, ann_msg, user.id)
                due = datetime.datetime.fromtimestamp(item["run_at"]).strftime("%d-%b-%Y %H:%M:%S")
                await safe_reply(
                    update.message,
                    f"✅ Announcement scheduled.\n\n"
                    f"🆔 {item['id']}\n"
                    f"⏰ Delivery time: {due}\n"
                    f"📢 Queue me save ho gaya — restart/webhook ke baad bhi nahi gayab hoga."
                )
                # A zero-minute schedule is useful for testing and should run
                # immediately instead of waiting for a second update.
                if delay_mins == 0:
                    await process_due_announcements(context.bot)
            except Exception:
                await safe_reply(update.message, "Invalid syntax. Use: DELAY_MINUTES | MESSAGE (delay 0 se 43200 minutes)")
            return

        if context.user_data.pop("awaiting_add_credit", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                parts = text.split()
                target = parts[0]
                amount = float(parts[1])
                users = get_users()

                if target.lower() == "all":
                    for uid in users:
                        users[uid]["credits"] = users[uid].get("credits", 1.0) + amount
                    save_users(users)
                    log_audit_action(f"Added {amount} credits to ALL users", user.id)
                    await safe_reply(update.message, f"Successfully added +{amount} Credits to ALL USERS!")
                else:
                    target_uid = str(int(target))
                    if target_uid in users:
                        users[target_uid]["credits"] = users[target_uid].get("credits", 1.0) + amount
                        save_users(users)
                        log_audit_action(f"Added {amount} credits to user {target_uid}", user.id)
                        await safe_reply(update.message, f"Successfully added +{amount} Credits to User ID {target_uid}!")
                        try:
                            await context.bot.send_message(int(target_uid), f"Credit Updated!\nAdmin added +{amount} Credits to your wallet!")
                        except Exception:
                            pass
                    else:
                        await safe_reply(update.message, "User ID not found in database.")
            except Exception:
                await safe_reply(update.message, "Invalid syntax. Use format: USER_ID CREDITS or all CREDITS.")

        elif context.user_data.pop("awaiting_rem_credit", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                parts = text.split()
                target = parts[0]
                amount = float(parts[1])
                users = get_users()

                if target.lower() == "all":
                    for uid in users:
                        curr = users[uid].get("credits", 1.0)
                        users[uid]["credits"] = max(0.0, curr - amount)
                    save_users(users)
                    log_audit_action(f"Removed {amount} credits from ALL users", user.id)
                    await safe_reply(update.message, f"Successfully removed {amount} Credits from ALL USERS!")
                else:
                    target_uid = str(int(target))
                    if target_uid in users:
                        curr = users[target_uid].get("credits", 1.0)
                        users[target_uid]["credits"] = max(0.0, curr - amount)
                        save_users(users)
                        log_audit_action(f"Removed {amount} credits from user {target_uid}", user.id)
                        await safe_reply(update.message, f"Successfully removed {amount} Credits from User ID {target_uid}!")
                        try:
                            await context.bot.send_message(int(target_uid), f"Credit Updated!\nAdmin deducted {amount} Credits from your wallet.")
                        except Exception:
                            pass
                    else:
                        await safe_reply(update.message, "User ID not found in database.")
            except Exception:
                await safe_reply(update.message, "Invalid syntax. Use format: USER_ID CREDITS or all CREDITS.")

        elif context.user_data.pop("awaiting_ref_reward", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                val = float(text)
                cfg = get_config()
                cfg["referral_reward"] = val
                save_config(cfg)
                log_audit_action(f"Updated referral reward rate to {val}", user.id)
                await safe_reply(update.message, f"Referral reward successfully updated to {val} Credits per invite!")
            except ValueError:
                await safe_reply(update.message, "Invalid number format.")

        elif context.user_data.pop("awaiting_redeem_create", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                parts = text.split()
                code_str = parts[0]
                cred_val = float(parts[1])
                duration_days = float(parts[2]) if len(parts) > 2 else 0
                max_users = int(parts[3]) if len(parts) > 3 else 1

                expiry_time = (time.time() + (duration_days * 86400)) if duration_days > 0 else None

                codes = get_redeem_codes()
                codes[code_str] = {
                    "credits": cred_val,
                    "used": False,
                    "max_uses": max_users,
                    "redeemed_by_users": [],
                    "expiry_time": expiry_time,
                    "created": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
                save_redeem_codes(codes)
                log_audit_action(f"Created Redeem Code {code_str} for {cred_val} credits, duration {duration_days}d, max uses {max_users}", user.id)
                dur_text = f"{duration_days} Days" if duration_days > 0 else "Lifetime"
                await safe_reply(update.message, f"Redeem Code Created Successfully!\n\n• Code: {code_str}\n• Value: {cred_val} Credits\n• Validity: {dur_text}\n• Max Users Limit: {max_users}")
            except Exception:
                await safe_reply(update.message, "Invalid syntax. Use format: CODE CREDITS DURATION_DAYS MAX_USERS")

        elif context.user_data.pop("awaiting_broadcast", False):
            if int(user.id) != int(ADMIN_ID):
                return
            # Read the existing database only; never clear or rewrite the user list.
            all_u = get_users()
            sent = 0
            failed = 0
            for uid in all_u.keys():
                try:
                    await context.bot.send_message(chat_id=int(uid), text=text)
                    sent += 1
                except Exception as exc:
                    failed += 1
                    logging.warning("Broadcast failed for user ID %s: %s", uid, exc)
                # Keep below Telegram's typical per-chat/global throughput limits.
                await asyncio.sleep(0.05)
            log_audit_action(f"Broadcast attempted for {len(all_u)} users; sent={sent}; failed={failed}", user.id)
            await safe_reply(update.message,
                f"📢 Broadcast finished.\n✅ Sent: {sent}\n❌ Failed: {failed}\n"
                f"👥 User records preserved: {len(all_u)}"
            )

        elif context.user_data.pop("awaiting_ban_id", False):
            if int(user.id) != int(ADMIN_ID):
                return
            all_u = get_users()
            if text in all_u:
                all_u[text]["banned"] = True
                save_users(all_u)
                log_audit_action(f"Banned User {text}", user.id)
                await safe_reply(update.message, f"User ID {text} has been BANNED.")
            else:
                await safe_reply(update.message, "User ID not found.")

        elif context.user_data.pop("awaiting_unban_id", False):
            if int(user.id) != int(ADMIN_ID):
                return
            all_u = get_users()
            if text in all_u:
                all_u[text]["banned"] = False
                save_users(all_u)
                log_audit_action(f"Unbanned User {text}", user.id)
                await safe_reply(update.message, f"User ID {text} has been UNBANNED.")
            else:
                await safe_reply(update.message, "User ID not found.")

        elif context.user_data.pop("awaiting_restrict_id", False):
            if int(user.id) != int(ADMIN_ID):
                return
            all_u = get_users()
            if text in all_u:
                all_u[text]["restricted"] = True
                save_users(all_u)
                bots = get_bots()
                for bid, binfo in list(bots.items()):
                    if str(binfo.get("owner_id")) == text:
                        stop_bot_process(bid)
                log_audit_action(f"Restricted User {text} and stopped their bots", user.id)
                await safe_reply(update.message, f"User ID {text} is now RESTRICTED 🔒. All their bots have been stopped and hosting is disabled.")
                try:
                    await context.bot.send_message(int(text), "⚠️ Your hosting account has been restricted by the admin.")
                except Exception:
                    pass
            else:
                await safe_reply(update.message, "User ID not found.")

        elif context.user_data.pop("awaiting_unrestrict_id", False):
            if int(user.id) != int(ADMIN_ID):
                return
            all_u = get_users()
            if text in all_u:
                all_u[text]["restricted"] = False
                save_users(all_u)
                log_audit_action(f"Unrestricted User {text}", user.id)
                await safe_reply(update.message, f"User ID {text} restrictions have been lifted successfully 🔓.")
                try:
                    await context.bot.send_message(int(text), "🎉 Your hosting account restrictions have been lifted by the admin!")
                except Exception:
                    pass
            else:
                await safe_reply(update.message, "User ID not found.")

        elif context.user_data.pop("awaiting_stop_bot_id", False):
            if int(user.id) != int(ADMIN_ID):
                return
            bots = get_bots()
            if text in bots:
                stop_bot_process(text)
                log_audit_action(f"Admin forcibly stopped Bot ID #{text}", user.id)
                await safe_reply(update.message, f"Bot ID #{text} has been successfully stopped!")
            else:
                await safe_reply(update.message, "Bot ID not found.")

        elif context.user_data.pop("awaiting_del_bot_id", False):
            if int(user.id) != int(ADMIN_ID):
                return
            bots = get_bots()
            if text in bots:
                binfo = bots[text]
                stop_bot_process(text)
                if os.path.exists(binfo["path"]):
                    try:
                        os.remove(binfo["path"])
                    except Exception:
                        pass
                del bots[text]
                save_bots(bots)
                log_audit_action(f"Admin deleted Bot ID #{text} and its files", user.id)
                await safe_reply(update.message, f"Bot ID #{text} and its source files have been permanently deleted.")
            else:
                await safe_reply(update.message, "Bot ID not found.")

        elif context.user_data.pop("awaiting_view_user", False):
            if int(user.id) != int(ADMIN_ID):
                return
            all_u = get_users()
            bots = get_bots()
            if text in all_u:
                uinfo = all_u[text]
                ubots = [bid for bid, b in bots.items() if b.get("owner_id") == int(text)]
                await safe_reply(update.message,
                    f"User Profile Matrix\n"
                    f"ID: {text}\n"
                    f"Name: {uinfo.get('name')}\n"
                    f"Username: @{uinfo.get('username')}\n"
                    f"Premium: {uinfo.get('premium', False)}\n"
                    f"Restricted: {uinfo.get('restricted', False)}\n"
                    f"Credits: {round(uinfo.get('credits', 1.0), 2)}\n"
                    f"Joined: {uinfo.get('joined')}\n"
                    f"Banned: {uinfo.get('banned')}\n"
                    f"Active Bot IDs: {ubots}"
                )
            else:
                await safe_reply(update.message, "User ID not found in database.")

        elif context.user_data.pop("awaiting_give_prem", False):
            try:
                parts = text.split()
                target_uid = str(int(parts[0]))
                days = int(parts[1])
                users = get_users()

                if target_uid in users:
                    expiry_timestamp = time.time() + (days * 86400)
                    users[target_uid]["premium"] = True
                    users[target_uid]["premium_expiry"] = expiry_timestamp
                    save_users(users)

                    log_audit_action(f"Granted Premium VIP via panel to User {target_uid} for {days} days", user.id)
                    await safe_reply(update.message, f"User {target_uid} successfully upgraded to Premium VIP for {days} Days!")
                    try:
                        await context.bot.send_message(int(target_uid), f"Congratulations!\nYou have been granted Premium VIP status for {days} Days by the admin!")
                    except Exception:
                        pass
                else:
                    await safe_reply(update.message, "User ID not found.")
            except Exception:
                await safe_reply(update.message, "Invalid syntax. Use format: USER_ID DAYS")

        elif context.user_data.pop("awaiting_rem_prem", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                target_uid = str(int(text))
                users = get_users()
                if target_uid in users:
                    users[target_uid]["premium"] = False
                    users[target_uid]["premium_expiry"] = None
                    save_users(users)
                    log_audit_action(f"Removed Premium status via panel from User {target_uid}", user.id)
                    await safe_reply(update.message, f"User {target_uid} has been downgraded to Free Member.")
                    try:
                        await context.bot.send_message(int(target_uid), "Your Premium VIP status has been removed by the admin.")
                    except Exception:
                        pass
                else:
                    await safe_reply(update.message, "User ID not found.")
            except ValueError:
                await safe_reply(update.message, "Invalid User ID format.")

        elif context.user_data.pop("awaiting_fj_add", False):
            if int(user.id) != int(ADMIN_ID):
                return
            channels = get_force_join()
            value = text.strip()
            # FIX: a typo / private channel here used to lock out every user.
            if not re.fullmatch(r"@[A-Za-z0-9_]{4,}|-?\d{6,}", value):
                await safe_reply(update.message,
                    "Invalid format. Send @channelusername or the numeric -100... chat id.")
                return
            try:
                await context.bot.get_chat(_to_chat_id(value))
            except Exception as e:
                await safe_reply(update.message,
                    f"Cannot access {value}: {e}\nAdd the bot to that channel first, then retry.")
                return
            if value not in channels:
                channels.append(value)
                save_force_join(channels)
                log_audit_action(f"Added Force Join channel: {value}", user.id)
                await safe_reply(update.message, f"Channel {value} added to Force Join successfully! Make sure the bot is an administrator there.")
            else:
                await safe_reply(update.message, "Channel already exists in list.")

        elif context.user_data.pop("awaiting_fj_rem", False):
            if int(user.id) != int(ADMIN_ID):
                return
            channels = get_force_join()
            value = text.strip()
            if value in channels:
                channels.remove(value)
                save_force_join(channels)
                log_audit_action(f"Removed Force Join channel: {value}", user.id)
                await safe_reply(update.message, f"Channel {value} removed from Force Join!")
            else:
                await safe_reply(update.message, "Channel not found in list.")

        elif context.user_data.pop("awaiting_add_admin", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                new_admin_id = int(text)
                admins = get_admins()
                if new_admin_id not in admins:
                    admins.append(new_admin_id)
                    save_admins(admins)
                    log_audit_action(f"Added Sub-Admin: {new_admin_id}", user.id)
                    await safe_reply(update.message, f"User {new_admin_id} added as Sub-Admin!")
                    try:
                        await context.bot.send_message(new_admin_id, "Congratulations!\nYou have been promoted to Sub-Admin by the owner. Send /admin to open your panel.")
                    except Exception:
                        pass
                else:
                    await safe_reply(update.message, "User is already an admin.")
            except ValueError:
                await safe_reply(update.message, "Invalid Chat ID.")

        elif context.user_data.pop("awaiting_remove_admin", False):
            if int(user.id) != int(ADMIN_ID):
                return
            try:
                rem_admin_id = int(text)
                if rem_admin_id == ADMIN_ID:
                    await safe_reply(update.message, "Cannot remove primary super owner!")
                    return
                admins = get_admins()
                if rem_admin_id in admins:
                    admins.remove(rem_admin_id)
                    save_admins(admins)
                    log_audit_action(f"Removed Admin: {rem_admin_id}", user.id)
                    await safe_reply(update.message, f"Admin {rem_admin_id} removed successfully!")
                else:
                    await safe_reply(update.message, "Admin ID not found.")
            except ValueError:
                await safe_reply(update.message, "Invalid ID format.")

        elif context.user_data.pop("awaiting_db_query", False):
            if int(user.id) != int(ADMIN_ID):
                return
            bots = get_bots()
            users = get_users()
            res = [f"Found in Users: {uid}" for uid in users if text in uid or text in users[uid].get("username", "")]
            res += [f"Found in Bots: #{bid} ({b['name']})" for bid, b in bots.items() if text in bid or text in b['name']]
            await safe_reply(update.message, "Database Query Results:\n\n" + ("\n".join(res) if res else "No matches found."))

        elif context.user_data.pop("awaiting_res_limit", False):
            try:
                ram, cpu = text.split()
                cfg = get_config()
                cfg["default_ram_limit"] = int(ram)
                cfg["default_cpu_limit"] = float(cpu)
                save_config(cfg)
                log_audit_action(f"Updated Hardware Defaults: RAM {ram}MB, CPU {cpu}", user.id)
                await safe_reply(update.message, f"Hardware Limits Updated!\nRAM Cap: {ram} MB\nCPU Cores: {cpu}")
            except Exception:
                await safe_reply(update.message, "Invalid syntax. Use: 8192 8.0")

    elif not had_pending_state:
        # BACK BUTTON FIX: an unmatched message used to be swallowed silently,
        # which looks exactly like "bot not responding". Always answer.
        await safe_reply(update.message,
            "🤖 I didn't understand that.\n\nUse the buttons below, or /start to open the main menu.",
            reply_markup=main_menu_keyboard())

# ==================== ERROR HANDLING ====================

async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """FIX: without this, any unexpected exception in a handler was printed by PTB
    but the user got no reply at all (button looked dead)."""
    err = context.error
    err_low = str(err).lower()

    # Known, harmless Telegram answers - never spam the owner with these.
    noisy = ("not modified", "query is too old", "message to be replied not found",
             "reply message not found", "message to edit not found",
             "terminated by other getupdates", "chat not found",
             "bot was blocked by the user", "user is deactivated",
             "have no rights to send a message")
    if any(k in err_low for k in noisy):
        logger.warning("Handled Telegram warning: %s", err)
        # 409 Conflict = SAME token pe doosra program bhi chal raha hai.
        # Isi wajah se user ko kabhi hamara reply, kabhi doosre program ka
        # reply aata hai. Owner ko turant batao (10 min me ek baar).
        if "other getupdates" in err_low or "conflict" in err_low:
            global _LAST_CONFLICT_ALERT
            if time.time() - _LAST_CONFLICT_ALERT > 600:
                _LAST_CONFLICT_ALERT = time.time()
                try:
                    await context.bot.send_message(
                        chat_id=ADMIN_ID,
                        text=("🚨 *SAME TOKEN PE DOOSRA PROGRAM CHAL RAHA HAI*\n\n"
                              "Telegram ne `409 Conflict` bheja — matlab koi doosra "
                              "bot/program isi token se getUpdates kar raha hai.\n\n"
                              "*Isliye* tumhe kabhi sahi reply aata hai, kabhi kisi "
                              "aur program ka galat reply.\n\n"
                              "*Permanent fix (2 minute):*\n"
                              "1. @BotFather → `/revoke` → naya token lo\n"
                              "2. Naya token daalo: `python3 ROLAX_HOSTING_FINAL.py --settoken`\n"
                              "3. Doosra program band karo (ya rehne do — naya token "
                              "milte hi wo khud mar jayega)"),
                        parse_mode="Markdown",
                    )
                except Exception:
                    pass
        return

    logger.error("Unhandled exception while processing an update: %s", err, exc_info=err)

    try:
        if isinstance(update, Update):
            text = "⚠️ Something went wrong while processing that action. It has been logged."
            if update.callback_query:
                await safe_answer(update.callback_query, "Error handled - see logs.", show_alert=False)
                try:
                    await update.callback_query.edit_message_text(
                        text, reply_markup=InlineKeyboardMarkup(
                            [[InlineKeyboardButton("🔙 Main Menu", callback_data="menu_start")]]))
                except Exception:
                    pass
            elif update.effective_message:
                await safe_reply(update.effective_message, text)
    except Exception:
        pass

    if not isinstance(err, (SystemExit, KeyboardInterrupt)):
        try:
            await context.bot.send_message(
                chat_id=ADMIN_ID,
                text=f"🐞 Bot error report\n\nType: {type(err).__name__}\nDetail: {str(err)[:600]}"
            )
        except Exception:
            pass


# ==================== MAIN APPLICATION ====================

async def post_init(app: Application) -> None:
    global BOT_USERNAME
    # bot ka username pata karo -> har screen pe identity dikhegi
    try:
        _me = await app.bot.get_me()
        BOT_USERNAME = (_me.username or "").strip()
        logger.info("Bot identity: @%s (v%s)", BOT_USERNAME, VERSION)
    except Exception as e:
        logger.warning("get_me failed: %s", e)

    # Telegram ke "/" menu me commands dikhao (pehle koi list hi nahi thi)
    try:
        await app.bot.set_my_commands([
            ("start", "Main menu / bot host karo"),
            ("help", "Saare commands dekho"),
            ("redeem", "Redeem code se credits add karo"),
        ])
    except Exception as e:
        logger.warning("set_my_commands failed: %s", e)

    spawn_background(auto_fix_guardian_task(app))
    spawn_background(background_expiry_guardian(app))
    spawn_background(daily_reminder_guardian(app))
    spawn_background(scheduled_announcement_guardian(app))
    spawn_background(startup_self_check(app))

    # Admin ko batao kaunsa bot/instance online hua - isse ye pata chalta hai
    # ki jis chat me reply aa raha hai wo SAHI bot hai ya koi doosra.
    try:
        await app.bot.send_message(
            chat_id=ADMIN_ID,
            text=("✅ ROLAX HOSTING V2 v%s online\n"
                  "🤖 @%s\n"
                  "🕒 %s\n\n"
                  "Isi chat me /start aur /help chalao. Agar kisi doosri chat me "
                  "alag reply aaye, to wo DOOSRA bot hai (naam same ho sakta hai)."
                  % (VERSION, BOT_USERNAME or "?", datetime.datetime.now().strftime("%d-%b %H:%M"))),
        )
    except Exception as e:
        logger.warning("Admin online ping failed: %s", e)


async def post_shutdown(app: Application) -> None:
    """Kill hosted bots on shutdown/SIGTERM but KEEP their RUNNING status in
    bots.json, so they come back automatically after a restart or redeploy."""
    for item in list(RUNNING_PROCESSES.values()):
        proc = item.get("process")
        try:
            if proc and proc.poll() is None:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        except Exception:
            try:
                if proc:
                    proc.terminate()
            except Exception:
                pass
        try:
            item.get("log_file_obj").close()
        except Exception:
            pass
    RUNNING_PROCESSES.clear()
    logger.info("Shutdown complete - hosted bot statuses preserved for restart")


async def startup_self_check(app: Application) -> None:
    """Tell the owner immediately if the force-join setup cannot work."""
    try:
        await asyncio.sleep(2)
        problems = await audit_force_join_config(app.bot)
        if problems:
            detail = "\n".join(f"• {p}" for p in problems)
            logger.warning("Force-join configuration problems:\n%s", detail)
            try:
                await app.bot.send_message(
                    chat_id=ADMIN_ID,
                    text=("⚠️ Force-Join self-check found problems\n\n" + detail +
                          "\n\nUsers are NOT blocked by these channels (the bot skips them), "
                          "but join enforcement is off for them. Make the bot an administrator "
                          "in each channel to enforce it.")
                )
            except Exception:
                pass
        else:
            logger.info("Force-join self-check passed for all configured channels.")
    except Exception as e:
        logger.warning("Startup self-check failed: %s", e)

def build_application(lifecycle: bool = True) -> Application:
    """Create the same handlers for polling and Vercel webhook execution.

    Webhook requests must not start background guardians or run_polling; they
    initialize one short-lived PTB application, process one Telegram update,
    then shut it down. Normal VPS mode keeps the original lifecycle hooks.
    """
    builder = Application.builder().token(BOT_TOKEN)
    if lifecycle:
        builder = builder.post_init(post_init).post_shutdown(post_shutdown)
    app = builder.build()

    # =================================================================
    #  ##  HANDLER REGISTRATION  ##  (kaun si command kis function pe)
    # =================================================================
    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(CommandHandler(["back", "Back", "home", "cancel", "Cancel"], menu_command))
    app.add_handler(CommandHandler(["redeem", "Redeem", "REDEEM"], redeem_command))
    app.add_handler(CommandHandler(["admin", "Admin", "ADMIN"], admin_command))
    app.add_handler(CommandHandler("addadmin", add_admin_command))
    app.add_handler(CommandHandler("addpremium", add_premium_command))
    app.add_handler(CommandHandler(["help", "h", "commands", "support", "info", "about"], help_command))

    app.add_handler(CallbackQueryHandler(callback_query_handler))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_document))
    app.add_handler(MessageHandler(filters.PHOTO, handle_photo))
    app.add_handler(MessageHandler(filters.VIDEO | filters.ANIMATION | filters.VIDEO_NOTE, handle_video))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    # sabse aakhir: koi bhi bachi hui command (/START, /start@bot, typo)
    app.add_handler(MessageHandler(filters.COMMAND, unknown_command))
    app.add_error_handler(error_handler)
    return app


def main() -> None:
    req_path = os.path.join(BASE_DIR, "requirements.txt")
    if not os.path.exists(req_path):
        with open(req_path, "w", encoding="utf-8") as rf:
            rf.write("python-telegram-bot==21.11.1\npsutil>=5.9\n")

    get_users()
    get_bots()
    get_pending()
    get_config()
    get_admins()
    get_force_join()
    get_redeem_codes()
    get_scheduled_announcements()

    bots = get_bots()
    for bid, binfo in bots.items():
        if binfo.get("status") == "RUNNING":
            start_bot_process(bid)

    app = build_application(lifecycle=True)



    logger.info("EXCLUSIVE ROLAX HOSTING V2 v%s online - polling started", VERSION)
    try:
        app.run_polling(
            allowed_updates=Update.ALL_TYPES,
            drop_pending_updates=False,
            close_loop=False,
        )
    except KeyboardInterrupt:
        logger.info("Shutdown requested by keyboard interrupt")
    except InvalidToken:
        # Token revoke / galat hai -> traceback ke bajaye seedha message
        print("\n" + "=" * 64)
        print(" [FATAL] BOT_TOKEN valid nahi hai (revoke ho gaya ya galat hai).")
        print(" Naya token lo:  @BotFather -> /mybots -> API Token -> Revoke")
        print(" Phir chalao:    python3 %s --settoken" % os.path.basename(__file__))
        print("=" * 64 + "\n")
        return
    except Exception as e:
        logger.error("Polling stopped: %s", e)
        raise

# ==================== TOKEN HELPERS ====================

def _verify_token_live(token: str):
    """Telegram se poochh ke dekho token zinda hai ya nahi.
    Return: (True, "username") | (False, "reason") | (None, "network issue")"""
    import json as _json
    import urllib.request
    import urllib.error
    url = "https://api.telegram.org/bot%s/getMe" % token
    try:
        with urllib.request.urlopen(url, timeout=12) as resp:
            data = _json.loads(resp.read().decode("utf-8", "ignore"))
        if data.get("ok"):
            return True, str(data.get("result", {}).get("username", "?"))
        return False, str(data.get("description", "unknown"))
    except urllib.error.HTTPError as e:
        try:
            body = _json.loads(e.read().decode("utf-8", "ignore"))
            return False, str(body.get("description", e))
        except Exception:
            return False, str(e)
    except Exception as e:                      # internet nahi hai, etc.
        return None, str(e)


def set_token_cli() -> int:
    """python3 <file> --settoken
    Token ko SAFE tarike se file me likhta hai (manual edit me quote tootta hai,
    jisse SyntaxError aata hai - isliye yeh mode banaya gaya hai)."""
    print("=" * 64)
    print(" BOT_TOKEN set karo  (koi syntax error nahi hoga)")
    print("=" * 64)
    print(" Telegram me @BotFather -> /mybots -> apna bot -> API Token -> Revoke")
    print(" (naya token copy karo, aisa dikhega: 123456789:AAHxxxxxxxxxxxxxxxxxxxx)")
    token = input("\nNaya token paste karo: ").strip().strip('"').strip("'")

    if not re.fullmatch(r"\d{6,}:[A-Za-z0-9_-]{30,}", token):
        print("\n x Token ka format galat hai. Dobara try karo.")
        return 1

    ok, info = _verify_token_live(token)
    if ok is False:
        print("\n x Telegram ne yeh token reject kar diya: %s" % info)
        print("   BotFather se dobara Revoke karke naya token lo.")
        return 1
    if ok is None:
        print("\n ! Live verify nahi ho paya (%s) - format sahi hai, save kar raha hoon." % info)

    path = os.path.abspath(__file__)
    with open(path, "r", encoding="utf-8") as f:
        src = f.read()
    new_src, count = re.subn(r'^BOT_TOKEN = "[^"\n]*"[ \t]*$',
                             'BOT_TOKEN = "%s"' % token, src, count=1, flags=re.M)
    if count != 1:
        print("\n x File me 'BOT_TOKEN = \"...\"' line nahi mili. Manually check karo.")
        return 1
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_src)
    print("\n OK - token save ho gaya" + (" (verified: @%s)" % info if ok else ""))
    print(" Ab bot chalao:  python3 %s" % os.path.basename(path))
    return 0


# ==================== SELF CHECK / ENTRY POINT ====================

def self_check() -> int:
    """python3 ROLAX_HOSTING_FINAL.py --check
    Batata hai ki file poori hai, packages hain, token sahi hai, folder writable hai."""
    problems = []

    print("=" * 62)
    print(f" ROLAX HOSTING V2  v{VERSION}  -  self check")
    print("=" * 62)
    print(f" Python          : {sys.version.split()[0]}")
    print(f" File            : {os.path.abspath(__file__)}")

    # 1) file truncation / copy-paste check
    try:
        own_src = open(os.path.abspath(__file__), encoding="utf-8", errors="ignore").read()
        if not own_src.rstrip().endswith("main()"):
            problems.append("File adhoori lag rahi hai (last line main() nahi hai) - dobara download karo")
        _bytes = os.path.getsize(os.path.abspath(__file__))
        _lines = len(own_src.rstrip(chr(10)).split(chr(10)))
        print(f" File size       : {_bytes} bytes / {_lines} lines / {len(own_src)} chars")
    except Exception as e:
        problems.append(f"File read nahi hui: {e}")

    # 1b) encoding / BOM - "syntax error" ki sabse badi wajah Notepad/UTF-16 save
    try:
        raw = open(os.path.abspath(__file__), "rb").read()
        if raw[:3] == b"\xef\xbb\xbf":
            problems.append("File me BOM hai (UTF-8-BOM) - editor me 'UTF-8 (no BOM)' me save karo")
        if raw[:2] in (b"\xff\xfe", b"\xfe\xff"):
            problems.append("File UTF-16 me save hui hai - 'UTF-8' me save karo")
        if b"\x00" in raw:
            problems.append("File me NUL byte hai - dobara download karo")
        print(f" Encoding        : {'OK (plain UTF-8)' if raw[:3] != b'\xef\xbb\xbf' else 'UTF-8 with BOM'}")
    except Exception as e:
        problems.append(f"Encoding check fail: {e}")

    # 2) token
    token_ok = bool(re.fullmatch(r"\d{6,}:[A-Za-z0-9_-]{30,}", str(BOT_TOKEN)))
    print(f" Bot token       : {'OK' if token_ok else 'GALAT'} (****{str(BOT_TOKEN)[-6:]})")
    if not token_ok:
        problems.append("BOT_TOKEN ka format galat hai (BotFather se naya lo)")

    # 2b) live token check (revoked / wrong token pakadne ke liye)
    _ok, _info = _verify_token_live(BOT_TOKEN) if token_ok else (None, "format galat")
    if _ok is True:
        print(f" Token live check: OK (@{_info})")
    elif _ok is False:
        print(f" Token live check: REJECTED ({_info})")
        problems.append(
            f"Telegram ne token reject kiya ({_info}). BotFather se naya token lo, "
            f"phir chalao:  python3 {os.path.basename(__file__)} --settoken")
    else:
        print(f" Token live check: skip ({_info})")

    # 3) admin id
    print(f" Admin ID        : {ADMIN_ID}")
    if not isinstance(ADMIN_ID, int) or ADMIN_ID <= 0:
        problems.append("ADMIN_ID galat hai")

    # 4) packages
    try:
        import telegram
        print(f" python-telegram-bot: {telegram.__version__}")
    except Exception as e:
        problems.append(f"python-telegram-bot missing: {e}")
    try:
        print(f" psutil          : {psutil.__version__}")
    except Exception as e:
        problems.append(f"psutil missing: {e}")

    # 5) writable folder
    try:
        probe = os.path.join(BASE_DIR, ".write_test")
        with open(probe, "w", encoding="utf-8") as f:
            f.write("ok")
        os.remove(probe)
        print(f" Data folder     : {BASE_DIR} (writable)")
    except Exception as e:
        problems.append(f"Data folder writable nahi: {e}")

    # 6) handlers/functions present (pakka file poori hai)
    required = ["main", "start_command", "callback_query_handler", "_route_callback",
                "handle_text", "handle_document", "handle_photo", "handle_video",
                "error_handler", "start_bot_process", "stop_bot_process"]
    missing = [n for n in required if n not in globals()]
    print(f" Functions       : {len(required) - len(missing)}/{len(required)} present")
    if missing:
        problems.append(f"Functions missing: {missing}")

    print(f" Force join      : {REQUIRED_FORCE_JOIN_CHANNELS or 'OFF'}")
    print("-" * 62)
    if problems:
        print(" RESULT: PROBLEM MILA")
        for p in problems:
            print("   x", p)
        return 1
    print(" RESULT: SAB OK  -  bot start karne ke liye: python3 " +
          os.path.basename(__file__))
    return 0


if __name__ == "__main__":
    if any(a in ("--settoken", "--token", "-t") for a in sys.argv[1:]):
        sys.exit(set_token_cli())
    if any(a in ("--check", "-c", "--test") for a in sys.argv[1:]):
        sys.exit(self_check())
    main()
