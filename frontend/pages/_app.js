export default function App({ Component, pageProps }) {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <Component {...pageProps} />
    </div>
  );
}
