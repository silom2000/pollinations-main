// VibeStudio AI — Frontend Application Logic

// Global arrays of models and history
let textModels = [];
let imageModels = [];
let videoModels = [];
let audioModels = [];
let chatHistory = [];
let activeTab = 'chat';

// URL for downloading media
let lastGeneratedImageBlobUrl = null;
let lastGeneratedVideoBlobUrl = null;
let lastGeneratedAudioBlobUrl = null;

// Initialization on load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupTextareaAutoGrow();
});

// Set up auto-height for textarea in chat
function setupTextareaAutoGrow() {
    const textarea = document.getElementById('chat-input');
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight - 4) + 'px';
    });
    
    // Send on Ctrl + Enter
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
}

// Load statuses and model list
async function initApp() {
    updateServerStatus(true, 'Connecting...');
    
    try {
        // 1. Request key status
        const statusRes = await fetch('/api/key-status');
        if (statusRes.ok) {
            const statusData = await statusRes.json();
            document.getElementById('key-value').textContent = statusData.maskedKey;
            if (!statusData.hasKey) {
                document.getElementById('key-value').style.color = '#ef4444';
            }
        }
        
        // 2. Get text models
        const textRes = await fetch('/api/models');
        if (textRes.ok) {
            textModels = await textRes.json();
            populateTextModels();
            
            // Add listener to text model selection
            document.getElementById('chat-model-select').addEventListener('change', updateChatPrice);
            updateChatPrice();
        }
        
        // 3. Get image and video models
        const imageRes = await fetch('/api/image-models');
        if (imageRes.ok) {
            const rawImageModels = await imageRes.json();
            
            // Separate into images and video by modalities or category field
            imageModels = rawImageModels.filter(m => m.category === 'image' || (m.output_modalities && m.output_modalities.includes('image')));
            videoModels = rawImageModels.filter(m => m.category === 'video' || (m.output_modalities && m.output_modalities.includes('video')));
            
            populateImageModels();
            populateVideoModels();

            // Add listeners to image and video model selection
            document.getElementById('img-model-select').addEventListener('change', updateImagePrice);
            document.getElementById('vid-model-select').addEventListener('change', updateVideoPrice);
            document.getElementById('vid-duration').addEventListener('change', updateVideoPrice);
            
            updateImagePrice();
            updateVideoPrice();
        }

        // 4. Get audio models (TTS and music)
        const audioRes = await fetch('/api/audio-models');
        if (audioRes.ok) {
            audioModels = await audioRes.json();
            populateAudioModels();
            
            // Add listeners to audio model selection
            document.getElementById('aud-model-select').addEventListener('change', () => {
                updateAudioModelVoices();
                updateAudioPrice();
            });
            document.getElementById('aud-music-model-select').addEventListener('change', updateAudioPrice);
            document.getElementById('aud-music-duration').addEventListener('input', updateAudioPrice);
            
            updateAudioModelVoices();
            updateAudioPrice();
        }
        
        updateServerStatus(true, 'Proxy server active');
    } catch (err) {
        console.error('Initialization error:', err);
        updateServerStatus(false, 'Connection error');
        document.getElementById('key-value').textContent = 'Error';
    }
}

// Functions to update pricing info

function updateChatPrice() {
    const modelName = document.getElementById('chat-model-select').value;
    const priceBadge = document.getElementById('chat-price-info');
    const model = textModels.find(m => m.name === modelName);
    
    if (model && model.pricing) {
        const inPrice = (parseFloat(model.pricing.promptTextTokens || 0) * 1e6).toFixed(3);
        const outPrice = (parseFloat(model.pricing.completionTextTokens || 0) * 1e6).toFixed(3);
        priceBadge.textContent = `1M tokens: In ~${inPrice}P / Out ~${outPrice}P`;
        priceBadge.style.display = 'inline-block';
    } else {
        priceBadge.style.display = 'none';
    }
}

function updateImagePrice() {
    const modelName = document.getElementById('img-model-select').value;
    const priceBadge = document.getElementById('img-price-info');
    const model = imageModels.find(m => m.name === modelName);
    
    if (model && model.pricing) {
        const price = parseFloat(model.pricing.completionImageTokens || 0);
        if (price > 0) {
            priceBadge.textContent = `Price: ${price.toFixed(4)} Pollen / art`;
            priceBadge.style.display = 'inline-block';
        } else {
            priceBadge.textContent = 'Price: Free / Limit';
            priceBadge.style.display = 'inline-block';
        }
    } else {
        priceBadge.style.display = 'none';
    }
}

function updateVideoPrice() {
    const modelName = document.getElementById('vid-model-select').value;
    const duration = parseInt(document.getElementById('vid-duration').value || 4);
    const priceBadge = document.getElementById('vid-price-info');
    const model = videoModels.find(m => m.name === modelName);
    
    if (model && model.pricing) {
        const pricePerSec = parseFloat(model.pricing.completionVideoSeconds || 0);
        const totalEst = pricePerSec * duration;
        priceBadge.textContent = `Price: ${pricePerSec.toFixed(3)}P/sec (Total: ~${totalEst.toFixed(2)}P)`;
        priceBadge.style.display = 'inline-block';
    } else {
        priceBadge.style.display = 'none';
    }
}


// Update network indicator
function updateServerStatus(isOnline, text) {
    const dot = document.getElementById('status-dot');
    const textEl = document.getElementById('status-text');
    
    if (isOnline) {
        dot.className = 'status-dot online';
    } else {
        dot.className = 'status-dot offline';
    }
    textEl.textContent = text;
}

// Populate text models dropdown
function populateTextModels() {
    const select = document.getElementById('chat-model-select');
    select.innerHTML = '';
    
    // Filter only text models
    const textOnly = textModels.filter(m => m.category === 'text');
    
    textOnly.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        
        // Format display (Name + Brand + if Paid)
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${brand}${model.title || model.name}${paid}`;
        
        // Make "openai" selected by default
        if (model.name === 'openai') {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// Populate image models dropdown
function populateImageModels() {
    const select = document.getElementById('img-model-select');
    select.innerHTML = '';
    
    imageModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${brand}${model.title || model.name}${paid}`;
        
        if (model.name === 'zimage' || model.name === 'flux') {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// Populate video models dropdown
function populateVideoModels() {
    const select = document.getElementById('vid-model-select');
    select.innerHTML = '';
    
    videoModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${brand}${model.title || model.name}${paid}`;
        
        if (model.name === 'veo' || model.name === 'wan-fast') {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// Tab switching
function switchTab(tabId) {
    activeTab = tabId;
    
    // Switch navigation buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${tabId}`).classList.add('active');
    
    // Switch content containers
    document.querySelectorAll('.content-tab').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`content-${tabId}`).classList.add('active');
}

// Clear chat
function clearChat() {
    chatHistory = [];
    const container = document.getElementById('chat-messages');
    container.innerHTML = `
        <div class="message system-message">
            <div class="message-content">
                <p>🧹 Chat cleared. Ask a new question!</p>
            </div>
        </div>
    `;
}

// Markup formatting (micro markdown parser for code)
function formatMarkdown(text) {
    // Escape HTML tags for safety
    let html = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
    // Format multiline code blocks ```javascript ... ```
    html = html.replace(/```([\w-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
    });
    
    // Format inline code `code`
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    
    // Convert line breaks to <br>
    html = html.replace(/\n/g, '<br>');
    return html;
}

// Send message to chat
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const prompt = input.value.trim();
    if (!prompt) return;
    
    const model = document.getElementById('chat-model-select').value;
    
    // Add user message to UI
    appendMessage('user', prompt);
    input.value = '';
    input.style.height = 'auto'; // Reset height
    
    // Add to history
    chatHistory.push({ role: 'user', content: prompt });
    
    // Create empty container for bot response
    const assistantMessageEl = appendMessage('assistant', '<div class="spinner" style="width:20px;height:20px;display:inline-block;vertical-align:middle;margin-right:8px;"></div> Thinking...');
    const messageContentEl = assistantMessageEl.querySelector('.message-content');
    
    const sendButton = document.getElementById('btn-send-chat');
    sendButton.disabled = true;
    
    try {
        // Send request to proxy server with streaming enabled
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: chatHistory,
                stream: true
            })
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        messageContentEl.innerHTML = ''; // Clear "Thinking..." spinner
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let assistantReply = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            // Parse Server-Sent Events strings
            const lines = chunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') continue;
                    
                    try {
                        const parsed = JSON.parse(dataStr);
                        const content = parsed.choices[0]?.delta?.content || '';
                        assistantReply += content;
                        
                        // Show text with syntax highlighting
                        messageContentEl.innerHTML = formatMarkdown(assistantReply);
                        
                        // Scroll chat down
                        const chatContainer = document.getElementById('chat-messages');
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    } catch (e) {
                        // Ignore parsing errors for incomplete chunks
                    }
                }
            }
        }
        
        // Save final response to dialog history
        chatHistory.push({ role: 'assistant', content: assistantReply });
        
    } catch (err) {
        console.error('Chat error:', err);
        messageContentEl.innerHTML = `<span style="color:#ef4444">❌ Failed to get response: ${err.message}</span>`;
    } finally {
        sendButton.disabled = false;
        input.focus();
    }
}

// Add message to chat block
function appendMessage(role, text) {
    const container = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = `message ${role}-message`;
    
    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';
    
    if (role === 'user') {
        contentEl.textContent = text;
    } else {
        contentEl.innerHTML = text; // For HTML formatting of responses
    }
    
    messageEl.appendChild(contentEl);
    container.appendChild(messageEl);
    container.scrollTop = container.scrollHeight;
    
    return messageEl;
}

// --- IMAGE GENERATION ---

async function generateImage() {
    const prompt = document.getElementById('img-prompt').value.trim();
    if (!prompt) {
        alert('Please describe the image in the prompt!');
        return;
    }
    
    const model = document.getElementById('img-model-select').value;
    const seed = document.getElementById('img-seed').value;
    const width = document.getElementById('img-width').value;
    const height = document.getElementById('img-height').value;
    const safe = document.getElementById('img-safe').checked;
    
    // UI state: show loader
    const loader = document.getElementById('image-loader');
    const placeholder = document.getElementById('image-placeholder');
    const displayContainer = document.getElementById('image-display-container');
    const displayImg = document.getElementById('image-display');
    const btnGen = document.getElementById('btn-gen-image');
    
    loader.classList.remove('hidden');
    placeholder.classList.add('hidden');
    displayContainer.classList.add('hidden');
    btnGen.disabled = true;
    
    // Unlock regeneration/download buttons only after success
    document.getElementById('btn-regen-image').disabled = true;
    document.getElementById('btn-download-image').disabled = true;

    try {
        const queryParams = new URLSearchParams({
            prompt,
            model,
            width,
            height,
            seed,
            safe: safe.toString()
        });

        const fetchUrl = `/api/image?${queryParams.toString()}`;
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
            let errMsg = `Error (${response.status})`;
            try {
                const errData = await response.json();
                errMsg = errData.details || errData.error || errMsg;
            } catch (e) {}
            throw new Error(errMsg);
        }
        
        const blob = await response.blob();
        
        // Free old reference from memory if exists
        if (lastGeneratedImageBlobUrl) {
            URL.revokeObjectURL(lastGeneratedImageBlobUrl);
        }
        
        lastGeneratedImageBlobUrl = URL.createObjectURL(blob);
        
        displayImg.src = lastGeneratedImageBlobUrl;
        
        loader.classList.add('hidden');
        displayContainer.classList.remove('hidden');
        
        // Enable control buttons
        document.getElementById('btn-regen-image').disabled = false;
        document.getElementById('btn-download-image').disabled = false;
        
    } catch (err) {
        console.error(err);
        loader.classList.add('hidden');
        placeholder.classList.remove('hidden');
        alert(`Failed to generate image: ${err.message}`);
    } finally {
        btnGen.disabled = false;
    }
}

// Regenerate image with new seed
function regenerateImage() {
    const seedInput = document.getElementById('img-seed');
    // Generate random seed from 1 to a million
    const randomSeed = Math.floor(Math.random() * 1000000) + 1;
    seedInput.value = randomSeed;
    generateImage();
}

// Download generated image
function downloadImage() {
    if (!lastGeneratedImageBlobUrl) return;
    const a = document.createElement('a');
    a.href = lastGeneratedImageBlobUrl;
    
    // Format filename from prompt
    const prompt = document.getElementById('img-prompt').value.trim().slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `VibeStudio_${prompt || 'image'}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- VIDEO GENERATION ---

async function generateVideo() {
    const prompt = document.getElementById('vid-prompt').value.trim();
    if (!prompt) {
        alert('Please describe the scene for the video!');
        return;
    }
    
    const model = document.getElementById('vid-model-select').value;
    const seed = document.getElementById('vid-seed').value;
    const duration = document.getElementById('vid-duration').value;
    const aspect = document.getElementById('vid-aspect').value;
    
    // Determine video width and height based on aspect ratio
    let width = 1024;
    let height = 576; // 16:9
    if (aspect === '9:16') {
        width = 576;
        height = 1024;
    }
    
    const loader = document.getElementById('video-loader');
    const placeholder = document.getElementById('video-placeholder');
    const displayContainer = document.getElementById('video-display-container');
    const displayVid = document.getElementById('video-display');
    const btnGen = document.getElementById('btn-gen-video');
    
    loader.classList.remove('hidden');
    placeholder.classList.add('hidden');
    displayContainer.classList.add('hidden');
    btnGen.disabled = true;
    
    document.getElementById('btn-regen-video').disabled = true;
    document.getElementById('btn-download-video').disabled = true;

    try {
        const queryParams = new URLSearchParams({
            prompt,
            model,
            width: width.toString(),
            height: height.toString(),
            duration,
            seed
        });

        const fetchUrl = `/api/video?${queryParams.toString()}`;
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
            let errMsg = `Error (${response.status})`;
            try {
                const errData = await response.json();
                errMsg = errData.details || errData.error || errMsg;
            } catch (e) {}
            throw new Error(errMsg);
        }
        
        const blob = await response.blob();
        
        if (lastGeneratedVideoBlobUrl) {
            URL.revokeObjectURL(lastGeneratedVideoBlobUrl);
        }
        
        lastGeneratedVideoBlobUrl = URL.createObjectURL(blob);
        
        displayVid.src = lastGeneratedVideoBlobUrl;
        
        loader.classList.add('hidden');
        displayContainer.classList.remove('hidden');
        
        document.getElementById('btn-regen-video').disabled = false;
        document.getElementById('btn-download-video').disabled = false;
        
    } catch (err) {
        console.error(err);
        loader.classList.add('hidden');
        placeholder.classList.remove('hidden');
        alert(`Failed to create video clip: ${err.message}`);
    } finally {
        btnGen.disabled = false;
    }
}

// Regenerate video with new seed
function regenerateVideo() {
    const seedInput = document.getElementById('vid-seed');
    const randomSeed = Math.floor(Math.random() * 1000000) + 1;
    seedInput.value = randomSeed;
    generateVideo();
}

// Download video clip
function downloadVideo() {
    if (!lastGeneratedVideoBlobUrl) return;
    const a = document.createElement('a');
    a.href = lastGeneratedVideoBlobUrl;
    
    const prompt = document.getElementById('vid-prompt').value.trim().slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `VibeStudio_${prompt || 'video'}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- AUDIO GENERATION ---

// Populate TTS models dropdown
function populateAudioModels() {
    const select = document.getElementById('aud-model-select');
    select.innerHTML = '';
    
    // Filter models that have available voices (these are TTS speech synthesis models)
    const ttsModels = audioModels.filter(m => m.voices && m.voices.length > 0);
    
    ttsModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${brand}${model.title || model.name}${paid}`;
        
        if (model.name === 'elevenlabs' || model.name === 'elevenflash') {
            option.selected = true;
        }
        select.appendChild(option);
    });
}

// Switch fields depending on type (TTS or Music)
function toggleAudioFields() {
    const type = document.getElementById('aud-type').value;
    const ttsSettings = document.getElementById('aud-tts-settings');
    const musicSettings = document.getElementById('aud-music-settings');
    const promptTextarea = document.getElementById('aud-prompt');
    
    if (type === 'tts') {
        ttsSettings.classList.remove('hidden');
        musicSettings.classList.add('hidden');
        promptTextarea.placeholder = 'Enter text for voiceover...';
    } else {
        ttsSettings.classList.add('hidden');
        musicSettings.classList.remove('hidden');
        promptTextarea.placeholder = 'Describe music style, instruments, mood (e.g., lofi synthwave beat with slow drums, night drive vibe)...';
    }
    updateAudioPrice();
}

// Update voice list for selected TTS model
function updateAudioModelVoices() {
    const modelName = document.getElementById('aud-model-select').value;
    const voiceSelect = document.getElementById('aud-voice-select');
    voiceSelect.innerHTML = '';
    
    const model = audioModels.find(m => m.name === modelName);
    
    if (model && model.voices) {
        model.voices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice;
            option.textContent = voice;
            
            if (voice === 'nova' || voice === 'alloy') {
                option.selected = true;
            }
            voiceSelect.appendChild(option);
        });
    } else {
        const option = document.createElement('option');
        option.value = 'alloy';
        option.textContent = 'alloy';
        voiceSelect.appendChild(option);
    }
}

// Update pricing information for audio
function updateAudioPrice() {
    const type = document.getElementById('aud-type').value;
    
    if (type === 'tts') {
        const modelName = document.getElementById('aud-model-select').value;
        const priceBadge = document.getElementById('aud-price-info');
        const model = audioModels.find(m => m.name === modelName);
        
        if (model && model.pricing) {
            const price = parseFloat(model.pricing.completionAudioTokens || 0);
            priceBadge.textContent = `Price: ${price.toFixed(5)}P / char`;
            priceBadge.style.display = 'inline-block';
        } else {
            priceBadge.style.display = 'none';
        }
        document.getElementById('aud-music-price-info').style.display = 'none';
    } else {
        // Music
        const modelName = document.getElementById('aud-music-model-select').value;
        const duration = parseInt(document.getElementById('aud-music-duration').value || 10);
        const priceBadge = document.getElementById('aud-music-price-info');
        
        // Temporary static pricing estimation for music (since API has no clear pricing in /models response)
        let pricePerSec = 0.003; // by default
        if (modelName === 'stable-audio-2.5') {
            pricePerSec = 0.005;
        }
        
        const totalEst = pricePerSec * duration;
        priceBadge.textContent = `Price: ~${pricePerSec.toFixed(3)}P/sec (Total: ~${totalEst.toFixed(3)}P)`;
        priceBadge.style.display = 'inline-block';
        document.getElementById('aud-price-info').style.display = 'none';
    }
}

// Audio Generation
async function generateAudio() {
    const prompt = document.getElementById('aud-prompt').value.trim();
    if (!prompt) {
        alert('Please write a prompt or text for generation!');
        return;
    }
    
    const type = document.getElementById('aud-type').value;
    
    const loader = document.getElementById('audio-loader');
    const placeholder = document.getElementById('audio-placeholder');
    const displayContainer = document.getElementById('audio-display-container');
    const displayAud = document.getElementById('audio-display');
    const btnGen = document.getElementById('btn-gen-audio');
    
    loader.classList.remove('hidden');
    placeholder.classList.add('hidden');
    displayContainer.classList.add('hidden');
    btnGen.disabled = true;
    
    document.getElementById('btn-download-audio').disabled = true;

    try {
        let queryParams;
        
        if (type === 'tts') {
            const model = document.getElementById('aud-model-select').value;
            const voice = document.getElementById('aud-voice-select').value;
            
            queryParams = new URLSearchParams({
                text: prompt,
                model,
                voice
            });
        } else {
            const model = document.getElementById('aud-music-model-select').value;
            const duration = document.getElementById('aud-music-duration').value;
            const instrumental = document.getElementById('aud-music-instrumental').checked;
            
            queryParams = new URLSearchParams({
                text: prompt,
                model,
                duration,
                instrumental: instrumental.toString()
            });
        }

        const fetchUrl = `/api/audio?${queryParams.toString()}`;
        const response = await fetch(fetchUrl);
        
        if (!response.ok) {
            let errMsg = `Error (${response.status})`;
            try {
                const errData = await response.json();
                errMsg = errData.details || errData.error || errMsg;
            } catch (e) {}
            throw new Error(errMsg);
        }
        
        const blob = await response.blob();
        
        if (lastGeneratedAudioBlobUrl) {
            URL.revokeObjectURL(lastGeneratedAudioBlobUrl);
        }
        
        lastGeneratedAudioBlobUrl = URL.createObjectURL(blob);
        
        displayAud.src = lastGeneratedAudioBlobUrl;
        
        loader.classList.add('hidden');
        displayContainer.classList.remove('hidden');
        
        document.getElementById('btn-download-audio').disabled = false;
        
    } catch (err) {
        console.error(err);
        loader.classList.add('hidden');
        placeholder.classList.remove('hidden');
        alert(`Failed to create audio file: ${err.message}`);
    } finally {
        btnGen.disabled = false;
    }
}

// Download audio file
function downloadAudio() {
    if (!lastGeneratedAudioBlobUrl) return;
    const a = document.createElement('a');
    a.href = lastGeneratedAudioBlobUrl;
    
    const prompt = document.getElementById('aud-prompt').value.trim().slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `VibeStudio_${prompt || 'audio'}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

