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

Поточна інформація про товар:
Оригінальна назва: ${productContext.name}
Категорія: ${productContext.group || 'Не вказано'}
Опис: ${productContext.description ? productContext.description.substring(0, 300) + '...' : 'Немає'}

Згенеруй ОДНУ ідеальну назву українською мовою. 
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
2. Від 10 до 20 найрелевантніших запитів.
3. Включай синоніми, можливі помилки розкладки, сленгові назви товару.
4. Мова: українська та російська впереміш (як шукають реальні люди).

Товар: ${productContext.name}
Категорія: ${productContext.group || 'Не вказано'}

Поверни ТІЛЬКИ рядок з ключовими словами, без пояснень.`;

        try {
            const msg = await client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 300,
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

        const prompt = `Ти професійний копірайтер для e-commerce. Напиши продаючий опис для товару на Prom.ua.
Вимоги:
1. Мова: українська.
2. Формат: HTML (використовуй <h3>, <ul>, <li>, <strong>, <p>). Не використовуй теги <html> чи <body>.
3. Структура:
   - Короткий вступ, що чіпляє (вирішення болю клієнта)
   - Основні переваги (списком)
   - Короткий висновок або заклик до дії
4. Текст має бути унікальним, читабельним, без води.

Поточна інформація:
Назва: ${productContext.name}
Ціна: ${productContext.price} ${productContext.currency}
Поточний опис (якщо є): ${productContext.description || 'Немає'}

Поверни ТІЛЬКИ HTML-код опису.`;

        try {
            const msg = await client.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 2000,
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
}

module.exports = new AnthropicService();
