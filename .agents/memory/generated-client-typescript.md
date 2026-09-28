---
name: Generated client TypeScript
description: TypeScript configuration needed by generated browser API clients in this workspace
---

Generated API clients can use `Headers.entries()` even when their package's TypeScript configuration only includes the base ES library.

**Why:** The shared client package is compiled as a library, so it does not inherit the DOM iterable types from a browser app.

**How to apply:** When generated client typechecking reports that `Headers.entries` is missing, include both `dom` and `dom.iterable` in the client package's `compilerOptions.lib`.