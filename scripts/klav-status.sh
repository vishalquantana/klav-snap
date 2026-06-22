#!/bin/bash
# Reliable Dev status board for the orchestrator's ticks.
# Detects WORKING via the live-spinner signature ("Verb… (timer)" / "esc to
# interrupt") in a WIDE read — the old tail-5 check missed spinners that had
# scrolled above the input box and false-reported idle.
CMUX=/Applications/cmux.app/Contents/Resources/bin/cmux
WS=workspace:2
name_for() { case "$1" in 176) echo "Dev 1";; 177) echo "Dev 2";; 189) echo "Dev 3";; 183) echo "Dev 4";; 188) echo "Dev 5";; 207) echo "Dev 6";; esac; }
for n in 176 177 189 183 188 207; do
  sid="surface:$n"
  scr="$("$CMUX" read-screen --surface "$sid" --lines 24 2>/dev/null)"
  # one confirming re-read to avoid a mid-transition false IDLE/PARKED
  if ! printf '%s' "$scr" | grep -qE '(…|\.\.\.)[[:space:]]*\(|esc to interrupt'; then
    sleep 0.6; scr="$("$CMUX" read-screen --surface "$sid" --lines 24 2>/dev/null)"
  fi
  cwd="$(printf '%s' "$scr" | grep -oE 'vishalkumar@Mac:[^ |]+' | tail -1 | sed 's/.*@Mac://')"
  if printf '%s' "$scr" | grep -qiE 'rate limit|session limit|try again in|limiting requests'; then
    st="RATE-LTD"
  elif printf '%s' "$scr" | grep -qE '(…|\.\.\.)[[:space:]]*\(|esc to interrupt'; then
    st="WORKING"
  elif printf '%s' "$scr" | grep -qE 'Enter to select|↑/↓ to navigate|Do you want to proceed|\(y/n\)|❯ 1\.'; then
    st="NEEDS-PICK"   # interactive menu — blocked on user's choice
  else
    pl="$(printf '%s' "$scr" | grep -E '^❯' | tail -1 | sed -E 's/^❯[[:space:]]*//; s/[[:space:]]*$//')"
    if [ -n "$pl" ]; then st="PARKED"
    elif printf '%s' "$scr" | grep -qiE 'your call|want me to|should i |shall i |let me know|or pause|which (one|approach|do you)|do you want|go ahead\?|\?[[:space:]]*$'; then
      st="ASKED-Q"   # finished a turn with a question — waiting on user
    else st="IDLE"; fi
  fi
  act="$(printf '%s' "$scr" | grep -oE '[A-Za-z]+(…|\.\.\.) ?\([^)]*\)' | tail -1)"
  printf '  %-6s %-9s %-26s %s\n' "$(name_for $n)" "$st" "$cwd" "$act"
done
echo "  ----"
echo "  merge-loop=[$(pgrep -f merge-loop.sh|tr '\n' ' ')] last=$(tail -3 ~/.config/klav-orchestrator/merge-loop.log 2>/dev/null|grep -oE '[0-9]{2}:[0-9]{2}:[0-9]{2}'|tail -1) autoresume=[$(pgrep -f cmux_claude_auto_resume|wc -l|tr -d ' ')]"
