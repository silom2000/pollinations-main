const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Load API key from .env file in project root
const envPath = path.resolve(__dirname, '..', '.env');
let apiKey = '';

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (key === 'POLLINATIONS_API_KEY') {
        apiKey = value.trim();
      }
    }
  });
}

// If no key in .env, try getting from environment variables
if (!apiKey) {
  apiKey = process.env.POLLINATIONS_API_KEY || '';
}

console.log('🔑 Loaded API key:', apiKey ? `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}` : '❌ Missing');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Helper function to determine MIME type
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg': return 'image/jpeg';
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.mp4': return 'video/mp4';
    case '.mp3': return 'audio/mpeg';
    default: return 'application/octet-stream';
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  console.log(`[${req.method}] ${pathname}`);

  // --- API ENDPOINTS ---

  // 0. Get key status
  if (pathname === '/api/key-status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ 
      hasKey: !!apiKey,
      maskedKey: apiKey ? `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}` : 'Missing (requests will be limited)'
    }));
    return;
  }

  // 1. Get list of text models
  if (pathname === '/api/models' && req.method === 'GET') {
    try {
      const apiRes = await fetch('https://gen.pollinations.ai/models');
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`);
      const data = await apiRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get models', details: err.message }));
    }
    return;
  }

  // 2. Get list of models for images and video
  if (pathname === '/api/image-models' && req.method === 'GET') {
    try {
      const apiRes = await fetch('https://gen.pollinations.ai/image/models');
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`);
      const data = await apiRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get image models', details: err.message }));
    }
    return;
  }

  // 3. Proxy for text chat (POST /api/chat)
  if (pathname === '/api/chat' && req.method === 'POST') {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const bodyData = JSON.parse(bodyStr);
        
        const headers = {
          'Content-Type': 'application/json',
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const apiRes = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyData)
        });

        res.writeHead(apiRes.status, {
          'Content-Type': apiRes.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        // Proxy data stream (to support SSE streaming)
        for await (const chunk of apiRes.body) {
          res.write(chunk);
        }
        res.end();

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Chat error', details: err.message }));
      }
    });
    return;
  }

  // 4. Proxy for images (GET /api/image)
  if (pathname === '/api/image' && req.method === 'GET') {
    const prompt = parsedUrl.searchParams.get('prompt') || '';
    const model = parsedUrl.searchParams.get('model') || 'zimage';
    const width = parsedUrl.searchParams.get('width') || '1024';
    const height = parsedUrl.searchParams.get('height') || '1024';
    const seed = parsedUrl.searchParams.get('seed') || '0';
    const safe = parsedUrl.searchParams.get('safe') || 'false';

    const targetUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${width}&height=${height}&seed=${seed}&safe=${safe}`;
    console.log(`🔗 Proxying image: ${targetUrl}`);

    try {
      const headers = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const apiRes = await fetch(targetUrl, { headers });
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status} ${apiRes.statusText}`);

      res.writeHead(200, {
        'Content-Type': apiRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400'
      });

      for await (const chunk of apiRes.body) {
        res.write(chunk);
      }
      res.end();

    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Image generation error', details: err.message }));
    }
    return;
  }

  // 5. Proxy for video (GET /api/video)
  if (pathname === '/api/video' && req.method === 'GET') {
    const prompt = parsedUrl.searchParams.get('prompt') || '';
    const model = parsedUrl.searchParams.get('model') || 'veo';
    const width = parsedUrl.searchParams.get('width') || '1024';
    const height = parsedUrl.searchParams.get('height') || '1024';
    const duration = parsedUrl.searchParams.get('duration') || '4';
    const seed = parsedUrl.searchParams.get('seed') || '0';

    const targetUrl = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${width}&height=${height}&duration=${duration}&seed=${seed}`;
    console.log(`🎥 Proxying video: ${targetUrl}`);

    try {
      const headers = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const apiRes = await fetch(targetUrl, { headers });
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status} ${apiRes.statusText}`);

      res.writeHead(200, {
        'Content-Type': apiRes.headers.get('content-type') || 'video/mp4'
      });

      for await (const chunk of apiRes.body) {
        res.write(chunk);
      }
      res.end();

    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Video generation error', details: err.message }));
    }
    return;
  }

  // 5.5. Get list of audio models
  if (pathname === '/api/audio-models' && req.method === 'GET') {
    try {
      const apiRes = await fetch('https://gen.pollinations.ai/audio/models');
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status}`);
      const data = await apiRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Failed to get audio models', details: err.message }));
    }
    return;
  }

  // 5.6. Proxy for audio (GET /api/audio)
  if (pathname === '/api/audio' && req.method === 'GET') {
    const text = parsedUrl.searchParams.get('text') || '';
    const model = parsedUrl.searchParams.get('model') || 'elevenlabs';
    const voice = parsedUrl.searchParams.get('voice') || 'alloy';
    const duration = parsedUrl.searchParams.get('duration') || '';
    const instrumental = parsedUrl.searchParams.get('instrumental') || 'false';

    const queryParams = new URLSearchParams({
      model,
      voice,
      response_format: 'mp3'
    });
    if (duration) queryParams.set('duration', duration);
    if (instrumental === 'true') queryParams.set('instrumental', 'true');

    const targetUrl = `https://gen.pollinations.ai/audio/${encodeURIComponent(text)}?${queryParams.toString()}`;
    console.log(`🔊 Proxying audio: ${targetUrl}`);

    try {
      const headers = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const apiRes = await fetch(targetUrl, { headers });
      if (!apiRes.ok) throw new Error(`HTTP ${apiRes.status} ${apiRes.statusText}`);

      res.writeHead(200, {
        'Content-Type': apiRes.headers.get('content-type') || 'audio/mpeg'
      });

      for await (const chunk of apiRes.body) {
        res.write(chunk);
      }
      res.end();

    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Audio generation error', details: err.message }));
    }
    return;
  }

  // --- STATIC FILES ---
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  // Check if file exists
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 File not found');
      return;
    }

    // Read and serve file
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    stream.pipe(res);
  });
});

// Server start
server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 VibeStudio server started!`);
  console.log(`🌐 App address: http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
