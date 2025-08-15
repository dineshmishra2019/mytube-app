export default function VideoCard({ video, onOpenComments }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          width="180"
          height="100"
          style={{ objectFit: 'cover', borderRadius: 8 }}
        />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '4px 0' }}>{video.title}</h3>
          <video controls width="480" style={{ borderRadius: 8, outline: 'none' }}>
            <source src={video.videoUrl} type="video/mp4" />
          </video>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => onOpenComments(video)} style={{ padding: '6px 10px' }}>
              Comments
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
