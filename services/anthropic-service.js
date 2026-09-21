const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');

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
        
        const prompt = `Ти SEO-спеціаліст маркетплейсу Prom.ua. Твоє завдання - покращити назву товару.
Правила Prom.ua для назв:
1. Максимум 110 символів.
2. Формула: Тип товару + Бренд/Виробник + Модель + Ключові характеристики.
3. Без слів "купити", "акція", "знижка".
4. Назва має бути максимально релевантною для пошуку.
5. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодного російського слова!

Поточна інформація про товар:
Оригінальна назва: ${productContext.name}
Опис: ${productContext.description ? productContext.description.substring(0, 300) + '...' : 'Немає'}

Згенеруй ідеальну назву ВИКЛЮЧНО українською мовою.
У відповіді поверни ТІЛЬКИ текст назви, без лапок чи пояснень.`;

        try {
            const msg = await client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 150,
                messages: [{ role: "user", content: prompt }]
            });
            return msg.content[0].text.trim().replace(/^"|"$/g, '');
        } catch (error) {
            console.error('Anthropic generateTitle error:', error);
            throw new Error('Помилка генерації назви ШІ (Anthropic)');
        }
    }

    /**
     * Генерує пошукові ключові слова (до 1024 символів, через кому)
     */
    async generateKeywords(apiKey, productContext) {
        const client = this.getClient(apiKey);

        const prompt = `Ти SEO-спеціаліст. Згенеруй пошукові запити (keywords) для товару на маркетплейсі.
Правила:
1. Ключові слова мають бути розділені комою та пробілом (, ).
2. Згенеруй багато релевантних ключів, які реально шукають люди. Включай синоніми.
3. Довжина тексту має бути від 900 до 1020 символів.
4. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодних російських слів (російські ключі ми додамо окремо пізніше)!

Товар: ${productContext.name}

Згенеруй пул ключів ВИКЛЮЧНО українською мовою.
Поверни ТІЛЬКИ рядок з ключовими словами, без пояснень.`;

        try {
            const msg = await client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 500,
                messages: [{ role: "user", content: prompt }]
            });
            return msg.content[0].text.trim();
        } catch (error) {
            console.error('Anthropic generateKeywords error:', error);
            throw new Error('Помилка генерації ключових слів ШІ (Anthropic)');
        }
    }

    /**
     * Генерує повноцінний HTML опис товару
     */
    async generateDescription(apiKey, productContext) {
        const client = this.getClient(apiKey);

        const prompt = `Ти професійний копірайтер для e-commerce. Напиши продаючий опис для товару.
Вимоги:
1. Формат: HTML (використовуй <h3>, <ul>, <li>, <strong>, <p>). Не використовуй теги <html> чи <body>.
2. Опис має бути релевантним товару, нічого самому не придумувати, тільки те що пишуть в інтернеті про цей товар інші магазини.
3. Опис має бути розширеним і продаючим.
4. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодного російського слова в тексті опису!

Поточна інформація:
Назва: ${productContext.name}
Ціна: ${productContext.price} ${productContext.currency}
Поточний опис (якщо є): ${productContext.description || 'Немає'}

Напиши опис ВИКЛЮЧНО українською мовою. Поверни ТІЛЬКИ HTML-код опису без додаткових пояснень.`;

        try {
            const msg = await client.messages.create({
                model: "claude-3-5-sonnet-20241022",
                max_tokens: 1500,
                messages: [{ role: "user", content: prompt }]
            });
            
            let html = msg.content[0].text.trim();
            // Очищення від маркдауну
            if (html.startsWith('\`\`\`html')) {
                html = html.replace(/^\`\`\`html/, '').replace(/\`\`\`$/, '');
            } else if (html.startsWith('\`\`\`')) {
                html = html.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '');
            }
            return html.trim();
        } catch (error) {
            console.error('Anthropic generateDescription error:', error);
            throw new Error('Помилка генерації опису ШІ (Anthropic)');
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
                    model: "claude-3-5-haiku-20241022",
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
