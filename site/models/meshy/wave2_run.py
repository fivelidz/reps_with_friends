#!/usr/bin/env python3
"""wave2_run.py — the wave-2 Meshy asset scheduler (2026-09-11).

Drives the full chain for 13 assets at the account's concurrency cap:
  preview (text-to-3d, should_remesh baked in) → refine (PBR 2k)
  → [characters only] rig (auto-rig mixamo) → download GLBs.

Keeps up to MAXFLIGHT text-to-3d tasks running; on HTTP 429 backs off and
lowers the in-flight cap (min 1). Every submit/terminal event is appended to
logs/wave2_scheduler.jsonl for the manifest. Refined GLBs land in
wave2/<tag>.glb (+ <tag>_thumb.png); rigged characters also get
wave2/<tag>_rigged.glb + <tag>_walk.glb (Meshy's basic walk, used by the
two-frame delta verify).

Usage: python3 wave2_run.py            # full run, resumable (state file)
       python3 wave2_run.py --status   # one status sweep, no submission
"""

import json, os, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MESHY = os.path.join(HERE, "meshy.py")
OUT = os.path.join(HERE, "wave2")
LOGJ = os.path.join(HERE, "logs", "wave2_scheduler.jsonl")
os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.dirname(LOGJ), exist_ok=True)

CHARACTERS = {"athlete_f", "dad", "teen"}
TAGS = [
    "athlete_f",
    "dad",
    "teen",
    "trophy",
    "floodlight",
    "stands",
    "hurdle",
    "scoreboard",
    "jumprope",
    "bands",
    "weights",
    "medal",
    "bottle",
]
MAXFLIGHT = 3


def jlog(obj):
    with open(LOGJ, "a") as f:
        f.write(json.dumps({"t": time.strftime("%H:%M:%S"), **obj}) + "\n")


def run(args, timeout=60):
    p = subprocess.run(
        ["python3", MESHY] + args, capture_output=True, text=True, timeout=timeout
    )
    return p.stdout.strip(), p.stderr.strip()


def submit(kind, *args):
    """POST a task via meshy.py; returns task id, "ERR", or None on 429/ratelimit."""
    out, err = run([kind, *args])
    first = out.split("\n", 1)[0]
    parts = first.split(" ", 1)
    code = parts[0] if parts else "?"
    if code == "429":
        return None
    try:
        d = json.loads(parts[1] if len(parts) > 1 else "{}")
    except Exception:
        jlog(
            {
                "ev": "submit_parse_fail",
                "kind": kind,
                "args": args,
                "out": out[:300],
                "err": err[:200],
            }
        )
        return "ERR"
    tid = d.get("result")
    if code not in ("200", "202") or not tid:
        jlog({"ev": "submit_fail", "kind": kind, "args": args, "code": code, "resp": d})
        return "ERR"
    jlog({"ev": "submitted", "kind": kind, "tag": args[0], "id": tid})
    return tid


def state_of(tid):
    out, _ = run(["status", tid], timeout=30)
    try:
        return json.loads(out.split("\n", 1)[0])
    except Exception:
        return {}


def add_credits(st, tag, tid, credits):
    """Count a task's credits once (reaps may see the same terminal task twice
    across scheduler restarts — flight is re-seeded from the state file)."""
    counted = st[tag].setdefault("counted", [])
    if tid in counted:
        return
    if isinstance(credits, (int, float)):
        st[tag]["credits"] += credits
    counted.append(tid)


def fetch_task_outputs(tag, tid):
    """GLB + thumbnail via meshy.py download (it re-GETs the task internally —
    NEVER parse meshy.py's printed URLs: the status line truncates them to 120
    chars, which 403s on CloudFront — the wave-2 first-run lesson)."""
    ok_glb = run(["download", tid, "glb", f"wave2/{tag}.glb"], timeout=330)[0]
    if "saved" in ok_glb:
        st_glb = f"wave2/{tag}.glb"
    else:
        jlog({"ev": "download_fail", "tag": tag, "out": ok_glb[:200]})
        st_glb = None
    run(["download", tid, "thumb", f"wave2/{tag}_thumb.png"], timeout=120)
    return st_glb


def fetch_rig_outputs(tag, tid):
    """Rigged GLB + Meshy's basic walk via rigdownload (same task-id rule)."""
    out_glb = run(["rigdownload", tid, "glb", f"wave2/{tag}_rigged.glb"], timeout=330)[
        0
    ]
    rigged = f"wave2/{tag}_rigged.glb" if "saved" in out_glb else None
    if not rigged:
        jlog({"ev": "download_fail", "tag": tag, "kind": "rig", "out": out_glb[:200]})
    run(["rigdownload", tid, "walking_glb_url", f"wave2/{tag}_walk.glb"], timeout=330)
    return rigged


def blank(tag):
    return {
        "tag": tag,
        "preview": None,
        "preview_ok": None,
        "refine": None,
        "rig": None,
        "glb": None,
        "rigged": None,
        "walk": None,
        "credits": 0,
        "done": False,
        "fail_preview": 0,
        "fail_refine": 0,
        "fail_rig": 0,
    }


def load_state():
    fn = os.path.join(HERE, "wave2_state.json")
    st: dict = {}
    if os.path.exists(fn):
        with open(fn) as f:
            st = json.load(f)
    for t in TAGS:
        st.setdefault(t, blank(t))
    return st


def save_state(st):
    with open(os.path.join(HERE, "wave2_state.json"), "w") as f:
        json.dump(st, f, indent=1)


def status_sweep():
    st = load_state()
    for t in TAGS:
        d = st[t]
        print(
            t,
            json.dumps(
                {
                    k: d.get(k)
                    for k in (
                        "preview",
                        "preview_ok",
                        "refine",
                        "rig",
                        "glb",
                        "rigged",
                        "done",
                        "credits",
                    )
                }
            ),
        )


def main():
    st = load_state()
    save_state(st)
    # adopt the 3 previews submitted from the shell during the 429 burst
    try:
        with open("/tmp/wave2_tasks.txt") as f:
            for line in f:
                parts = line.split()
                if (
                    len(parts) == 3
                    and parts[2]
                    and parts[1] == "202"
                    and not st[parts[0]]["preview"]
                ):
                    st[parts[0]]["preview"] = parts[2]
                    jlog({"ev": "adopted", "tag": parts[0], "id": parts[2]})
    except FileNotFoundError:
        pass
    save_state(st)

    flight = {}  # tid -> [tag, kind]
    for t in TAGS:
        for k in ("preview", "refine", "rig"):
            if st[t][k]:
                flight[st[t][k]] = [t, k]

    cap = MAXFLIGHT
    t0 = time.time()
    running = True
    while running:
        running = False
        # 1) reap terminal text-to-3d tasks
        for tid in [k for k, v in flight.items() if v[1] in ("preview", "refine")]:
            running = True
            tag, kind = flight[tid]
            s = state_of(tid)
            status = s.get("status")
            if status not in ("SUCCEEDED", "FAILED", "CANCELED"):
                continue
            credits = s.get("consumed_credits") or 0
            add_credits(st, tag, tid, credits)
            jlog(
                {
                    "ev": "terminal",
                    "tag": tag,
                    "kind": kind,
                    "id": tid,
                    "status": status,
                    "credits": credits,
                    "err": s.get("task_error"),
                }
            )
            del flight[tid]
            if status == "SUCCEEDED" and kind == "preview":
                st[tag]["preview_ok"] = tid  # refine input
            elif status == "SUCCEEDED" and kind == "refine":
                st[tag]["glb"] = fetch_task_outputs(tag, tid)
                if st[tag]["glb"] and tag in CHARACTERS:
                    st[tag]["rig"] = "QUEUED"  # picked up below
                elif st[tag]["glb"]:
                    st[tag]["done"] = True
                else:
                    jlog({"ev": "skip", "tag": tag, "why": "refine ok but GLB missing"})
                    st[tag]["done"] = True
            elif status != "SUCCEEDED":
                key = f"fail_{kind}"
                st[tag][key] = st[tag].get(key, 0) + 1
                if st[tag][key] >= 2:
                    jlog({"ev": "skip", "tag": tag, "why": f"{kind} failed twice"})
                    st[tag]["done"] = True
                    st[tag][key.replace("fail_", "skipped_")] = True
                elif kind == "preview":
                    st[tag]["preview"] = None  # resubmit
                else:
                    st[tag]["refine"] = None  # resubmit
            save_state(st)
        # 2) queue refines for finished previews (one submit attempt per loop)
        for t in TAGS:
            if st[t]["preview_ok"] and not st[t]["refine"] and not st[t]["done"]:
                tid = submit("refine", t, st[t]["preview_ok"], "true")
                if tid and tid != "ERR":
                    st[t]["refine"] = tid
                    flight[tid] = [t, "refine"]
                elif tid == "ERR":
                    st[t]["done"] = True
                save_state(st)
                break
        # 3) queue previews while capacity remains
        while len(flight) < cap:
            nxt = next(
                (
                    t
                    for t in TAGS
                    if not st[t]["preview"]
                    and not st[t]["refine"]
                    and not st[t]["preview_ok"]
                    and not st[t]["done"]
                ),
                None,
            )
            if not nxt:
                break
            tid = submit("preview", nxt, f"params_wave2_{nxt}.json")
            if tid and tid != "ERR":
                st[nxt]["preview"] = tid
                flight[tid] = [nxt, "preview"]
            elif tid == "ERR":
                st[nxt]["done"] = True
            else:
                cap = max(1, cap - 1)  # 429 backoff
                time.sleep(15)
            save_state(st)
            break  # one attempt per loop; 429 handling above
        if any(flight.values()):
            running = True
        # 4) queue rigs (separate endpoint, eager submit, tolerate 429)
        for t in TAGS:
            if st[t]["rig"] == "QUEUED" and st[t]["refine"]:
                tid = submit("rig", t, st[t]["refine"])
                if tid and tid != "ERR":
                    st[t]["rig"] = tid
                    flight[tid] = [t, "rig"]
                elif tid == "ERR":
                    st[t]["fail_rig"] += 1
                    if st[t]["fail_rig"] >= 2:
                        st[t]["rig"] = None
                        st[t]["skipped_rig"] = True
                        st[t]["done"] = True
                        jlog(
                            {
                                "ev": "skip_rig",
                                "tag": t,
                                "why": "rig submit failed twice",
                            }
                        )
                    else:
                        st[t]["rig"] = "QUEUED"  # retry next loop
                else:
                    time.sleep(15)  # 429
                save_state(st)
                break
        # 5) reap terminal rigs
        for tid in [k for k, v in flight.items() if v[1] == "rig"]:
            running = True
            tag = flight[tid][0]
            out, _ = run(["rigpoll", tid, "1"], timeout=40)
            if "TERMINAL" not in out:
                continue
            line = next((l for l in out.split("\n") if l.startswith("TERMINAL")), "")
            status = line.split()[1] if len(line.split()) > 1 else "?"
            _, d2 = run(["rigstatus", tid], timeout=30)
            credits = 0
            try:
                credits = json.loads(d2).get("consumed_credits") or 0
            except Exception:
                pass
            add_credits(st, tag, tid, credits)
            jlog(
                {
                    "ev": "terminal",
                    "tag": tag,
                    "kind": "rig",
                    "id": tid,
                    "status": status,
                    "credits": credits,
                }
            )
            if status == "SUCCEEDED":
                rigged = fetch_rig_outputs(tag, tid)
                if rigged:
                    st[tag]["rigged"] = rigged
                    walk = f"wave2/{tag}_walk.glb"
                    st[tag]["walk"] = (
                        walk if os.path.exists(os.path.join(HERE, walk)) else None
                    )
                st[tag]["done"] = True
            else:
                st[tag]["fail_rig"] += 1
                if st[tag]["fail_rig"] < 2:
                    st[tag]["rig"] = "QUEUED"  # one retry
                else:
                    st[tag]["rig"] = None
                    st[tag]["skipped_rig"] = True
                    st[tag]["done"] = True
                    jlog({"ev": "skip_rig", "tag": tag, "why": "rig failed twice"})
            del flight[tid]
            save_state(st)
        if not running or time.time() - t0 > 7200:
            if running:
                jlog({"ev": "global_timeout"})
            break
        time.sleep(12)

    save_state(st)
    print("=== WAVE2 SCHEDULER DONE ===")
    total = 0
    for t in TAGS:
        d = st[t]
        total += d.get("credits", 0)
        print(
            f"{t:11s} glb={str(d.get('glb') or '-'):20s} rigged={str(d.get('rigged') or '-'):26s} "
            f"credits={d.get('credits', 0)} done={d.get('done')}"
        )
    print("TOTAL_CREDITS", total)


if __name__ == "__main__":
    if "--status" in sys.argv:
        status_sweep()
    else:
        main()
