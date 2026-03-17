# HTCB Church App — Claude Governance Document

## Project Identity
- **App**: Harvest Time Church of Baytown (HTCB) PWA
- **Repo**: github.com/HarvestTime1/Baytown-HarvestTime (private)
- **Live URL**: baytown-harvest-time.vercel.app
- **Pastor**: Bishop Tonya L. Kearney
- **Address**: 308 Graham Street, Baytown TX 77520

---

## Architecture

### Single-file PWA
- `index.html` — the entire app. HTML + CSS + JS in one file.
- This is intentional for this project. Do NOT refactor into multiple files unless explicitly asked.
- All screens are rendered via JavaScript render functions (renderHome, renderMinGrid, etc.)

### Backend — Supabase
- **Project ID**: `cgkmibegfxlhoapxofvl`
- **URL**: `https://cgkmibegfxlhoapxofvl.supabase.co`
- All tables prefixed with `ht_`

### AI — Edge Function
- **Function**: `htcb-ai-proxy` (deployed on Supabase)
- Routes all Haiku calls through the proxy — API key NEVER goes in index.html
- Call types: `scripture`, `qotw`, `outreach`
- Has 6 hooks: beforePrompt → cacheRead → callHaiku → validateResponse → validateScripture → validateTone → cacheWrite → afterResponse

---

## Database Tables
| Table | Purpose |
|---|---|
| `ht_families` | Connect card submissions |
| `ht_children` | Children linked to families |
| `ht_join_interest` | Membership/watch care interest |
| `ht_qotw_responses` | Question of the Week answers |
| `ht_ministry_signups` | Ministry connection signups |
| `ht_ministry_prayer` | Ministry prayer requests |
| `ht_friend_invites` | Friend invite tracking |
| `ht_ai_cache` | AI response cache (cuts costs) |
| `ht_ai_logs` | AI audit trail for Bishop |
| `ht_broadcasts` | Pastoral messages / sick & shut-in |

---

## Screens (18 total)
- `s-home` — Home
- `s-times` — Services
- `s-min` — Ministry grid
- `s-min-Men`, `s-min-Women`, `s-min-Family`, `s-min-YoungAdults`, `s-min-Youth`, `s-min-Seniors` — Ministry pages
- `s-connect` — Connect card (family registration)
- `s-join` — Join/membership interest
- `s-qotw` — Question of the Week (4 groups: Young Adult, Middle Age, Family, Senior)
- `s-pastor` — Bishop Kearney bio
- `s-give` — Giving (Cash App + Zelle)
- `s-auth` — Leadership auth (PIN + Magic Link)
- `s-dash` — Leadership dashboard
- `s-outreach` — AI outreach strategies

---

## Design System
- **Colors**: `--pu:#3b0764` `--pum:#7c3aad` `--pul:#c084fc` `--go:#c8a96e` `--bk:#070711`
- **Fonts**: Cormorant Garamond (serif/headings) + DM Sans (body)
- **Theme**: Purple/black/silver — feminine, elegant, Spirit-filled
- **Shell**: Max 430px wide, centered, dark background

---

## Rules for Claude

### NEVER do these:
- Put the Anthropic API key in `index.html` — it goes in Supabase secrets only
- Call `api.anthropic.com` directly from the browser — always use `htcb-ai-proxy`
- Add console.log debug statements
- Change the design system colors or fonts without being asked
- Make forms oversized — inputs use `padding: 9px 12px`, not `13px 14px`
- Add non-Christian content anywhere — this is a church app

### ALWAYS do these:
- Keep everything in `index.html` unless explicitly told to split files
- Test that all `bnav()` calls use a single argument — no `||` fallback pattern
- Preserve all 18 screens when editing
- Keep the `callHaiku(prompt, callType)` signature — callType is required
- Respect the SIC Method — every change must be explainable to a new hire via this doc

---

## Deployment Workflow

### Every time Claude builds an updated file:
1. Download the new `htcb_final_vX.html` from Claude
2. Go to **github.com/HarvestTime1/Baytown-HarvestTime**
3. Click `index.html` → click the **pencil ✏️ edit icon**
4. Press **Ctrl+A** → **Delete** → **Paste** the new file contents
5. Click **Commit changes**
6. Vercel auto-deploys in ~30 seconds ✓

### No Codespaces needed. No terminal needed. GitHub web editor → done.

---

## Key People
- **Maria Denise LeBlanc** — Founder, AI Systems Director, developer
- **Bishop Tonya L. Kearney** — Pastor, app owner
- **Deacon Quinton Kearney** — Bishop's husband
- **Children**: Minister Erin Wyatt, Eli Wyatt, Ethan Wyatt
- **Podcast**: "Only Up From Here" — bishoptkministries.com

---

## Giving Info
- Church Cash App: `$ToHTCB`
- Church Zelle: `Harvesttimebaytown@gmail.com`
- Bishop Cash App: `$KingdomMinded23`
- Bishop Zelle: `Qtkearney@gmail.com`

---

## Services
- Sunday Morning Worship — 10:00 AM
- Wednesday Bible Study — 7:30 PM
- Friday Prayer — 7:30 PM

---
*Last updated: March 2026 — v4*
