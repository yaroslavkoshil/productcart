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
    const searchInput = document.getElementById('search-input');

    // Модальне вікно
    const modal = document.getElementById('product-modal');
    const closeModal = document.querySelector('.close-modal');
    let currentEditingProduct = null;
    let currentProducts = [];
    let lastProductId = null;
    let currentGroupId = 'all';
    let allGroupsMap = {}; // зберігаємо дерево груп

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

        // Будуємо дерево груп
        const groupsMap = {};
        const rootGroups = [];

        // Ініціалізуємо мапу і зберігаємо глобально
        groups.forEach(g => {
            g.children = [];
            groupsMap[g.id] = g;
        });
        allGroupsMap = groupsMap;

        // Розподіляємо по батьківських групах
        groups.forEach(g => {
            const parentId = g.parent_group_id || g.parent_id;
            if (parentId && groupsMap[parentId]) {
                groupsMap[parentId].children.push(g);
            } else {
                rootGroups.push(g);
            }
        });

        groupsList.innerHTML = '<div class="group-item active" data-id="all">Усі товари</div>';

        // Рекурсивна функція для малювання дерева
        function renderNode(node, level = 0) {
            const div = document.createElement('div');
            div.className = 'group-item';
            div.dataset.id = node.id;
            
            // Робимо відступ для підкатегорій
            div.style.paddingLeft = `${15 + (level * 20)}px`;
            
            if (level > 0) {
                div.style.fontSize = '0.9em';
                div.style.color = 'var(--text-secondary)';
                div.textContent = '└ ' + node.name;
            } else {
                div.style.fontWeight = '500';
                div.textContent = node.name;
            }

            groupsList.appendChild(div);

            if (node.children && node.children.length > 0) {
                node.children.forEach(child => renderNode(child, level + 1));
            }
        }

        rootGroups.forEach(g => renderNode(g, 0));
    }

    // Обробник кліків по групах
    groupsList.addEventListener('click', async (e) => {
        const item = e.target.closest('.group-item');
        if (!item) return;

        document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        const promToken = localStorage.getItem('promToken');
        currentGroupId = item.dataset.id;
        loadProducts(promToken, currentGroupId, false);
    });

    async function loadProducts(promToken, groupId = null, append = false) {
        if (!append) {
            productsGrid.innerHTML = '<div class="loading">Завантаження товарів...</div>';
            currentProducts = [];
            lastProductId = null;
        }

        try {
            let url = `${API_BASE}/products?limit=50`;
            if (groupId && groupId !== 'all') url += `&group_id=${groupId}`;
            if (lastProductId) url += `&last_id=${lastProductId}`;

            const response = await fetch(url, { headers: { 'x-prom-token': promToken } });
            const data = await response.json();
            
            const newProducts = data.products || [];
            
            if (append) {
                currentProducts = [...currentProducts, ...newProducts];
            } else {
                currentProducts = newProducts;
            }
            
            if (newProducts.length > 0) {
                lastProductId = newProducts[newProducts.length - 1].id;
            }
            
            searchInput.value = ''; // Очищаємо пошук при зміні категорії
            renderProducts(currentProducts);
            
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (newProducts.length === 50) {
                loadMoreBtn.style.display = 'inline-block';
            } else {
                loadMoreBtn.style.display = 'none';
            }
        } catch (error) {
            if (!append) {
                productsGrid.innerHTML = `<div class="error-msg">Помилка: ${error.message}</div>`;
            } else {
                alert('Помилка при завантаженні: ' + error.message);
            }
        }
    }

    document.getElementById('load-more-btn').addEventListener('click', (e) => {
        const btn = e.target;
        btn.textContent = 'Завантаження...';
        btn.disabled = true;
        
        loadProducts(localStorage.getItem('promToken'), currentGroupId, true).finally(() => {
            btn.textContent = 'Завантажити ще 50 товарів';
            btn.disabled = false;
        });
    });

    function renderProducts(products) {
        productsCount.textContent = products ? products.length : 0;
        
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

    // Пошук товарів
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderProducts(currentProducts);
            return;
        }
        
        const filtered = currentProducts.filter(p => {
            const nameRu = (p.name || '').toLowerCase();
            const nameUk = (p.name_multilang && p.name_multilang.uk ? p.name_multilang.uk : '').toLowerCase();
            const id = (p.id || '').toString().toLowerCase();
            const sku = (p.sku || '').toString().toLowerCase();
            
            return nameRu.includes(query) || nameUk.includes(query) || id.includes(query) || sku.includes(query);
        });
        
        renderProducts(filtered);
    });

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
        const currentName = (product.name_multilang && product.name_multilang.uk) ? product.name_multilang.uk : product.name || '';
        const currentDesc = (product.description_multilang && product.description_multilang.uk) ? product.description_multilang.uk : product.description || '';
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
                keywords: currentEditingProduct.keywords,
                description: currentEditingProduct.description,
                name_multilang: {
                    ru: currentEditingProduct.name,
                    uk: document.getElementById('ai-name').value.trim()
                },
                description_multilang: {
                    ru: currentEditingProduct.description,
                    uk: document.getElementById('ai-desc').value.trim()
                }
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
