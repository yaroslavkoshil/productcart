const API_BASE = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    // Елементи DOM
    const authSection = document.getElementById('auth-section');
    const catalogSection = document.getElementById('catalog-section');
    const headerActions = document.getElementById('header-actions');
    
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const promTokenInput = document.getElementById('prom-token');
    const anthropicTokenInput = document.getElementById('anthropic-token');
    const errorMsg = document.getElementById('auth-error');

    const groupsList = document.getElementById('groups-list');
    const productsGrid = document.getElementById('products-grid');
    const productsCount = document.getElementById('products-count');

    // Модальне вікно
    const modal = document.getElementById('product-modal');
    const closeModal = document.querySelector('.close-modal');
    let currentEditingProduct = null;

    let currentProducts = [];

    // Завантаження збережених токенів
    const savedProm = localStorage.getItem('promToken');
    const savedAnthropic = localStorage.getItem('anthropicToken');
    if (savedProm) promTokenInput.value = savedProm;
    if (savedAnthropic) anthropicTokenInput.value = savedAnthropic;

    if (savedProm && savedAnthropic) {
        connectToApi(savedProm, savedAnthropic);
    }

    connectBtn.addEventListener('click', () => {
        const promToken = promTokenInput.value.trim();
        const anthropicToken = anthropicTokenInput.value.trim();

        if (!promToken || !anthropicToken) {
            showError('Будь ласка, введіть обидва токени.');
            return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = 'Підключення...';
        errorMsg.style.display = 'none';

        connectToApi(promToken, anthropicToken);
    });

    disconnectBtn.addEventListener('click', () => {
        localStorage.removeItem('promToken');
        localStorage.removeItem('anthropicToken');
        catalogSection.style.display = 'none';
        headerActions.style.display = 'none';
        authSection.style.display = 'block';
        promTokenInput.value = '';
        anthropicTokenInput.value = '';
    });

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
        connectBtn.disabled = false;
        connectBtn.textContent = 'Підключитися та завантажити товари';
    }

    async function connectToApi(promToken, anthropicToken) {
        try {
            const response = await fetch(`${API_BASE}/groups`, {
                headers: { 'x-prom-token': promToken }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Неправильний токен або помилка API');
            }

            const data = await response.json();
            
            localStorage.setItem('promToken', promToken);
            localStorage.setItem('anthropicToken', anthropicToken);
            
            authSection.style.display = 'none';
            headerActions.style.display = 'block';
            catalogSection.style.display = 'block';
            
            renderGroups(data.groups);
            loadProducts(promToken);
        } catch (error) {
            showError(error.message);
        }
    }

    function renderGroups(groups) {
        if (!groups || groups.length === 0) return;
        groupsList.innerHTML = '<div class="group-item active" data-id="all">Усі товари</div>';
        groups.forEach(group => {
            const div = document.createElement('div');
            div.className = 'group-item';
            div.textContent = group.name;
            div.dataset.id = group.id;
            groupsList.appendChild(div);
        });
    }

    // Обробник кліків по групах
    groupsList.addEventListener('click', (e) => {
        const item = e.target.closest('.group-item');
        if (!item) return;

        // Знімаємо active з усіх
        document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
        // Додаємо active на вибраний
        item.classList.add('active');

        // Завантажуємо товари для вибраної групи
        const promToken = localStorage.getItem('promToken');
        loadProducts(promToken, item.dataset.id);
    });

    async function loadProducts(promToken, groupId = null) {
        productsGrid.innerHTML = '<div class="loading">Завантаження товарів...</div>';
        try {
            let url = `${API_BASE}/products?limit=50`;
            if (groupId && groupId !== 'all') url += `&group_id=${groupId}`;

            const response = await fetch(url, { headers: { 'x-prom-token': promToken } });
            const data = await response.json();
            currentProducts = data.products || [];
            productsCount.textContent = currentProducts.length;
            
            renderProducts(currentProducts);
        } catch (error) {
            productsGrid.innerHTML = `<div class="error-msg">Помилка: ${error.message}</div>`;
        }
    }

    function renderProducts(products) {
        if (!products || products.length === 0) {
            productsGrid.innerHTML = '<div class="loading">Товарів не знайдено</div>';
            return;
        }

        productsGrid.innerHTML = '';
        
        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';
            
            const imgSrc = p.main_image || 'https://via.placeholder.com/250?text=No+Image';
            const price = p.price ? `${p.price} ${p.currency || '₴'}` : 'Ціна не вказана';
            
            card.innerHTML = `
                <img src="${imgSrc}" class="product-img" alt="Product">
                <div class="product-info">
                    <div class="product-name">${p.name}</div>
                    <div class="product-price">${price}</div>
                    <div class="product-meta">
                        <span>ID: ${p.id}</span>
                        <span style="color: ${p.status === 'on_display' ? 'var(--primary)' : 'var(--text-muted)'}">${p.status}</span>
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => openModal(p));
            productsGrid.appendChild(card);
        });
    }

    // --- ЛОГІКА МОДАЛЬНОГО ВІКНА ТА ШІ ---

    async function openModal(summaryProduct) {
        // Показуємо лоадер або просто блокуємо клік поки вантажиться
        document.getElementById('modal-title').textContent = `Завантаження...`;
        modal.style.display = 'block';

        let product;
        try {
            const promToken = localStorage.getItem('promToken');
            const response = await fetch(`${API_BASE}/products/${summaryProduct.id}`, {
                headers: { 'x-prom-token': promToken }
            });
            if (!response.ok) throw new Error('Не вдалося завантажити деталі товару');
            product = await response.json();
        } catch (e) {
            alert(e.message);
            modal.style.display = 'none';
            return;
        }

        currentEditingProduct = product;
        
        // Беремо українську версію, якщо є, інакше російську (дефолтну)
        const currentName = product.name_uk || product.name || '';
        const currentDesc = product.description_uk || product.description || '';
        const currentKeywords = product.keywords_uk || product.keywords || '';
        
        document.getElementById('modal-title').textContent = `Редагування: ${currentName}`;
        document.getElementById('modal-img').src = product.main_image || summaryProduct.main_image || 'https://via.placeholder.com/250';
        
        document.getElementById('current-name').textContent = currentName || 'Немає';
        document.getElementById('current-keywords').textContent = currentKeywords || 'Немає';
        document.getElementById('current-desc').innerHTML = currentDesc || 'Немає';

        // Очищаємо поля для нових значень
        document.getElementById('ai-name').value = currentName;
        document.getElementById('ai-keywords').value = currentKeywords;
        document.getElementById('ai-desc').value = currentDesc;
        
        document.getElementById('save-status').textContent = '';
        document.getElementById('save-status').className = 'status-msg';

        modal.style.display = 'block';
    }

    closeModal.onclick = () => modal.style.display = 'none';
    window.onclick = (e) => { if (e.target == modal) modal.style.display = 'none'; }

    // Кнопки генерації
    document.querySelectorAll('.gen-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = e.target.dataset.type;
            const originalText = e.target.textContent;
            
            e.target.textContent = '⏳ Генерую...';
            e.target.disabled = true;

            try {
                const anthropicToken = localStorage.getItem('anthropicToken');
                const response = await fetch(`${API_BASE}/generate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-anthropic-token': anthropicToken
                    },
                    body: JSON.stringify({
                        product: currentEditingProduct,
                        type: type
                    })
                });

                if (!response.ok) throw new Error('Помилка ШІ');
                const data = await response.json();

                if (type === 'title') document.getElementById('ai-name').value = data.result;
                if (type === 'keywords') document.getElementById('ai-keywords').value = data.result;
                if (type === 'description') document.getElementById('ai-desc').value = data.result;

            } catch (error) {
                alert(error.message);
            } finally {
                e.target.textContent = originalText;
                e.target.disabled = false;
            }
        });
    });

    // Кнопка збереження на Prom.ua
    document.getElementById('save-btn').addEventListener('click', async (e) => {
        const btn = e.target;
        const statusMsg = document.getElementById('save-status');
        
        btn.disabled = true;
        btn.textContent = '💾 Зберігаю...';
        statusMsg.textContent = '';

        try {
            const promToken = localStorage.getItem('promToken');
            
            const updatedProduct = {
                id: currentEditingProduct.id,
                name: currentEditingProduct.name,
                name_uk: document.getElementById('ai-name').value.trim(),
                keywords: currentEditingProduct.keywords,
                keywords_uk: document.getElementById('ai-keywords').value.trim(),
                description: currentEditingProduct.description,
                description_uk: document.getElementById('ai-desc').value.trim(),
            };

            const response = await fetch(`${API_BASE}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-prom-token': promToken
                },
                body: JSON.stringify(updatedProduct)
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Помилка при збереженні');
            }

            statusMsg.textContent = '✅ Успішно збережено на Prom.ua!';
            statusMsg.className = 'status-msg success';
            
            // Оновлюємо дані в локальному стейті
            currentEditingProduct.name = updatedProduct.name;
            currentEditingProduct.keywords = updatedProduct.keywords;
            currentEditingProduct.description = updatedProduct.description;

            // Перемальовуємо каталог, щоб побачити нову назву
            renderProducts(currentProducts);

        } catch (error) {
            statusMsg.textContent = `❌ ${error.message}`;
            statusMsg.className = 'status-msg error';
        } finally {
            btn.disabled = false;
            btn.textContent = '💾 Зберегти на Prom.ua';
        }
    });
});
