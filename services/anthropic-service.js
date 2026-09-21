const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

function formatAnthropicError(error) {
    let msg = '';
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
        msg = 'Невідома помилка Anthropic';
    }

    if (msg.includes('credit balance is too low') || msg.includes('credit_balance_too_low')) {
        return 'На рахунку Anthropic закінчилися кошти (нульовий баланс). Поповніть баланс на console.anthropic.com';
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
     * Ініціалізує клієнт Anthropic з переданим ключем
     */
    getClient(apiKey) {
        if (!apiKey) throw new Error('Anthropic API Key is required');
        return new Anthropic({
            apiKey: apiKey,
        });
    }

    /**
     * Генерує оптимізовану назву товару (до 110 символів)
     */
    async generateTitle(apiKey, productContext) {
        const client = this.getClient(apiKey);
        
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
            const msg = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 150,
                messages: [{ role: "user", content: prompt }]
            });
            return msg.content[0].text.trim().replace(/^"|"$/g, '');
        } catch (error) {
            console.error('Anthropic generateTitle error:', error);
            throw new Error(`Помилка ШІ: ${formatAnthropicError(error)}`);
        }
    }

    /**
     * Генерує пошукові ключові слова (до 1024 символів, через кому)
     */
    async generateKeywords(apiKey, productContext) {
        const client = this.getClient(apiKey);
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
1. Ключові слова мають бути розділені комою та пробілом (, ).
2. Пиши реальні фрази, які люди вводять у пошук (наприклад: "професійний шампунь для фарбованого волосся", "захист кольору", "догляд за пошкодженим волоссям").
3. НЕ ПОВТОРЮЙ одне й те саме слово в кожній фразі (не треба писати слово "шампунь" 50 разів). Змішуй характеристики, бренд, призначення.
4. Довжина тексту має бути близько 800-1000 символів.
5. МОВА: СУВОРО 100% УКРАЇНСЬКА! Категорично заборонено використовувати російські слова (наприклад "защита", "цвета"). Жодної транслітерації.
6. Бренд або англійські назви (наприклад You Look Professional) можна залишити англійською.
7. КАТЕГОРИЧНО ЗАБОРОНЕНО придумувати розмір, об'єм (наприклад "1000 мл", "1 літр", "великий обсяг" чи "економна упаковка"), вагу або інші характеристики, якщо вони чітко не вказані в назві або описі нижче. Нічого не вигадуй від себе!

Товар: ${name}
Опис: ${desc}

Згенеруй ідеальні ключові слова.
Поверни ТІЛЬКИ рядок з ключовими словами, без пояснень і лапок.`;

        try {
            const msg = await client.messages.create({
                model: "claude-sonnet-4-5-20250929", // Використовуємо sonnet для кращої якості і дотримання мови
                max_tokens: 500,
                messages: [{ role: "user", content: prompt }]
            });
            return msg.content[0].text.trim();
        } catch (error) {
            console.error('Anthropic generateKeywords error:', error);
            throw new Error(`Помилка ШІ: ${formatAnthropicError(error)}`);
        }
    }

    /**
     * Генерує повноцінний HTML опис товару
     */
    async generateDescription(apiKey, productContext) {
        const client = this.getClient(apiKey);
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
2. Опис має бути релевантним товару, нічого самому не придумувати, тільки те що пишуть в інтернеті про цей товар інші магазини.
3. Опис має бути розширеним і продаючим.
4. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодного російського слова в тексті опису!

Поточна інформація:
Назва: ${name}
Ціна: ${price} ${currency}
Поточний опис (якщо є): ${desc}

Напиши опис ВИКЛЮЧНО українською мовою. Поверни ТІЛЬКИ HTML-код опису без додаткових пояснень.`;

        try {
            const msg = await client.messages.create({
                model: "claude-sonnet-4-5-20250929",
                max_tokens: 1500,
                messages: [{ role: "user", content: prompt }]
            });
            
            let html = msg.content[0].text.trim();
            // Очищення від маркдауну
            if (html.startsWith('```html')) {
                html = html.replace(/^```html/, '').replace(/```$/, '');
            } else if (html.startsWith('```')) {
                html = html.replace(/^```/, '').replace(/```$/, '');
            }
            return html.trim();
        } catch (error) {
            console.error('Anthropic generateDescription error:', error);
            throw new Error(`Помилка ШІ: ${formatAnthropicError(error)}`);
        }
    }

    /**
     * Генерує атрибути (характеристики) на основі опису та схеми
     */
    async generateAttributes(apiKey, productContext, schema) {
        const client = this.getClient(apiKey);
        
        const name = (productContext && productContext.name) ? productContext.name : '';
        let desc = 'Немає';
        if (productContext && productContext.description) {
            if (typeof productContext.description === 'string') {
                desc = productContext.description;
            } else if (typeof productContext.description === 'object' && productContext.description.uk) {
                desc = String(productContext.description.uk);
            }
        }
        
        // Формуємо текст схеми для ШІ
        let schemaText = '';
        if (schema && schema.attributes) {
            schema.attributes.forEach(attr => {
                if (attr.values && attr.values.length > 0) {
                    schemaText += `- ID: ${attr.id}, Назва: "${attr.name}", Тип: ${attr.type}\n`;
                    schemaText += `  Дозволені значення: ${JSON.stringify(attr.values)}\n`;
                }
            });
        }

        const prompt = `Ти — експерт з маркетплейсу Prom.ua. Твоя задача — заповнити характеристики товару на основі його назви та опису.
Вимоги та ОБМЕЖЕННЯ (КРИТИЧНО ВАЖЛИВО):
1. Ти маєш право вибирати значення ТІЛЬКИ зі списку "Дозволені значення" для кожної характеристики.
2. Якщо в описі чи назві товару НЕМАЄ прямої інформації про характеристику — ПРОПУСТИ ЇЇ.
3. КАТЕГОРИЧНО ЗАБОРОНЕНО вигадувати значення або писати те, в чому ти не впевнений.
4. Для типу "multiselect" ти можеш повернути масив з кількох дозволених значень (наприклад ["Зволоження", "Відновлення"]). Для "singleselect" — тільки один рядок.
5. Поверни результат ВИКЛЮЧНО у форматі валідного JSON об'єкта, де ключі — це ID характеристики (як рядки), а значення — це вибране значення (рядок) або масив значень. БЕЗ markdown-розмітки, БЕЗ пояснень.

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

        try {
            const msg = await client.messages.create({
                model: "claude-sonnet-4-5-20250929", // Використовуємо sonnet для кращого аналізу
                max_tokens: 1000,
                messages: [{ role: "user", content: prompt }]
            });
            
            let resultText = msg.content[0].text.trim();
            // Очищення від markdown якщо раптом є
            if (resultText.startsWith('```json')) {
                resultText = resultText.replace(/^```json/, '').replace(/```$/, '');
            } else if (resultText.startsWith('```')) {
                resultText = resultText.replace(/^```/, '').replace(/```$/, '');
            }
            
            return JSON.parse(resultText.trim());
        } catch (error) {
            console.error('Anthropic generateAttributes error:', error);
            throw new Error(`Помилка ШІ (генерація атрибутів): ${formatAnthropicError(error)}`);
        }
    }

    /**
     * Перекладає текст на російську мову
     */
    async translateText(apiKey, text, type) {
        // 1. Пробуємо безкоштовний Google Translate API через POST (надійно, без ліміту довжини URL)
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

        // 2. Резервний варіант через Anthropic Claude (якщо Google заблоковано і є API ключ)
        if (apiKey) {
            try {
                const client = this.getClient(apiKey);
                const prompt = `Переклади наступний текст з української на російську мову. Збережи всі HTML-теги, структуру та форматування. Поверни ТІЛЬКИ перекладений текст без додаткових коментарів чи лапок:\n\n${text}`;
                const msg = await client.messages.create({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 2000,
                    messages: [{ role: "user", content: prompt }]
                });
                return msg.content[0].text.trim();
            } catch (claudeError) {
                console.error('Anthropic translate fallback error:', claudeError.message);
            }
        }

        throw new Error('Помилка перекладу. Перевірте з\'єднання або спробуйте пізніше.');
    }
}

module.exports = new AnthropicService();
