# Klavity Snap — Manual Smoke Test Checklist

Load `packages/extension/dist` as an unpacked extension in Chrome (chrome://extensions → Developer mode → Load unpacked).

## Context Menu
- [ ] Right-click on any webpage → 3 items appear: "🐛 Report a Bug", "💡 Request a Feature", "📋 View submissions"
- [ ] "View submissions" → opens configured tracker URL in new tab (or does nothing if not configured)

## Modal
- [ ] "Report a Bug" → modal opens with Bug toggle active (red)
- [ ] "Request a Feature" → modal opens with Feature toggle active (amber)
- [ ] Toggle between Bug/Feature works
- [ ] Page URL shown correctly (📍 /path)
- [ ] Screenshot auto-captures ~200ms after modal opens
- [ ] Escape key closes modal

## Screenshot Capture
- [ ] "📷 Full Page" button → adds another full-page screenshot
- [ ] "✂️ Region" button → drag overlay appears, hint shown before drag
- [ ] Drag region → cropped screenshot added (NOT the full-page version)
- [ ] Only cropped screenshot added (not double-added)
- [ ] "🖼 Upload" → file picker opens
- [ ] Upload image → thumbnail appears
- [ ] Paste (⌘+V / Ctrl+V) with image in clipboard → thumbnail appears
- [ ] At 5 images → capture buttons still show but adding a 6th is prevented
- [ ] × button removes individual screenshots

## Annotation Editor
- [ ] ✏ button on thumbnail → full-screen editor opens
- [ ] Pen tool → freehand drawing works
- [ ] Rect tool → rectangle drawn on release
- [ ] Arrow tool → arrow with arrowhead drawn on release
- [ ] Text tool → click places input, Enter commits, Escape cancels
- [ ] 4 colour swatches work
- [ ] ↩ Undo removes last shape
- [ ] 🗑 Clear removes all shapes
- [ ] ✓ Save → annotations flattened, thumbnail updated
- [ ] ✕ / Escape → closes editor without saving

## Submission
- [ ] Submit disabled until description is non-empty
- [ ] Fill description → Submit enabled
- [ ] With valid Jira config → "Filing..." shown → success message "✓ Filed as PROJ-123"
- [ ] Modal auto-closes 1.5s after success
- [ ] With invalid API key → error message shown → Submit re-enabled

## Settings
- [ ] Click toolbar icon → popup shows active integration + mode
- [ ] Click "⚙️ Settings" → options page opens in new tab
- [ ] Select different integration → corresponding section shows/hides
- [ ] Fill in Jira credentials → Save → "✓ Saved" appears
- [ ] Reload extension → credentials persisted

## Cloud Switch
- [ ] Leave Backend URL empty → direct mode shown in popup
- [ ] Enter a backend URL → cloud mode shown in popup

## Sign-in & sims (2026-06)

- [ ] Fresh install while logged into klavity.quantana.top → open popup → silent login → signed-in, sims listed.
- [ ] Fresh install while NOT logged in → email + 6-digit code → signed-in, sims listed.
- [ ] Invalid/expired code → inline error, stays on the code field.
- [ ] Multi-project account → header picker switches projects → sims update → last choice remembered on reopen.
- [ ] Single-project account → picker hidden.
- [ ] Sign out → returns to auth form; reopening stays signed out.
- [ ] Web "Connect Extension" button on /app detects the extension (no "Extension not installed").
