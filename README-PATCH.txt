SalsysOS v0.4 patch

Apply to an existing v0.3 project:
1. Stop npm run dev.
2. Back up your project folder.
3. Copy the CONTENTS of this patch folder into the root of your existing v0.3 project and allow Windows to replace matching files.
4. Do NOT delete or replace your .env.local.
5. Run supabase/migrations/004_course_catalog_and_batches.sql in Supabase SQL Editor.
6. Start the app again with: npm run dev
7. Open Add Lead and test Course -> Upcoming batch auto-fill.
