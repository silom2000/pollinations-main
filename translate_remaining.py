import os

replacements = {
    "Error чата": "Chat error",
    "Failed to get models картинок": "Failed to get image models",
    "Error генерации картинки": "Image generation error",
    "Error генерации видео": "Video generation error",
    "Error генерации аудио": "Audio generation error",
    "Ручная загрузка .env файла, чтобы не ставить лишних зависимостей": "Manual load of .env file to avoid extra dependencies",
    "Переменная POLLINATIONS_API_KEY не найдена в файле .env!": "POLLINATIONS_API_KEY variable not found in .env file!",
    "Пожалуйста, убедитесь, что в файле .env есть строка: POLLINATIONS_API_KEY=ваш_ключ": "Please ensure your .env file has the line: POLLINATIONS_API_KEY=your_key",
    "Тест генерации текста": "Text generation test",
    "Напиши короткий, мотивирующий и забавный совет для начинающего программиста-вайбкодера, который только начинает свой путь.": "Write a short, motivating and funny advice for a beginner vibecoder programmer who is just starting out.",
    "Отправляем запрос текстовой модели": "Sending request to text model",
    "Ответ модели:": "Model response:",
    "Error при генерации текста:": "Error during text generation:",
    "Тест генерации изображения": "Image generation test",
    "Генерируем картинку": "Generating image",
    "Изображение успешно создано!": "Image successfully created!",
    "Сохранено в:": "Saved to:",
    "Error при генерации изображения:": "Error during image generation:",
    "Работа скрипта завершена!": "Script execution finished!"
}

files_to_check = [
    'vibestudio/public/app.js',
    'vibestudio/server.js',
    'sandbox.js'
]

for f in files_to_check:
    path = os.path.join('d:/Open_Project/pollinations-main', f)
    if os.path.exists(path):
        with open(path, 'r', encoding='utf-8') as file:
            content = file.read()
            
        for rus, eng in replacements.items():
            content = content.replace(rus, eng)
            
        with open(path, 'w', encoding='utf-8') as file:
            file.write(content)

print('Final translation completed.')
