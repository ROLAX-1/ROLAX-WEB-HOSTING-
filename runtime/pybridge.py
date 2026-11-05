#!/usr/bin/env python3
"""
ROLUX HOST — real Python bot runtime bridge.

Server-side engine: user ki uploaded .py file ko ASLI python me chalata hai,
bot libraries ke stubs inject karta hai, aur /start jaise command ka
ASLI reply nikal ke deta hai (Telegram pe bhejne ke liye).

Usage: python3 pybridge.py <project_dir> <entry_file>
env:
  ROL_TEXT      : user ka message text (e.g. "/start")
  ROL_CMD       : bare command (e.g. "start") — handled by wrapper
  ROL_TOKEN     : bot token (optional, env me daal diya jaata hai)
  ROL_TIMEOUT   : seconds (default 10)
Output: stdout pe last line = "###RESULT###{json}"
"""
import asyncio
import inspect
import io
import json
import os
import re
import sys
import traceback
import types
import contextlib

RESULT = {
    "ok": False,
    "loaded": False,
    "error": "",
    "loadError": "",
    "replies": [],
    "logs": [],
    "commands": [],
    "tokenFound": "",
    "handlers": 0,
}
REPLIES = []      # captured bot replies
LOGS = []         # captured prints
REG = []          # registered handlers
BOT_INSTANCES = []


def say(*parts, **kw):
    text = kw.get("text")
    for p in parts:
        if isinstance(p, str) and p.strip():
            text = p if text is None else text
    if text and isinstance(text, str):
        REPLIES.append(text)


class _Cap(io.TextIOBase):
    def __init__(self):
        self.buf = []

    def write(self, s):
        if len(self.buf) < 500:
            self.buf.append(s)
        if len(LOGS) < 400:
            LOGS.append(s)
        return len(s)

    def flush(self):
        pass


class Obj:
    """Har attribute access pe khali namespace — bot libs ke objects ke liye safe stub."""

    def __init__(self, *args, **kw):
        self.__dict__.update(kw)
        self.__dict__.setdefault("id", 1)
        self.__dict__.setdefault("username", "rolax_bot")
        self.__dict__.setdefault("first_name", "ROLAX Bot")
        self.__dict__.setdefault("is_bot", True)

    def __await__(self):
        return iter(())

    def __call__(self, *a, **k):
        return self

    def __iter__(self):
        return iter(())

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        return Obj()


class Message(Obj):
    def __init__(self, text="/start", chat_id=777000, mid=1):
        super().__init__()
        self.text = text
        self.html_text = text
        self.markdown_text = text
        self.caption = text
        self.message_id = mid
        self.content_type = "text"
        self.entities = []
        self.chat = Obj(id=chat_id, type="private", title="ROLUX Tester", username="tester")
        self.from_user = Obj(id=chat_id, first_name="Tester", last_name="", username="tester", is_bot=False,
                             language_code="en", full_name="Tester")
        self.reply_to_message = None
        self.date = None

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        if name in ("reply_to_message", "pinned_message", "voice", "photo", "document", "video"):
            return None
        return Obj()

    def reply_text(self, *a, **k):
        say(*a, **k)
        return Message(self.text, self.chat.id, self.message_id + 1)

    def answer(self, *a, **k):
        say(*a, **k)
        return self

    def edit_text(self, *a, **k):
        say(*a, **k)
        return self

    def delete(self, *a, **k):
        return True


class Update(Obj):
    def __init__(self, message=None, text="/start"):
        super().__init__()
        self.message = message or Message(text)
        self.edited_message = None
        self.callback_query = None
        self.channel_post = None
        self.inline_query = None

    @property
    def effective_message(self):
        return self.message

    @property
    def effective_user(self):
        return self.message.from_user

    @property
    def effective_chat(self):
        return self.message.chat


class _Decor:
    """Decorator-safe no-op: @bot.polling() aur bot.polling() dono chalta hai."""

    def __call__(self, fn=None, *a, **k):
        return fn if fn is not None else None


class BotStub(Obj):
    """telebot.TeleBot / aiogram.Bot / telegram.Bot ka combined stub."""

    def __init__(self, token=None, *a, **k):
        super().__init__()
        self.token = token if isinstance(token, str) else (k.get("token") or "")
        if self.token and not RESULT["tokenFound"]:
            RESULT["tokenFound"] = self.token
        self.user = Obj(id=1, username="rolax_bot", first_name="ROLAX Bot", is_bot=True)
        BOT_INSTANCES.append(self)

    # ---------- replies ----------
    def send_message(self, chat_id=None, text=None, *a, **k):
        say(text, *a, **k)
        return Message(str(text or ""), getattr(chat_id, "id", chat_id) or 777000)

    sendMessage = send_message

    def reply_to(self, message=None, text=None, *a, **k):
        say(text, *a, **k)
        return Message(str(text or ""))

    def answer(self, *a, **k):
        say(*a, **k)
        return True

    def edit_message_text(self, *a, **k):
        say(*a, **k)
        return True

    def send_photo(self, chat_id=None, photo=None, caption=None, *a, **k):
        say(caption, *a, **k)
        return Message(str(caption or ""))

    def send_document(self, chat_id=None, document=None, caption=None, *a, **k):
        say(caption, *a, **k)
        return Message(str(caption or ""))

    # ---------- telebot decorators ----------
    def message_handler(self, *a, **k):
        cmds, any_flag = _parse_handler_args(a, k)

        def deco(fn):
            _register("message", cmds, any_flag, fn)
            return fn

        return deco

    def callback_query_handler(self, *a, **k):
        cmds, any_flag = _parse_handler_args(a, k)

        def deco(fn):
            _register("callback", cmds, any_flag, fn)
            return fn

        return deco

    def channel_post_handler(self, *a, **k):
        def deco(fn):
            _register("channel", [], True, fn)
            return fn

        return deco

    def register_message_handler(self, fn, *a, **k):
        cmds, any_flag = _parse_handler_args(a, k)
        _register("message", cmds, any_flag, fn)
        return fn

    register_callback_query_handler = register_message_handler

    # ---------- aiogram decorators (dp.message / dp.callback_query) ----------
    def message(self, *a, **k):
        cmds = []
        for v in a:
            name = type(v).__name__.lower()
            if name == "command":
                for attr in ("command", "_command", "commands"):
                    val = getattr(v, attr, None)
                    if isinstance(val, str):
                        cmds.append(val)
                        break
            elif isinstance(v, str):
                cmds.append(v)
        if not cmds:
            cmds, _ = _parse_handler_args(a, k)

        def deco(fn):
            _register("message", cmds, not cmds, fn)
            return fn

        return deco

    def callback_query(self, *a, **k):
        def deco(fn):
            _register("callback", [], True, fn)
            return fn

        return deco

    # ---------- no-op polling / runners ----------
    def polling(self, *a, **k):
        return _Decor()

    def infinity_polling(self, *a, **k):
        return _Decor()

    def poll(self, *a, **k):
        return _Decor()

    def run(self, *a, **k):
        return _Decor()

    def start_polling(self, *a, **k):
        return _Decor()

    def stop_polling(self, *a, **k):
        return None

    def run_polling(self, *a, **k):
        return _Decor()

    def set_my_commands(self, *a, **k):
        return True

    def setMyCommands(self, *a, **k):
        return True

    def get_me(self, *a, **k):
        return self.user

    def delete_webhook(self, *a, **k):
        return True

    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)

        def anything(*a, **k):
            return None

        return anything


def _parse_handler_args(a, k):
    cmds = []
    any_flag = False
    if isinstance(k.get("commands"), (list, tuple)):
        cmds = [str(c) for c in k["commands"]]
    for v in a:
        if isinstance(v, (list, tuple)):
            cmds = [str(c) for c in v]
        elif isinstance(v, str) and v.isidentifier():
            any_flag = True
    if k.get("func") is not None or k.get("content_types") is not None or k.get("chat_types") is not None:
        any_flag = True
    if isinstance(k.get("commands"), str):
        cmds = [k["commands"]]
    cmds = [c.lstrip("/").strip() for c in cmds if c]
    return cmds, any_flag or not cmds


def _register(kind, cmds, any_flag, fn):
    REG.append({"kind": kind, "commands": cmds or [], "any": bool(any_flag or not cmds), "fn": fn})
    RESULT["handlers"] = len(REG)
    for c in cmds or []:
        if c and c not in RESULT["commands"]:
            RESULT["commands"].append(c)


# ---------------------------------------------------------------- stub modules
def _mkmod(name, **attrs):
    m = types.ModuleType(name)
    for k, v in attrs.items():
        setattr(m, k, v)
    sys.modules[name] = m
    return m


def install_stubs():
    bot = BotStub()

    # ---- telebot / pyTelegramBotAPI ----
    tb = _mkmod("telebot", TeleBot=BotStub, Telebot=BotStub, bot=bot)
    tb_types = _mkmod("telebot.types", Message=Message, Update=Update, CallbackQuery=Obj,
                      InlineKeyboardMarkup=Obj, ReplyKeyboardMarkup=Obj, InlineKeyboardButton=Obj,
                      ReplyKeyboardRemove=Obj, BotCommand=Obj, InputFile=Obj, Chat=Obj, User=Obj,
                      ParseMode=types.SimpleNamespace(HTML="HTML", MARKDOWN="Markdown", MARKDOWN_V2="MarkdownV2"))
    tb.types = tb_types
    sys.modules["telebot.apihelper"] = _mkmod("telebot.apihelper", ApiTelegramException=Exception)
    sys.modules["telebot.util"] = _mkmod("telebot.util", split_string=lambda *a, **k: [], smart_split=lambda *a, **k: [])

    # ---- python-telegram-bot ----
    def commandhandler(cmd, fn, *a, **k):
        _register("message", [str(cmd)], False, fn)
        return Obj(callback=fn, command=cmd)

    def messagehandler(filt, fn, *a, **k):
        _register("message", [], True, fn)
        return Obj(callback=fn)

    class _App:
        def __init__(self):
            self.handlers = []
            self.bot = BotStub()

        def add_handler(self, h, *a, **k):
            self.handlers.append(h)
            return None

        def add_handlers(self, *hs):
            return None

        def run_polling(self, *a, **k):
            return None

        def start_polling(self, *a, **k):
            return None

        def __getattr__(self, name):
            if name.startswith("__"):
                raise AttributeError(name)
            return lambda *a, **k: None

    class _AppBuilder:
        def __init__(self):
            self._app = _App()

        def token(self, *a, **k):
            t = a[0] if a else k.get("token")
            if isinstance(t, str) and not RESULT["tokenFound"]:
                RESULT["tokenFound"] = t
            return self

        def build(self):
            return self._app

        def __getattr__(self, name):
            if name.startswith("__"):
                raise AttributeError(name)
            return lambda *a, **k: self

    class Application:
        @staticmethod
        def builder():
            return _AppBuilder()

        @staticmethod
        def build():
            return _App()

    tg = _mkmod("telegram", Bot=BotStub, Update=Update, Message=Message, BotCommand=Obj)
    tgext = _mkmod("telegram.ext", Application=Application, CommandHandler=commandhandler,
                   MessageHandler=messagehandler, CallbackQueryHandler=messagehandler,
                   ContextTypes=Obj(), filters=Obj(), ConversationHandler=Obj(),
                   PicklePersistence=Obj)
    tg.ext = tgext
    sys.modules["telegram.error"] = _mkmod("telegram.error", InvalidToken=Exception, NetworkError=Exception,
                                           TelegramError=Exception, BadRequest=Exception)

    # ---- aiogram ----
    class Command:
        def __init__(self, command="start", *a, **k):
            self.command = command.lstrip("/")

    class Dispatcher:
        def __init__(self, *a, **k):
            pass

        def include_router(self, *a, **k):
            return None

        def message(self, *a, **k):
            cmds = []
            for v in a:
                for attr in ("command", "_command", "commands"):
                    val = getattr(v, attr, None)
                    if isinstance(val, str):
                        cmds.append(val)
                        break
                if isinstance(v, str):
                    cmds.append(v)

            def deco(fn):
                _register("message", [c.lstrip("/") for c in cmds], not cmds, fn)
                return fn

            return deco

        def callback_query(self, *a, **k):
            def deco(fn):
                _register("callback", [], True, fn)
                return fn

            return deco

        def channel_post(self, *a, **k):
            return self.message(*a, **k)

        def edited_message(self, *a, **k):
            return self.message(*a, **k)

        def __getattr__(self, name):
            if name.startswith("__"):
                raise AttributeError(name)
            return lambda *a, **k: None

    class Router(Dispatcher):
        pass

    class F:
        def __getattr__(self, name):
            if name.startswith("__"):
                raise AttributeError(name)
            return self

        def __call__(self, *a, **k):
            return self

    aiogram = _mkmod("aiogram", Bot=BotStub, Dispatcher=Dispatcher, Router=Router, F=F(),
                     types=types.SimpleNamespace(Message=Message, CallbackQuery=Obj),
                     enums=types.SimpleNamespace(ParseMode=types.SimpleNamespace(HTML="HTML")),
                     Router_=Router)
    sys.modules["aiogram.types"] = _mkmod("aiogram.types", Message=Message, CallbackQuery=Obj, ReplyKeyboardMarkup=Obj,
                                          InlineKeyboardMarkup=Obj, KeyboardButton=Obj)
    sys.modules["aiogram.enums"] = _mkmod("aiogram.enums", ParseMode=types.SimpleNamespace(HTML="HTML"))
    sys.modules["aiogram.filters"] = _mkmod("aiogram.filters", Command=Command)
    sys.modules["aiogram.client.default"] = _mkmod("aiogram.client.default", DefaultBotProperties=Obj)
    sys.modules["aiogram.client.bot"] = _mkmod("aiogram.client.bot", Bot=BotStub)
    aiogram.types = sys.modules["aiogram.types"]

    # ---- discord ----
    class DiscordClient(BotStub):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.user = Obj(id=1, username="rolax_bot", first_name="ROLAX Bot", is_bot=True)

        def event(self, fn=None, *a, **k):
            if fn:
                return fn

            def deco(f):
                return f

            return deco

        def command(self, *a, **k):
            def deco(fn):
                cmd = k.get("name")
                if not cmd and a:
                    cmd = a[0].name if hasattr(a[0], "name") else (a[0] if isinstance(a[0], str) else None)
                _register("message", [str(cmd or fn.__name__)], False, fn)
                return fn

            return deco

        def run(self, *a, **k):
            return None

    dc = _mkmod("discord", Client=DiscordClient, Bot=DiscordClient, Intents=Obj(), AutoShardedClient=DiscordClient)
    dc.Intents = types.SimpleNamespace(all=lambda: Obj(), default=lambda: Obj(), message_content=True, members=True)
    _mkmod("discord.ext", commands=types.SimpleNamespace(bot=DiscordClient, Bot=DiscordClient, command=lambda *a, **k: (lambda f: f)))
    _mkmod("discord.ext.commands", Bot=DiscordClient, Client=DiscordClient, command=lambda *a, **k: (lambda f: f))

    # ---- dotenv ----
    _mkmod("dotenv", load_dotenv=lambda *a, **k: True, dotenv_values=lambda *a, **k: {}, find_dotenv=lambda *a, **k: "")

    # ---- flask / fastapi (web python: sirf load karo) ----
    class _Flask(BotStub):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self.routes = []

        def route(self, *a, **k):
            def deco(fn):
                self.routes.append(a[0] if a else k.get("rule", "/"))
                return fn

            return deco

        get = post = put = delete = route

        def run(self, *a, **k):
            return None

    _mkmod("flask", Flask=_Flask, request=Obj(), jsonify=lambda *a, **k: Obj(), Response=Obj, render_template=Obj,
           render_template_string=Obj, send_file=Obj, redirect=lambda *a, **k: Obj(), abort=lambda *a, **k: None)
    class _FastAPI(_Flask):
        pass

    _mkmod("fastapi", FastAPI=_FastAPI, APIRouter=_FastAPI, HTTPException=Exception, Request=Obj, Response=Obj,
           Depends=lambda *a, **k: None, BackgroundTasks=Obj)
    _mkmod("fastapi.responses", JSONResponse=Obj, HTMLResponse=Obj, PlainTextResponse=Obj)
    _mkmod("uvicorn", run=lambda *a, **k: None, Config=Obj, Server=Obj)

    # ---- UNIVERSAL FALLBACK: koi bhi missing module import pe crash na ho ----
    install_import_fallback()

    # ---- asyncio.run -> safe (bot polling coroutines ke liye) ----
    real_run = asyncio.run

    def safe_asyncio_run(coro, *a, **k):
        try:
            if inspect.iscoroutine(coro):
                coro.close()
            return None
        except Exception:
            return None

    asyncio.run = safe_asyncio_run


class _Any:
    """Kisi bhi missing library ka permissive object: har attribute/call/iter kaam kare."""

    def __init__(self, name="any"):
        self._name = name

    def __getattr__(self, k):
        if k.startswith("__") and k.endswith("__"):
            raise AttributeError(k)
        if k in ("__version__", "__all__", "version"):
            return "1.0.0"
        if k in ("text", "content", "title", "status", "url", "name", "value", "data"):
            return ""
        if k in ("json", "keys", "values", "items", "split", "strip", "upper", "lower", "read", "decode",
                 "encode", "get", "dict", "list", "raise_for_status", "close", "iter_rows", "sort_values"):
            return lambda *a, **kw: _Any(k)
        return _Any(k)

    def __call__(self, *a, **k):
        if a and isinstance(a[0], str) and len(a) == 1:
            return a[0]
        return _Any(self._name)

    def __getitem__(self, k):
        return _Any(self._name)

    def __setitem__(self, k, v):
        return None

    def __iter__(self):
        return iter(())

    def __len__(self):
        return 0

    def __bool__(self):
        return True

    def __int__(self):
        return 0

    def __float__(self):
        return 0.0

    def __str__(self):
        return ""

    def __repr__(self):
        return f"<{self._name}>"

    def __add__(self, o):
        return _Any(self._name)

    __radd__ = __sub__ = __mul__ = __truediv__ = __add__

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def __await__(self):
        return iter(())


def install_import_fallback():
    """Jo library install nahi hai (numpy/pandas/requests/...) uske liye auto-stub.
    Isse koi bhi single .py file import error se crash nahi hoti."""
    import importlib.abc
    import importlib.machinery

    class _Mod(types.ModuleType):
        SAFE_DUNDER = {"__version__": "1.0.0", "__all__": [], "__path__": [], "__author__": "rolax",
                       "__email__": "", "__license__": "MIT", "__title__": "", "__doc__": ""}

        def __getattr__(self, k):
            if k in self.SAFE_DUNDER:
                return self.SAFE_DUNDER[k]
            if k.startswith("__") and k.endswith("__"):
                raise AttributeError(k)
            v = _Any(k)
            setattr(self, k, v)
            return v

    class _Loader(importlib.abc.Loader):
        def create_module(self, spec):
            return _Mod(spec.name)

        def exec_module(self, module):
            pass

    class _Finder(importlib.abc.MetaPathFinder):
        SKIP = {"pip", "setuptools", "pkg_resources"}

        def find_spec(self, fullname, path=None, target=None):
            top = fullname.split(".")[0]
            if top in self.SKIP:
                return None
            # agar module ASLI me installed hai to bilkul interfere mat karo
            try:
                if importlib.machinery.PathFinder.find_spec(fullname, path) is not None:
                    return None
            except Exception:
                pass
            try:
                return importlib.machinery.ModuleSpec(fullname, _Loader(), is_package=True)
            except Exception:
                return None

    # real modules pehle, fallback sabse aakhir me
    sys.meta_path.append(_Finder())
    sys.modules.setdefault("typing_extensions", _Mod("typing_extensions"))


# ---------------------------------------------------------------- .env load
def load_env(project_dir):
    for cand in (".env", ".env.example", ".env.local"):
        p = os.path.join(project_dir, cand)
        if not os.path.exists(p):
            continue
        try:
            for line in open(p, encoding="utf-8", errors="ignore"):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip().replace("export ", "")
                v = v.strip().strip('"').strip("'")
                if k and v and k not in os.environ:
                    os.environ[k] = v
        except Exception:
            pass


def invoke(fn, msg, bot):
    """Handler ko sahi signature ke saath chalao — sync ya async, dono."""
    results = []

    def build_args():
        update = Update(msg)
        ctx = Obj()
        ctx.bot = bot
        ctx.args = []
        ctx.chat_data = {}
        ctx.user_data = {}
        ctx.bot_data = {}
        return [(msg,), (update, ctx), (msg, ctx), (update,), ()]

    errs = []
    for args in build_args():
        try:
            res = fn(*args)
            if inspect.iscoroutine(res):
                loop = asyncio.new_event_loop()
                try:
                    loop.run_until_complete(res)
                finally:
                    loop.close()
            return True
        except TypeError as e:
            msg_s = str(e)
            if "argument" in msg_s or "positional" in msg_s or "missing" in msg_s:
                errs.append(msg_s)
                continue
            RESULT["error"] = f"handler TypeError: {msg_s}"
            return False
        except Exception as e:
            RESULT["error"] = f"{type(e).__name__}: {e}"
            return False
    if errs:
        RESULT["error"] = f"handler signature: {errs[0][:120]}"
    return False


def call_handler(fn, msg, bot):
    ctx = Obj()
    ctx.bot = bot
    ctx.args = []
    ctx.chat_data = {}
    ctx.user_data = {}
    update = Update(msg)
    attempts = [(msg,), (update, ctx), (msg, ctx), (update,), ()]
    last_err = None
    for args in attempts:
        try:
            res = fn(*args)
            if inspect.iscoroutine(res):
                run_async(lambda: res)
            return
        except TypeError as e:
            last_err = e
            continue
        except Exception as e:
            RESULT["error"] = f"{type(e).__name__}: {e}"
            return
    if last_err:
        RESULT["error"] = f"handler error: {last_err}"


def run_async(fn, *args):
    try:
        loop = asyncio.new_event_loop()
        try:
            res = fn(*args)
            if inspect.iscoroutine(res):
                loop.run_until_complete(res)
        finally:
            try:
                loop.close()
            except Exception:
                pass
    except TypeError:
        call_handler(fn, *args)
    except Exception as e:
        RESULT["error"] = f"{type(e).__name__}: {e}"


def main():
    if len(sys.argv) < 3:
        print("###RESULT###" + json.dumps({"ok": False, "error": "usage: pybridge.py <dir> <entry>"}))
        return
    project_dir = sys.argv[1]
    entry = sys.argv[2]
    text = os.environ.get("ROL_TEXT", "/start")
    cmd = os.environ.get("ROL_CMD", "").strip().lstrip("/")
    if not cmd and text:
        cmd = text.strip().lstrip("/").split()[0].lower()

    sys.setrecursionlimit(6000)
    install_stubs()
    load_env(project_dir)

    global REPLIES
    REPLIES = []

    entry_path = os.path.join(project_dir, entry)
    if not os.path.exists(entry_path):
        for cand in ("bot.py", "main.py", "app.py", "index.py"):
            p = os.path.join(project_dir, cand)
            if os.path.exists(p):
                entry_path = p
                entry = cand
                break
    if not os.path.exists(entry_path):
        RESULT["error"] = "Entry file nahi mili"
        print("###RESULT###" + json.dumps(RESULT))
        return

    # bot token ke liye safe defaults — code "os.environ['BOT_TOKEN']" kare to bhi crash na ho
    os.environ.setdefault("BOT_TOKEN", "")
    os.environ.setdefault("TOKEN", os.environ.get("BOT_TOKEN", ""))
    os.environ.setdefault("API_HASH", "")
    if not os.environ.get("BOT_TOKEN"):
        tok = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("TOKEN") or ""
        if tok.startswith(tuple("0123456789")) and ":" in tok:
            os.environ["BOT_TOKEN"] = tok
    if not os.environ.get("API_ID"):
        os.environ["API_ID"] = "0"
    if not os.environ.get("API_HASH"):
        os.environ["API_HASH"] = "0"

    load_cap = _Cap()
    code = open(entry_path, encoding="utf-8", errors="ignore").read()
    sys.path.insert(0, project_dir)
    os.chdir(project_dir)
    os.environ.setdefault("PORT", "8080")

    g = {"__name__": "__main__", "__file__": entry_path, "__builtins__": __builtins__}
    cap = _Cap()
    try:
        with contextlib.redirect_stdout(load_cap), contextlib.redirect_stderr(load_cap):
            try:
                exec(compile(code, entry, "exec"), g)
            except SystemExit:
                pass
        RESULT["loaded"] = True
    except BaseException as e:
        RESULT["loaded"] = False
        RESULT["loadError"] = f"{type(e).__name__}: {e}"
        tb_lines = traceback.format_exc().strip().split("\n")
        RESULT["traceback"] = tb_lines[-6:]

    RESULT["commands"] = sorted(set(RESULT["commands"]))
    if not RESULT["tokenFound"]:
        for v in (g.get("BOT_TOKEN"), g.get("TOKEN"), g.get("bot_token"), os.environ.get("BOT_TOKEN")):
            if isinstance(v, str) and re.match(r"^\d{6,12}:[A-Za-z0-9_-]{20,60}$", v.strip()):
                RESULT["tokenFound"] = v.strip()
                break

    # ---- run the requested command against registered handlers ----
    REPLIES.clear()
    LOGS.clear()
    msg = Message(text if text.startswith("/") else ("/" + cmd if cmd else text))
    if cmd:
        exact = [h for h in REG if h["kind"] == "message" and cmd in h["commands"]]
        catchall = [h for h in REG if h["kind"] == "message" and h["any"] and not h["commands"]]
        targets = exact or catchall
        if not targets:
            targets = [h for h in REG if h["kind"] == "message" and h["any"]]
        for h in targets:
            invoke(h["fn"], msg, BOT_INSTANCES[0] if BOT_INSTANCES else BotStub())
            if REPLIES:
                break
        if not targets and not REPLIES:
            RESULT["note"] = "is command ka handler code me nahi mila"

    load_out = "".join(load_cap.buf).strip() if getattr(load_cap, "buf", None) else "".strip()
    RESULT["replies"] = [r for r in dict.fromkeys(REPLIES) if r][:5]
    if load_out:
        RESULT["loadLogs"] = [l for l in load_out.split("\n") if l.strip()][:15]
    if not RESULT["replies"] and RESULT.get("loadLogs") and not RESULT["commands"]:
        # plain python script (koi bot handler nahi) -> uska asli output hi jawab hai
        RESULT["replies"] = RESULT["loadLogs"][-3:]
    RESULT["ok"] = bool(RESULT["loaded"])
    RESULT["tokenFound"] = bool(RESULT["tokenFound"])
    print("###RESULT###" + json.dumps(RESULT, default=str))


if __name__ == "__main__":
    try:
        main()
    except BaseException as e:
        print("###RESULT###" + json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
