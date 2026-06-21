#!/usr/bin/env python3
"""
Klavity verify lane — gates prod on the test suite ("e2e where possible").

Runs in an ISOLATED clone (~/.config/klav-orchestrator/verify) so it never
contends with the merge-train's git locks. Each cycle:
  - fetch origin/master
  - if master advanced beyond `verified`: run `bun test` (530 integration tests, ~25s)
  - PASS  -> fast-forward the `verified` branch to that sha (prod deploys `verified`)
            and trigger a prod deploy
  - FAIL  -> cmux notify with the failure; leave `verified` (prod stays on last good)
  - opt-out: a commit whose message contains [skip-e2e] is promoted without testing

Prod's autodeploy.sh deploys origin/verified (not origin/master), with
health-rollback as the final safety net.

Control:  python3 klav-verify.py {start|stop|status|run}
"""
import os, sys, subprocess, time, datetime

VC = os.path.expanduser("~/.config/klav-orchestrator/verify")
STATE_DIR = os.path.expanduser("~/.config/klav-orchestrator")
LOG_FILE = os.path.join(STATE_DIR, "verify.log")
PID_FILE = os.path.join(STATE_DIR, "verify.pid")
CMUX = "/Applications/cmux.app/Contents/Resources/bin/cmux"
WORKSPACE = "workspace:2"
PROD_SSH = "root@66.135.20.62"
CYCLE = 30
TEST_TIMEOUT = 180

os.makedirs(STATE_DIR, exist_ok=True)

def log(m):
    line = f"[{datetime.datetime.now():%F %T}] {m}"
    print(line, flush=True)
    try: open(LOG_FILE, "a").write(line + "\n")
    except Exception: pass

def sh(args, cwd=None, timeout=300):
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout, r.stderr
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except Exception as e:
        return 1, "", str(e)

def git(args, timeout=120):
    return sh(["git"] + args, cwd=VC, timeout=timeout)

def notify(title, body):
    sh([CMUX, "notify", "--title", title, "--body", body, "--workspace", WORKSPACE])
    log(f"🔔 {title} — {body}")

def trigger_deploy():
    sh(["ssh", "-o", "ConnectTimeout=8", PROD_SSH,
        "/opt/klav/scripts/autodeploy.sh >/dev/null 2>&1 &"], timeout=20)

def rev(ref):
    c, o, _ = git(["rev-parse", ref])
    return o.strip() if c == 0 else ""

def run_tests():
    """Return (passed: bool, summary: str)."""
    sh(["bun", "install", "--silent"], cwd=os.path.join(VC, "prototype"), timeout=180)
    code, out, err = sh(["bun", "test"], cwd=os.path.join(VC, "prototype"), timeout=TEST_TIMEOUT)
    text = (out or "") + (err or "")
    # bun prints "N pass" / "N fail"
    import re
    mfail = re.search(r'(\d+)\s+fail', text)
    mpass = re.search(r'(\d+)\s+pass', text)
    if code == 124:
        return False, "test run timed out"
    failed = int(mfail.group(1)) if mfail else (0 if code == 0 else 1)
    passed_n = int(mpass.group(1)) if mpass else 0
    if failed == 0 and code == 0:
        return True, f"{passed_n} pass"
    # collect a few failing test names
    fails = re.findall(r'\(fail\)\s+(.+)', text)[:4]
    return False, f"{failed} fail / {passed_n} pass" + (": " + "; ".join(fails) if fails else "")

def cycle(state):
    git(["fetch", "-q", "origin", "master", "verified"])
    master = rev("origin/master")
    verified = rev("origin/verified")
    if not master or master == verified:
        return
    if master == state.get("last_tested"):
        return  # already evaluated this sha (and it failed); wait for a new one
    git(["reset", "-q", "--hard", master])
    _, msg, _ = git(["log", "-1", "--format=%B"])
    if "[skip-e2e]" in (msg or ""):
        passed, summary = True, "skip-e2e"
    else:
        log(f"testing {master[:7]} …")
        passed, summary = run_tests()
    state["last_tested"] = master
    if passed:
        c, o, e = git(["push", "origin", f"{master}:refs/heads/verified"])
        if c == 0:
            log(f"✅ verified {master[:7]} ({summary}) → prod")
            trigger_deploy()
        else:
            log(f"verify push failed: {e.strip()}")
    else:
        notify("❌ e2e FAILED — holding deploy", f"{master[:7]}: {summary}")

def main():
    log("=== Klavity verify lane started ===")
    state = {}
    while True:
        try: cycle(state)
        except Exception as e: log(f"cycle error: {e}")
        time.sleep(CYCLE)

def _alive(pid):
    try: os.kill(pid, 0); return True
    except OSError: return False

def start():
    if os.path.exists(PID_FILE):
        try:
            pid = int(open(PID_FILE).read().strip())
            if _alive(pid): print(f"already running (pid {pid})"); return
        except Exception: pass
    lf = open(os.path.join(STATE_DIR, "verify.daemon.log"), "a")
    p = subprocess.Popen([sys.executable, "-u", os.path.abspath(__file__), "run"],
                         stdout=lf, stderr=lf, stdin=subprocess.DEVNULL, start_new_session=True)
    open(PID_FILE, "w").write(str(p.pid))
    print(f"started verify lane (pid {p.pid})")

def stop():
    try:
        pid = int(open(PID_FILE).read().strip()); os.kill(pid, 15); print(f"stopped {pid}")
    except Exception as e: print(f"not running / {e}")
    try: os.remove(PID_FILE)
    except Exception: pass

def status():
    try:
        pid = int(open(PID_FILE).read().strip())
        print(f"running (pid {pid})" if _alive(pid) else "stale, not running")
    except Exception: print("stopped")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    {"start": start, "stop": stop, "status": status}.get(cmd, main)()
