const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Load API key from .env file in project root
const envPath = path.resolve(__dirname, '..', '.env');
let apiKey = '';
let customAiApiKey = '';
let customAiUrl = '';
let customAiModels = [];

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      value = value.trim();
      if (key === 'POLLINATIONS_API_KEY') apiKey = value;
      if (key === 'CUSTOM_AI_API_KEY') customAiApiKey = value;
      if (key === 'CUSTOM_AI_URL') customAiUrl = value;
      if (key === 'CUSTOM_AI_MODEL') customAiModels = value.split(',').map(s => s.trim()).filter(Boolean);
    }
  });
}

// Fallback to environment variables
if (!apiKey) apiKey = process.env.POLLINATIONS_API_KEY || '';
if (!customAiApiKey) customAiApiKey = process.env.CUSTOM_AI_API_KEY || '';
if (!customAiUrl) customAiUrl = process.env.CUSTOM_AI_URL || '';
if (!customAiModels.length && process.env.CUSTOM_AI_MODEL) {
  customAiModels = process.env.CUSTOM_AI_MODEL.split(',').map(s => s.trim()).filter(Boolean);
}

// Derive base URL (strip /chat/completions if present)
const customAiBaseUrl = customAiUrl.replace(/\/chat\/completions\/?$/, '');

console.log('🔑 Loaded API key:', apiKey ? `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}` : '❌ Missing');
console.log('🤖 Custom AI provider:', customAiBaseUrl || '❌ Not configured', '| Models:', customAiModels.join(', ') || 'none');

const PORT = process.env.PORT || 3030;
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
      const headers = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const apiRes = await fetch('https://gen.pollinations.ai/models', { headers });
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
      const headers = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const apiRes = await fetch('https://gen.pollinations.ai/image/models', { headers });
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
      if (!apiRes.ok) {
        const errorText = await apiRes.text();
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(errorText);
        return;
      }

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
    const image = parsedUrl.searchParams.get('image') || '';
    const aspectRatio = parsedUrl.searchParams.get('aspectRatio') || '';

    let targetUrl = `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&width=${width}&height=${height}&duration=${duration}&seed=${seed}`;
    if (image) {
      targetUrl += `&image=${encodeURIComponent(image)}`;
    }
    if (aspectRatio) {
      targetUrl += `&aspectRatio=${encodeURIComponent(aspectRatio)}`;
    }
    console.log(`🎥 Proxying video: ${targetUrl}`);

    try {
      const headers = {};
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const apiRes = await fetch(targetUrl, { headers });
      if (!apiRes.ok) {
        const errorText = await apiRes.text();
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(errorText);
        return;
      }

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
      const headers = {};
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      const apiRes = await fetch('https://gen.pollinations.ai/audio/models', { headers });
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

  // 5.7. Custom AI provider — list of models (GET /api/custom-models)
  if (pathname === '/api/custom-models' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      models: customAiModels,
      available: Boolean(customAiBaseUrl && customAiApiKey)
    }));
    return;
  }

  // 5.8. Custom AI provider — text chat (POST /api/custom-chat)
  if (pathname === '/api/custom-chat' && req.method === 'POST') {
    if (!customAiBaseUrl || !customAiApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Custom AI provider not configured' }));
      return;
    }
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const bodyData = JSON.parse(bodyStr);
        const apiRes = await fetch(`${customAiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${customAiApiKey}`
          },
          body: JSON.stringify(bodyData)
        });
        res.writeHead(apiRes.status, {
          'Content-Type': apiRes.headers.get('content-type') || 'application/json',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });
        for await (const chunk of apiRes.body) {
          res.write(chunk);
        }
        res.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Custom AI chat error', details: err.message }));
      }
    });
    return;
  }

  // 5.9. Custom AI provider — image generation via gemini-3.1-flash-image (POST /api/custom-image)
  // Uses /v1/chat/completions with optional reference image (multimodal input)
  if (pathname === '/api/custom-image' && req.method === 'POST') {
    if (!customAiBaseUrl || !customAiApiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Custom AI provider not configured' }));
      return;
    }
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', async () => {
      try {
        const { prompt, size, referenceImageBase64, referenceImageMime } = JSON.parse(bodyStr);

        // Build message content: multimodal if reference image provided
        let messageContent;
        if (referenceImageBase64) {
          const mimeType = referenceImageMime || 'image/jpeg';
          messageContent = [
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${referenceImageBase64}` }
            },
            {
              type: 'text',
              text: prompt || 'Edit or transform this image'
            }
          ];
          console.log(`🖼️  Custom image (I2I) via gemini-3.1-flash-image, size=${size || '1024x1024'}, ref=${mimeType}`);
        } else {
          messageContent = prompt || 'Generate an image';
          console.log(`🖼️  Custom image (T2I) via gemini-3.1-flash-image, size=${size || '1024x1024'}`);
        }

        const requestBody = {
          model: 'gemini-3.1-flash-image',
          messages: [{ role: 'user', content: messageContent }]
        };
        // 'size' goes at the TOP LEVEL — the OpenAI Python SDK's extra_body
        // merges fields into the root request body, so we must do the same manually.
        if (size) requestBody.size = size;

        const apiRes = await fetch(`${customAiBaseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${customAiApiKey}`
          },
          body: JSON.stringify(requestBody)
        });

        if (!apiRes.ok) {
          const errText = await apiRes.text();
          console.error('Custom image error:', errText);
          res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(errText);
          return;
        }

        const data = await apiRes.json();
        const content = data.choices?.[0]?.message?.content || '';
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ content }));
      } catch (err) {
        console.error(err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Custom image error', details: err.message }));
      }
    });
    return;
  }

  // 5.6. Media upload for reference images (POST /api/upload)
  if (pathname === '/api/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', chunk => { chunks.push(chunk); });
    req.on('end', async () => {
      try {
        const buffer = Buffer.concat(chunks);
        const headers = {
          'Content-Type': req.headers['content-type'] || 'application/octet-stream'
        };
        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }
        if (req.headers['x-file-name']) {
          headers['X-File-Name'] = req.headers['x-file-name'];
        }

        const apiRes = await fetch('https://media.pollinations.ai/upload', {
          method: 'POST',
          headers,
          body: buffer
        });

        const data = await apiRes.json();
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      } catch (err) {
        console.error('Upload error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upload failed', details: err.message }));
      }
    });
    return;
  }

  // 5.6. Proxy for audio (GET /api/audio)
  if (pathname === '/api/audio' && req.method === 'GET') {
    const text = parsedUrl.searchParams.get('text') || '';
    const model = parsedUrl.searchParams.get('model') || 'elevenlabs';
    const voice = parsedUrl.searchParams.get('voice') || 'alloy';
    const duration = parsedUrl.searchParams.get('duration') || '';
    const instrumental = parsedUrl.searchParams.get('instrumental') || 'false';
    const responseFormat = parsedUrl.searchParams.get('response_format') || '';

    const queryParams = new URLSearchParams({
      model
    });
    if (voice) queryParams.set('voice', voice);
    if (responseFormat) queryParams.set('response_format', responseFormat);
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
      if (!apiRes.ok) {
        const errorText = await apiRes.text();
        console.error(`Audio upstream error (${apiRes.status}):`, errorText);
        res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(errorText);
        return;
      }

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
