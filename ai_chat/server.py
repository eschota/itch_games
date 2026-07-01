#!/usr/bin/env python3
"""Development-agent chat for the itch_games project."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import html
import json
import mimetypes
import os
import pathlib
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request as urlrequest
from urllib.parse import parse_qs, urlparse


ROOT = pathlib.Path(__file__).resolve().parents[1]
APP_DIR = pathlib.Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
DATA_DIR = pathlib.Path(os.environ.get("AI_CHAT_DATA_DIR", APP_DIR / "data"))
MESSAGES_FILE = DATA_DIR / "messages.jsonl"
TELEGRAM_SEEN_FILE = DATA_DIR / "telegram_seen_updates.txt"
MAX_MESSAGE_CHARS = 4000
MAX_ROLE_CHARS = 80
WRITE_LOCK = threading.Lock()
DEPLOY_LOCK = threading.Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_package() -> dict:
    try:
        return json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    except Exception:
        return {}


def project_version() -> str:
    package = read_package()
    return str(package.get("gameVersion") or package.get("version") or "unknown")


def git_cmd(args: list[str], timeout: int = 4) -> str:
    return subprocess.check_output(
        ["git", "-C", str(ROOT), *args],
        stderr=subprocess.DEVNULL,
        text=True,
        timeout=timeout,
    ).strip()


def git_context() -> dict:
    try:
        branch = git_cmd(["rev-parse", "--abbrev-ref", "HEAD"])
    except Exception:
        branch = "unknown"
    try:
        commit = git_cmd(["rev-parse", "--short", "HEAD"])
    except Exception:
        commit = "unknown"
    try:
        dirty = bool(git_cmd(["status", "--short"]))
    except Exception:
        dirty = False
    return {"branch": branch, "commit": commit, "dirty": dirty}


def read_messages(limit: int) -> list[dict]:
    if not MESSAGES_FILE.exists():
        return []
    rows: list[dict] = []
    with MESSAGES_FILE.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows[-limit:]


def append_message(role: str, text: str, source: str = "web", mirror_telegram: bool = True) -> dict:
    role = " ".join(role.strip().split())[:MAX_ROLE_CHARS] or "Agent"
    text = text.strip()[:MAX_MESSAGE_CHARS]
    if not text:
        raise ValueError("message is required")
    context = git_context()
    record = {
        "id": uuid.uuid4().hex,
        "created_at": now_iso(),
        "role": role,
        "message": text,
        "project_version": project_version(),
        "branch": context["branch"],
        "commit": context["commit"],
        "dirty": context["dirty"],
        "source": source,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with WRITE_LOCK:
        with MESSAGES_FILE.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
            handle.write("\n")
    if mirror_telegram and source != "telegram":
        mirror_record_to_telegram(record)
    return record


def telegram_config() -> dict:
    token = (os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("AI_CHAT_TELEGRAM_TOKEN") or "").strip()
    chat_id = (os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("AI_CHAT_TELEGRAM_CHAT_ID") or "").strip()
    secret = (
        os.environ.get("TELEGRAM_WEBHOOK_SECRET")
        or os.environ.get("AI_CHAT_TELEGRAM_SECRET_TOKEN")
        or ""
    ).strip()
    return {
        "enabled": bool(token and chat_id),
        "token": token,
        "chat_id": chat_id,
        "secret": secret,
    }


def telegram_api(method: str, payload: dict, timeout: int = 35) -> dict:
    config = telegram_config()
    if not config["enabled"]:
        raise RuntimeError("Telegram bridge is not configured")
    url = f"https://api.telegram.org/bot{config['token']}/{method}"
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urlrequest.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urlrequest.urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def telegram_text(record: dict) -> str:
    role = str(record.get("role") or "Agent")
    message = str(record.get("message") or "")
    version = str(record.get("project_version") or "version unknown")
    branch = str(record.get("branch") or "branch unknown")
    commit = str(record.get("commit") or "commit unknown")
    dirty = " dirty" if record.get("dirty") else ""
    text = f"{role}: {message}\n\n{version} - {branch} @ {commit}{dirty}"
    if len(text) > 3900:
        text = text[:3890].rstrip() + "\n...[truncated]"
    return text


def send_telegram_message(text: str) -> None:
    config = telegram_config()
    if not config["enabled"]:
        return
    try:
        telegram_api(
            "sendMessage",
            {
                "chat_id": config["chat_id"],
                "text": text[:4096],
                "disable_web_page_preview": True,
            },
        )
    except Exception as exc:
        print(f"telegram send failed: {exc}")


def mirror_record_to_telegram(record: dict) -> None:
    if not telegram_config()["enabled"]:
        return
    thread = threading.Thread(target=send_telegram_message, args=(telegram_text(record),), daemon=True)
    thread.start()


def telegram_update_seen(update_id: int) -> bool:
    if update_id <= 0:
        return False
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with WRITE_LOCK:
        seen: set[int] = set()
        if TELEGRAM_SEEN_FILE.exists():
            for line in TELEGRAM_SEEN_FILE.read_text(encoding="utf-8").splitlines():
                try:
                    seen.add(int(line.strip()))
                except ValueError:
                    continue
        if update_id in seen:
            return True
        seen.add(update_id)
        recent = sorted(seen)[-1000:]
        TELEGRAM_SEEN_FILE.write_text("\n".join(str(item) for item in recent), encoding="utf-8")
    return False


def telegram_sender_name(message: dict) -> str:
    sender = message.get("from") or {}
    parts = [str(sender.get("first_name") or "").strip(), str(sender.get("last_name") or "").strip()]
    full_name = " ".join(part for part in parts if part)
    return full_name or str(sender.get("username") or "Telegram user")


def telegram_message_text(message: dict) -> str:
    text = message.get("text")
    if text is None:
        text = message.get("caption")
    return str(text or "").strip()


def process_telegram_update(update: dict) -> bool:
    update_id = int(update.get("update_id", 0) or 0)
    if telegram_update_seen(update_id):
        return False
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    config = telegram_config()
    if str(chat.get("id")) != str(config["chat_id"]):
        return False
    sender = message.get("from") or {}
    if sender.get("is_bot"):
        return False
    text = telegram_message_text(message)
    if not text:
        return False
    producer_text = f"Продюсер: {text}"
    source_note = telegram_sender_name(message)
    if source_note:
        producer_text = f"{producer_text}\n\nTelegram user: {source_note}"
    append_message("Продюсер", producer_text, source="telegram", mirror_telegram=False)
    return True


def verify_telegram_secret(headers) -> tuple[bool, str]:
    config = telegram_config()
    secret = config.get("secret") or ""
    if not secret:
        return False, "Telegram webhook secret is not configured"
    received = headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not hmac.compare_digest(received, secret):
        return False, "invalid Telegram webhook secret"
    return True, "ok"


def recent_commits(limit: int = 80) -> dict:
    branches: list[dict] = []
    commits: list[dict] = []
    try:
        raw_branches = git_cmd(
            [
                "for-each-ref",
                "--format=%(refname:short)%1f%(objectname:short)%1f%(committerdate:iso-strict)%1f%(subject)",
                "refs/heads",
                "refs/remotes/origin",
            ]
        )
        for line in raw_branches.splitlines():
            parts = line.split("\x1f")
            if len(parts) == 4:
                branches.append(
                    {
                        "name": parts[0],
                        "commit": parts[1],
                        "date": parts[2],
                        "subject": parts[3],
                    }
                )
    except Exception:
        branches = []

    try:
        raw_commits = git_cmd(
            [
                "log",
                "--all",
                f"-n{limit}",
                "--date=iso-strict",
                "--pretty=format:%H%x1f%h%x1f%cd%x1f%D%x1f%an%x1f%s",
            ]
        )
        for line in raw_commits.splitlines():
            parts = line.split("\x1f")
            if len(parts) == 6:
                commits.append(
                    {
                        "hash": parts[0],
                        "short": parts[1],
                        "date": parts[2],
                        "refs": parts[3],
                        "author": parts[4],
                        "subject": parts[5],
                    }
                )
    except Exception:
        commits = []

    return {"branches": branches, "commits": commits}


def verify_github_signature(headers, body: bytes) -> tuple[bool, str]:
    secret = os.environ.get("AI_CHAT_WEBHOOK_SECRET", "")
    if not secret:
        return False, "webhook secret is not configured"
    signature = headers.get("X-Hub-Signature-256", "")
    if not signature.startswith("sha256="):
        return False, "missing sha256 signature"
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    expected = f"sha256={digest}"
    if not hmac.compare_digest(signature, expected):
        return False, "invalid signature"
    return True, "ok"


def run_deploy_from_webhook(payload: dict) -> None:
    if not DEPLOY_LOCK.acquire(blocking=False):
        append_message("Deploy Webhook", "Deploy webhook received, but another deploy is already running.")
        return
    try:
        ref = str(payload.get("ref", "unknown"))
        head = payload.get("head_commit") or {}
        head_id = str(head.get("id", ""))[:12] or "unknown"
        append_message("Deploy Webhook", f"GitHub push received for `{ref}` at `{head_id}`. Starting autodeploy.")
        script = os.environ.get("AI_CHAT_DEPLOY_SCRIPT", "/usr/local/bin/itch-games-autodeploy.sh")
        result = subprocess.run(
            [script],
            cwd=str(ROOT),
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        output = "\n".join(part.strip() for part in [result.stdout, result.stderr] if part.strip())
        output = output[-2500:] if output else "no output"
        if result.returncode == 0:
            append_message("Deploy Webhook", f"Autodeploy completed for `{ref}`.\n{output}")
        else:
            append_message("Deploy Webhook", f"Autodeploy failed for `{ref}` with exit {result.returncode}.\n{output}")
    except Exception as exc:
        append_message("Deploy Webhook", f"Autodeploy crashed: {exc}")
    finally:
        DEPLOY_LOCK.release()


def start_deploy_thread(payload: dict) -> None:
    thread = threading.Thread(target=run_deploy_from_webhook, args=(payload,), daemon=True)
    thread.start()


class Handler(BaseHTTPRequestHandler):
    server_version = "ItchGamesAIChat/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def _send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_error_json(self, message: str, status: HTTPStatus) -> None:
        self._send_json({"ok": False, "error": message}, status)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path in {"/api/health", "/health"}:
            self._send_json(
                {
                    "ok": True,
                    "time": now_iso(),
                    "project_version": project_version(),
                    "git": git_context(),
                    "telegram": {"enabled": telegram_config()["enabled"]},
                }
            )
            return
        if path == "/api/messages":
            query = parse_qs(parsed.query)
            try:
                limit = min(max(int(query.get("limit", ["200"])[0]), 1), 500)
            except ValueError:
                limit = 200
            self._send_json({"ok": True, "messages": read_messages(limit)})
            return
        if path == "/api/commits":
            self._send_json({"ok": True, **recent_commits()})
            return
        if path == "/api/status":
            self._send_json(
                {
                    "ok": True,
                    "project_version": project_version(),
                    "git": git_context(),
                    "message_count": len(read_messages(100000)),
                    "telegram": {"enabled": telegram_config()["enabled"]},
                }
            )
            return
        self._send_static(path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/deploy-webhook":
            self._handle_deploy_webhook()
            return
        if parsed.path == "/api/telegram-webhook":
            self._handle_telegram_webhook()
            return
        if parsed.path != "/api/messages":
            self._send_error_json("not found", HTTPStatus.NOT_FOUND)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 16384:
            self._send_error_json("invalid request size", HTTPStatus.BAD_REQUEST)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            role = str(payload.get("role", "Agent"))
            message = str(payload.get("message", ""))
            record = append_message(role, message)
        except ValueError as exc:
            self._send_error_json(str(exc), HTTPStatus.BAD_REQUEST)
            return
        except Exception as exc:
            self._send_error_json(f"write failed: {html.escape(str(exc))}", HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self._send_json({"ok": True, "message": record}, HTTPStatus.CREATED)

    def _handle_deploy_webhook(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 262144:
            self._send_error_json("invalid request size", HTTPStatus.BAD_REQUEST)
            return
        body = self.rfile.read(length)
        ok, reason = verify_github_signature(self.headers, body)
        if not ok:
            self._send_error_json(reason, HTTPStatus.FORBIDDEN)
            return
        event = self.headers.get("X-GitHub-Event", "")
        try:
            payload = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self._send_error_json("invalid json", HTTPStatus.BAD_REQUEST)
            return
        if event == "ping":
            self._send_json({"ok": True, "event": "ping", "message": "pong"})
            return
        if event != "push":
            self._send_json({"ok": True, "ignored": True, "event": event})
            return
        ref = str(payload.get("ref", ""))
        if ref != "refs/heads/main":
            self._send_json({"ok": True, "ignored": True, "event": event, "ref": ref})
            return
        start_deploy_thread(payload)
        self._send_json({"ok": True, "accepted": True, "event": event, "ref": ref}, HTTPStatus.ACCEPTED)

    def _handle_telegram_webhook(self) -> None:
        ok, reason = verify_telegram_secret(self.headers)
        if not ok:
            self._send_error_json(reason, HTTPStatus.FORBIDDEN)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length <= 0 or length > 262144:
            self._send_error_json("invalid request size", HTTPStatus.BAD_REQUEST)
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            self._send_error_json("invalid json", HTTPStatus.BAD_REQUEST)
            return
        try:
            accepted = process_telegram_update(payload)
        except Exception as exc:
            self._send_error_json(f"telegram update failed: {html.escape(str(exc))}", HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self._send_json({"ok": True, "accepted": accepted})

    def _send_static(self, path: str) -> None:
        if path in {"", "/"}:
            target = STATIC_DIR / "index.html"
        else:
            safe = pathlib.PurePosixPath(path.lstrip("/"))
            if ".." in safe.parts:
                self.send_error(HTTPStatus.FORBIDDEN)
                return
            target = STATIC_DIR / safe
        if not target.exists() or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        body = target.read_bytes()
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        if target.name.endswith(".js"):
            content_type = "application/javascript"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Cache-Control", "no-store" if target.name == "index.html" else "public, max-age=60")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("AI_CHAT_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("AI_CHAT_PORT", "8765")))
    args = parser.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"telegram bridge {'enabled' if telegram_config()['enabled'] else 'disabled'}")
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"ai_chat listening on http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        time.sleep(0.1)


if __name__ == "__main__":
    main()
