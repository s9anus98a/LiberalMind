// Required modules
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import fs from 'fs/promises'; // For saving the image file
import path from 'path';      // For handling file paths

// --- Configuration ---
// ВАЖНО: Храните ваш API ключ безопасно! Использование переменных окружения рекомендуется.
// Оставляю ваш плейсхолдер согласно запросу. НЕ ИСПОЛЬЗУЙТЕ НАСТОЯЩИЙ КЛЮЧ ТАК В РЕАЛЬНЫХ ПРОЕКТАХ!
const API_KEY = "AIzaSyBCURZf72ZWwMN2SHZ7XCQoNgExV4WMX8E";
if (API_KEY === "AIzaSyBCURZf72ZWwMN2SHZ7XCQoNgExV4WMX8E") {
    console.warn("ПРЕДУПРЕЖДЕНИЕ: Используется плейсхолдер API ключа. Замените его на ваш настоящий ключ или используйте переменные окружения для безопасного хранения.");
    // В реальном приложении здесь стоит прервать выполнение, если ключ не настоящий
    // process.exit(1);
}

// Настройки безопасности (можно настроить по необходимости)
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(API_KEY);

// Модели, максимально приближенные к указанным в Python скрипте:
// Python: gemini-2.0-flash-exp-image-generation -> JS: gemini-1.5-flash (ближайшая общедоступная быстрая модель)
const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// Python: imagen-3.0-generate-002 -> JS: imagen-3 (стандартное имя для Imagen 3 в SDK)
const imageModel = genAI.getGenerativeModel({ model: "imagen-3", safetySettings }); // Добавляем safetySettings к модели Imagen


// --- Helper Functions --- (Остаются такими же, как в предыдущем ответе)

/**
 * Extracts text content from a Gemini API response.
 * @param {GenerateContentResponse} response - The API response object.
 * @returns {string} - The extracted text.
 * @throws {Error} If response is invalid or lacks text.
 */
function extractText(response) {
    try {
        // Check for safety ratings first - might indicate blocked content
        if (response.response.promptFeedback?.blockReason) {
            throw new Error(`Request blocked due to: ${response.response.promptFeedback.blockReason}`);
        }
        if (!response.response.candidates?.[0]?.content?.parts?.[0]?.text) {
             console.error("Invalid response structure or missing text:", JSON.stringify(response, null, 2));
            throw new Error("Failed to extract text from API response.");
        }
        return response.response.candidates[0].content.parts[0].text.trim();
    } catch (error) {
        console.error("Error extracting text:", error);
        console.error("Full API Response on Error:", JSON.stringify(response, null, 2));
        throw error;
    }
}

/**
 * Extracts image data (Base64) from a Gemini API response.
 * @param {GenerateContentResponse} response - The API response object.
 * @returns {{mimeType: string, data: string}} - Object with mimeType and Base64 image data.
 * @throws {Error} If response is invalid or lacks image data.
 */
function extractImageData(response) {
    try {
        if (response.response.promptFeedback?.blockReason) {
             throw new Error(`Request blocked due to: ${response.response.promptFeedback.blockReason}`);
        }
        const imagePart = response.response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
        if (!imagePart || !imagePart.inlineData.data) {
             console.error("Invalid response structure or missing image data:", JSON.stringify(response, null, 2));
            throw new Error("Failed to extract image data from API response.");
        }
        return {
            mimeType: imagePart.inlineData.mimeType,
            data: imagePart.inlineData.data
        };
    } catch (error) {
        console.error("Error extracting image data:", error);
        console.error("Full API Response on Error:", JSON.stringify(response, null, 2));
        throw error;
    }
}

// --- Core Logic Functions --- (Остаются такими же)

/**
 * Analyze and optimize the original prompt using a text model.
 * @param {string} originalPrompt - User's original text prompt.
 * @returns {Promise<string>} - The enhanced prompt.
 */
async function analyzeAndEnhancePrompt(originalPrompt) {
    console.log("✍️  Улучшение промпта...");
    const prompt = `Ты эксперт по инженерии промптов. Улучши этот промпт для генерации изображений:
1. Добавь детальные спецификации (цвета, стиль, композиция, освещение, настроение)
2. Уточни неоднозначные элементы
3. Предложи художественные улучшения и специфичные ключевые слова
4. Обеспечь физическую правдоподобность, где это уместно

Оригинальный промпт: "${originalPrompt}"

Верни ТОЛЬКО улучшенный промпт без объяснений, вступлений или заголовков.`;

    try {
        const result = await textModel.generateContent(prompt);
        return extractText(result);
    } catch (error) {
        console.error("Ошибка при улучшении промпта:", error);
        console.warn("Возвращаемся к оригинальному промпту из-за ошибки улучшения.");
        return originalPrompt;
    }
}

/**
 * Simulate diffusion process: conceptual exploration -> refinement.
 * Identifies concepts to avoid and elements to include.
 * @param {string} prompt - The (usually enhanced) prompt.
 * @returns {Promise<object>} - Object with 'negativeConcepts' and 'positiveDetails' arrays.
 */
async function simulateDiffusion(prompt) {
    console.log("🧪 Симуляция процесса диффузии...");
    try {
        // Фаза 1: Идентификация того, что НЕ нужно включать
        const negativePrompt = `Перечисли 3 абстрактных или конкретных концепта/элемента, которые явно НЕ должны появляться на изображении, сгенерированном по этому промпту: "${prompt}"\n\nОтформатируй вывод строго как: Концепт 1 | Концепт 2 | Концепт 3`;
        const negativeResult = await textModel.generateContent(negativePrompt);
        const negativeConceptsText = extractText(negativeResult);
        const negativeConcepts = negativeConceptsText.split('|').map(s => s.trim()).filter(Boolean);

        // Фаза 2: Идентификация существенных деталей
        const positivePrompt = `Извлеки 5 самых важных визуальных элементов или качеств, которые ДОЛЖНЫ появиться или быть представлены на изображении, сгенерированном для промпта: "${prompt}"\n\nОтформатируй вывод строго как: Элемент 1 | Элемент 2 | Элемент 3 | Элемент 4 | Элемент 5`;
        const positiveResult = await textModel.generateContent(positivePrompt);
        const positiveDetailsText = extractText(positiveResult);
        const positiveDetails = positiveDetailsText.split('|').map(s => s.trim()).filter(Boolean);

        if (negativeConcepts.length === 0) console.warn("Не удалось извлечь негативные концепты.");
        if (positiveDetails.length === 0) console.warn("Не удалось извлечь позитивные детали.");

        return {
            negativeConcepts: negativeConcepts.length > 0 ? negativeConcepts : ["размытые элементы", "текстовые артефакты", "плохая композиция"],
            positiveDetails: positiveDetails.length > 0 ? positiveDetails : ["четкий фокус", "хорошее освещение", "высокая детализация", "правильные цвета", "ясная композиция"]
        };
    } catch (error) {
        console.error("Ошибка во время симуляции диффузии:", error);
        console.warn("Используем стандартные данные диффузии из-за ошибки симуляции.");
        return {
             negativeConcepts: ["размытые элементы", "текстовые артефакты", "водяные знаки"],
             positiveDetails: ["четкий фокус", "яркие цвета", "реалистичные текстуры", "хорошее освещение", "ясная композиция"]
        };
    }
}

/**
 * Generate image with diffusion constraints and potentially iterative feedback.
 * @param {string} prompt - The current working prompt.
 * @param {object} diffusionData - Contains 'negativeConcepts' and 'positiveDetails'.
 * @param {object|null} previousImageData - Optional { mimeType: string, data: string } of the previous image (Base64).
 * @returns {Promise<object>} - Object with { mimeType: string, data: string } for the generated image (Base64).
 */
async function generateImageWithCritique(prompt, diffusionData, previousImageData = null) {
    console.log("🖼️  Генерация изображения...");

    const generationPrompt = `
${prompt}

**Строгие указания:**
*   **ИЗБЕГАТЬ:** ${diffusionData.negativeConcepts.join(", ")}.
*   **ОБЯЗАТЕЛЬНО ВКЛЮЧИТЬ:** ${diffusionData.positiveDetails.join(", ")}.
*   Максимизировать детализацию текстур и освещения.
*   Обеспечить физическую точность и реализм всех объектов, если не указано иное (например, стиль фэнтези).
*   Высокое разрешение, фотореалистичный стиль (если промпт не указывает иное).

${previousImageData ? "**Заметка по уточнению:** Улучшить предыдущую попытку на основе критики." : "**Начальная генерация.**"}
`;

    const parts = [ { text: generationPrompt } ];

    if (previousImageData) {
        console.log("   ...используем предыдущее изображение для уточнения.");
        parts.push({
            inlineData: {
                mimeType: previousImageData.mimeType,
                data: previousImageData.data
            }
        });
    }

    try {
        const result = await imageModel.generateContent({ contents: [{ parts }] });
        return extractImageData(result);
    } catch (error) {
        console.error("Ошибка генерации изображения:", error);
        throw new Error(`Генерация изображения не удалась: ${error.message}`);
    }
}

/**
 * Generate detailed artistic critique of the image based on the prompt.
 * @param {object} imageData - { mimeType: string, data: string } of the image (Base64).
 * @param {string} originalPrompt - The prompt the image was *intended* to match.
 * @returns {Promise<string>} - The critique text.
 */
async function getImageCritique(imageData, originalPrompt) {
    console.log("🧐 Критика изображения...");
    const prompt = `Ты профессиональный арт-критик и аналитик ИИ-изображений. Проанализируй предоставленное изображение на основе следующего исходного промпта:
Промпт: "${originalPrompt}"

Предоставь краткую критику, сфокусированную *только* на действенных замечаниях для улучшения в *следующей* итерации генерации. Затронь эти пункты:
1.  **Соответствие промпту:** Насколько хорошо оно соответствует *ключевым элементам* промпта? Что отсутствует или неверно?
2.  **Реализм/Правдоподобие:** Определи любые нереалистичные, искаженные или физически неверные элементы (если это не задумано стилистически промптом).
3.  **Композиция и Эстетика:** Предложи конкретные улучшения композиции, освещения, детализации или художественного качества.
4.  **Технические Недостатки:** Отметь любые распространенные артефакты ИИ (например, лишние конечности, искаженный текст, размытые области).

Будь конкретным и конструктивным. Сформулируй 3-5 ключевых пунктов для улучшения.`;

    const parts = [
        { text: prompt },
        { inlineData: { mimeType: imageData.mimeType, data: imageData.data } }
    ];

    try {
        const result = await textModel.generateContent({ contents: [{ parts }] });
        return extractText(result);
    } catch (error) {
        console.error("Ошибка получения критики изображения:", error);
        return "Генерация критики не удалась. Продолжаем с текущим промптом.";
    }
}

/**
 * Refine the prompt based on critique using a text model.
 * @param {string} currentPrompt - The prompt used for the last generation.
 * @param {string} critique - The critique received for the last image.
 * @returns {Promise<string>} - The new, improved prompt.
 */
async function updatePromptFromCritique(currentPrompt, critique) {
    console.log("✍️  Обновление промпта на основе критики...");
    const prompt = `Улучши следующий промпт для генерации изображений, основываясь *только* на предоставленной критике. Тонко интегрируй обратную связь, чтобы направить *следующую* попытку генерации изображения. Не просто перечисляй пункты критики.

Текущий промпт: "${currentPrompt}"

Критика: "${critique}"

Верни ТОЛЬКО новый, улучшенный промпт без каких-либо объяснений, вступлений или заголовков. Сфокусируйся на включении предложений в описательный текст.`;

    try {
        const result = await textModel.generateContent(prompt);
        return extractText(result);
    } catch (error) {
        console.error("Ошибка обновления промпта по критике:", error);
        console.warn("Возвращаемся к предыдущему промпту из-за ошибки обновления.");
        return currentPrompt;
    }
}

/**
 * Main function to generate an image with enhanced prompt and iterative critique.
 * @param {string} initialUserPrompt - User's original text prompt.
 * @param {number} iterations - Number of improvement cycles (default: 3).
 * @returns {Promise<object>} - { mimeType: string, data: string } of the final optimized image (Base64).
 */
async function generateEnhancedImage(initialUserPrompt, iterations = 3) {
    if (!initialUserPrompt) {
        throw new Error("Начальный промпт пользователя не может быть пустым.");
    }
    console.log(`🚀 Запуск улучшенной генерации изображения для: "${initialUserPrompt}" с ${iterations} итерациями.`);

    let currentPrompt = await analyzeAndEnhancePrompt(initialUserPrompt);
    console.log(`✨ Начальный улучшенный промпт: ${currentPrompt}`);

    console.log("🔍 Симуляция фазы диффузии: Идентификация ключевых концептов...");
    const diffusionData = await simulateDiffusion(currentPrompt);
    console.log(`   Концепты для избегания: ${diffusionData.negativeConcepts.join(', ')}`);
    console.log(`   Детали для включения: ${diffusionData.positiveDetails.join(', ')}`);

    let bestImageData = null;
    for (let i = 0; i < iterations; i++) {
        console.log(`\n🔄 Итерация ${i + 1}/${iterations}`);

        try {
             const currentImageData = await generateImageWithCritique(
                currentPrompt,
                diffusionData,
                bestImageData
            );

            if (i < iterations - 1) {
                const critique = await getImageCritique(currentImageData, currentPrompt);
                console.log(`📝 Критика: ${critique}`);
                 currentPrompt = await updatePromptFromCritique(currentPrompt, critique);
                 console.log(`✨ Уточненный промпт для следующей итерации: ${currentPrompt}`);
            } else {
                 console.log("✅ Последняя итерация завершена. Дальнейшая критика не требуется.");
            }
             bestImageData = currentImageData;

        } catch (error) {
            console.error(`Ошибка во время итерации ${i + 1}:`, error);
             if (error.message.includes("Генерация изображения не удалась")) {
                 console.error("Остановка генерации из-за критической ошибки.");
                 throw error;
             }
             console.warn("Продолжаем следующую итерацию, несмотря на некритическую ошибку в текущей.");
             if (!bestImageData && i === 0) { // Если первая же генерация не удалась
                 throw new Error("Начальная генерация изображения не удалась, невозможно продолжить.");
             }
        }
        // Optional delay
        // await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!bestImageData) {
         throw new Error("Процесс генерации изображения завершился без создания финального изображения.");
    }

    return bestImageData;
}

// --- Example Usage ---
async function main() {
    const userPrompt = "Футуристический космический корабль на орбите очень близко к вращающейся, ярко светящейся нейтронной звезде, реалистичный стиль, высокая детализация"; // Промпт из примера
    const outputFilename = "enhanced_spaceship.png";
    const outputDir = "./output"; // Папка для сохранения

    try {
        await fs.mkdir(outputDir, { recursive: true });
        const outputFilePath = path.join(outputDir, outputFilename);

        const finalImageData = await generateEnhancedImage(userPrompt, 3); // 3 итерации

        console.log(`\n💾 Сохранение финального изображения в ${outputFilePath}...`);
        const imageBuffer = Buffer.from(finalImageData.data, 'base64');
        await fs.writeFile(outputFilePath, imageBuffer);

        console.log("✅ Изображение успешно сгенерировано и сохранено!");

    } catch (error) {
        console.error("\n❌ Произошла ошибка в процессе генерации изображения:", error);
        process.exitCode = 1;
    }
}

// Run the main function
main();