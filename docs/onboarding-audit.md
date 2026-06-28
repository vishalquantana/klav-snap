# Onboarding Audit — Non-Technical Founder Persona

**Date:** 2026-06-28  
**Auditor:** Dev 1 (Klavity Worker)  
**Persona:** Priya — solo D2C skincare founder, ~12 customers, non-technical. Heard "Klavity lets her collect bug reports from visitors on her site." Does not know: widget, embed snippet, CSP, browser extension, API key, DNS, URL pattern.  
**Goal:** Find every friction point blocking Priya from receiving her first bug report.  
**Method:** Full code trace of onboarding.html, login.html, dashboard.html, server.ts + live HTTP simulation of signup flow.

---

## Executive Summary

Priya's goal — a bug report button on her site — is achievable in Klavity, but the path to it is buried, jargon-heavy, and extension-first. The welcome screen speaks entirely about Sims and AI personas, which is not the product Priya heard about. The extension install error links to a GitHub README. The widget snippet requires knowing what `</body>` is. There are no platform guides (Shopify, Webflow, Squarespace) that Priya would actually use.

**Steps to first bug report (current):** 11+ steps with 3 hard technical blockers.  
**Steps to first bug report (target):** ≤ 6 steps with zero technical knowledge required.

---

## Friction Inventory

### F1 — Welcome screen is about Sims, not bug reports (HIGH)

**What Priya sees:**  
> "Your customers review your product — before they ever see it."  
> "Klavity turns your real customer calls into **Sims** — AI personas grounded in the exact words your customers said."

**Problem:** Priya came to collect bug reports from her site visitors. The welcome screen talks about AI personas, customer call transcripts, and a "Studio." None of this matches what she wants. There is no mention of the bug report widget anywhere on the welcome step. The word "bug" does not appear in the onboarding HTML at all.

**Priya's reaction:** "Is this the right product? I wanted a bug button, not AI personas. Let me try something else."

**Recommendation:** Add a one-liner below the hero that bridges both use cases: *"Including Snap — a lightweight bug-report button your site visitors click when something breaks."* Or add a two-path welcome: "Collect bug reports from users" vs "Review with AI personas."

---

### F2 — Extension is the primary path; widget is secondary (HIGH)

**What Priya sees on Step 2:**  
- Pre-selected tile: **"Connect the Klavity extension"** — "Required for live Sims on your real pages"
- Primary CTA button: **"Connect the extension to continue →"**
- Secondary dashed tile: "Or embed the widget" (smaller, dashed border, lower visual weight)

**Problem:** Priya does not want Sims on her pages — she wants the bug report widget. But the widget path is the *secondary* option with a dashed/alt visual style. Clicking the primary CTA does nothing useful if she doesn't have the extension. The skip link ("I'll set this up later") is small, right-aligned, and easy to miss.

**Recommendation:** Flip the tile order for new users who haven't indicated they want Sims. Lead with the widget: "Add the bug button to your site" as the primary tile, "Connect the Klavity extension" as secondary. Or at minimum, make both tiles equal weight with the widget first.

---

### F3 — Extension install error links to GitHub (HIGH)

**What Priya sees** when she clicks "Connect the extension" without it installed:  
> "Klavity extension not detected. **Install it**, then click to connect."

The "Install it" link goes to: `https://github.com/vishalquantana/klav-snap#install`

**Problem:** A GitHub repository README is a developer-facing page. A non-technical founder landing on a GitHub repo full of code would immediately leave. The Chrome Web Store URL exists and is used correctly on the marketing page and dashboard (`https://chromewebstore.google.com/detail/olahjdcgbdjajbfmgnakjlehgjdmaene`) but the onboarding uses the wrong link.

**Fix implemented in this commit:** Changed GitHub link → Chrome Web Store link.

---

### F4 — Widget snippet requires knowing HTML (HIGH)

**What Priya sees** when she opens the widget tile:  
```
<script src="https://klavity.quantana.top/widget.js" data-project="proj_xxx" defer></script>
```
*"Your project ID is filled in — paste this before `</body>` on any page."*

**Problem:**
- Priya does not know what `</body>` is
- She does not know how to add JavaScript to her Shopify/Webflow/Squarespace/Wix site
- There are zero platform-specific guides
- No "What do I do with this?" helper text for non-technical users

**Recommendation:**
1. Add a "Where to paste this?" expandable section with platform tabs: Shopify, Webflow, Squarespace, Wix, Custom HTML — each with 2-sentence instructions
2. Add helper text: *"Paste this once and it works on every page — no coding needed if you're on Shopify or Webflow."*

---

### F5 — "Work email" label may exclude personal emails (MED)

**What Priya sees:**  
Label: **"Work email"**, placeholder: `you@acme.com`

**Problem:** Priya runs a tiny startup and likely uses Gmail (`priya@gmail.com`). "Work email" sends a signal that her personal address isn't valid. She may hesitate or abandon.

**Fix implemented in this commit:** Changed "Work email" → "Your email" on Step 1.

---

### F6 — "Company domain" label is confusing (MED)

**What Priya sees:**  
Label: **"Company domain · tells your team apart from your clients"**  
Placeholder: `acme.com`

**Problems:**
- "Domain" is technical jargon — Priya likely thinks of her Instagram handle or brand name
- "tells your team apart from your clients" — she has no team
- No indication this field is optional or what happens if she skips it
- No example that maps to her context (she'd say "my store" not "my domain")

**Fix implemented in this commit:** Changed label to "Your website (e.g. yourstore.com) — optional" with clearer hint text.

**Recommendation (further):** Make this field truly optional and move it to Settings, not signup. A solo founder with 12 customers doesn't need workspace/team separation.

---

### F7 — URL pattern placeholder is technical (MED)

**What Priya sees on Step 2:**  
Placeholder: `app.acme.com/*`  
Tip: *"end a path with `/*` to cover every page beneath it — e.g. `app.acme.com/*`. We drop `https://` and anything after `?` for you."*

**Problem:** Code-formatted text (`/*`) signals "this is technical." "URL pattern" is jargon. Priya would type her full website URL (with https://) and not understand why `/*` is needed.

**Recommendation:**
- Change placeholder to `yourstore.com` (simpler, no wildcard)
- Change tip to: *"Just paste your site address — we'll handle the rest. Add `/*` if you want every page covered."*
- Auto-append `/*` if the user doesn't include a path wildcard

---

### F8 — "Magic-link" but actually sends a 6-digit OTP (LOW)

**What Priya sees:**  
Step 1 sub-text: *"Magic-link sign-in, no password."*  
But the actual flow sends a 6-digit numeric code (an OTP), not a clickable link.

**Problem:** "Magic link" implies a link to click. An OTP is a different pattern and could confuse users who go to their email looking for a button to click.

**Recommendation:** Change to *"We'll email you a 6-digit sign-in code. No password."* (consistent with the standalone login.html which gets this right).

---

### F9 — "~90 seconds, then you're in the Studio" (LOW)

**What Priya sees** in the onboarding rail footer:  
*"~90 seconds, then you're in the Studio"*

**Problem:** "Studio" is undefined jargon at this point. The 90-second estimate is also misleading — installing an extension or embedding a widget could take much longer, especially for non-technical users.

**Recommendation:** Change to *"~2 minutes to your first bug report"* or remove the time estimate entirely.

---

### F10 — Dashboard "Copy to AI" button tooltip (LOW)

**What Priya sees** in the dashboard widget embed section:  
Button: **"Copy to AI"** with tooltip: *"Widget not loading? If your site has a Content Security Policy, copy paste-ready fix instructions for your AI or developer."*

**Problem:** "Content Security Policy" (CSP) is deep engineering jargon. Even the button label "Copy to AI" assumes she knows what that means and has an AI coding assistant.

**Recommendation:** Rename to **"Get help installing"** and phrase the tooltip as *"Trouble adding the widget? Get step-by-step instructions."*

---

## Steps to First Bug Report: Current vs Target

| Step | Current | Friction |
|------|---------|---------|
| 1 | Visit marketing page, click "Get started" | None |
| 2 | Watch Sims welcome screen | Confused — not about bug reports |
| 3 | Click "Get started →" | Extra step (step 0 shouldn't exist for widget users) |
| 4 | Fill email ("Work email" hesitation) | MED |
| 5 | Fill project name | None |
| 6 | Fill "Company domain" (confusing) | MED |
| 7 | Click "Create project →" | None |
| 8 | Check email, enter 6-digit code | Slight confusion ("magic link" vs OTP) |
| 9 | Click "Verify & create →" | None |
| 10 | Step 2: realize widget path, not extension | HIGH — extension is default |
| 11 | Click "Or embed the widget" tile | Easy to miss |
| 12 | Copy snippet, understand `</body>` | **HARD BLOCK** for non-tech users |
| 13 | Find where to paste it in site builder | No guidance at all |

---

## Prioritized Recommendations

### P0 — Fix now (blocking non-technical users entirely)

1. **Fix extension install link** → Chrome Web Store (not GitHub). Done in this commit.
2. **Flip Step 2 tile order** for first-time users: widget path first, extension second. Primary CTA becomes "Copy the widget snippet" not "Connect the extension."
3. **Add platform install guides** for Shopify, Webflow, Squarespace, Wix in the widget snippet section.

### P1 — High value, low effort (copy + label changes)

4. **Welcome screen**: add one sentence about Snap/bug reports below the hero, or add a two-path entry ("Collect bug reports" vs "Review with AI Sims").
5. **"Work email" → "Your email"**. Done in this commit.
6. **Simplify "Company domain"** label. Done in this commit.
7. **Fix "Magic-link" copy** → "6-digit sign-in code."

### P2 — Medium effort, high impact

8. **URL pattern UX**: auto-append `/*`, simplify placeholder to `yourstore.com`.
9. **"Company domain" field**: make optional, move to Settings.
10. **"~90 seconds" copy**: remove or change to "~2 minutes to your first bug report."

### P3 — Incremental polish

11. **Dashboard "Copy to AI" button**: rename to "Get help installing", plain-language tooltip.
12. **Welcome step 0**: consider skipping it entirely for users who land via bug-report referral sources.

---

## Quick Wins Implemented

Two changes shipped in this commit:

1. **`site/onboarding.html` line 404**: Extension "Install it" link changed from `https://github.com/vishalquantana/klav-snap#install` → `https://chromewebstore.google.com/detail/olahjdcgbdjajbfmgnakjlehgjdmaene`. Adds "from Chrome Web Store" to link text.

2. **`site/onboarding.html` line 203**: "Work email" label → "Your email" (removes hesitation for users without a company address).

3. **`site/onboarding.html` line 205**: "Company domain · tells your team apart from your clients" → "Your website (e.g. yourstore.com) · optional" (removes jargon, makes field optional-feeling).
