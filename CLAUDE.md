# Staff portal + POS — working rules

- Before saying anything is done, merging, or asking the owner to press anything on the
  live site: follow `.claude/skills/release-check/SKILL.md` and run
  `bash scripts/e2e/check-all.sh` — 0 problems required (every page, button, link, form,
  phone + desktop, English + Arabic).
- Replies to the owner: short, plain language, links they can tap.
- Never put secrets or private brand names in code, commits or chat (env vars only).
- Database changes: numbered, add-only, re-runnable migrations in `supabase/migrations/`.
