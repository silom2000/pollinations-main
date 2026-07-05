const fs = require('fs');
const path = require('path');

// 1. Manual load of .env file to avoid extra dependencies (dotenv)
const envPath = path.resolve(__dirname || '.', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value.trim();
    }
  });
}

const apiKey = process.env.POLLINATIONS_API_KEY;

if (!apiKey) {
  console.error("❌ Error: POLLINATIONS_API_KEY variable not found in .env file!");
  console.log("Please ensure your .env file has the line: POLLINATIONS_API_KEY=your_key");
  process.exit(1);
}

async function main() {
  console.log("==================================================");
  console.log("🚀 Sandbox start Pollinations.ai...");
  console.log("==================================================\n");

  // --- Text generation test ---
  const textPrompt = "Write a short, motivating and funny advice for a beginner vibecoder programmer who is just starting out.";
  console.log(`💬 1. Sending request to text model (openai)...`);
  console.log(`Prompt: "${textPrompt}"\n`);

  try {
    const textResponse = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "openai",
        messages: [{ role: "user", content: textPrompt }]
      })
    });

    if (!textResponse.ok) {
      throw new Error(`Error HTTP: ${textResponse.status} ${textResponse.statusText}`);
    }

    const textData = await textResponse.json();
    const reply = textData.choices[0].message.content;
    console.log("🤖 Model response:");
    console.log("--------------------------------------------------");
    console.log(reply);
    console.log("--------------------------------------------------\n");

  } catch (error) {
    console.error("❌ Error during text generation:", error.message);
  }

  // --- Image generation test ---
  const imagePrompt = "A cozy developer room with a keyboard glowing, a cute cat sleeping on a desk, pixel art style, warm cozy lighting";
  console.log(`🎨 2. Generating image (модель: flux)...`);
  console.log(`Prompt: "${imagePrompt}"\n`);

  try {
    const imageUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(imagePrompt)}?model=flux&width=1024&height=1024&seed=42`;
    
    const imageResponse = await fetch(imageUrl, {
      headers: {
        "Authorization": `Bearer ${apiKey}`
      }
    });

    if (!imageResponse.ok) {
      throw new Error(`Error HTTP: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const outputPath = path.resolve(".", "sandbox_image.jpg");
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`✅ Image successfully created!`);
    console.log(`💾 Saved to: ${outputPath}\n`);

  } catch (error) {
    console.error("❌ Error during image generation:", error.message);
  }

  console.log("==================================================");
  console.log("🎉 Script execution finished!");
  console.log("==================================================");
}

main();
