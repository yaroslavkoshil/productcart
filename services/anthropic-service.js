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
Шлях категорії: ${productContext.categoryPath || productContext.group || 'Не вказано'}
Опис: ${productContext.description ? productContext.description.substring(0, 300) + '...' : 'Немає'}

Згенеруй ідеальну назву українською мовою та одразу переклади її на російську.
Відповідь має бути ТІЛЬКИ у форматі JSON:
{
  "uk": "Назва українською (до 110 симв.)",
  "ru": "Название на русском (до 110 симв.)"
}`;

        try {
            const msg = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 300,
                messages: [{ role: "user", content: prompt }]
            });
            return this.extractJson(msg.content[0].text);
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
2. Згенеруй багато релевантних ключів, які реально шукають люди, щоб охопити максимальну аудиторію. Включай синоніми, можливі помилки розкладки, сленг.
3. Довжина тексту для КОЖНОЇ мови має бути від 900 до 1020 символів.

Товар: ${productContext.name}
Шлях категорії: ${productContext.categoryPath || productContext.group || 'Не вказано'}

Згенеруй пул ключів українською мовою, а потім переклади ці ж ключі російською мовою.
Відповідь має бути ТІЛЬКИ у форматі JSON:
{
  "uk": "ключ 1, ключ 2, ... (900-1020 символів)",
  "ru": "ключ 1, ключ 2, ... (900-1020 символів)"
}`;

        try {
            const msg = await client.messages.create({
                model: "claude-haiku-4-5-20251001",
                max_tokens: 1000,
                messages: [{ role: "user", content: prompt }]
            });
            return this.extractJson(msg.content[0].text);
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
1. Формат: HTML (використовуй <h3>, <ul>, <li>, <strong>, <p>).
2. Опис має бути релевантним товару, нічого самому не придумувати, тільки те що пишуть в інтернеті про цей товар інші магазини.
3. Опис має бути розширеним і продаючим, щоб людина захотіла купити цей товар у нас.

Поточна інформація:
Назва: ${productContext.name}
Ціна: ${productContext.price} ${productContext.currency}
Поточний опис (якщо є): ${productContext.description || 'Немає'}

Напиши опис українською мовою та відразу переклади його російською.
Відповідь має бути ТІЛЬКИ у форматі JSON:
{
  "uk": "<h3>Укр заголовок...</h3><p>...",
  "ru": "<h3>Русский заголовок...</h3><p>..."
}`;

        try {
            const msg = await client.messages.create({
                model: "claude-sonnet-4-5-20250929",
                max_tokens: 3000,
                messages: [{ role: "user", content: prompt }]
            });
            return this.extractJson(msg.content[0].text);
        } catch (error) {
            console.error('Anthropic generateDescription error:', error);
            throw new Error('Помилка генерації опису ШІ (Anthropic)');
        }
    }

    extractJson(text) {
        try {
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}') + 1;
            const jsonStr = text.slice(start, end);
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error("Failed to parse JSON from AI response:", text);
            throw new Error("Некоректна відповідь від ШІ (не JSON)");
        }
    }
}

module.exports = new AnthropicService();
