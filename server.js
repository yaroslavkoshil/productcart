const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const promApi = require('./services/prom-api');
const geminiService = require('./services/gemini-service');

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
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Отримати список товарів
app.get('/api/products', async (req, res) => {
    try {
        const token = req.headers['x-prom-token'];
        if (!token) return res.status(401).json({ error: 'Токен не надано' });

        const limit = req.query.limit || 50;
        const lastId = req.query.last_id;
        const groupId = req.query.group_id;

        const data = await promApi.getProducts(token, limit, lastId, groupId);
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
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Згенерувати контент (ШІ)
app.post('/api/generate', async (req, res) => {
    try {
        const geminiToken = req.headers['x-gemini-token'];
        if (!geminiToken) return res.status(401).json({ error: 'Gemini токен не надано' });

        const { product, type } = req.body;
        // type може бути: 'title', 'keywords', 'description'
        
        let result = '';
        if (type === 'title') {
            result = await geminiService.generateTitle(geminiToken, product);
        } else if (type === 'keywords') {
            result = await geminiService.generateKeywords(geminiToken, product);
        } else if (type === 'description') {
            result = await geminiService.generateDescription(geminiToken, product);
        } else {
            return res.status(400).json({ error: 'Невідомий тип генерації' });
        }

        res.json({ result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 5. Зберегти зміни на Prom.ua
app.post('/api/save', async (req, res) => {
    try {
        const promToken = req.headers['x-prom-token'];
        if (!promToken) return res.status(401).json({ error: 'Prom токен не надано' });

        const productData = req.body; // { id, name, description, keywords, ... }
        
        const data = await promApi.editProduct(promToken, productData);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
