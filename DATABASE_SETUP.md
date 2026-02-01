# Database Setup for User Profiles

## ⚠️ IMPORTANT - Run this BEFORE using the app!

If you see an error like "Could not find the table 'publicuser_profiles' in the schema cache", you need to run this migration.

## Step-by-Step Setup

1. **Open Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project

2. **Navigate to SQL Editor**
   - Click "SQL Editor" in the left sidebar
   - Click "New Query"

3. **Copy & Paste the Migration**
   - Open `supabase-migrations.sql` from this repo
   - Copy ALL the SQL code
   - Paste it into the SQL editor

4. **Run the Migration**
   - Click "Run" or press Ctrl+Enter
   - Wait for success message
   - You should see "Success. No rows returned"

5. **Verify Tables Created**
   - Click "Table Editor" in sidebar
   - You should see `user_profiles` table
   - Check that `pixels` table now has a `user_id` column

## What This Creates

- **`user_profiles` table** - stores username, country, and social media links
- **`user_id` foreign key** on `pixels` table - links pixels to creators
- **Row Level Security policies** - public read, anyone can create/update profiles

## Testing

After running the migration:
1. Refresh the app - error should be gone
2. Click "Create Profile" button in the sidebar
3. Enter username (required) and optional info
4. Paint pixels - your profile will be attached
5. Inspect pixels - you'll see artist info

## Troubleshooting

**Still seeing schema error?**
- Make sure you ran ALL the SQL code
- Check Supabase logs for any error messages
- Verify you selected the correct project

**"Table already exists" error?**
- That's fine! The migration uses `IF NOT EXISTS`
- It will only create tables that don't exist
