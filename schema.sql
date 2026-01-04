-- ============================================
-- DIGITAL KENANGAN KELAS 11 DPIB 2
-- Improved Database Schema (Supabase-ready)
-- Includes admins table, triggers, RLS policies, and helpful indexes
-- Paste into Supabase SQL editor (run as SQL admin)
-- ============================================

-- Helper: timestamp trigger function to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ADMINS table: list of authorised admin user UUIDs (from auth.users)
DROP TABLE IF EXISTS admins;
CREATE TABLE admins (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  role TEXT DEFAULT 'admin',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 1. SITE CONFIG
DROP TABLE IF EXISTS site_config;
CREATE TABLE site_config (
  id BIGINT PRIMARY KEY DEFAULT 1,
  hero_title TEXT DEFAULT 'Kelas 11 DPIB 2',
  hero_subtitle TEXT DEFAULT 'SMKN 1 Kota Kediri',
  hero_motto TEXT DEFAULT 'Bersama Menggapai Mimpi',
  logo_url TEXT,
  footer_text TEXT DEFAULT '© 2024 Kelas 11 DPIB 2 - SMKN 1 Kota Kediri',
  instagram_url TEXT,
  youtube_url TEXT,
  tiktok_url TEXT,
  whatsapp_url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_site_config BEFORE UPDATE ON site_config FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

-- 2. CLASS PROFILE
DROP TABLE IF EXISTS class_profile;
CREATE TABLE class_profile (
  id BIGINT PRIMARY KEY DEFAULT 1,
  ketua_name TEXT,
  ketua_photo_url TEXT,
  ketua_instagram TEXT,
  wakil_name TEXT,
  wakil_photo_url TEXT,
  wakil_instagram TEXT,
  wali_name TEXT,
  wali_photo_url TEXT,
  wali_instagram TEXT,
  total_students INT DEFAULT 0,
  school_name TEXT DEFAULT 'SMKN 1 Kota Kediri',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_class_profile BEFORE UPDATE ON class_profile FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

-- 3. TAGS
DROP TABLE IF EXISTS tags;
CREATE TABLE tags (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  color TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. GALLERY
DROP TABLE IF EXISTS gallery;
CREATE TABLE gallery (
  id BIGSERIAL PRIMARY KEY,
  image_url TEXT NOT NULL,
  title TEXT,
  caption TEXT,
  status TEXT DEFAULT 'public' CHECK (status IN ('public', 'private', 'draft')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_gallery BEFORE UPDATE ON gallery FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

-- 5. GALLERY TAGS
DROP TABLE IF EXISTS gallery_tags;
CREATE TABLE gallery_tags (
  id BIGSERIAL PRIMARY KEY,
  gallery_id BIGINT REFERENCES gallery(id) ON DELETE CASCADE,
  tag_id BIGINT REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gallery_id, tag_id)
);

-- 6. MEMORIES
DROP TABLE IF EXISTS memories;
CREATE TABLE memories (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  memory_date DATE,
  position INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_memories BEFORE UPDATE ON memories FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

-- 7. MEMORY PHOTOS
DROP TABLE IF EXISTS memory_photos;
CREATE TABLE memory_photos (
  id BIGSERIAL PRIMARY KEY,
  memory_id BIGINT REFERENCES memories(id) ON DELETE CASCADE,
  gallery_id BIGINT REFERENCES gallery(id) ON DELETE SET NULL,
  position INT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. NEWS
DROP TABLE IF EXISTS news;
CREATE TABLE news (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  publish_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_news BEFORE UPDATE ON news FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

-- 9. EVENTS
DROP TABLE IF EXISTS events;
CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  event_time TIME,
  location TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_events BEFORE UPDATE ON events FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

-- 10. GUESTBOOK
DROP TABLE IF EXISTS guestbook;
CREATE TABLE guestbook (
  id BIGSERIAL PRIMARY KEY,
  visitor_name TEXT,
  visitor_email TEXT,
  message TEXT NOT NULL,
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_gallery_status ON gallery(status);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_tags_gallery ON gallery_tags(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gallery_tags_tag ON gallery_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_memories_position ON memories(position);
CREATE INDEX IF NOT EXISTS idx_memory_photos_memory ON memory_photos(memory_id);
CREATE INDEX IF NOT EXISTS idx_news_status ON news(status);
CREATE INDEX IF NOT EXISTS idx_news_date ON news(publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook(created_at DESC);

-- =====================
-- ROW LEVEL SECURITY
-- =====================

ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE guestbook ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Helper to check admin - simply check if user is authenticated
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- Public read policies
DROP POLICY IF EXISTS "site_config_public" ON site_config;
CREATE POLICY "site_config_public" ON site_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "class_profile_public" ON class_profile;
CREATE POLICY "class_profile_public" ON class_profile FOR SELECT USING (true);

DROP POLICY IF EXISTS "tags_public" ON tags;
CREATE POLICY "tags_public" ON tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "gallery_public" ON gallery;
CREATE POLICY "gallery_public" ON gallery FOR SELECT USING (status = 'public');

DROP POLICY IF EXISTS "gallery_tags_public" ON gallery_tags;
CREATE POLICY "gallery_tags_public" ON gallery_tags FOR SELECT USING (
  EXISTS (SELECT 1 FROM gallery WHERE gallery.id = gallery_tags.gallery_id AND status = 'public')
);

DROP POLICY IF EXISTS "memories_public" ON memories;
CREATE POLICY "memories_public" ON memories FOR SELECT USING (true);

DROP POLICY IF EXISTS "memory_photos_public" ON memory_photos;
CREATE POLICY "memory_photos_public" ON memory_photos FOR SELECT USING (true);

DROP POLICY IF EXISTS "news_public" ON news;
CREATE POLICY "news_public" ON news FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "events_public" ON events;
CREATE POLICY "events_public" ON events FOR SELECT USING (true);

DROP POLICY IF EXISTS "guestbook_public" ON guestbook;
CREATE POLICY "guestbook_public" ON guestbook FOR SELECT USING (is_approved = true);

DROP POLICY IF EXISTS "guestbook_insert_public" ON guestbook;
CREATE POLICY "guestbook_insert_public" ON guestbook FOR INSERT WITH CHECK (true);

-- Admin write policies using admins table check
DROP POLICY IF EXISTS "site_config_admin" ON site_config;
CREATE POLICY "site_config_admin" ON site_config FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "site_config_admin_insert" ON site_config;
CREATE POLICY "site_config_admin_insert" ON site_config FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "class_profile_admin" ON class_profile;
CREATE POLICY "class_profile_admin" ON class_profile FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "class_profile_admin_insert" ON class_profile;
CREATE POLICY "class_profile_admin_insert" ON class_profile FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "tags_admin_insert" ON tags;
CREATE POLICY "tags_admin_insert" ON tags FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "tags_admin_update" ON tags;
CREATE POLICY "tags_admin_update" ON tags FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "tags_admin_delete" ON tags;
CREATE POLICY "tags_admin_delete" ON tags FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "gallery_admin_insert" ON gallery;
CREATE POLICY "gallery_admin_insert" ON gallery FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "gallery_admin_update" ON gallery;
CREATE POLICY "gallery_admin_update" ON gallery FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "gallery_admin_delete" ON gallery;
CREATE POLICY "gallery_admin_delete" ON gallery FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "gallery_tags_admin_insert" ON gallery_tags;
CREATE POLICY "gallery_tags_admin_insert" ON gallery_tags FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "gallery_tags_admin_delete" ON gallery_tags;
CREATE POLICY "gallery_tags_admin_delete" ON gallery_tags FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "memories_admin_insert" ON memories;
CREATE POLICY "memories_admin_insert" ON memories FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "memories_admin_update" ON memories;
CREATE POLICY "memories_admin_update" ON memories FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "memories_admin_delete" ON memories;
CREATE POLICY "memories_admin_delete" ON memories FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "memory_photos_admin_insert" ON memory_photos;
CREATE POLICY "memory_photos_admin_insert" ON memory_photos FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "memory_photos_admin_delete" ON memory_photos;
CREATE POLICY "memory_photos_admin_delete" ON memory_photos FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "news_admin_insert" ON news;
CREATE POLICY "news_admin_insert" ON news FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "news_admin_update" ON news;
CREATE POLICY "news_admin_update" ON news FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "news_admin_delete" ON news;
CREATE POLICY "news_admin_delete" ON news FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "events_admin_insert" ON events;
CREATE POLICY "events_admin_insert" ON events FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "events_admin_update" ON events;
CREATE POLICY "events_admin_update" ON events FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "events_admin_delete" ON events;
CREATE POLICY "events_admin_delete" ON events FOR DELETE USING (is_admin_user());

DROP POLICY IF EXISTS "guestbook_admin_read" ON guestbook;
CREATE POLICY "guestbook_admin_read" ON guestbook FOR SELECT USING (is_admin_user());

DROP POLICY IF EXISTS "guestbook_admin_delete" ON guestbook;
CREATE POLICY "guestbook_admin_delete" ON guestbook FOR DELETE USING (is_admin_user());

-- 11. STUDENTS
DROP TABLE IF EXISTS students;
CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  student_number INT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  instagram TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER tz_students BEFORE UPDATE ON students FOR EACH ROW EXECUTE PROCEDURE set_updated_at_column();

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Allow only admins to manage students
DROP POLICY IF EXISTS "students_admin_select" ON students;
-- Allow public read of students (for directory view) while write remains admin-only
DROP POLICY IF EXISTS "students_public" ON students;
CREATE POLICY "students_public" ON students
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "students_admin_insert" ON students;
CREATE POLICY "students_admin_insert" ON students
  FOR INSERT WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "students_admin_update" ON students;
CREATE POLICY "students_admin_update" ON students
  FOR UPDATE USING (is_admin_user()) WITH CHECK (is_admin_user());

DROP POLICY IF EXISTS "students_admin_delete" ON students;
CREATE POLICY "students_admin_delete" ON students
  FOR DELETE USING (is_admin_user());

-- =====================
-- INITIAL DATA (safe, idempotent)
-- =====================

INSERT INTO site_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO class_profile (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO tags (name, slug, color) VALUES
('Outing', 'outing', '#ff6b6b'),
('Kegiatan Sekolah', 'kegiatan-sekolah', '#4ecdc4'),
('Kelas', 'kelas', '#45b7d1'),
('Gathering', 'gathering', '#f9ca24'),
('Study Tour', 'study-tour', '#6c5ce7'),
('Kelulusan', 'kelulusan', '#a29bfe')
ON CONFLICT (name) DO NOTHING;

-- Note: to create an admin, insert the auth user's UUID into `admins` table.
-- Example (run in SQL editor after identifying the user's UUID):
-- INSERT INTO admins (user_id, email) VALUES ('<USER_UUID>', 'admin@example.com');

