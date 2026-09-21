const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const promApi = require('./services/prom-api');
const anthropicService = require('./services/anthropic-service');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
        if (!anthropicToken) return res.status(401).json({ error: 'Anthropic токен не надано' });

        const { product, type } = req.body;
        
        let result = '';
        if (type === 'title') {
            result = await anthropicService.generateTitle(anthropicToken, product);
        } else if (type === 'keywords') {
            result = await anthropicService.generateKeywords(anthropicToken, product);
        } else if (type === 'description') {
            result = await anthropicService.generateDescription(anthropicToken, product);
        } else {
            return res.status(400).json({ error: 'Невідомий тип генерації' });
        }

        res.json({ result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4.1 Перекласти контент (ШІ)
app.post('/api/translate', async (req, res) => {
    try {
        const anthropicToken = req.headers['x-anthropic-token'];
        if (!anthropicToken) return res.status(401).json({ error: 'Anthropic токен не надано' });

        const { text, type } = req.body;
        if (!text) return res.status(400).json({ error: 'Текст для перекладу не надано' });

        const result = await anthropicService.translateText(anthropicToken, text, type);
        res.json({ result });
    } catch (error) {
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

        // 2. Оновлюємо переклад (РУС) якщо є
        if (translationData) {
            await promApi.updateProductTranslation(promToken, translationData);
        }

        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
