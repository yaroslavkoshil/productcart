const axios = require('axios');

function formatExperientialError(error) {
    let msg = '';
    if (error.response && error.response.data && error.response.data.error) {
        msg = error.response.data.error.message || error.response.data.error;
    } else {
        msg = error.message;
    }
    return msg;
}

class ExperientialService {
    async callExperientialApi(apiKey, prompt, maxTokens) {
        const keyToUse = process.env.EXPLABS_API_KEY || apiKey;
        if (!keyToUse) throw new Error('Experiential API Key is required');

        const url = 'https://api.experientiallabs.ai/v1/chat/completions';
        const payload = {
            model: 'claude-opus-5.5',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens
        };

        try {
            const response = await axios.post(url, payload, {
                headers: {
                    'Authorization': `Bearer ${keyToUse}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Experiential API error:', error.response ? error.response.data : error.message);
            throw new Error(`Помилка ШІ: ${formatExperientialError(error)}`);
        }
    }

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

        const content = await this.callExperientialApi(apiKey, prompt, 150);
        return content.trim().replace(/^"|"$/g, '');
    }

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
4. СУВОРИЙ ЛІМІТ ДОВЖИНИ: Загальна довжина тексту має бути СУВОРО від 900 до 1020 символів. Це критично важливо! Якщо не вистачає конкретних ідей з опису, додавай широкі загальні пошукові запити з цієї ніші для максимального охоплення аудиторії (наприклад, "професійна косметика для волосся", "догляд за волоссям вдома" тощо), поки не досягнеш обсягу мінімум 900 символів.
5. МОВА: СУВОРО 100% УКРАЇНСЬКА! Категорично заборонено використовувати російські слова. Бренд або англійські назви можна залишити англійською.
6. Не вигадуй характеристики, яких немає в описі (якщо не вказано "1000 мл", не пиши це). Але якщо вони є в описі, обов'язково використовуй їх у ключах.

Ось ідеальні приклади того, що я очікую:

Приклад 1: (Бальзам-кондиціонер You Look 5 літрів)
Ключі: бальзам для волосся, кондиціонер для волосся, бальзам кондиціонер для волосся, кондиціонер для волосся 5л, бальзам для волосся 5 літрів, бальзам для волосся professional, бальзам для фарбованого волосся, кондиціонер для фарбованого волосся, бальзам для волосся для салону, кондиціонер для волосся для перукарні, бальзам для волосся оптом, бальзам для волосся веганський, бальзам для волосся без силікону, бальзам для волосся з ментолом, бальзам для волосся захист кольору, You Look Conditioner, You Look кондиціонер

Приклад 2: (Маска Subrina Professional Salon Mask)
Ключі: маска для всіх типів волосся, маска для ламкого волосся, Subrina Professional Salon Mask, маска салонна для волосся, маска з екстрактом кипариса, маска з екстрактом сосни, засіб для зміцнення волосся, маска для гладкості волосся, маска для легкого розчісування, маска відновлююча для волосся, догляд салонний за волоссям, маска професійна для перукарень, маска Subrina для волосся

Приклад 3: (Гель для душу Alcantara B.C. Orange Bath Gel 750мл)
Ключі: апельсиновий гель для душу, гель для душу 750 мл, Alcantara BC Orange Bath Gel, гель з провітаміном В5, професійний гель для душу, гель для душу alcantara, великий об'єм гель для душу, зволожуючий гель для душу, універсальний гель тіло волосся, сімейний гель для душу, професійна косметика alcantara, салонний гель для душу, гель для душу апельсин

Тепер твоя черга.
Товар: ${name}
Опис: ${desc}

Згенеруй ідеальні ключові слова.
Поверни ТІЛЬКИ рядок з ключовими словами через кому, без пояснень і лапок.`;

        const content = await this.callExperientialApi(apiKey, prompt, 500);
        return content.trim();
    }

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
2. Опис має бути релевантним товару, нічого самому не придумувати, тільки те що пишуть в інтернеті про цей товар інші магазини.
3. Опис має бути розширеним і продаючим.
4. МОВА: ВИКЛЮЧНО УКРАЇНСЬКА! Жодного російського слова в тексті опису!

Поточна інформація:
Назва: ${name}
Ціна: ${price} ${currency}
Поточний опис (якщо є): ${desc}

Напиши опис ВИКЛЮЧНО українською мовою. Поверни ТІЛЬКИ HTML-код опису без додаткових пояснень.`;

        let html = await this.callExperientialApi(apiKey, prompt, 1500);
        html = html.trim();
        if (html.startsWith('```html')) {
            html = html.replace(/^```html/, '').replace(/```$/, '');
        } else if (html.startsWith('```')) {
            html = html.replace(/^```/, '').replace(/```$/, '');
        }
        return html.trim();
    }

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
        
        let schemaText = '';
        if (schema && schema.attributes) {
            schema.attributes.forEach(attr => {
                schemaText += `- ID: ${attr.id}, Назва: "${attr.name}", Тип: ${attr.type}\n`;
                if (attr.values && attr.values.length > 0) {
                    schemaText += `  Дозволені значення: ${JSON.stringify(attr.values)}\n`;
                } else {
                    schemaText += `  Дозволені значення: Будь-яке власне значення (знайди в тексті)\n`;
                }
            });
        }

        const prompt = `Ти — експерт з маркетплейсу Prom.ua. Твоя задача — заповнити характеристики товару на основі його назви та опису.
Вимоги та ОБМЕЖЕННЯ (КРИТИЧНО ВАЖЛИВО):
1. Якщо характеристика має конкретний список "Дозволені значення", ти маєш право вибирати значення ТІЛЬКИ з цього списку.
2. Якщо "Дозволені значення: Будь-яке власне значення", ти можеш вписати точне число або слово з назви/опису (наприклад, для "Об'єм" - "1000", для "Вага" - "5"). Не додавай одиниці виміру до значення (просто "1000", а не "1000 мл").
3. Ти можеш логічно додумувати характеристики (наприклад, якщо шампунь з ментолом, він "Освіжаючий").
4. Якщо ти зовсім не впевнений — краще пропусти характеристику (не додавай цей ID).
5. Для типу "multiselect" ти можеш повернути масив з кількох дозволених значень (наприклад ["Зволоження", "Відновлення"]). Для інших типів — тільки один рядок/число.
6. Поверни результат ВИКЛЮЧНО у форматі валідного JSON об'єкта, де ключі — це ID характеристики (як рядки), а значення — це вибране значення (рядок) або масив значень. БЕЗ markdown-розмітки, БЕЗ пояснень.

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

        let resultText = await this.callExperientialApi(apiKey, prompt, 1000);
        resultText = resultText.trim();
        if (resultText.startsWith('```json')) {
            resultText = resultText.replace(/^```json/, '').replace(/```$/, '');
        } else if (resultText.startsWith('```')) {
            resultText = resultText.replace(/^```/, '').replace(/```$/, '');
        }
        
        return JSON.parse(resultText.trim());
    }

    async translateText(apiKey, text, type) {
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

        const prompt = `Переклади наступний текст з української на російську мову. Збережи всі HTML-теги, структуру та форматування. Поверни ТІЛЬКИ перекладений текст без додаткових коментарів чи лапок:\n\n${text}`;
        return await this.callExperientialApi(apiKey, prompt, 2000);
    }
}

module.exports = new ExperientialService();
