const Anthropic = require('@anthropic-ai/sdk');

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
Шлях категорії: ${productContext.categoryPath || productContext.group || 'Не вказано'}
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
Шлях категорії: ${productContext.categoryPath || productContext.group || 'Не вказано'}

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
        const client = this.getClient(apiKey);
        
        let extraInstructions = "";
        if (type === "title") extraInstructions = "Обмеження 110 символів. Тільки текст.";
        else if (type === "keywords") extraInstructions = "Збережи розділення комою. Переклади всі ключі максимально точно і релевантно для пошуку. Тільки текст.";
        else if (type === "description") extraInstructions = "Збережи всі HTML теги без змін. Переклади тільки текстовий вміст. Поверни тільки HTML код.";

        const prompt = `Переклади наступний текст з української на російську мову для інтернет-магазину.
Додаткові інструкції: ${extraInstructions}

Текст для перекладу:
${text}

Поверни ТІЛЬКИ перекладений текст без лапок чи пояснень.`;

        try {
            const msg = await client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1500,
                messages: [{ role: "user", content: prompt }]
            });
            
            let result = msg.content[0].text.trim();
            if (type === 'description') {
                if (result.startsWith('\`\`\`html')) result = result.replace(/^\`\`\`html/, '').replace(/\`\`\`$/, '');
                else if (result.startsWith('\`\`\`')) result = result.replace(/^\`\`\`/, '').replace(/\`\`\`$/, '');
            }
            return result.trim().replace(/^"|"$/g, '');
        } catch (error) {
            console.error('Anthropic translate error:', error);
            throw new Error('Помилка перекладу ШІ (Anthropic)');
        }
    }
}

module.exports = new AnthropicService();
