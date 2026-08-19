# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Toolchain: Bun only

This project uses [Bun](https://bun.sh) as its only runtime and package manager:

```sh
bun install    # install dependencies (bun.lock is the only lockfile)
bun run dev    # start the dev server
bun run build  # typecheck + production build
bun run lint   # oxlint
```

Do not use npm, yarn, pnpm, or node — other lockfiles are gitignored.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
# sig-magic
