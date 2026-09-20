const axios = require('axios');

class PromApiService {
    constructor() {
        this.baseURL = 'https://my.prom.ua/api/v1';
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
     * Отримує список груп (категорій) - всі сторінки автоматично
     */
    async getGroups(token) {
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
            return response.data;
        } catch (error) {
            console.error('Prom API editProduct error:', error.response?.data || error.message);
            throw new Error(error.response?.data?.message || 'Помилка при оновленні товару');
        }
    }
}

module.exports = new PromApiService();
