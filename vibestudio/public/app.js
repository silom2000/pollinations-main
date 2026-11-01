// VibeStudio AI — Frontend Application Logic

// Global arrays of models and history
let textModels = [];
let imageModels = [];
let videoModels = [];
let audioModels = [];
let customAiModels = [];
let chatHistory = [];
let activeTab = 'chat';

// Provider selection: 'pollinations' or 'custom'
let currentChatProvider = 'pollinations';
let currentImageProvider = 'pollinations';

// URL for downloading media
let lastGeneratedImageBlobUrl = null;
let lastGeneratedVideoBlobUrl = null;
let lastGeneratedAudioBlobUrl = null;
let lastGeneratedAudioType = 'audio/mpeg';

// Reference image state for Video Generator
let videoRefFile = null;
let videoRefUrl = '';

// Initialization on load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupTextareaAutoGrow();
    setupVideoRefHandlers();
    setupVoiceHandlers();
});

// Helper to get model health & readiness status
function getModelHealthInfo(model) {
    if (!model || !model.health) {
        return {
            status: 'unknown',
            label: 'Unknown',
            icon: '⚪',
            className: 'status-unknown',
            successRate: null
        };
    }
    const status = model.health.status || 'unknown';
    const rate = (model.health.success_rate !== null && model.health.success_rate !== undefined)
        ? Math.round(model.health.success_rate)
        : null;

    if (status === 'healthy') {
        return {
            status: 'healthy',
            label: 'Ready',
            icon: '🟢',
            className: 'status-healthy',
            successRate: rate
        };
    } else if (status === 'degraded') {
        return {
            status: 'degraded',
            label: 'Degraded',
            icon: '🟡',
            className: 'status-degraded',
            successRate: rate
        };
    } else if (status === 'down') {
        return {
            status: 'down',
            label: 'Offline',
            icon: '🔴',
            className: 'status-down',
            successRate: rate
        };
    }
    return {
        status: 'unknown',
        label: 'Unchecked',
        icon: '⚪',
        className: 'status-unknown',
        successRate: rate
    };
}

// Sort models: healthy first, then unknown, then degraded, then down
function sortModelsByHealth(models) {
    const priority = { healthy: 1, unknown: 2, degraded: 3, down: 4 };
    return [...models].sort((a, b) => {
        const pa = priority[a.health?.status || 'unknown'] || 2;
        const pb = priority[b.health?.status || 'unknown'] || 2;
        if (pa !== pb) return pa - pb;
        return (a.title || a.name || '').localeCompare(b.title || b.name || '');
    });
}

// Check models readiness across all loaded categories at startup
function checkModelsReadiness() {
    const allModels = [
        ...textModels,
        ...imageModels,
        ...videoModels,
        ...audioModels
    ];

    const healthTextEl = document.getElementById('models-health-text');
    const healthDotEl = document.getElementById('health-pulse-dot');
    const healthContainer = document.getElementById('models-health-summary');

    if (allModels.length === 0) {
        if (healthTextEl) healthTextEl.textContent = 'No models available';
        if (healthDotEl) healthDotEl.className = 'health-pulse-dot error';
        return;
    }

    let healthyCount = 0;
    let degradedCount = 0;
    let downCount = 0;
    let unknownCount = 0;

    allModels.forEach(m => {
        const status = m.health?.status || 'unknown';
        if (status === 'healthy') healthyCount++;
        else if (status === 'degraded') degradedCount++;
        else if (status === 'down') downCount++;
        else unknownCount++;
    });

    if (healthTextEl) {
        healthTextEl.textContent = `${healthyCount}/${allModels.length} models ready`;
    }

    if (healthContainer) {
        healthContainer.title = `Models readiness: ${healthyCount} ready (healthy), ${degradedCount} degraded, ${downCount} down, ${unknownCount} unverified.`;
    }

    if (healthDotEl) {
        if (healthyCount === 0 && downCount > 0) {
            healthDotEl.className = 'health-pulse-dot error';
        } else if (degradedCount > 5 || downCount > 0) {
            healthDotEl.className = 'health-pulse-dot warning';
        } else {
            healthDotEl.className = 'health-pulse-dot';
        }
    }
}

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

        // 2. Get text models (Pollinations)
        const textRes = await fetch('/api/models');
        if (textRes.ok) {
            textModels = await textRes.json();
            populateTextModels();

            // Add listener to text model selection
            document.getElementById('chat-model-select').addEventListener('change', updateChatPrice);
            updateChatPrice();
        }

        // 3. Get custom AI provider models
        const customRes = await fetch('/api/custom-models');
        if (customRes.ok) {
            const customData = await customRes.json();
            customAiModels = customData.models || [];
            if (!customData.available) {
                // Hide custom tab if not configured
                document.querySelectorAll('.provider-tab[data-provider="custom"]').forEach(el => {
                    el.style.opacity = '0.4';
                    el.title = 'Custom provider not configured in .env';
                });
            }
        }

        // 4. Get image and video models (Pollinations)
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
            document.getElementById('vid-model-select').addEventListener('change', () => {
                updateVideoPrice();
                updateVideoRefSupport();
            });
            document.getElementById('vid-duration').addEventListener('change', updateVideoPrice);

            updateImagePrice();
            updateVideoPrice();
            updateVideoRefSupport();
        }

        // 5. Get audio models (TTS and music)
        const audioRes = await fetch('/api/audio-models');
        if (audioRes.ok) {
            audioModels = await audioRes.json();
            populateAudioModels();

            // Add listeners to audio model selection
            document.getElementById('aud-model-select').addEventListener('change', () => {
                stopVoicePreview();
                updateAudioModelVoices();
                updateAudioPrice();
            });
            document.getElementById('aud-music-model-select').addEventListener('change', updateAudioPrice);
            document.getElementById('aud-music-duration').addEventListener('input', updateAudioPrice);

            updateAudioModelVoices();
            updateAudioPrice();
        }

        // Check models readiness across all categories
        checkModelsReadiness();

        updateServerStatus(true, 'Proxy server active');
    } catch (err) {
        console.error('Initialization error:', err);
        updateServerStatus(false, 'Connection error');
        document.getElementById('key-value').textContent = 'Error';
    }
}

// ============================================================
// Provider Switching
// ============================================================

function switchChatProvider(provider) {
    currentChatProvider = provider;

    // Update tab UI
    document.querySelectorAll('#chat-provider-tabs .provider-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.provider === provider);
    });

    // Repopulate models for chosen provider
    if (provider === 'pollinations') {
        populateTextModels();
    } else {
        populateCustomChatModels();
    }
    updateChatPrice();
}

function populateCustomChatModels() {
    const select = document.getElementById('chat-model-select');
    select.innerHTML = '';
    const models = customAiModels.length ? customAiModels : ['gemini-3.8-flash-high'];
    models.forEach((m, i) => {
        const option = document.createElement('option');
        option.value = m;
        option.textContent = `⚡ ${m}`;
        if (i === 0) option.selected = true;
        select.appendChild(option);
    });
}

function switchImageProvider(provider) {
    currentImageProvider = provider;

    // Update tab UI
    document.querySelectorAll('#img-provider-tabs .provider-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.provider === provider);
    });

    const pollinationsSettings = document.getElementById('img-pollinations-settings');
    const customSettings = document.getElementById('img-custom-settings');
    const sizeSettings = document.getElementById('img-size-settings');
    const safeGroup = document.querySelector('.form-group.inline-group');

    if (provider === 'custom') {
        pollinationsSettings.classList.add('hidden');
        sizeSettings.classList.add('hidden');
        if (safeGroup) safeGroup.classList.add('hidden');
        customSettings.classList.remove('hidden');
    } else {
        pollinationsSettings.classList.remove('hidden');
        sizeSettings.classList.remove('hidden');
        if (safeGroup) safeGroup.classList.remove('hidden');
        customSettings.classList.add('hidden');
    }
}

// Check if a video model supports reference image (Image-to-Video)
function modelSupportsImage(model) {
    if (!model) return false;
    const hasModality = model.input_modalities && model.input_modalities.includes('image');
    const hasCapability = model.video_capabilities && (
        model.video_capabilities.includes('start_frame') ||
        model.video_capabilities.includes('end_frame') ||
        model.video_capabilities.includes('reference_images')
    );
    return Boolean(hasModality || hasCapability);
}

// Update reference image UI based on selected video model
function updateVideoRefSupport() {
    const modelName = document.getElementById('vid-model-select').value;
    const model = videoModels.find(m => m.name === modelName);
    const badge = document.getElementById('vid-ref-badge');
    const dropzone = document.getElementById('vid-ref-dropzone');
    const urlInput = document.getElementById('vid-ref-url');

    if (!badge || !dropzone || !urlInput) return;

    const supports = modelSupportsImage(model);
    if (supports) {
        let text = '✨ I2V Supported: Image to Video';
        if (model.video_capabilities && model.video_capabilities.includes('end_frame')) {
            text = '✨ I2V Supported: Start & End frames';
        }
        badge.textContent = text;
        badge.className = 'ref-support-badge';
        dropzone.classList.remove('disabled');
        urlInput.disabled = false;
        urlInput.placeholder = 'Or paste direct image URL (https://...)';
    } else {
        badge.textContent = '❌ Text-to-Video only (No image support)';
        badge.className = 'ref-support-badge unsupported';
        dropzone.classList.add('disabled');
        urlInput.disabled = true;
        urlInput.placeholder = 'Selected model generates from text prompt only';
    }
}

// Setup handlers for drag-and-drop, file picking, and URL input
function setupVideoRefHandlers() {
    const fileInput = document.getElementById('vid-ref-file');
    const dropzone = document.getElementById('vid-ref-dropzone');
    const urlInput = document.getElementById('vid-ref-url');

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleVideoRefFile(e.target.files[0]);
            }
        });
    }

    if (dropzone) {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!dropzone.classList.contains('disabled')) {
                dropzone.classList.add('dragover');
            }
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (dropzone.classList.contains('disabled')) return;
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleVideoRefFile(e.dataTransfer.files[0]);
            }
        });
    }

    if (urlInput) {
        urlInput.addEventListener('input', (e) => {
            videoRefUrl = e.target.value.trim();
            if (videoRefUrl && !videoRefFile) {
                const promptView = document.getElementById('vid-ref-prompt');
                const previewBox = document.getElementById('vid-ref-preview-box');
                const previewImg = document.getElementById('vid-ref-preview-img');
                const filenameEl = document.getElementById('vid-ref-filename');
                const statusEl = document.getElementById('vid-ref-status-tag');

                if (promptView) promptView.classList.add('hidden');
                if (previewBox) previewBox.classList.remove('hidden');
                if (previewImg) previewImg.src = videoRefUrl;
                if (filenameEl) filenameEl.textContent = videoRefUrl.split('/').pop().split('?')[0] || 'Image URL';
                if (statusEl) statusEl.textContent = 'Direct Web URL';
            } else if (!videoRefUrl && !videoRefFile) {
                clearVideoReferenceImage();
            }
        });
    }
}

function handleVideoRefFile(file) {
    videoRefFile = file;
    const promptView = document.getElementById('vid-ref-prompt');
    const previewBox = document.getElementById('vid-ref-preview-box');
    const previewImg = document.getElementById('vid-ref-preview-img');
    const filenameEl = document.getElementById('vid-ref-filename');
    const statusEl = document.getElementById('vid-ref-status-tag');

    if (promptView) promptView.classList.add('hidden');
    if (previewBox) previewBox.classList.remove('hidden');

    if (previewImg) previewImg.src = URL.createObjectURL(file);
    if (filenameEl) filenameEl.textContent = file.name;
    if (statusEl) statusEl.textContent = `Attached (${(file.size / 1024).toFixed(0)} KB)`;
}

function clearVideoReferenceImage() {
    videoRefFile = null;
    videoRefUrl = '';
    const fileInput = document.getElementById('vid-ref-file');
    const urlInput = document.getElementById('vid-ref-url');
    const promptView = document.getElementById('vid-ref-prompt');
    const previewBox = document.getElementById('vid-ref-preview-box');
    const previewImg = document.getElementById('vid-ref-preview-img');

    if (fileInput) fileInput.value = '';
    if (urlInput) urlInput.value = '';
    if (promptView) promptView.classList.remove('hidden');
    if (previewBox) previewBox.classList.add('hidden');
    if (previewImg) previewImg.src = '';
}

// Functions to update pricing & health info

function updateChatPrice() {
    const modelName = document.getElementById('chat-model-select').value;
    const priceBadge = document.getElementById('chat-price-info');
    const model = textModels.find(m => m.name === modelName);

    if (model) {
        const hInfo = getModelHealthInfo(model);
        const healthHtml = `<span class="status-pill ${hInfo.className}">${hInfo.icon} ${hInfo.label}${hInfo.successRate !== null ? ` (${hInfo.successRate}%)` : ''}</span>`;
        let priceHtml = '';
        if (model.pricing) {
            const inPrice = (parseFloat(model.pricing.promptTextTokens || 0) * 1e6).toFixed(3);
            const outPrice = (parseFloat(model.pricing.completionTextTokens || 0) * 1e6).toFixed(3);
            priceHtml = `1M tok: In ~${inPrice}P / Out ~${outPrice}P`;
        }
        priceBadge.innerHTML = `${healthHtml}${priceHtml}`;
        priceBadge.style.display = 'inline-block';
    } else {
        priceBadge.style.display = 'none';
    }
}

function updateImagePrice() {
    const modelName = document.getElementById('img-model-select').value;
    const priceBadge = document.getElementById('img-price-info');
    const model = imageModels.find(m => m.name === modelName);

    if (model) {
        const hInfo = getModelHealthInfo(model);
        const healthHtml = `<span class="status-pill ${hInfo.className}">${hInfo.icon} ${hInfo.label}${hInfo.successRate !== null ? ` (${hInfo.successRate}%)` : ''}</span>`;
        let priceHtml = '';
        if (model.pricing) {
            const price = parseFloat(model.pricing.completionImageTokens || 0);
            priceHtml = price > 0 ? `Price: ${price.toFixed(4)} Pollen / art` : 'Price: Free / Limit';
        }
        priceBadge.innerHTML = `${healthHtml}${priceHtml}`;
        priceBadge.style.display = 'inline-block';
    } else {
        priceBadge.style.display = 'none';
    }
}

function updateVideoPrice() {
    const modelName = document.getElementById('vid-model-select').value;
    const duration = parseInt(document.getElementById('vid-duration').value || 4);
    const priceBadge = document.getElementById('vid-price-info');
    const model = videoModels.find(m => m.name === modelName);

    updateVideoRefSupport();

    if (model) {
        const hInfo = getModelHealthInfo(model);
        const healthHtml = `<span class="status-pill ${hInfo.className}">${hInfo.icon} ${hInfo.label}${hInfo.successRate !== null ? ` (${hInfo.successRate}%)` : ''}</span>`;
        let priceHtml = '';
        if (model.pricing) {
            const pricePerSec = parseFloat(model.pricing.completionVideoSeconds || 0);
            const totalEst = pricePerSec * duration;
            priceHtml = pricePerSec > 0 ? `Price: ${pricePerSec.toFixed(3)}P/sec (~${totalEst.toFixed(2)}P)` : 'Price: Free / Limit';
        }
        priceBadge.innerHTML = `${healthHtml}${priceHtml}`;
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

    // Filter only text models and sort by health
    const textOnly = sortModelsByHealth(textModels.filter(m => m.category === 'text'));

    textOnly.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;

        const hInfo = getModelHealthInfo(model);
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${hInfo.icon} ${brand}${model.title || model.name}${paid}`;

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

    const sorted = sortModelsByHealth(imageModels);
    sorted.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;

        const hInfo = getModelHealthInfo(model);
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${hInfo.icon} ${brand}${model.title || model.name}${paid}`;

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

    const sorted = sortModelsByHealth(videoModels);
    sorted.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;

        const hInfo = getModelHealthInfo(model);
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        const i2v = modelSupportsImage(model) ? ' [I2V]' : '';
        option.textContent = `${hInfo.icon} ${brand}${model.title || model.name}${i2v}${paid}`;

        if (model.name === 'veo' || model.name === 'wan-fast' || model.name === 'google/veo-3.1-fast') {
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
        // Route to appropriate provider
        const endpoint = currentChatProvider === 'custom' ? '/api/custom-chat' : '/api/chat';

        // Send request to proxy server with streaming enabled
        const response = await fetch(endpoint, {
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
        if (currentImageProvider === 'custom') {
            // --- Custom provider: gemini-3.1-flash-image ---
            const size = document.getElementById('img-custom-size').value || '1024x1024';

            const response = await fetch('/api/custom-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, size })
            });

            if (!response.ok) {
                let errMsg = `Error (${response.status})`;
                try {
                    const errData = await response.json();
                    errMsg = errData.details || errData.error || errMsg;
                } catch (e) {}
                throw new Error(errMsg);
            }

            const data = await response.json();
            const content = data.content || '';

            // Extract base64 image from markdown: ![...](data:image/...;base64,...)
            // or raw data URL
            const dataUrlMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
            if (!dataUrlMatch) {
                throw new Error('No image data received from Gemini. The model may not have generated an image for this prompt.');
            }

            if (lastGeneratedImageBlobUrl) {
                URL.revokeObjectURL(lastGeneratedImageBlobUrl);
            }
            // Convert data URL → blob
            const [meta, b64] = dataUrlMatch[0].split(',');
            const mimeType = meta.match(/data:([^;]+)/)[1];
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: mimeType });
            lastGeneratedImageBlobUrl = URL.createObjectURL(blob);

        } else {
            // --- Pollinations provider ---
            const model = document.getElementById('img-model-select').value;
            const seed = document.getElementById('img-seed').value;
            const width = document.getElementById('img-width').value;
            const height = document.getElementById('img-height').value;
            const safe = document.getElementById('img-safe').checked;

            const queryParams = new URLSearchParams({ prompt, model, width, height, seed, safe: safe.toString() });
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

            if (lastGeneratedImageBlobUrl) {
                URL.revokeObjectURL(lastGeneratedImageBlobUrl);
            }
            lastGeneratedImageBlobUrl = URL.createObjectURL(blob);
        }
        
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
    if (currentImageProvider === 'pollinations') {
        const seedInput = document.getElementById('img-seed');
        // Generate random seed from 1 to a million
        const randomSeed = Math.floor(Math.random() * 1000000) + 1;
        seedInput.value = randomSeed;
    }
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
        // Handle reference image if provided
        let refImageUrl = videoRefUrl;
        if (videoRefFile) {
            const loaderText = document.getElementById('video-loader-text');
            if (loaderText) loaderText.textContent = 'Uploading reference image to media server...';

            const uploadRes = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': videoRefFile.type || 'image/jpeg',
                    'X-File-Name': videoRefFile.name
                },
                body: videoRefFile
            });

            if (!uploadRes.ok) {
                let uploadErrMsg = `Upload failed (${uploadRes.status})`;
                try {
                    const uploadErrJson = await uploadRes.json();
                    uploadErrMsg = uploadErrJson.details || uploadErrJson.error || uploadErrMsg;
                } catch (e) {}
                throw new Error(uploadErrMsg);
            }

            const uploadData = await uploadRes.json();
            refImageUrl = uploadData.url;
            console.log('Reference image uploaded successfully:', refImageUrl);
        }

        const loaderText = document.getElementById('video-loader-text');
        if (loaderText) loaderText.textContent = 'Initializing video render. Video generation takes more time...';

        const queryParams = new URLSearchParams({
            prompt,
            model,
            width: width.toString(),
            height: height.toString(),
            duration,
            seed,
            aspectRatio: aspect
        });

        if (refImageUrl) {
            queryParams.set('image', refImageUrl);
        }

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

// Populate TTS and Music models dropdowns
function populateAudioModels() {
    const select = document.getElementById('aud-model-select');
    select.innerHTML = '';

    // Filter models that have available voices (these are TTS speech synthesis models) and sort by health
    const ttsModels = sortModelsByHealth(audioModels.filter(m => m.voices && m.voices.length > 0));

    ttsModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;

        const hInfo = getModelHealthInfo(model);
        const brand = model.brand ? `[${model.brand}] ` : '';
        const paid = model.paid_only ? ' (Premium)' : '';
        option.textContent = `${hInfo.icon} ${brand}${model.title || model.name}${paid}`;

        if (model.name === 'elevenlabs' || model.name === 'elevenflash' || model.name === 'google/gemini-3.8-flash-lite-tts') {
            option.selected = true;
        }
        select.appendChild(option);
    });

    // Populate Music / Audio generation models dropdown
    const musicSelect = document.getElementById('aud-music-model-select');
    if (musicSelect) {
        const currentMusicVal = musicSelect.value;
        const musicModels = sortModelsByHealth(audioModels.filter(m =>
            (!m.voices || m.voices.length === 0) &&
            m.output_modalities && m.output_modalities.includes('audio') &&
            m.input_modalities && m.input_modalities.includes('text')
        ));
        if (musicModels.length > 0) {
            musicSelect.innerHTML = '';
            musicModels.forEach((model, index) => {
                const option = document.createElement('option');
                option.value = model.name;
                const hInfo = getModelHealthInfo(model);
                const paid = model.paid_only ? ' (Premium)' : '';
                option.textContent = `${hInfo.icon} ${model.title || model.name}${paid}`;
                if (model.name === currentMusicVal || (!currentMusicVal && (model.name.includes('music-v2.5') || index === 0))) {
                    option.selected = true;
                }
                musicSelect.appendChild(option);
            });
        }
    }
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

// Voice metadata dictionary (gender, icon, display name, character/timbre)
const VOICE_CATALOG = {
    // OpenAI & standard voices
    'alloy': { gender: 'neutral', icon: '🧑', name: 'Alloy', desc: 'Универсальный, сбалансированный тембр' },
    'echo': { gender: 'male', icon: '👨', name: 'Echo', desc: 'Мужской, мягкий и размеренный' },
    'fable': { gender: 'male', icon: '👨', name: 'Fable', desc: 'Мужской, британский акцент, выразительный' },
    'onyx': { gender: 'male', icon: '👨', name: 'Onyx', desc: 'Мужской, глубокий, авторитетный диктор' },
    'nova': { gender: 'female', icon: '👩', name: 'Nova', desc: 'Женский, энергичный, теплый и ясный' },
    'shimmer': { gender: 'female', icon: '👩', name: 'Shimmer', desc: 'Женский, эмоциональный, нежный' },
    'ash': { gender: 'male', icon: '👨', name: 'Ash', desc: 'Мужской, спокойный, непринужденный' },
    'ballad': { gender: 'male', icon: '👨', name: 'Ballad', desc: 'Мужской, мелодичный, повествовательный' },
    'coral': { gender: 'female', icon: '👩', name: 'Coral', desc: 'Женский, дружелюбный, открытый' },
    'sage': { gender: 'female', icon: '👩', name: 'Sage', desc: 'Женский, спокойный, мягкий' },
    'verse': { gender: 'male', icon: '👨', name: 'Verse', desc: 'Мужской, выразительный рассказчик' },

    // ElevenLabs voices
    'rachel': { gender: 'female', icon: '👩', name: 'Rachel', desc: 'Женский, профессиональный диктор, спокойный' },
    'domi': { gender: 'female', icon: '👩', name: 'Domi', desc: 'Женский, энергичный, уверенный тон' },
    'bella': { gender: 'female', icon: '👩', name: 'Bella', desc: 'Женский, мягкий, юный, естественный' },
    'elli': { gender: 'female', icon: '👩', name: 'Elli', desc: 'Женский, эмоциональный, молодой' },
    'charlotte': { gender: 'female', icon: '👩', name: 'Charlotte', desc: 'Женский, бархатистый, притягательный' },
    'dorothy': { gender: 'female', icon: '👩', name: 'Dorothy', desc: 'Женский, приятный, сказочный/книжный' },
    'sarah': { gender: 'female', icon: '👩', name: 'Sarah', desc: 'Женский, новостной, четкая дикция' },
    'emily': { gender: 'female', icon: '👩', name: 'Emily', desc: 'Женский, спокойный, аудиокниги' },
    'lily': { gender: 'female', icon: '👩', name: 'Lily', desc: 'Женский, теплый, элегантный' },
    'matilda': { gender: 'female', icon: '👩', name: 'Matilda', desc: 'Женский, интеллигентный, мягкий' },
    'adam': { gender: 'male', icon: '👨', name: 'Adam', desc: 'Мужской, глубокий дикторский бас' },
    'antoni': { gender: 'male', icon: '👨', name: 'Antoni', desc: 'Мужской, сбалансированный, гид/реклама' },
    'arnold': { gender: 'male', icon: '👨', name: 'Arnold', desc: 'Мужской, четкий, харизматичный' },
    'josh': { gender: 'male', icon: '👨', name: 'Josh', desc: 'Мужской, молодой, глубокий тембр' },
    'sam': { gender: 'male', icon: '👨', name: 'Sam', desc: 'Мужской, динамичный, уверенный' },
    'daniel': { gender: 'male', icon: '👨', name: 'Daniel', desc: 'Мужской, авторитетный британский диктор' },
    'charlie': { gender: 'male', icon: '👨', name: 'Charlie', desc: 'Мужской, дружеский, разговорный' },
    'james': { gender: 'male', icon: '👨', name: 'James', desc: 'Мужской, документальный, солидный' },
    'fin': { gender: 'male', icon: '👨', name: 'Fin', desc: 'Мужской, бодрый, характерный' },
    'callum': { gender: 'male', icon: '👨', name: 'Callum', desc: 'Мужской, интенсивный, драматический' },
    'liam': { gender: 'male', icon: '👨', name: 'Liam', desc: 'Мужской, ясный, современный' },
    'george': { gender: 'male', icon: '👨', name: 'George', desc: 'Мужской, британский классический тембр' },
    'brian': { gender: 'male', icon: '👨', name: 'Brian', desc: 'Мужской, зрелый, резонирующий' },
    'bill': { gender: 'male', icon: '👨', name: 'Bill', desc: 'Мужской, доверительный, документальный' },

    // Google Gemini TTS voices
    'Zephyr': { gender: 'male', icon: '👨', name: 'Zephyr', desc: 'Мужской, спокойный, мягкий и ровный' },
    'Puck': { gender: 'male', icon: '👨', name: 'Puck', desc: 'Мужской, озорной, живой, юношеский' },
    'Charon': { gender: 'male', icon: '👨', name: 'Charon', desc: 'Мужской, глубокий, низкий и солидный' },
    'Kore': { gender: 'female', icon: '👩', name: 'Kore', desc: 'Женский, теплый, естественный и ясный' },
    'Fenrir': { gender: 'male', icon: '👨', name: 'Fenrir', desc: 'Мужской, энергичный, звучный' },
    'Leda': { gender: 'female', icon: '👩', name: 'Leda', desc: 'Женский, мягкий, заботливый тон' },
    'Orus': { gender: 'male', icon: '👨', name: 'Orus', desc: 'Мужской, уверенный диктор/ведущий' },
    'Aoede': { gender: 'female', icon: '👩', name: 'Aoede', desc: 'Женский, звонкий, мелодичный' },
    'Callirrhoe': { gender: 'female', icon: '👩', name: 'Callirrhoe', desc: 'Женский, плавный, выразительный' },
    'Autonoe': { gender: 'female', icon: '👩', name: 'Autonoe', desc: 'Женский, размеренный, ясный' },
    'Enceladus': { gender: 'male', icon: '👨', name: 'Enceladus', desc: 'Мужской, строгий, четкий' },
    'Iapetus': { gender: 'male', icon: '👨', name: 'Iapetus', desc: 'Мужской, бархатистый, низкий' },
    'Umbriel': { gender: 'male', icon: '👨', name: 'Umbriel', desc: 'Мужской, задумчивый, спокойный' },
    'Algieba': { gender: 'female', icon: '👩', name: 'Algieba', desc: 'Женский, яркий, динамичный' },
    'Despina': { gender: 'female', icon: '👩', name: 'Despina', desc: 'Женский, юный, легкий' },
    'Erinome': { gender: 'female', icon: '👩', name: 'Erinome', desc: 'Женский, вдохновляющий' },
    'Algenib': { gender: 'male', icon: '👨', name: 'Algenib', desc: 'Мужской, информационный, технический' },
    'Rasalgethi': { gender: 'male', icon: '👨', name: 'Rasalgethi', desc: 'Мужской, повествовательный рассказчик' },
    'Laomedeia': { gender: 'female', icon: '👩', name: 'Laomedeia', desc: 'Женский, мягкий тон' },
    'Achernar': { gender: 'male', icon: '👨', name: 'Achernar', desc: 'Мужской, энергичный диктор' },
    'Alnilam': { gender: 'male', icon: '👨', name: 'Alnilam', desc: 'Мужской, классический диктор' },
    'Schedar': { gender: 'female', icon: '👩', name: 'Schedar', desc: 'Женский, четкий, официальный' },
    'Gacrux': { gender: 'male', icon: '👨', name: 'Gacrux', desc: 'Мужской, глубокий тембр' },
    'Pulcherrima': { gender: 'female', icon: '👩', name: 'Pulcherrima', desc: 'Женский, благородный, чистый' },
    'Achird': { gender: 'male', icon: '👨', name: 'Achird', desc: 'Мужской, бодрый и оптимистичный' },
    'Zubenelgenubi': { gender: 'male', icon: '👨', name: 'Zubenelgenubi', desc: 'Мужской, нейтральный' },
    'Vindemiatrix': { gender: 'female', icon: '👩', name: 'Vindemiatrix', desc: 'Женский, спокойный' },
    'Sadachbia': { gender: 'male', icon: '👨', name: 'Sadachbia', desc: 'Мужской, размеренный' },
    'Sadaltager': { gender: 'male', icon: '👨', name: 'Sadaltager', desc: 'Мужской, убедительный' },
    'Sulafat': { gender: 'female', icon: '👩', name: 'Sulafat', desc: 'Женский, доброжелательный' }
};

// Helper to get formatted voice info
function getVoiceDetails(voiceKey) {
    if (VOICE_CATALOG[voiceKey]) {
        return VOICE_CATALOG[voiceKey];
    }
    let gender = 'neutral';
    let icon = '🧑';
    let cleanName = voiceKey;

    if (voiceKey.startsWith('af_') || voiceKey.startsWith('bf_')) {
        gender = 'female';
        icon = '👩';
        cleanName = voiceKey.slice(3);
    } else if (voiceKey.startsWith('am_') || voiceKey.startsWith('bm_')) {
        gender = 'male';
        icon = '👨';
        cleanName = voiceKey.slice(3);
    } else {
        const lower = voiceKey.toLowerCase();
        if (/(female|woman|girl|isla|emily|jenny|mia|alice|emma|eva|mary|olivia|sophia|anna|elena)/i.test(lower)) {
            gender = 'female';
            icon = '👩';
        } else if (/(male|man|boy|grant|klaus|guy|george|lewis|john|david|michael|thomas|alex)/i.test(lower)) {
            gender = 'male';
            icon = '👨';
        }
    }
    cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
    const desc = gender === 'female' ? 'Женский голос' : gender === 'male' ? 'Мужской голос' : 'Универсальный голос';
    return { gender, icon, name: cleanName, desc };
}

// Voice preview & filter state
let currentVoiceGenderFilter = 'all';
let previewAudioPlayer = null;
let currentPreviewKey = null;
const previewVoiceCache = {};

// Setup handlers for voice filter tabs and demo preview button
function setupVoiceHandlers() {
    const filterTabs = document.getElementById('voice-filter-tabs');
    if (filterTabs) {
        filterTabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.voice-filter-btn');
            if (!btn) return;
            filterTabs.querySelectorAll('.voice-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentVoiceGenderFilter = btn.dataset.filter || 'all';
            updateAudioModelVoices();
        });
    }

    const voiceSelect = document.getElementById('aud-voice-select');
    if (voiceSelect) {
        voiceSelect.addEventListener('change', () => {
            stopVoicePreview();
            updateVoiceMetaBadge();
        });
    }

    const previewBtn = document.getElementById('btn-preview-voice');
    if (previewBtn) {
        previewBtn.addEventListener('click', handleVoicePreview);
    }
}

// Update voice list for selected TTS model
function updateAudioModelVoices() {
    const modelName = document.getElementById('aud-model-select').value;
    const voiceSelect = document.getElementById('aud-voice-select');
    const prevSelectedVoice = voiceSelect.value;
    voiceSelect.innerHTML = '';

    const model = audioModels.find(m => m.name === modelName);
    const rawVoices = (model && model.voices && model.voices.length > 0) ? model.voices : ['alloy'];

    // Filter by gender if requested
    let filteredVoices = rawVoices;
    if (currentVoiceGenderFilter !== 'all') {
        const matches = rawVoices.filter(v => {
            const details = getVoiceDetails(v);
            return details.gender === currentVoiceGenderFilter;
        });
        if (matches.length > 0) {
            filteredVoices = matches;
        }
    }

    filteredVoices.forEach((voice, index) => {
        const option = document.createElement('option');
        option.value = voice;
        const details = getVoiceDetails(voice);
        option.textContent = `${details.icon} ${details.name} — ${details.desc}`;

        if (voice === prevSelectedVoice || (!prevSelectedVoice && index === 0)) {
            option.selected = true;
        }
        voiceSelect.appendChild(option);
    });

    if (!voiceSelect.value && filteredVoices.length > 0) {
        voiceSelect.value = filteredVoices[0];
    }

    updateVoiceMetaBadge();
}

// Update narrator metadata badge below select
function updateVoiceMetaBadge() {
    const voiceSelect = document.getElementById('aud-voice-select');
    const badge = document.getElementById('voice-meta-badge');
    if (!badge || !voiceSelect) return;

    const voice = voiceSelect.value;
    if (!voice) {
        badge.innerHTML = '';
        badge.style.display = 'none';
        return;
    }

    const details = getVoiceDetails(voice);
    badge.innerHTML = `<span style="font-size: 16px;">${details.icon}</span> <span><strong>${details.name}</strong> • ${details.desc} <span style="opacity: 0.6; font-size: 11px;">(ID: ${voice})</span></span>`;
    badge.style.display = 'flex';
}

// Voice preview handler
async function handleVoicePreview() {
    const model = document.getElementById('aud-model-select').value;
    const voice = document.getElementById('aud-voice-select').value;
    const btn = document.getElementById('btn-preview-voice');
    if (!voice || !btn) return;

    const key = `${model}_${voice}`;

    // If currently playing, stop it
    if (previewAudioPlayer && currentPreviewKey === key && !previewAudioPlayer.paused) {
        stopVoicePreview();
        return;
    }

    stopVoicePreview();

    const iconSpan = btn.querySelector('.preview-icon');
    const textSpan = btn.querySelector('.preview-text');

    // Check cache
    if (previewVoiceCache[key]) {
        playPreviewAudio(previewVoiceCache[key], key);
        return;
    }

    btn.classList.add('loading');
    iconSpan.textContent = '⏳';
    textSpan.textContent = 'Загрузка...';

    try {
        const sampleText = 'Привет! Это пример звучания моего голоса.';
        const url = `/api/audio?text=${encodeURIComponent(sampleText)}&model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`;
        const res = await fetch(url);
        if (!res.ok) {
            let errMsg = `Ошибка (${res.status})`;
            try {
                const errData = await res.json();
                errMsg = errData.error?.message || errData.message || errMsg;
            } catch (e) {}
            throw new Error(errMsg);
        }

        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        previewVoiceCache[key] = blobUrl;

        btn.classList.remove('loading');
        playPreviewAudio(blobUrl, key);
    } catch (err) {
        console.error('Voice preview error:', err);
        btn.classList.remove('loading');
        iconSpan.textContent = '▶';
        textSpan.textContent = 'Демо';
        alert(`Не удалось загрузить демо голоса: ${err.message}`);
    }
}

// Play preview audio with playback button state
function playPreviewAudio(blobUrl, key) {
    const btn = document.getElementById('btn-preview-voice');
    if (!btn) return;
    const iconSpan = btn.querySelector('.preview-icon');
    const textSpan = btn.querySelector('.preview-text');

    previewAudioPlayer = new Audio(blobUrl);
    currentPreviewKey = key;

    btn.classList.add('playing');
    iconSpan.textContent = '⏹';
    textSpan.textContent = 'Стоп';

    previewAudioPlayer.onended = () => {
        stopVoicePreview();
    };
    previewAudioPlayer.onerror = () => {
        stopVoicePreview();
    };

    previewAudioPlayer.play().catch(e => {
        console.error('Audio play error:', e);
        stopVoicePreview();
    });
}

// Stop preview playback
function stopVoicePreview() {
    if (previewAudioPlayer) {
        try {
            previewAudioPlayer.pause();
            previewAudioPlayer.currentTime = 0;
        } catch (e) {}
        previewAudioPlayer = null;
    }
    currentPreviewKey = null;

    const btn = document.getElementById('btn-preview-voice');
    if (btn) {
        btn.classList.remove('playing', 'loading');
        const iconSpan = btn.querySelector('.preview-icon');
        const textSpan = btn.querySelector('.preview-text');
        if (iconSpan) iconSpan.textContent = '▶';
        if (textSpan) textSpan.textContent = 'Демо';
    }
}

// Update pricing information for audio
function updateAudioPrice() {
    const type = document.getElementById('aud-type').value;

    if (type === 'tts') {
        const modelName = document.getElementById('aud-model-select').value;
        const priceBadge = document.getElementById('aud-price-info');
        const model = audioModels.find(m => m.name === modelName);

        if (model) {
            const hInfo = getModelHealthInfo(model);
            const healthHtml = `<span class="status-pill ${hInfo.className}">${hInfo.icon} ${hInfo.label}${hInfo.successRate !== null ? ` (${hInfo.successRate}%)` : ''}</span>`;
            let priceHtml = '';
            if (model.pricing) {
                const price = parseFloat(model.pricing.completionAudioTokens || 0);
                priceHtml = `Price: ${price.toFixed(5)}P / char`;
            }
            priceBadge.innerHTML = `${healthHtml}${priceHtml}`;
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
        const model = audioModels.find(m => m.name === modelName);

        const hInfo = getModelHealthInfo(model);
        const healthHtml = hInfo.status !== 'unknown'
            ? `<span class="status-pill ${hInfo.className}">${hInfo.icon} ${hInfo.label}</span>`
            : '';

        let pricePerSec = 0.003;
        if (modelName === 'stable-audio-2.5') {
            pricePerSec = 0.005;
        }

        const totalEst = pricePerSec * duration;
        priceBadge.innerHTML = `${healthHtml}Price: ~${pricePerSec.toFixed(3)}P/sec (~${totalEst.toFixed(3)}P)`;
        priceBadge.style.display = 'inline-block';
        document.getElementById('aud-price-info').style.display = 'none';
    }
}

// Audio Generation
async function generateAudio() {
    stopVoicePreview();

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
                errMsg = errData.error?.message || errData.message || errData.details || (typeof errData.error === 'string' ? errData.error : null) || errMsg;
            } catch (e) {}
            throw new Error(errMsg);
        }

        const blob = await response.blob();
        lastGeneratedAudioType = blob.type || 'audio/mpeg';

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

    let ext = '.mp3';
    if (lastGeneratedAudioType.includes('wav')) {
        ext = '.wav';
    } else if (lastGeneratedAudioType.includes('ogg')) {
        ext = '.ogg';
    } else if (lastGeneratedAudioType.includes('aac')) {
        ext = '.aac';
    }

    const prompt = document.getElementById('aud-prompt').value.trim().slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `VibeStudio_${prompt || 'audio'}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

