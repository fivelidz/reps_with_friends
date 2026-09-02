#!/usr/bin/env python3
"""GLM API caller for the img2threejs run (docs/23 §5).

Anthropic-compatible endpoint: POST https://api.z.ai/api/anthropic/v1/messages
- key from repo .env ZAI_API_KEY; fallback ~/.local/share/opencode/auth.json
  (zai, zai2, zai3, zhipuai — tried in order on 401/403/quota errors)
- the key is NEVER printed or logged
- every call appends {ts, provider, model, in/out/total tokens, prompt-name,
  stop_reason, text} to glm_transcript.jsonl for cost accounting

Usage:
  glm_call.py <prompt_name> <payload.json>          # payload = full body minus key/model handled here
  glm_call.py vision_test                            # built-in smoke test
"""

import base64, json, os, sys, time, urllib.request, urllib.error, pathlib

RUN = pathlib.Path(__file__).parent
ENV = RUN.parents[2] / ".env"
AUTH = pathlib.Path.home() / ".local/share/opencode/auth.json"
URL = "https://api.z.ai/api/anthropic/v1/messages"
DEFAULT_MODEL = os.environ.get("GLM_MODEL", "glm-5.3")


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
                if isinstance(v, dict) and v.get("key"):
                    keys.append((f"auth.json:{prov}", v["key"]))
        except Exception:
            pass
    seen, out = set(), []
    for n, k in keys:
        if k not in seen:
            seen.add(k)
            out.append((n, k))
    return out


def call(provider, key, body, timeout=240):
    req = urllib.request.Request(
        URL,
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": key,
            "authorization": f"Bearer {key}",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read()), time.time() - t0
    except urllib.error.HTTPError as e:
        return {
            "_http_error": e.code,
            "_body": e.read().decode(errors="replace")[:400],
        }, time.time() - t0


def log(rec):
    with open(RUN / "glm_transcript.jsonl", "a") as f:
        f.write(json.dumps(rec) + "\n")


def send(prompt_name, body, model=None):
    body = dict(body)
    body.setdefault("max_tokens", 4096)
    keys = load_keys()
    if not keys:
        print("NO KEYS FOUND")
        sys.exit(2)
    last = None
    for prov, key in keys:
        body["model"] = model or DEFAULT_MODEL
        res, dt = call(prov, key, body)
        if "_http_error" in res:
            last = (prov, res)
            print(
                f"[{prov}] HTTP {res['_http_error']}: {res['_body'][:180]}",
                file=sys.stderr,
            )
            continue  # try next key
        u = res.get("usage", {})
        rec = {
            "ts": time.strftime("%FT%T"),
            "provider": prov,
            "model": body["model"],
            "prompt": prompt_name,
            "seconds": round(dt, 1),
            "in": u.get("input_tokens"),
            "out": u.get("output_tokens"),
            "stop": res.get("stop_reason"),
        }
        log(rec)
        text = "".join(b.get("text", "") for b in res.get("content", []))
        return res, rec, text
    print(f"ALL KEYS FAILED. last={last}", file=sys.stderr)
    sys.exit(3)


def img_block(path, max_side=768):
    raw = pathlib.Path(path).read_bytes()
    from PIL import Image
    import io

    im = Image.open(io.BytesIO(raw)).convert("RGB")
    if max(im.size) > max_side:
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "PNG")
        raw = buf.getvalue()
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": base64.b64encode(raw).decode(),
        },
    }


# ── NATIVE v4 VISION (glm-4.6v) ─────────────────────────────────────────────
# The anthropic shim on api.z.ai is TEXT-ONLY (glm-5.3 refuses images; glm-4.6
# confabulates — verified by colour-canary 2026-09-02, see docs/23 §5). Real
# vision = native /api/paas/v4/chat/completions with a -v model on the zhipuai
# key (zai/zai3 keys return 1113 insufficient-balance for vision models).
V4_URL = "https://api.z.ai/api/paas/v4/chat/completions"


def v4_keys():
    return [(n, k) for n, k in load_keys() if n.endswith("zhipuai")]


def vision_call(
    prompt_name,
    image_path,
    text,
    model="glm-4.6v",
    system=None,
    max_tokens=4096,
    max_side=768,
):
    """One vision call through the native v4 API. Returns response text."""
    import io
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
        {"type": "text", "text": text},
    ]
    body = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": content}],
    }
    if system:
        body["messages"].insert(0, {"role": "system", "content": system})
    last = None
    for prov, key in v4_keys():
        req = urllib.request.Request(
            V4_URL,
            data=json.dumps(body).encode(),
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
        )
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                res = json.loads(r.read())
        except urllib.error.HTTPError as e:
            last = (prov, e.code, e.read().decode(errors="replace")[:200])
            print(f"[v4 {prov}] HTTP {e.code}", file=sys.stderr)
            continue
        msg = res["choices"][0]["message"]
        text_out = msg.get("content") or ""
        u = res.get("usage", {})
        log(
            {
                "ts": time.strftime("%FT%T"),
                "provider": f"v4:{prov}",
                "model": model,
                "prompt": prompt_name,
                "seconds": round(time.time() - t0, 1),
                "in": u.get("prompt_tokens"),
                "out": u.get("completion_tokens"),
                "stop": res["choices"][0].get("finish_reason"),
            }
        )
        return text_out
    print(f"V4 ALL KEYS FAILED last={last}", file=sys.stderr)
    sys.exit(3)


if __name__ == "__main__":
    if sys.argv[1] == "vision_test":
        body = {
            "max_tokens": 600,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        img_block(RUN / "test_subject.png"),
                        {
                            "type": "text",
                            "text": "Describe this image precisely: subject, palette (name the hex-like colours), head-worn items, garment, expression, and the single most distinctive silhouette feature. Be terse (<=150 words).",
                        },
                    ],
                }
            ],
        }
        res, rec, text = send("vision_test", body)
        print(json.dumps(rec, indent=1))
        print("---")
        print(text)
    else:
        name, payload = sys.argv[1], json.loads(pathlib.Path(sys.argv[2]).read_text())
        res, rec, text = send(name, payload)
        print(json.dumps(rec, indent=1))
        print("---")
        print(text)
