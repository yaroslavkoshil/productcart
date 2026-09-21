const express = require('express');
const cors = require('cors');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const promApi = require('./services/prom-api');
const anthropicService = require('./services/anthropic-service');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// Вимикаємо кешування для всіх API запитів
app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Expires', '-1');
    res.set('Pragma', 'no-cache');
    next();
});

// === ROUTES ===

// 1. Отримати список груп
app.get('/api/groups', async (req, res) => {
    try {
        const token = req.headers['x-prom-token'];
        if (!token) return res.status(401).json({ error: 'Токен не надано' });

        const data = await promApi.getGroups(token);
        const groups = data.groups || [];
        console.log(`\n=== ALL GROUPS (${groups.length}) ===`);
        groups.forEach(g => console.log(`id:${g.id} parent:${g.parent_group_id} name:${g.name}`));
        console.log(`=========================\n`);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Отримати товари (або пошук)
app.get('/api/products', async (req, res) => {
    try {
        const token = req.headers['x-prom-token'];
        if (!token) return res.status(401).json({ error: 'Токен не надано' });

        const { limit, last_id, group_id, query } = req.query;
        
        let data;
        if (query) {
            data = await promApi.searchProducts(token, query);
        } else {
            data = await promApi.getProducts(token, limit, last_id, group_id);
        }
        
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Отримати деталі товару
app.get('/api/products/:id', async (req, res) => {
    try {
        const token = req.headers['x-prom-token'];
        if (!token) return res.status(401).json({ error: 'Токен не надано' });

        const data = await promApi.getProduct(token, req.params.id);
        console.log(`\n=== DEBUG PRODUCT ${req.params.id} ===\n`, JSON.stringify(data, null, 2), `\n=========================\n`);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Згенерувати контент (ШІ)
app.post('/api/generate', async (req, res) => {
    try {
        const anthropicToken = req.headers['x-anthropic-token'];
        if (!anthropicToken) {
            return res.status(401).json({ error: 'Anthropic токен не надано. Введіть токен у формі підключення.' });
        }

        const { product, type, schema } = req.body;
        if (!product) {
            return res.status(400).json({ error: 'Дані товару не передано' });
        }
        
        let result = '';
        if (type === 'title') {
            result = await anthropicService.generateTitle(anthropicToken, product);
        } else if (type === 'keywords') {
            result = await anthropicService.generateKeywords(anthropicToken, product);
        } else if (type === 'description') {
            result = await anthropicService.generateDescription(anthropicToken, product);
        } else if (type === 'attributes') {
            result = await anthropicService.generateAttributes(anthropicToken, product, schema);
        } else {
            return res.status(400).json({ error: 'Невідомий тип генерації' });
        }

        res.json({ result });
    } catch (error) {
        console.error('Generate route error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4.1 Перекласти контент (БЕЗКОШТОВНО через Google Translate API)
app.post('/api/translate', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст для перекладу не надано' });

        const postData = new URLSearchParams({ q: text });
        const gResponse = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=uk&tl=ru&dt=t', {
            method: 'POST',
            body: postData
        });
        
        if (!gResponse.ok) {
            throw new Error(`Google API помилка: ${gResponse.status}`);
        }
        
        const gData = await gResponse.json();
        let translated = '';
        if (gData && Array.isArray(gData[0])) {
            translated = gData[0].map(part => (part && part[0]) ? part[0] : '').join('');
        }
        
        if (!translated) {
            throw new Error('Не вдалося отримати переклад');
        }

        res.json({ result: translated });
    } catch (error) {
        console.error('Translation error on server:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/save', async (req, res) => {
    try {
        const promToken = req.headers['x-prom-token'];
        if (!promToken) return res.status(401).json({ error: 'Prom токен не надано' });

        const { productData, translationData } = req.body;
        
        // 1. Оновлюємо основні дані (УКР)
        const data = await promApi.editProduct(promToken, productData);
        
        // Перевіряємо чи Prom повернув помилку валідації
        if (data && data.errors && Object.keys(data.errors).length > 0) {
            const firstError = Object.values(data.errors)[0];
            const errorMsg = typeof firstError === 'object' ? JSON.stringify(firstError) : firstError;
            return res.status(400).json({ error: 'Відмова Prom.ua: ' + errorMsg });
        }

        // 2. Оновлюємо переклад (РУС) якщо є
        if (translationData) {
            await promApi.updateProductTranslation(promToken, translationData);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Додавання нової категорії через XML посилання
const { exec } = require('child_process');

app.post('/api/add-category', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'Не вказано URL' });

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Не вдалося завантажити XML. Статус: ${response.status}`);
        
        const xmlData = await response.text();
        
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: ""
        });
        const jsonObj = parser.parse(xmlData);

        const DB_PATH = path.join(__dirname, 'public/data/attributes.json');
        let db = {};
        if (fs.existsSync(DB_PATH)) {
            db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        }

        if (!jsonObj.categories || !jsonObj.categories.category) {
            throw new Error('Невірний формат XML: не знайдено categories.category');
        }

        const categories = jsonObj.categories.category;
        const catList = Array.isArray(categories) ? categories : [categories];
        let addedCount = 0;

        for (const cat of catList) {
            if (!cat) continue;
            
            const catId = cat.id;
            const catName = cat.nameUK || cat.nameRU;
            const attributes = [];
            
            if (cat.attribute) {
                const attrs = cat.attribute;
                const attrList = Array.isArray(attrs) ? attrs : [attrs];
                
                for (const attr of attrList) {
                    if (!attr) continue;
                    const attribute = {
                        id: attr.id,
                        name: attr.nameUK || attr.nameRU,
                        type: attr.type,
                        unit: attr.measureUnitUK || attr.measureUnitRU || ''
                    };
                    
                    if (attr.attribute_value) {
                        const values = Array.isArray(attr.attribute_value) ? attr.attribute_value : [attr.attribute_value];
                        attribute.values = values.map(v => v.nameUK || v.nameRU).filter(Boolean);
                    }
                    attributes.push(attribute);
                }
            }
            
            db[catId] = { name: catName, attributes: attributes };
            addedCount++;
        }

        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
        
        // Автоматично відправляємо зміни на GitHub
        let pushCmd = 'git push';
        if (process.env.GITHUB_TOKEN) {
            pushCmd = 'git push https://yaroslavkoshil:$GITHUB_TOKEN@github.com/yaroslavkoshil/productcart.git main';
        }
        
        const gitSetup = 'git config user.email "bot@render.com" && git config user.name "Render Bot"';
        exec(`${gitSetup} && git add public/data/attributes.json && git commit -m "Auto-update attributes.json via UI" && ${pushCmd}`, (error, stdout, stderr) => {
            if (error) {
                console.error('Git push error:', error.message);
                // Ми не кидаємо помилку клієнту, бо локально файл вже збережено
            } else {
                console.log('Successfully pushed attributes to GitHub');
            }
        });

        res.json({ success: true, addedCount });

    } catch (error) {
        console.error('Add category error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
