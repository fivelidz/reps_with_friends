#!/usr/bin/env python3
"""meshy.py — Meshy API v2 helper for the Reps With Friends frog experiment.

Usage (key sourced from ~/.secrets/meshy.env, NEVER printed):
  python3 meshy.py preview  <tag> <json-params-file>   # create text-to-3d preview task
  python3 meshy.py refine   <tag> <preview-id> [pbr]   # refine (texture) a preview
  python3 meshy.py status   <task-id>                  # one status line + json to logs/
  python3 meshy.py poll     <task-id> [timeout_s]      # poll until terminal state
  python3 meshy.py download <task-id> <kind> <dest>    # kind: glb|obj|fbx|thumb|texture
  python3 meshy.py rig      <tag> <input-task-id>      # auto-rig a textured task
  python3 meshy.py balance                              # print credit balance

All responses are appended to logs/<tag>_<taskid>.json in this directory.
"""

import json, os, sys, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.path.join(HERE, "logs")
os.makedirs(LOGS, exist_ok=True)


def get_key():
    env = os.path.expanduser("~/.secrets/meshy.env")
    with open(env) as f:
        for line in f:
            line = line.strip()
            if line.startswith("MESHY_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("no MESHY_API_KEY in ~/.secrets/meshy.env")


KEY = get_key()
BASE = "https://api.meshy.ai"


def _jd(raw: str) -> dict:
    v = json.loads(raw or "{}")
    return v if isinstance(v, dict) else {"_raw": v}



def sub(d: dict, k: str) -> dict:
    v = d.get(k)
    return v if isinstance(v, dict) else {}

def call(method, path, body=None, timeout=60):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {KEY}")
    if data:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, _jd(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, _jd(e.read().decode())
        except Exception:
            return e.code, {"raw": str(e)}


def log(tag, taskid, obj):
    fn = (
        os.path.join(LOGS, f"{tag}_{taskid}.json")
        if tag
        else os.path.join(LOGS, f"{taskid}.json")
    )
    with open(fn, "a") as f:
        f.write(json.dumps(obj, indent=1) + "\n")


def download(url, dest):
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=300) as r, open(dest, "wb") as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    return os.path.getsize(dest)


def main():
    cmd = sys.argv[1]
    if cmd == "balance":
        st, d = call("GET", "/openapi/v1/balance")
        print(json.dumps(d))
        return
    tag = sys.argv[2]
    if cmd == "preview":
        with open(sys.argv[3]) as f:
            params = json.load(f)
        st, d = call("POST", "/openapi/v2/text-to-3d", params)
        log(
            tag,
            d.get("result", "err"),
            {"request": params, "status_code": st, "response": d},
        )
        print(st, json.dumps(d))
    elif cmd == "refine":
        preview_id = sys.argv[3]
        pbr = (sys.argv[4].lower() if len(sys.argv) > 4 else "true") == "true"
        body = {
            "mode": "refine",
            "preview_task_id": preview_id,
            "enable_pbr": pbr,
            "target_formats": ["glb"],
            "texture_resolution": "2k",
        }
        st, d = call("POST", "/openapi/v2/text-to-3d", body)
        log(
            tag,
            d.get("result", "err"),
            {"request": body, "status_code": st, "response": d},
        )
        print(st, json.dumps(d))
    elif cmd == "status":
        taskid = sys.argv[3] if len(sys.argv) > 3 else tag
        st, d = call("GET", f"/openapi/v2/text-to-3d/{taskid}")
        log("", taskid, d)
        print(
            json.dumps(
                {
                    k: d.get(k)
                    for k in (
                        "id",
                        "type",
                        "status",
                        "progress",
                        "consumed_credits",
                        "task_error",
                    )
                }
            )
        )
        if d.get("model_urls"):
            print("GLB:", str(sub(d, "model_urls").get("glb") or "")[:120])
        if d.get("thumbnail_url"):
            print("THUMB:", str(d.get("thumbnail_url"))[:120])
    elif cmd == "poll":
        taskid = tag
        timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 300
        t0 = time.time()
        while time.time() - t0 < timeout:
            st, d = call("GET", f"/openapi/v2/text-to-3d/{taskid}")
            s, p = d.get("status"), d.get("progress", 0)
            if s in ("SUCCEEDED", "FAILED", "CANCELED"):
                log("", taskid, d)
                print("TERMINAL", s, "credits:", d.get("consumed_credits"))
                print(
                    json.dumps(
                        {
                            k: d.get(k)
                            for k in ("id", "status", "consumed_credits", "task_error")
                        }
                    )
                )
                if d.get("model_urls"):
                    print("GLB:", sub(d, "model_urls").get("glb"))
                if d.get("thumbnail_url"):
                    print("THUMB:", str(d.get("thumbnail_url")))
                return 0 if s == "SUCCEEDED" else 1
            print(f"... {s} {p}%", flush=True)
            time.sleep(10)
        print("TIMEOUT")
        return 2
    elif cmd == "download":
        taskid = tag  # argv[2] is the task id for download
        kind = sys.argv[3]
        dest = os.path.join(HERE, sys.argv[4])
        st, d = call("GET", f"/openapi/v2/text-to-3d/{taskid}")
        if st != 200:
            print("ERR", st, d)
            return 1
        url = None
        if kind == "thumb":
            url = str(d.get("thumbnail_url") or "") or None
        elif kind == "texture":
            tx = d.get("texture_urls")
            url = (tx[0] or {}).get("base_color") if isinstance(tx, list) and tx else None
        elif kind == "pbr":
            url = None  # PBR maps arrive as texture_urls entries; extend if needed
        else:
            url = sub(d, "model_urls").get(kind)
        if not url:
            print("NO URL for", kind)
            return 1
        print("saved", dest, download(url, dest), "bytes")
    elif cmd == "remesh":
        input_task = sys.argv[3]
        poly = int(sys.argv[4]) if len(sys.argv) > 4 else 100000
        body = {"input_task_id": input_task, "topology": "triangle",
                "target_polycount": poly, "target_formats": ["glb"], "alpha_thumbnail": True}
        st, d = call("POST", "/openapi/v1/remesh", body)
        log(tag, d.get("result", "err"), {"request": body, "status_code": st, "response": d})
        print(st, json.dumps(d))
    elif cmd == "remeshpoll":
        taskid = tag
        timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 300
        t0 = time.time()
        while time.time() - t0 < timeout:
            st, d = call("GET", f"/openapi/v1/remesh/{taskid}")
            s, p = d.get("status"), d.get("progress", 0)
            if s in ("SUCCEEDED", "FAILED", "CANCELED"):
                log("", taskid, d)
                print("TERMINAL", s, "credits:", d.get("consumed_credits"))
                te = sub(d, "task_error")
                if te.get("message"):
                    print("ERROR:", te)
                if sub(d, "model_urls").get("glb"):
                    print("GLB:", sub(d, "model_urls").get("glb"))
                if d.get("thumbnail_url"):
                    print("THUMB:", str(d.get("thumbnail_url")))
                return 0 if s == "SUCCEEDED" else 1
            print(f"... {s} {p}%", flush=True)
            time.sleep(10)
        print("TIMEOUT")
        return 2
    elif cmd == "remeshdownload":
        taskid = tag
        dest = os.path.join(HERE, sys.argv[3])
        st, d = call("GET", f"/openapi/v1/remesh/{taskid}")
        url = sub(d, "model_urls").get("glb")
        if not url:
            print("NO GLB")
            return 1
        print("saved", dest, download(url, dest), "bytes")
    elif cmd == "rig":
        input_task = sys.argv[3]
        body = {"input_task_id": input_task}
        st, d = call("POST", "/openapi/v1/rigging", body)
        log(
            tag,
            d.get("result", "err"),
            {"request": body, "status_code": st, "response": d},
        )
        print(st, json.dumps(d))
    elif cmd == "rigstatus":
        taskid = sys.argv[3] if len(sys.argv) > 3 else tag
        st, d = call("GET", f"/openapi/v1/rigging/{taskid}")
        log("", taskid, d)
        print(
            json.dumps(
                {
                    k: d.get(k)
                    for k in (
                        "id",
                        "status",
                        "progress",
                        "consumed_credits",
                        "task_error",
                    )
                }
            )
        )
        if d.get("result"):
            print("RIGGED_GLB:", str(sub(d, "result").get("rigged_character_glb_url") or "")[:140])
    elif cmd == "rigpoll":
        taskid = tag
        timeout = int(sys.argv[3]) if len(sys.argv) > 3 else 300
        t0 = time.time()
        while time.time() - t0 < timeout:
            st, d = call("GET", f"/openapi/v1/rigging/{taskid}")
            s, p = d.get("status"), d.get("progress", 0)
            if s in ("SUCCEEDED", "FAILED", "CANCELED"):
                log("", taskid, d)
                print("TERMINAL", s, "credits:", d.get("consumed_credits"))
                te = sub(d, "task_error")
                if te.get("message"):
                    print("ERROR:", d["task_error"])
                if isinstance(d.get("result"), dict):
                    r = sub(d, "result")
                    print("RIGGED_GLB:", r.get("rigged_character_glb_url"))
                    print(
                        "WALK:",
                        (r.get("basic_animations") or {}).get("walking_glb_url"),
                    )
                return 0 if s == "SUCCEEDED" else 1
            print(f"... {s} {p}%", flush=True)
            time.sleep(10)
        print("TIMEOUT")
        return 2
    elif cmd == "rigdownload":
        taskid = tag  # argv[2] is the task id
        which = sys.argv[3]
        dest = os.path.join(HERE, sys.argv[4])
        st, d = call("GET", f"/openapi/v1/rigging/{taskid}")
        r = d.get("result") or {}
        url = (
            r.get("rigged_character_glb_url")
            if which == "glb"
            else (r.get("basic_animations") or {}).get(which)
        )
        if not url:
            print("NO URL for", which)
            return 1
        print("saved", dest, download(url, dest), "bytes")
    else:
        print(__doc__)


if __name__ == "__main__":
    sys.exit(main() or 0)
