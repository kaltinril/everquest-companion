# deps-refresh: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-08 | owner | Apply the dependency updates that are small or security related, in a branch of their own. | built: lockfiles only (`npm audit fix`, named `npm update`, `cargo update`); both findings in shipped code (`js-yaml`, `fast-uri`) and every high cleared; shipped in test.21 |
| 2026-10-09 | owner | Apply the updates that have little to no impact, such as simple version bumps, as long as they cause no issues. | built: electron 43.7.9, vite 7.3.7 and the AWS SDK clients 3.1149 inside their ranges; `json-schema-to-typescript` 16 (generated protocol files byte-identical); `globals` 17 (lint unchanged); Rust toolchain 1.99 (generated.rs byte-identical, fmt, clippy and the factoring register clean) |
| 2026-10-09 | owner | (same ask) What was left out, and why. | not built: React 19 with MUI 9, Electron 44, Vite 8 with plugin-react 6, TypeScript 7, ESLint 10 and eslint-plugin-react-hooks 7, electron-store 11 and chokidar 5 change behaviour or code and each wants its own branch; `koffi` 3 and `onnxruntime-node` 1.29+ change how their binaries arrive (`.npmrc`, ADOPTIONS.md); `typescript-eslint` 8.70+ turns the creator's unchanged code red; `@types/node` 24+ waits for a reason to move |
