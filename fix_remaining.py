import os

replacements = {
    '<h2>Генератор изображений</h2>': '<h2>Image Generator</h2>',
    '<p>Задайте настройки слева и нажмите «Generate»</p>': '<p>Set the settings on the left and click "Generate"</p>',
    '<h2>Video Generatorроликов</h2>': '<h2>Video Generator</h2>',
    '<p>Задайте настройки слева и нажмите «Create Video»</p>': '<p>Set the settings on the left and click "Create Video"</p>',
    '<h2>Audio Generator и музыки</h2>': '<h2>Audio and Music Generator</h2>',
    '<p>Задайте настройки слева и нажмите «Generate Audio»</p>': '<p>Set the settings on the left and click "Generate Audio"</p>'
}

path = 'd:/Open_Project/pollinations-main/vibestudio/public/index.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

for rus, eng in replacements.items():
    content = content.replace(rus, eng)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Fixed remaining strings.')
