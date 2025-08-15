import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import {
  insertVideo,
  listVideos,
  getVideoById,
  insertComment,
  listComments
} from './db.js';

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const ROOT = process.cwd();
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const TEMP_DIR = path.join(ROOT, 'temp');
const THUMB_DIR = path.join(ROOT, 'thumbnails');

[UPLOAD_DIR, TEMP_DIR, THUMB_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

/**
 * 1) Traditional single-shot upload (kept for convenience)
 *    Accepts a file + title; small/medium files only.
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.post('/upload/single', upload.single('video'), async (req, res) => {
  const title = req.body.title?.trim() || req.file.originalname;
  const filename = req.file.filename;
  const filePath = path.join(UPLOAD_DIR, filename);

  try {
    const thumbName = filename + '.jpg';
    const thumbPath = path.join(THUMB_DIR, thumbName);
    await generateThumbnail(filePath, thumbPath);

    const info = insertVideo.run({ filename, title, thumbnail: thumbName });
    res.json({ id: info.lastInsertRowid, filename, title, thumbnail: thumbName });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'thumbnail_failed' });
  }
});

/**
 * 2) Chunked upload (for large files)
 * Endpoints:
 *   POST /upload/init      -> {filename, title} => { uploadId }
 *   POST /upload/chunk     -> headers: x-upload-id, x-chunk-index, x-chunks-total (raw body)
 *   POST /upload/complete  -> { uploadId, title, filename }
 */
app.post('/upload/init', (req, res) => {
  const { filename, title } = req.body || {};
  if (!filename) return res.status(400).json({ error: 'filename_required' });

  const uploadId = uuidv4();
  const dir = path.join(TEMP_DIR, uploadId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ filename, title: title || filename }));
  res.json({ uploadId });
});

app.post('/upload/chunk', express.raw({ type: '*/*', limit: '200mb' }), (req, res) => {
  const uploadId = req.header('x-upload-id');
  const index = req.header('x-chunk-index');
  const total = req.header('x-chunks-total');

  if (!uploadId || index == null || !total) {
    return res.status(400).json({ error: 'missing_headers' });
  }

  const dir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'upload_not_found' });

  const partPath = path.join(dir, `${index}.part`);
  fs.writeFileSync(partPath, req.body);
  res.json({ ok: true });
});

app.post('/upload/complete', async (req, res) => {
  const { uploadId } = req.body || {};
  if (!uploadId) return res.status(400).json({ error: 'uploadId_required' });

  const dir = path.join(TEMP_DIR, uploadId);
  if (!fs.existsSync(dir)) return res.status(404).json({ error: 'upload_not_found' });

  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8'));
  const parts = fs.readdirSync(dir).filter(f => f.endsWith('.part'))
    .map(f => parseInt(f.replace('.part',''), 10))
    .sort((a,b)=>a-b);

  const ext = path.extname(meta.filename) || '.mp4';
  const finalName = `${Date.now()}${ext}`;
  const finalPath = path.join(UPLOAD_DIR, finalName);

  // stitch parts
  const write = fs.createWriteStream(finalPath);
  for (const i of parts) {
    const partPath = path.join(dir, `${i}.part`);
    const data = fs.readFileSync(partPath);
    write.write(data);
  }
  write.end();

  await new Promise(resolve => write.on('finish', resolve));

  // generate thumbnail
  const thumbName = finalName + '.jpg';
  const thumbPath = path.join(THUMB_DIR, thumbName);
  try {
    await generateThumbnail(finalPath, thumbPath);
  } catch (e) {
    console.error('thumbnail_failed', e);
  }

  const info = insertVideo.run({ filename: finalName, title: meta.title, thumbnail: thumbName });

  // cleanup
  fs.rmSync(dir, { recursive: true, force: true });

  res.json({ id: info.lastInsertRowid, filename: finalName, title: meta.title, thumbnail: thumbName });
});

/**
 * 3) Videos list + basic search
 * GET /videos?q=term
 */
app.get('/videos', (req, res) => {
  const q = (req.query.q || '').toString().trim() || null;
  const rows = listVideos.all({ q });
  const base = `http://localhost:${PORT}`;
  const mapped = rows.map(r => ({
    id: r.id,
    title: r.title,
    videoUrl: `${base}/media/${r.filename}`,
    thumbnailUrl: `${base}/thumbs/${r.thumbnail}`,
    created_at: r.created_at
  }));
  res.json(mapped);
});

/**
 * 4) Comments
 */
app.get('/videos/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  if (!getVideoById.get(id)) return res.status(404).json({ error: 'video_not_found' });
  const rows = listComments.all(id);
  res.json(rows);
});

app.post('/videos/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  const { author, body } = req.body || {};
  if (!getVideoById.get(id)) return res.status(404).json({ error: 'video_not_found' });
  if (!author || !body) return res.status(400).json({ error: 'author_and_body_required' });
  const info = insertComment.run({ video_id: id, author: author.trim(), body: body.trim() });
  res.json({ id: info.lastInsertRowid, author, body });
});

/**
 * 5) Static serving
 */
app.use('/media', express.static(UPLOAD_DIR));     // video files
app.use('/thumbs', express.static(THUMB_DIR));     // thumbnails

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

function generateThumbnail(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Grab a frame at 5 seconds; if shorter, ffmpeg picks nearest frame.
    ffmpeg(inputPath)
      .on('end', resolve)
      .on('error', reject)
      .screenshots({
        count: 1,
        timemarks: ['5'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x?'
      });
  });
}
