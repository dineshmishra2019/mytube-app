import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'app.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_videos_title ON videos(title);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);
`);

export const insertVideo = db.prepare(
  `INSERT INTO videos (filename, title, thumbnail) VALUES (@filename, @title, @thumbnail)`
);
export const listVideos = db.prepare(
  `SELECT id, filename, title, thumbnail, created_at
   FROM videos
   WHERE (@q IS NULL OR title LIKE '%' || @q || '%')
   ORDER BY id DESC`
);
export const getVideoById = db.prepare(
  `SELECT id, filename, title, thumbnail, created_at FROM videos WHERE id = ?`
);
export const insertComment = db.prepare(
  `INSERT INTO comments (video_id, author, body) VALUES (@video_id, @author, @body)`
);
export const listComments = db.prepare(
  `SELECT id, author, body, created_at FROM comments WHERE video_id = ? ORDER BY id DESC`
);

export default db;
