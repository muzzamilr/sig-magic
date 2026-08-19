# Repository rules

## Commits

- Commit messages must NEVER mention Claude or Anthropic in any form: no
  `Co-Authored-By: Claude` trailers, no "Generated with Claude Code" lines,
  no session links. Write plain, conventional commit messages only.
- This is enforced by the `commit-msg` hook in `.githooks/` (wired via
  `core.hooksPath`, set automatically by the `prepare` npm script).

## Toolchain

- Bun is the ONLY runtime and package manager for this repository. Use
  `bun install`, `bun run <script>`, and `bunx <tool>` — never npm, npx,
  yarn, pnpm, or node.
- `bun.lock` is the only lockfile; `package-lock.json`, `yarn.lock`, and
  `pnpm-lock.yaml` are gitignored and must never be committed.
- Scripts in `package.json` use `bunx --bun` so Vite runs on the Bun
  runtime, not Node.

## Language

- This repository is TypeScript. All source files must be `.ts`/`.tsx` —
  never add new `.js`/`.jsx` files.
- Run `npx tsc --noEmit` (or `npm run build`) before committing to make sure
  the code typechecks.
