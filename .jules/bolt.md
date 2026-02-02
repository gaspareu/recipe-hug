## 2025-05-15 - [Lazy Loading react-markdown]
**Learning:** Even when the project documentation or memory suggests that heavy dependencies like `react-markdown` are lazy-loaded, they might still be imported synchronously in some parts of the codebase, leading to unnecessary bundle bloat in those page chunks.
**Action:** Always verify with `grep` or by checking imports if expensive libraries are indeed lazy-loaded where used. Use a memoized lazy wrapper to ensure consistent performance across the app.
