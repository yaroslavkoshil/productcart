const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

function formatAiError(error) {
    let msg = '';
    
    // Помилка Google Gemini
    if (error.response && error.response.data && error.response.data.error) {
        const geminiErr = error.response.data.error;
        const rawMsg = geminiErr.message || JSON.stringify(geminiErr);
        if (rawMsg.includes('API key not valid') || rawMsg.includes('API_KEY_INVALID')) {
            return 'Недійсний Google Gemini API ключ. Перевірте ключ у формі підключення';
        }
        if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('quota') || error.response.status === 429) {
            return 'Перевищено ліміт безкоштовних запитів Google Gemini (Rate limit). Зачекайте 1 хвилину';
        }
        return `Помилка Google Gemini: ${rawMsg}`;
    }

    // Помилка Anthropic Claude
    if (error.error && error.error.message) {
        msg = error.error.message;
    } else if (typeof error.message === 'string') {
        const jsonMatch = error.message.match(/\{.*\}$/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.error && parsed.error.message) msg = parsed.error.message;
            } catch (e) {}
        }
        if (!msg) msg = error.message;
    } else {
        msg = 'Невідома помилка ШІ';
    }

    if (msg.includes('credit balance is too low') || msg.includes('credit_balance_too_low')) {
        return 'На рахунку Anthropic закінчилися кошти (нульовий баланс). Поповніть баланс або використайте безкоштовний ключ Gemini';
    }
    if (msg.includes('API key is invalid') || msg.includes('authentication_error')) {
        return 'Недійсний API ключ Anthropic. Перевірте ключ у формі підключення';
    }
    if (msg.includes('rate_limit') || msg.includes('Too Many Requests')) {
        return 'Перевищено ліміт запитів Anthropic (Rate Limit). Зачекайте 1-2 хвилини';
    }
    return msg;
}

class AnthropicService {
    /**
     * Повторює операцію при тимчасових помилках мережі чи лімітах
     */
    async withRetry(operation, maxRetries = 3, delayMs = 1500) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                const msg = (error.message || '').toLowerCase();
                // Не повторюємо для критичних помилок (невірний ключ, баланс, поганий запит)
                if (msg.includes('credit balance') || msg.includes('api key') || msg.includes('authentication_error') || msg.includes('api_key_invalid')) {
                    throw error;
                }
                console.warn(`[AI Service] Спроба ${i + 1} невдала, повтор через ${delayMs}мс... Помилка: ${error.message}`);
                await new Promise(res => setTimeout(res, delayMs));
                delayMs *= 1.5;
            }
        }
        throw lastError;
    }

    getClient(apiKey) {
        if (!apiKey) throw new Error('API ключ ШІ не надано');
        return new Anthropic({
            apiKey: apiKey.trim(),
        });
    }

    /**
     * Виклик Google Gemini API (REST)
     */
    async callGemini(apiKey, prompt, maxTokens = 1200) {
        const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
        let lastError = null;

        for (const model of models) {
            try {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
                const response = await this.withRetry(async () => {
                    return await axios.post(url, {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            maxOutputTokens: maxTokens,
                            temperature: 0.3
                        }
                    }, {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 30000
                    });
                }, 2, 2000);

                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) return text.trim();
            } catch (err) {
                lastError = err;
                const errMsg = err.response?.data?.error?.message || err.message || '';
                if (errMsg.includes('API key not valid') || errMsg.includes('API_KEY_INVALID')) {
                    throw err;
                }
                console.warn(`[Gemini] Помилка на моделі ${model}: ${errMsg}, пробуємо резервну...`);
            }
        }
        throw lastError || new Error('Google Gemini API не повернуло відповіді');
    }

    /**
     * Виклик Anthropic Claude API
     */
    async callClaude(apiKey, prompt, maxTokens = 1200, preferredModel = 'claude-3-5-haiku-20241022') {
        const client = this.getClient(apiKey);
        const models = [preferredModel, 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'];
        const uniqueModels = [...new Set(models)];
        
        let lastError = null;
        for (const model of uniqueModels) {
            try {
                const msg = await this.withRetry(async () => {
                    return await client.messages.create({
                        model: model,
                        max_tokens: maxTokens,
                        messages: [{ role: "user", content: prompt }]
                    });
                }, 2, 2000);
                return msg.content[0].text.trim();
            } catch (err) {
                lastError = err;
                const msg = (err.message || '').toLowerCase();
                if (msg.includes('credit balance') || msg.includes('api key') || msg.includes('authentication_error')) {
                    throw err;
                }
                console.warn(`[Claude] Модель ${model} повернула помилку: ${err.message}, пробуємо іншу...`);
            }
        }
        throw lastError;
    }

    /**
     * Універсальний виклик ШІ (автоматично визначає Gemini або Claude за форматом ключа)
     */
    async callAi(apiKey, prompt, maxTokens = 1200, preferredClaudeModel = 'claude-3-5-haiku-20241022') {
        if (!apiKey) throw new Error('API ключ ШІ не надано. Введіть ваш ключ у формі підключення.');
        const trimmedKey = apiKey.trim();

        if (trimmedKey.startsWith('AIza') || trimmedKey.length === 39) {
            return await this.callGemini(trimmedKey, prompt, maxTokens);
        } else {
            return await this.callClaude(trimmedKey, prompt, maxTokens, preferredClaudeModel);
        }
    }

    /**
     * Генерує оптимізовану назву товару (до 110 символів)
     */
    async generateTitle(apiKey, productContext) {
        const name = (productContext && productContext.name) ? productContext.name : '';
        let desc = 'Немає';
        if (productContext && productContext.description) {
            if (typeof productContext.description === 'string') {
                desc = productContext.description.substring(0, 300) + '...';
            } else if (typeof productContext.description === 'object' && productContext.description.uk) {
                desc = String(productContext.description.uk).substring(0, 300) + '...';
            }
        }
        
        const prompt = `Ти SEO-спеціаліст маркетплейсу Prom.ua. Твоє завдання - покращити назву товару.
Правила Prom.ua для назв:
1. Максимум 110 символів.
2. Формула: Тип товару + Бренд/Виробник + Модель + Ключові характеристики.
3. Без слів "купити", "акція", "знижка".
4. Назва має бути максимально релевантною для пошуку.
5. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодного російського слова!

Поточна інформація про товар:
Оригінальна назва: ${name}
Опис: ${desc}

Згенеруй ідеальну назву ВИКЛЮЧНО українською мовою.
У відповіді поверни ТІЛЬКИ текст назви, без лапок чи пояснень.`;

        try {
            const result = await this.callAi(apiKey, prompt, 150, 'claude-3-5-haiku-20241022');
            return result.replace(/^"|"$/g, '').trim();
        } catch (error) {
            console.error('AI generateTitle error:', error);
            throw new Error(`Помилка ШІ: ${formatAiError(error)}`);
        }
    }

    /**
     * Генерує пошукові ключові слова (до 1024 символів, через кому)
     */
    async generateKeywords(apiKey, productContext) {
        const name = (productContext && productContext.name) ? productContext.name : '';
        
        let desc = 'Немає';
        if (productContext && productContext.description) {
            if (typeof productContext.description === 'string') {
                desc = productContext.description.substring(0, 500) + '...';
            } else if (typeof productContext.description === 'object' && productContext.description.uk) {
                desc = String(productContext.description.uk).substring(0, 500) + '...';
            }
        }

        const prompt = `Ти професійний SEO-спеціаліст маркетплейсу Prom.ua. Згенеруй пошукові запити (keywords) для товару.
Правила:
1. Ключові слова мають бути розділені комою.
2. Пиши реальні фрази, які люди вводять у пошук (від 2 до 5 слів у фразі).
3. Комбінуй тип товару з брендом, об'ємом, дією, складом, типом волосся/шкіри, цільовою аудиторією (напр. "для салону", "оптом").
4. СУВОРИЙ ЛІМІТ ДОВЖИНИ: Загальна довжина тексту має бути СУВОРО від 900 до 1020 символів. Це критично важливо! Якщо не вистачає конкретних ідей з опису, додавай широкі загальні пошукові запити з цієї ніші для максимального охоплення аудиторії, поки не досягнеш обсягу мінімум 900 символів.
5. МОВА: СУВОРО 100% УКРАЇНСЬКА! Категорично заборонено використовувати російські слова. Бренд або англійські назви можна залишити англійською.
6. Не вигадуй характеристики, яких немає в описі (якщо не вказано "1000 мл", не пиши це). Але якщо вони є в описі, обов'язково використовуй їх у ключах.

Товар: ${name}
Опис: ${desc}

Згенеруй ідеальні ключові слова.
Поверни ТІЛЬКИ рядок з ключовими словами через кому, без пояснень і лапок.`;

        try {
            const result = await this.callAi(apiKey, prompt, 600, 'claude-3-5-haiku-20241022');
            return result.replace(/^"|"$/g, '').trim();
        } catch (error) {
            console.error('AI generateKeywords error:', error);
            throw new Error(`Помилка ШІ: ${formatAiError(error)}`);
        }
    }

    /**
     * Генерує повноцінний HTML опис товару
     */
    async generateDescription(apiKey, productContext) {
        const name = (productContext && productContext.name) ? productContext.name : '';
        const price = (productContext && productContext.price) ? productContext.price : '';
        const currency = (productContext && productContext.currency) ? productContext.currency : 'UAH';
        let desc = 'Немає';
        if (productContext && productContext.description) {
            if (typeof productContext.description === 'string') {
                desc = productContext.description;
            } else if (typeof productContext.description === 'object' && productContext.description.uk) {
                desc = String(productContext.description.uk);
            }
        }

        const prompt = `Ти професійний копірайтер для e-commerce. Напиши продаючий опис для товару.
Вимоги:
1. Формат: HTML (використовуй <h3>, <ul>, <li>, <strong>, <p>). Не використовуй теги <html> чи <body>.
2. Опис має бути релевантним товару, нічого самому не вигадувати, підкреслити користь, склад, спосіб застосування, переваги.
3. Опис має бути розширеним і структурованим.
4. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодного російського слова в тексті опису!

Поточна інформація:
Назва: ${name}
Ціна: ${price} ${currency}
Поточний опис (якщо є): ${desc}

Напиши опис ВИКЛЮЧНО українською мовою. Поверни ТІЛЬКИ HTML-код опису без додаткових пояснень.`;

        try {
            let html = await this.callAi(apiKey, prompt, 2000, 'claude-3-5-sonnet-20241022');
            
            // Очищення від маркдауну
            if (html.startsWith('```html')) {
                html = html.replace(/^```html/, '').replace(/```$/, '');
            } else if (html.startsWith('```')) {
                html = html.replace(/^```/, '').replace(/```$/, '');
            }
            return html.trim();
        } catch (error) {
            console.error('AI generateDescription error:', error);
            throw new Error(`Помилка ШІ: ${formatAiError(error)}`);
        }
    }

    /**
     * Генерує атрибути (характеристики) на основі опису та схеми (або витягує їх динамічно)
     */
    async generateAttributes(apiKey, productContext, schema) {
        const name = (productContext && productContext.name) ? productContext.name : '';
        let desc = 'Немає';
        if (productContext && productContext.description) {
            if (typeof productContext.description === 'string') {
                desc = productContext.description;
            } else if (typeof productContext.description === 'object' && productContext.description.uk) {
                desc = String(productContext.description.uk);
            }
        }
        
        let prompt = '';
        const hasSchema = schema && Array.isArray(schema.attributes) && schema.attributes.length > 0;

        if (hasSchema) {
            // Формуємо текст схеми з бази Прому
            let schemaText = '';
            schema.attributes.forEach(attr => {
                schemaText += `- ID: ${attr.id}, Назва: "${attr.name}", Тип: ${attr.type}\n`;
                if (attr.values && attr.values.length > 0) {
                    schemaText += `  Дозволені значення: ${JSON.stringify(attr.values)}\n`;
                } else {
                    schemaText += `  Дозволені значення: Будь-яке власне значення (знайди в тексті)\n`;
                }
            });

            prompt = `Ти — експерт з маркетплейсу Prom.ua. Твоя задача — заповнити характеристики товару на основі його назви та опису.
Вимоги та ОБМЕЖЕННЯ:
1. Якщо характеристика має конкретний список "Дозволені значення", вибирай значення ТІЛЬКИ з цього списку.
2. Якщо "Дозволені значення: Будь-яке власне значення", впиши точне число або слово з назви/опису (наприклад "1000", а не "1000 мл").
3. Логічно додумуй очевидні характеристики (наприклад шампунь з ментолом — дія "Освіжаюча").
4. Якщо зовсім не впевнений — пропусти характеристику (не додавай цей ID).
5. Для типу "multiselect" поверни масив з кількох дозволених значень (наприклад ["Зволоження", "Відновлення"]). Для інших — рядок/число.
6. Поверни результат ВИКЛЮЧНО у форматі валідного JSON об'єкта, де ключі — це ID характеристики (як рядки), а значення — це вибране значення або масив. БЕЗ markdown, БЕЗ пояснень.

Приклад вихідного JSON:
{
  "123": "Білий",
  "456": ["Для жінок", "Унісекс"]
}

Дані про товар:
Назва: ${name}
Опис: ${desc}

Доступні характеристики для заповнення:
${schemaText}`;
        } else {
            // Без попередньої схеми: AI визначає ключові характеристики за назвою та описом
            prompt = `Ти — експерт з товарів та характеристик для Prom.ua. Твоя задача — витягнути та сформувати ключові характеристики товару на основі його назви та опису.
Визнач всі важливі характеристики (наприклад: Виробник/Бренд, Країна виробник, Колір, Матеріал, Об'єм, Вага, Тип, Призначення, Стать, Клас косметики тощо).

Вимоги:
1. Ключі JSON — це назви характеристик українською мовою (наприклад: "Виробник", "Країна виробник", "Колір", "Матеріал", "Об'єм", "Тип", "Призначення").
2. Значення — це коротке точне значення (рядок).
3. Якщо інформація є в назві чи описі — обов'язково додай її.
4. Поверни ВИКЛЮЧНО валідний JSON об'єкт, БЕЗ markdown-форматування, БЕЗ пояснень.

Приклад вихідного JSON:
{
  "Виробник": "Subrina Professional",
  "Країна виробник": "Словенія",
  "Тип": "Кондиціонер",
  "Призначення": "Відновлення, Зволоження",
  "Об'єм": "1000 мл"
}

Дані про товар:
Назва: ${name}
Опис: ${desc}`;
        }

        try {
            let resultText = await this.callAi(apiKey, prompt, 1200, 'claude-3-5-haiku-20241022');
            
            // Очищення від markdown якщо раптом є
            if (resultText.startsWith('```json')) {
                resultText = resultText.replace(/^```json/, '').replace(/```$/, '');
            } else if (resultText.startsWith('```')) {
                resultText = resultText.replace(/^```/, '').replace(/```$/, '');
            }
            
            const firstBrace = resultText.indexOf('{');
            const lastBrace = resultText.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                resultText = resultText.substring(firstBrace, lastBrace + 1);
            }
            
            return JSON.parse(resultText.trim());
        } catch (error) {
            console.error('AI generateAttributes error:', error);
            throw new Error(`Помилка ШІ (генерація атрибутів): ${formatAiError(error)}`);
        }
    }

    /**
     * Перекладає текст на російську мову
     */
    async translateText(apiKey, text, type) {
        // 1. Пробуємо безкоштовний Google Translate API через POST
        try {
            const postData = new URLSearchParams({ q: text });
            const response = await axios.post(
                'https://translate.googleapis.com/translate_a/single?client=gtx&sl=uk&tl=ru&dt=t',
                postData.toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000
                }
            );
            const data = response.data;
            if (data && Array.isArray(data[0])) {
                const translated = data[0].map(part => (part && part[0]) ? part[0] : '').join('');
                if (translated.trim()) {
                    return translated;
                }
            }
        } catch (googleError) {
            console.warn('Google Translate API error:', googleError.message);
        }

        // 2. Резервний варіант через AI
        if (apiKey) {
            try {
                const prompt = `Переклади наступний текст з української на російську мову. Збережи всі HTML-теги, структуру та форматування. Поверни ТІЛЬКИ перекладений текст без додаткових коментарів чи лапок:\n\n${text}`;
                return await this.callAi(apiKey, prompt, 2000, 'claude-3-5-haiku-20241022');
            } catch (aiError) {
                console.error('AI translate fallback error:', aiError.message);
            }
        }

        throw new Error('Помилка перекладу. Перевірте з\'єднання або спробуйте пізніше.');
    }
}

module.exports = new AnthropicService();
