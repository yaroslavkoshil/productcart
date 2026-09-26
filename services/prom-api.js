const axios = require('axios');

class PromApiService {
    constructor() {
        this.baseURL = 'https://my.prom.ua/api/v1';
        this.cache = {}; // Зберігаємо товари по токенам
    }

    /**
     * Фонове завантаження всіх товарів в пам'ять
     */
    async syncAllProducts(token) {
        if (this.cache[token] && this.cache[token].isSyncing) return;
        
        if (!this.cache[token]) {
            this.cache[token] = { products: [], isSyncing: true, lastSynced: 0 };
        } else {
            this.cache[token].isSyncing = true;
        }

        try {
            console.log('[Cache] Базове завантаження товарів розпочато...');
            const client = this.getClient(token);
            let allProducts = [];
            let lastId = null;
            const limit = 100;
            
            while (true) {
                let url = `/products/list?limit=${limit}`;
                if (lastId) url += `&last_id=${lastId}`;
                
                const response = await client.get(url);
                const products = response.data.products || [];
                if (products.length === 0) break;
                
                allProducts = allProducts.concat(products);
                if (products.length < limit) break;
                
                lastId = products[products.length - 1].id;
            }
            
            this.cache[token].products = allProducts;
            this.cache[token].lastSynced = Date.now();
            console.log(`[Cache] Успішно завантажено ${allProducts.length} товарів. Пошук тепер працює моментально.`);
        } catch(e) {
            console.error('[Cache] Помилка фонового завантаження:', e.message);
        } finally {
            this.cache[token].isSyncing = false;
        }
    }

    /**
     * Створює axios instance з переданим токеном
     */
    getClient(token) {
        if (!token) throw new Error('API Token is required');
        
        return axios.create({
            baseURL: this.baseURL,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Отримує список товарів компанії
     */
    async getProducts(token, limit = 50, lastId = null, groupId = null) {
        try {
            const client = this.getClient(token);
            let url = `/products/list?limit=${limit}`;
            
            if (lastId) url += `&last_id=${lastId}`;
            if (groupId) url += `&group_id=${groupId}`;

            const response = await client.get(url);
            return response.data;
        } catch (error) {
            console.error('Prom API getProducts error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Помилка при отриманні товарів');
        }
    }

    /**
     * Отримує деталі одного товару
     */
    async getProduct(token, productId) {
        try {
            const client = this.getClient(token);
            const response = await client.get(`/products/${productId}`);
            return response.data.product;
        } catch (error) {
            console.error('Prom API getProduct error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Помилка при отриманні товару');
        }
    }

    /**
     * Глобальний пошук товарів
     */
    async searchProducts(token, query) {
        const client = this.getClient(token);
        const lowerQuery = query.toLowerCase().trim();
        const isNumeric = /^\d+$/.test(lowerQuery);
        
        // 1. Моментальний пошук по кешу (якщо він вже завантажений)
        if (this.cache[token] && this.cache[token].products && this.cache[token].products.length > 0) {
            console.log('[Cache] Використовую миттєвий пошук по пам\'яті');
            const results = this.cache[token].products.filter(p => {
                const nameRu = (p.name || '').toLowerCase();
                const nameUk = (p.name_multilang && p.name_multilang.uk ? p.name_multilang.uk : '').toLowerCase();
                const sku = (p.sku || '').toLowerCase();
                const idStr = p.id.toString();
                return nameRu.includes(lowerQuery) || nameUk.includes(lowerQuery) || sku.includes(lowerQuery) || idStr === lowerQuery;
            });
            return { products: results.slice(0, 50) };
        }
        
        // 2. Якщо кешу ще немає - працюємо по старому алгоритму API
        let results = [];

        // 1. Якщо це число, пробуємо знайти по ID
        if (isNumeric) {
            try {
                const response = await client.get(`/products/${lowerQuery}`);
                if (response.data && response.data.product) {
                    results.push(response.data.product);
                }
            } catch (e) {
                // Ignore 404
            }
        }

        // 2. Якщо не знайдено по ID, або це текст, шукаємо по імені/SKU, завантажуючи сторінки
        if (results.length === 0) {
            let lastId = null;
            const limit = 100; // Максимум для Prom.ua API
            let pagesChecked = 0;
            const MAX_PAGES = 10; // Обмеження щоб не чекати вічно (до 1000 товарів)

            while (pagesChecked < MAX_PAGES) {
                try {
                    let url = `/products/list?limit=${limit}`;
                    if (lastId) url += `&last_id=${lastId}`;

                    const response = await client.get(url);
                    const products = response.data.products || [];
                    
                    if (products.length === 0) break; // Кінець каталогу

                    // Фільтруємо
                    const matched = products.filter(p => {
                        const nameRu = (p.name || '').toLowerCase();
                        const nameUk = (p.name_multilang && p.name_multilang.uk ? p.name_multilang.uk : '').toLowerCase();
                        const sku = (p.sku || '').toLowerCase();
                        return nameRu.includes(lowerQuery) || nameUk.includes(lowerQuery) || sku.includes(lowerQuery);
                    });

                    results = results.concat(matched);

                    if (results.length >= 20) break; // Знайшли достатньо

                    lastId = products[products.length - 1].id;
                    pagesChecked++;
                } catch (e) {
                    console.error('Prom API search loop error:', e.message);
                    break; // Перериваємо пошук при помилці
                }
            }
        }

        return { products: results.slice(0, 50) };
    }

    /**
     * Отримує список груп (категорій) - всі сторінки автоматично
     */
    async getGroups(token) {
        // Тригеримо фонове завантаження товарів для кешу (fire and forget)
        if (!this.cache[token] || (!this.cache[token].isSyncing && Date.now() - this.cache[token].lastSynced > 1000 * 60 * 60)) {
            this.syncAllProducts(token);
        }
        
        try {
            const client = this.getClient(token);
            let allGroups = [];
            let lastId = null;
            const limit = 100;

            // Пагінуємо доки не отримаємо всі групи
            while (true) {
                let url = `/groups/list?limit=${limit}`;
                if (lastId) url += `&last_id=${lastId}`;

                const response = await client.get(url);
                const groups = response.data.groups || [];
                allGroups = allGroups.concat(groups);

                if (groups.length < limit) break; // дійшли до кінця
                lastId = groups[groups.length - 1].id;
            }

            return { groups: allGroups };
        } catch (error) {
            console.error('Prom API getGroups error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Помилка при отриманні груп');
        }
    }

    /**
     * Оновлює товар
     */
    async editProduct(token, productData) {
        try {
            const client = this.getClient(token);
            // Prom API expecting array of objects for edit
            const response = await client.post('/products/edit', [productData]);
            
            // Оновлюємо кеш, щоб пошук знаходив нові дані
            if (this.cache[token] && this.cache[token].products) {
                const idx = this.cache[token].products.findIndex(p => p.id === productData.id);
                if (idx !== -1) {
                    this.cache[token].products[idx] = { ...this.cache[token].products[idx], ...productData };
                }
            }
            
            return response.data;
        } catch (error) {
            console.error('Prom API editProduct error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Помилка при оновленні товару');
        }
    }

    /**
     * Оновлює переклад товару (наприклад, ключові слова російською)
     */
    async updateProductTranslation(token, translationData) {
        try {
            const client = this.getClient(token);
            // PUT /products/translation
            const response = await client.put('/products/translation', translationData);
            return response.data;
        } catch (error) {
            console.error('Prom API updateTranslation error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Помилка при збереженні перекладу товару');
        }
    }
}

module.exports = new PromApiService();
