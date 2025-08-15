import { useEffect, useState } from 'react';
import axios from 'axios';
import VideoCard from '../components/VideoCard';

const API = process.env.NEXT_PUBLIC_API || 'http://localhost:4000';
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export default function Home() {
  const [videos, setVideos] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [search, setSearch] = useState('');
  const [commentsOpenFor, setCommentsOpenFor] = useState(null);
  const [commentAuthor, setCommentAuthor] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [comments, setComments] = useState([]);

  const loadVideos = async (q = '') => {
    const res = await axios.get(`${API}/videos`, { params: q ? { q } : {} });
    setVideos(res.data);
  };

  useEffect(() => { loadVideos(); }, []);

  const handleSingleUpload = async () => {
    if (!file) return;
    const form = new FormData();
    form.append('video', file);
    form.append('title', title || file.name);
    await axios.post(`${API}/upload/single`, form);
    setTitle('');
    setFile(null);
    await loadVideos(search);
  };

  const handleChunkedUpload = async () => {
    if (!file) return;
    // 1) init
    const { data: init } = await axios.post(`${API}/upload/init`, {
      filename: file.name,
      title: title || file.name
    });
    const uploadId = init.uploadId;

    // 2) chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);
      await fetch(`${API}/upload/chunk`, {
        method: 'POST',
        headers: {
          'x-upload-id': uploadId,
          'x-chunk-index': String(i),
          'x-chunks-total': String(totalChunks)
        },
        body: chunk
      });
    }

    // 3) complete
    await axios.post(`${API}/upload/complete`, { uploadId });
    setTitle('');
    setFile(null);
    await loadVideos(search);
  };

  const openComments = async (video) => {
    setCommentsOpenFor(video);
    const res = await axios.get(`${API}/videos/${video.id}/comments`);
    setComments(res.data);
  };

  const postComment = async () => {
    if (!commentsOpenFor) return;
    await axios.post(`${API}/videos/${commentsOpenFor.id}/comments`, {
      author: commentAuthor || 'Anonymous',
      body: commentBody
    });
    setCommentBody('');
    const res = await axios.get(`${API}/videos/${commentsOpenFor.id}/comments`);
    setComments(res.data);
  };

  return (
    <div>
      <h1>Local YouTube-like MVP (chunked uploads + thumbnails + comments)</h1>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
        <input
          type="text"
          placeholder="Search by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadVideos(search)}
          style={{ padding: 8, flex: 1 }}
        />
        <button onClick={() => loadVideos(search)} style={{ padding: '8px 12px' }}>Search</button>
        <button onClick={() => { setSearch(''); loadVideos(''); }} style={{ padding: '8px 12px' }}>Clear</button>
      </div>

      <hr style={{ margin: '16px 0' }} />

      <div style={{ display: 'grid', gap: 8 }}>
        <input type="text" placeholder="Video title" value={title} onChange={(e)=>setTitle(e.target.value)} />
        <input type="file" accept="video/*" onChange={e => setFile(e.target.files[0] || null)} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleSingleUpload} disabled={!file} style={{ padding: '8px 12px' }}>
            Upload (single request)
          </button>
          <button onClick={handleChunkedUpload} disabled={!file} style={{ padding: '8px 12px' }}>
            Upload (chunked)
          </button>
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>Videos</h2>
      {videos.map(v => (
        <VideoCard key={v.id} video={v} onOpenComments={openComments} />
      ))}

      {commentsOpenFor && (
        <div style={{
          position: 'fixed', right: 20, bottom: 20, width: 380,
          background: '#fff', border: '1px solid #ddd', borderRadius: 8, padding: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.12)'
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <strong>Comments — {commentsOpenFor.title}</strong>
            <button onClick={() => setCommentsOpenFor(null)} style={{ border: 'none', background: 'transparent', fontSize: 18 }}>×</button>
          </div>
          <div style={{ maxHeight: 280, overflow: 'auto', marginTop: 8 }}>
            {comments.length === 0 && <div>No comments yet.</div>}
            {comments.map(c => (
              <div key={c.id} style={{ borderBottom: '1px solid #eee', padding: '6px 0' }}>
                <div style={{ fontWeight: 600 }}>{c.author}</div>
                <div>{c.body}</div>
                <div style={{ fontSize: 12, color: '#777' }}>{new Date(c.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <input
              type="text"
              placeholder="Your name"
              value={commentAuthor}
              onChange={(e)=>setCommentAuthor(e.target.value)}
            />
            <textarea
              placeholder="Write a comment..."
              rows={3}
              value={commentBody}
              onChange={(e)=>setCommentBody(e.target.value)}
            />
            <button onClick={postComment} disabled={!commentBody.trim()} style={{ padding: '8px 12px' }}>
              Post comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
