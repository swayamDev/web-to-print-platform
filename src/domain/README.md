# src/domain

Pure TypeScript business logic: pricing, text fitting, design layout, order state machine,
file naming. **No imports from React, Next.js or Supabase.** The browser and the server both
use this code, and so could a future mobile app (PRD p9 §14).

Every module here has a `*.test.ts` file next to it.
