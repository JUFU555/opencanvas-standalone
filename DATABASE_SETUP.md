# Database Setup for User Profiles

## Run this SQL in your Supabase SQL Editor

The SQL migration file is in `supabase-migrations.sql`.

You need to:
1. Go to your Supabase project dashboard
2. Click "SQL Editor" in the sidebar
3. Paste the contents of `supabase-migrations.sql`
4. Click "Run"

This will create:
- `user_profiles` table to store username, country, and social media links
- Add `user_id` foreign key to `pixels` table
- Set up Row Level Security policies for public read, authenticated write

## Testing

After running the migration:
1. The app will show a "Create Profile" button in the sidebar
2. Users can create a profile with username (required), country, Twitter, Instagram, TikTok, and website
3. When users paint pixels, their profile info is attached
4. When inspecting pixels, you'll see the artist's info if they had a profile

## Notes

- Profiles are stored in localStorage for now (simple auth)
- User ID is linked to pixels via foreign key
- The pixel inspector shows full artist info when available
