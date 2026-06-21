#!/usr/bin/env python3
"""
Klavity orchestrator daemon — full-auto supervisor for all Claude agents in the
cmux 'Klavity' workspace.

Each cycle (~25s) it:
  1. MERGE+DEPLOY: runs the merge-train (assemble feat/* -> master, stamp, push),
     then triggers the server to pull+restart with health-rollback.
  2. CONFLICT RADAR: warns when two feat/* branches edit the same file.
  3. WATCHDOG: classifies every agent surface (running/idle/needs-input/blocked/
     conflict/error/rate-limited) and surfaces concerns via cmux notify.
  4. AUTO-UNBLOCK (full auto): nudges agents stuck on the master-hook or a merge
     conflict with the exact fix; escalates real permission prompts instead of
     blind-approving.

Run:  python3 klav-orchestrator.py run     (foreground)
      via launchd plist for persistence.
"""
import os, re, sys, json, time, subprocess, datetime

CMUX = "/Applications/cmux.app/Contents/Resources/bin/cmux"
REPO = "/Users/vishalkumar/Downloads/qbug/klav-snap"
WORKSPACE = "workspace:2"            # Klavity
SELF_SURFACES = {"surface:11"}       # this orchestrator's own supervisor pane — never drive it
PROD_SSH = "root@66.135.20.62"
CYCLE_SECS = 25
STATE_DIR = os.path.expanduser("~/.config/klav-orchestrator")
LOG_FILE = os.path.join(STATE_DIR, "orchestrator.log")
STATE_FILE = os.path.join(STATE_DIR, "state.json")

os.makedirs(STATE_DIR, exist_ok=True)

def log(msg):
    line = f"[{datetime.datetime.now():%F %T}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as f: f.write(line + "\n")
    except Exception: pass

def sh(args, cwd=None, timeout=120):
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except Exception as e:
        return 1, "", str(e)

def cmux(args, timeout=20):
    for _ in range(2):
        code, out, err = sh([CMUX] + args, timeout=timeout)
        if code == 0: return out
        if "broken pipe" in (out+err).lower(): time.sleep(0.4); continue
        return out
    return ""

def git(args, timeout=120, orchestrator=False):
    env = os.environ.copy()
    if orchestrator: env["KLAV_ORCHESTRATOR"] = "1"
    try:
        r = subprocess.run(["git"] + args, cwd=REPO, capture_output=True, text=True,
                           timeout=timeout, env=env)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except Exception as e:
        return 1, "", str(e)

# ---------------------------------------------------------------- discovery
def klav_surfaces():
    """Return [(surface_ref, title)] for every agent surface in the workspace."""
    out = cmux(["list-panes", "--workspace", WORKSPACE])
    panes = re.findall(r'(pane:\d+)', out)
    surfaces = []
    for p in panes:
        so = cmux(["list-pane-surfaces", "--workspace", WORKSPACE, "--pane", p])
        for line in so.splitlines():
            m = re.search(r'(surface:\d+)\s+\S?\s*(.*?)\s*(\[selected\])?$', line.strip())
            if m:
                ref, title = m.group(1), m.group(2).strip()
                surfaces.append((ref, title))
    return surfaces

# ---------------------------------------------------------------- classify
SPINNER = re.compile(r'esc to interrupt|tokens\)|✢|✳|⠂|⠐|wrangling|philosophising|finagling|pouncing|sautéed|cogitat', re.I)
def classify(surface):
    screen = cmux(["read-screen", "--surface", surface, "--lines", "45"])
    if not screen: return ("unknown", "")
    lines = [l for l in screen.splitlines()]
    tail = "\n".join(lines[-45:]).lower()
    nonempty = [l.strip() for l in lines if l.strip()]
    last = nonempty[-1] if nonempty else ""

    if re.search(r'rate limit|session limit|try again in|limiting requests|usage limit', tail):
        return ("rate_limited", last)
    if re.search(r'blocked: you are on .master|pushing to master is reserved', tail):
        return ("blocked_master", "on master / pushing master (hook blocked)")
    if re.search(r'conflict \(content\)|unmerged paths|fix conflicts and|both modified|merge --abort|rebase --abort', tail):
        return ("git_conflict", "merge/rebase conflict")
    # real permission/decision prompt awaiting the human
    if re.search(r'do you want to proceed|allow this|approve this|\(y/n\)|press enter to|❯ 1\.|1\. yes', tail) \
       and not SPINNER.search("\n".join(lines[-4:])):
        return ("needs_input", last[:80])
    if re.search(r'\bfatal:|\berror:|traceback \(most recent|exception:|command failed|exit code [1-9]', tail):
        return ("error", last[:80])
    if SPINNER.search("\n".join(lines[-6:])):
        return ("running", "")
    if last.startswith("❯") or last == "❯":
        return ("idle", "at prompt")
    return ("running", "")

# ---------------------------------------------------------------- radar
def conflict_radar():
    code, out, _ = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
    branches = [b for b in out.splitlines() if b.startswith("feat/")]
    files = {}
    for b in branches:
        c, o, _ = git(["diff", "--name-only", f"master...{b}"])
        if o.strip(): files[b] = set(o.splitlines())
    warns = []
    bl = list(files)
    for i in range(len(bl)):
        for j in range(i+1, len(bl)):
            common = files[bl[i]] & files[bl[j]]
            # ignore version/changelog files (orchestrator owns those)
            common = {f for f in common if f not in (
                "CHANGELOG.md","docs/PRD.md","package.json",
                "packages/core/package.json","packages/extension/package.json",
                "packages/extension/manifest.json","packages/sdk/package.json")}
            if common:
                warns.append((bl[i], bl[j], sorted(common)))
    return warns

# ---------------------------------------------------------------- deploy
def trigger_deploy():
    sh(["ssh", "-o", "ConnectTimeout=8", PROD_SSH,
        "/opt/klav/scripts/autodeploy.sh >/dev/null 2>&1 &"], timeout=20)

# ---------------------------------------------------------------- interventions
def send_to(surface, text):
    if surface in SELF_SURFACES: return
    cmux(["send", "--surface", surface, text])
    time.sleep(0.4)
    cmux(["send-key", "--surface", surface, "enter"])
    log(f"  ↳ nudged {surface}: {text[:70]}")

def notify(title, body):
    cmux(["notify", "--title", title, "--body", body, "--workspace", WORKSPACE])
    log(f"  🔔 {title} — {body}")

# ---------------------------------------------------------------- main
def load_state():
    try:
        with open(STATE_FILE) as f: return json.load(f)
    except Exception: return {}

def save_state(s):
    try:
        with open(STATE_FILE, "w") as f: json.dump(s, f)
    except Exception: pass

def cycle(state):
    # 1) MERGE + DEPLOY ----------------------------------------------------
    code, out, err = sh(["bash", os.path.join(REPO, "scripts", "merge-train.sh")], timeout=180)
    for l in (out or "").splitlines():
        if "pushed" in l or "CONFLICT" in l or "FAILED" in l: log(l)
    if "pushed v" in (out or ""):
        trigger_deploy()

    # 2) RADAR -------------------------------------------------------------
    for a, b, common in conflict_radar():
        key = f"radar:{a}|{b}:{','.join(common)}"
        if key not in state.get("seen", {}):
            notify("⚠️ Conflict radar",
                   f"{a} & {b} both edit: {', '.join(common[:3])}")
            state.setdefault("seen", {})[key] = time.time()

    # 3) WATCHDOG + AUTO-UNBLOCK ------------------------------------------
    last = state.get("surface_state", {})
    now_state = {}
    summary = {"running":0,"idle":0,"needs_input":0,"blocked":0,"error":0,"rate":0}
    for surface, title in klav_surfaces():
        if surface in SELF_SURFACES:
            continue
        st, detail = classify(surface)
        now_state[surface] = st
        if st == "running": summary["running"] += 1
        elif st == "idle": summary["idle"] += 1
        elif st == "needs_input": summary["needs_input"] += 1
        elif st == "blocked_master": summary["blocked"] += 1
        elif st == "git_conflict": summary["blocked"] += 1
        elif st == "error": summary["error"] += 1
        elif st == "rate_limited": summary["rate"] += 1

        changed = last.get(surface) != st
        if not changed:
            continue

        # full-auto interventions
        if st == "blocked_master":
            notify("🚧 Agent blocked on master", f"{title[:40]} — auto-redirecting to a worktree")
            send_to(surface,
                "You're blocked because you're on master. Workers never touch master here. "
                "Run: bash " + REPO + "/scripts/new-worktree.sh " +
                (re.sub(r'[^a-z0-9 ]','',title.lower())[:24].strip() or "task") +
                " — then cd into that worktree and redo your commit on that feat/ branch. "
                "Do NOT merge to master or deploy; the orchestrator does that automatically.")
        elif st == "git_conflict":
            notify("🔀 Agent hit a merge conflict", f"{title[:40]} — auto-advising abort")
            send_to(surface,
                "You have a merge/rebase conflict. You don't need to integrate with master yourself — "
                "the orchestrator merges all feat/ branches with theirs-wins and deploys. "
                "Run `git merge --abort` (or `git rebase --abort`) and just keep committing on your feat/ branch.")
        elif st == "needs_input":
            # escalate real permission prompts to the human; don't blind-approve
            notify("✋ Agent waiting on you", f"{title[:40]}: {detail}")
        elif st == "error":
            notify("❌ Agent error", f"{title[:40]}: {detail}")
        elif st == "rate_limited":
            notify("⏳ Agent rate-limited", f"{title[:40]} (auto-resume daemon will handle)")

    # 4) STATUS ------------------------------------------------------------
    s = (f"▶{summary['running']} ✓{summary['idle']} "
         f"✋{summary['needs_input']} 🚧{summary['blocked']} ❌{summary['error']} ⏳{summary['rate']}")
    cmux(["set-status", "orchestrator", s, "--workspace", WORKSPACE])
    log(f"cycle: {s}")

    state["surface_state"] = now_state
    # prune seen radar warnings older than 1h
    seen = state.get("seen", {})
    state["seen"] = {k:v for k,v in seen.items() if time.time()-v < 3600}
    save_state(state)

def main():
    log("=== Klavity orchestrator started (full-auto) ===")
    state = load_state()
    while True:
        try:
            cycle(state)
        except Exception as e:
            log(f"cycle error: {e}")
        time.sleep(CYCLE_SECS)

if __name__ == "__main__":
    main()
