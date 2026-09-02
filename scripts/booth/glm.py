#!/usr/bin/env python3
"""glm.py — GLM API caller for the PHOTO BOOTH (apps/booth, /api/booth).

Mirrors the PROVEN caller from scripts/img2threejs_run/glm_call.py (docs/23 §5)
with two changes: calls return (text, usage-rec) so generate.py can cost-account
per run, and every call is appended to .data/booth-log.jsonl (the booth cost log).

Routes (verified 2026-09-02, docs/23 §5.2 — do not change without a canary):
  TEXT  (glm-5.3)   POST https://api.z.ai/api/anthropic/v1/messages
                    keys: .env ZAI_API_KEY, then auth.json {zai,zai2,zai3,zhipuai}
  VISION (glm-4.6v) POST https://api.z.ai/api/paas/v4/chat/completions
                    keys: auth.json zhipuai ONLY (zai/zai3 = 1113 no vision balance)
The anthropic shim is TEXT-ONLY — never send it images (glm-4.6 confabulates).

Keys are NEVER printed or logged. Images are downsized before upload.
"""

import base64
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

REPO = pathlib.Path(__file__).resolve().parents[2]
AUTH = pathlib.Path.home() / ".local/share/opencode/auth.json"
ENV = REPO / ".env"
LOG = REPO / ".data/booth-log.jsonl"

SHIM_URL = "https://api.z.ai/api/anthropic/v1/messages"
V4_URL = "https://api.z.ai/api/paas/v4/chat/completions"


def load_keys():
    keys = []
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if line.startswith("ZAI_API_KEY="):
                keys.append(
                    ("env:ZAI_API_KEY", line.split("=", 1)[1].strip().strip('"'))
                )
    if AUTH.exists():
        try:
            d = json.loads(AUTH.read_text())
            for prov in ("zai", "zai2", "zai3", "zhipuai"):
                v = d.get(prov)
                if isinstance(v, dict) and isinstance(v.get("key"), str):
                    keys.append((f"auth.json:{prov}", v["key"]))
        except Exception:
            pass
    seen, out = set(), []
    for n, k in keys:
        if k in seen:
            # same key under several aliases (2026-09-03: .env ZAI_API_KEY ==
            # auth.json zhipuai) — keep the entry but let the more specific
            # vision-capable label ("...zhipuai") win, so name-based route
            # selection still works after dedupe
            for i, (en, ek) in enumerate(out):
                if ek == k and n.endswith("zhipuai"):
                    out[i] = (n, k)
            continue
        seen.add(k)
        out.append((n, k))
    return out


def log(rec):
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG, "a") as f:
        f.write(json.dumps(rec) + "\n")


class GLMHttpError(Exception):
    pass


def _http(url, key, body, timeout, headers):
    """POST json. Returns (parsed_response, seconds) or raises GLMHttpError."""
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", **headers},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read()), time.time() - t0
    except urllib.error.HTTPError as e:
        raise GLMHttpError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}")


def send_text(stage, system, user, max_tokens=8000, model="glm-5.3"):
    """glm-5.3 via the anthropic shim. Returns (text, rec). Raises on total failure.
    Thinking disabled — §5.3 lost two calls to hidden reasoning truncation;
    canary-verified the shim honours the anthropic thinking param (14→3 tokens)."""
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "thinking": {"type": "disabled"},
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    last = None
    for prov, key in load_keys():
        try:
            res, dt = _http(
                SHIM_URL,
                key,
                body,
                240,
                {
                    "x-api-key": key,
                    "authorization": f"Bearer {key}",
                    "anthropic-version": "2023-06-01",
                },
            )
        except GLMHttpError as e:
            last = (prov, str(e))
            print(f"PHASE_WARN text via {prov}: {e}", file=sys.stderr)
            continue
        u = res.get("usage") or {}
        rec = {
            "ts": time.strftime("%FT%T"),
            "type": "call",
            "stage": stage,
            "route": "shim",
            "provider": prov,
            "model": model,
            "in": u.get("input_tokens"),
            "out": u.get("output_tokens"),
            "seconds": round(dt, 1),
            "stop": res.get("stop_reason"),
        }
        log(rec)
        text = "".join(b.get("text", "") for b in res.get("content") or [])
        return text, rec
    raise RuntimeError(f"text call failed on all keys, last={last}")


def send_vision(
    stage,
    image_path,
    prompt,
    system=None,
    max_tokens=3000,
    model="glm-4.6v",
    max_side=512,
):
    """glm-4.6v via native v4 API (the ONLY real-vision route — docs/23 §5.2).
    Downsizes the image to max_side first. Returns (text, rec)."""
    from PIL import Image

    raw = pathlib.Path(image_path).read_bytes()
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "PNG")
        raw = buf.getvalue()
    b64 = base64.b64encode(raw).decode()

    content = [
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
        {"type": "text", "text": prompt},
    ]
    msgs = ([{"role": "system", "content": system}] if system else []) + [
        {"role": "user", "content": content}
    ]
    body = {
        "model": model,
        "max_tokens": max_tokens,
        # glm-4.6v THINKS by default — it burned a full 3000-token budget on
        # hidden reasoning and truncated the JSON (seen live 2026-09-03,
        # stop=length at 88s). Disabled = fast, terse, parseable. Canary-verified.
        "thinking": {"type": "disabled"},
        "messages": msgs,
    }
    last = None
    for prov, key in load_keys():
        if not prov.endswith("zhipuai"):
            continue  # vision needs the funded zhipuai key
        try:
            res, dt = _http(V4_URL, key, body, 300, {"Authorization": f"Bearer {key}"})
        except GLMHttpError as e:
            last = (prov, str(e))
            print(f"PHASE_WARN vision via {prov}: {e}", file=sys.stderr)
            continue
        choice = res["choices"][0]
        u = res.get("usage") or {}
        rec = {
            "ts": time.strftime("%FT%T"),
            "type": "call",
            "stage": stage,
            "route": "v4",
            "provider": prov,
            "model": model,
            "in": u.get("prompt_tokens"),
            "out": u.get("completion_tokens"),
            "seconds": round(dt, 1),
            "stop": choice.get("finish_reason"),
        }
        log(rec)
        return choice["message"].get("content") or "", rec
    raise RuntimeError(f"vision call failed (zhipuai key unusable), last={last}")


if __name__ == "__main__":
    # smoke: one tiny text call, print usage only (never the key)
    text, rec = send_text("smoke", "You are terse.", "Reply with exactly: ok")
    print(json.dumps(rec))
    print(text[:80])
