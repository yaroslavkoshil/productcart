const { GoogleGenerativeAI } = require("@google/generative-ai");

class GeminiService {
    /**
     * Ініціалізує клієнт Gemini з переданим ключем
     */
    getClient(apiKey) {
        if (!apiKey) throw new Error('Gemini API Key is required');
        return new GoogleGenerativeAI(apiKey);
    }

    /**
     * Генерує оптимізовану назву товару (до 110 символів)
     */
    async generateTitle(apiKey, productContext) {
        const genAI = this.getClient(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
Ти SEO-спеціаліст маркетплейсу Prom.ua. Твоє завдання - покращити назву товару.
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
У відповіді поверни ТІЛЬКИ текст назви, без лапок чи пояснень.
`;

        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim().replace(/^"|"$/g, '');
        } catch (error) {
            console.error('Gemini generateTitle error:', error);
            throw new Error('Помилка генерації назви ШІ');
        }
    }

    /**
     * Генерує пошукові ключові слова (до 1024 символів, через кому)
     */
    async generateKeywords(apiKey, productContext) {
        const genAI = this.getClient(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
Ти SEO-спеціаліст. Згенеруй пошукові запити (keywords) для товару на маркетплейсі.
Правила:
1. Ключові слова мають бути розділені комою та пробілом (, ).
2. Від 10 до 20 найрелевантніших запитів.
3. Включай синоніми, можливі помилки розкладки, сленгові назви товару.
4. Мова: українська та російська впереміш (як шукають реальні люди).

Товар: ${productContext.name}
Категорія: ${productContext.group || 'Не вказано'}

Поверни ТІЛЬКИ рядок з ключовими словами, без пояснень.
`;

        try {
            const result = await model.generateContent(prompt);
            return result.response.text().trim();
        } catch (error) {
            console.error('Gemini generateKeywords error:', error);
            throw new Error('Помилка генерації ключових слів ШІ');
        }
    }

    /**
     * Генерує повноцінний HTML опис товару
     */
    async generateDescription(apiKey, productContext) {
        const genAI = this.getClient(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" }); // Використовуємо PRO для більших текстів

        const prompt = `
Ти професійний копірайтер для e-commerce. Напиши продаючий опис для товару на Prom.ua.
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

Поверни ТІЛЬКИ HTML-код опису.
`;

        try {
            const result = await model.generateContent(prompt);
            let html = result.response.text().trim();
            // Очищення від маркдауну, якщо ШІ його додасть
            if (html.startsWith('\`\`\`html')) {
                html = html.replace(/^\`\`\`html/, '').replace(/\`\`\`$/, '');
            }
            return html.trim();
        } catch (error) {
            console.error('Gemini generateDescription error:', error);
            throw new Error('Помилка генерації опису ШІ');
        }
    }
}

module.exports = new GeminiService();
