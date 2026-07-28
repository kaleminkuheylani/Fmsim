// server.js — basit static server
import http from 'http';
import handler from 'serve-handler';

const server = http.createServer((req, res) => {
  return handler(req, res, {
    public: 'site',
    rewrites: [{ source: '**', destination: '/index.html' }],
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌐 http://localhost:${PORT}`);
});
