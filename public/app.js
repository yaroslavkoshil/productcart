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
            const response = await fetch(`${API_BASE}/groups?_t=${Date.now()}`, {
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

        groups.forEach(g => {
            g.children = [];
            groupsMap[g.id] = g;
        });
        allGroupsMap = groupsMap;

        groups.forEach(g => {
            const parentId = g.parent_group_id || g.parent_id;
            if (parentId && groupsMap[parentId]) {
                groupsMap[parentId].children.push(g);
            } else {
                rootGroups.push(g);
            }
        });

        // Читаємо збережені стани з localStorage
        const collapsedGroups = JSON.parse(localStorage.getItem('collapsedGroups') || '{}');
        const lastGroupId = localStorage.getItem('lastGroupId') || 'all';

        groupsList.innerHTML = '';

        // Додаємо кнопку "Усі товари"
        const allDiv = document.createElement('div');
        allDiv.className = 'group-item' + (lastGroupId === 'all' ? ' active' : '');
        allDiv.dataset.id = 'all';
        allDiv.textContent = 'Усі товари';
        allDiv.style.fontWeight = '500';
        groupsList.appendChild(allDiv);

        function renderNode(node, level = 0, container = groupsList) {
            const hasChildren = node.children && node.children.length > 0;
            const isCollapsed = collapsedGroups[node.id] === true;

            const div = document.createElement('div');
            div.className = 'group-item' + (String(node.id) === String(lastGroupId) ? ' active' : '');
            div.dataset.id = node.id;
            div.style.paddingLeft = `${14 + level * 18}px`;

            if (hasChildren) {
                // Стрілка для згортання
                const arrow = document.createElement('span');
                arrow.className = 'group-arrow';
                arrow.textContent = isCollapsed ? '▶ ' : '▼ ';
                arrow.dataset.toggleId = node.id;
                div.appendChild(arrow);
                
                const textSpan = document.createElement('span');
                textSpan.textContent = level === 0 ? node.name : ' └ ' + node.name;
                if (level === 0) textSpan.style.fontWeight = '500';
                else textSpan.style.fontSize = '0.9em';
                
                div.appendChild(textSpan);
            } else {
                if (level === 0) {
                    div.style.fontWeight = '500';
                    div.textContent = node.name;
                } else {
                    div.style.fontSize = '0.9em';
                    div.textContent = '└ ' + node.name;
                }
            }

            container.appendChild(div);

            if (hasChildren) {
                const childrenContainer = document.createElement('div');
                childrenContainer.dataset.parentId = node.id;
                childrenContainer.style.display = isCollapsed ? 'none' : 'block';
                
                // РЕКУРСІЯ: рендеримо дітей всередину цього контейнера
                node.children.forEach(child => renderNode(child, level + 1, childrenContainer));
                
                container.appendChild(childrenContainer);
            }
        }

        rootGroups.forEach(g => renderNode(g, 0, groupsList));

        // Відновлюємо останню вибрану групу і завантажуємо товари
        currentGroupId = lastGroupId;
        const promToken = localStorage.getItem('promToken');
        loadProducts(promToken, lastGroupId, false);
    }

    // Обробник кліків по групах
    groupsList.addEventListener('click', (e) => {
        // Клік на стрілку — лише згортаємо/розгортаємо
        const arrow = e.target.closest('.group-arrow');
        if (arrow) {
            const toggleId = arrow.dataset.toggleId;
            const container = groupsList.querySelector(`[data-parent-id="${toggleId}"]`);
            const collapsedGroups = JSON.parse(localStorage.getItem('collapsedGroups') || '{}');

            if (container.style.display === 'none') {
                container.style.display = 'block';
                arrow.textContent = '▼ ';
                delete collapsedGroups[toggleId];
            } else {
                container.style.display = 'none';
                arrow.textContent = '▶ ';
                collapsedGroups[toggleId] = true;
            }
            localStorage.setItem('collapsedGroups', JSON.stringify(collapsedGroups));
            return; // не завантажуємо товари
        }

        // Клік на групу — вибираємо і завантажуємо
        const item = e.target.closest('.group-item');
        if (!item) return;

        document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');

        currentGroupId = item.dataset.id;
        localStorage.setItem('lastGroupId', currentGroupId); // запам’ятовуємо

        const promToken = localStorage.getItem('promToken');
        loadProducts(promToken, currentGroupId, false);
    });

    async function loadProducts(promToken, groupId = null, append = false) {
        if (!append) {
            productsGrid.innerHTML = '<div class="loading">Завантаження товарів...</div>';
            currentProducts = [];
            lastProductId = null;
        }

        try {
            const url = new URL(`${API_BASE}/products`, window.location.origin);
            url.searchParams.append('limit', '50');
            if (groupId && groupId !== 'all') url.searchParams.append('group_id', groupId);
            if (lastProductId) url.searchParams.append('last_id', lastProductId);
            url.searchParams.append('_t', Date.now());

            const response = await fetch(url.toString(), { headers: { 'x-prom-token': promToken } });
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

    // Пошук товарів локально (по завантажених)
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

    // Глобальний пошук по всьому магазину
    document.getElementById('search-btn').addEventListener('click', performGlobalSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') performGlobalSearch();
    });

    async function performGlobalSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        productsGrid.innerHTML = '<div class="loading">Шукаю по всьому магазину (це може зайняти час)...</div>';
        const loadMoreBtn = document.getElementById('load-more-btn');
        if(loadMoreBtn) loadMoreBtn.style.display = 'none';

        try {
            const token = localStorage.getItem('promToken');
            const url = new URL(`${API_BASE}/products`, window.location.origin);
            url.searchParams.append('query', query);
            url.searchParams.append('_t', Date.now());

            const response = await fetch(url.toString(), {
                headers: { 'x-prom-token': token }
            });

            if (!response.ok) throw new Error('Помилка пошуку');
            const data = await response.json();
            
            // Зберігаємо як поточні товари, щоб можна було фільтрувати
            currentProducts = data.products || [];
            currentGroupId = null; // скидаємо активну групу
            
            // Знімаємо виділення з дерева категорій
            document.querySelectorAll('.group-item').forEach(el => el.classList.remove('active'));

            renderProducts(currentProducts);
        } catch (error) {
            productsGrid.innerHTML = `<div class="error-msg">Помилка пошуку: ${error.message}</div>`;
        }
    }

    // --- ЛОГІКА МОДАЛЬНОГО ВІКНА ТА ШІ ---

    async function openModal(summaryProduct) {
        // Показуємо лоадер або просто блокуємо клік поки вантажиться
        document.getElementById('modal-title').textContent = `Завантаження...`;
        modal.style.display = 'block';

        let product;
        try {
            const promToken = localStorage.getItem('promToken');
            const response = await fetch(`${API_BASE}/products/${summaryProduct.id}?_t=${Date.now()}`, {
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
        
        // Будуємо шлях категорії для контексту ШІ
        let categoryPath = product.group ? product.group.name : 'Не вказано';
        if (product.group && product.group.id && allGroupsMap[product.group.id]) {
            const path = [];
            let curr = allGroupsMap[product.group.id];
            while (curr) {
                path.unshift(curr.name);
                curr = allGroupsMap[curr.parent_group_id || curr.parent_id];
            }
            categoryPath = path.join(' > ');
        }
        currentEditingProduct.categoryPath = categoryPath;
        
        // Беремо українську версію, якщо є, інакше російську (дефолтну)
        const currentNameUk = (product.name_multilang && product.name_multilang.uk) ? product.name_multilang.uk : product.name || '';
        const currentNameRu = (product.name_multilang && product.name_multilang.ru) ? product.name_multilang.ru : product.name || '';
        const currentDescUk = (product.description_multilang && product.description_multilang.uk) ? product.description_multilang.uk : product.description || '';
        const currentDescRu = (product.description_multilang && product.description_multilang.ru) ? product.description_multilang.ru : product.description || '';
        
        // Ключові слова (на Prom.ua вони спільні, але для зручності ми їх ділимо якщо можна)
        const currentKeywords = product.keywords || '';
        
        document.getElementById('modal-title').textContent = `Редагування: ${currentNameUk}`;
        document.getElementById('modal-img').src = product.main_image || summaryProduct.main_image || 'https://via.placeholder.com/250';
        
        document.getElementById('current-name').textContent = currentNameUk || 'Немає';
        document.getElementById('current-keywords').textContent = currentKeywords || 'Немає';
        document.getElementById('current-desc').innerHTML = currentDescUk || 'Немає';

        // Зберігаємо поточні дані в data-атрибути для кнопок "Копіювати"
        document.querySelector('.copy-btn[data-target="name"]').dataset.uk = currentNameUk;
        document.querySelector('.copy-btn[data-target="name"]').dataset.ru = currentNameRu;
        document.querySelector('.copy-btn[data-target="keywords"]').dataset.uk = currentKeywords;
        document.querySelector('.copy-btn[data-target="keywords"]').dataset.ru = currentKeywords;
        document.querySelector('.copy-btn[data-target="description"]').dataset.uk = currentDescUk;
        document.querySelector('.copy-btn[data-target="description"]').dataset.ru = currentDescRu;

        // Очищаємо поля для нових значень
        document.getElementById('ai-name-uk').value = currentNameUk;
        document.getElementById('ai-name-ru').value = currentNameRu;
        document.getElementById('ai-keywords-uk').value = currentKeywords;
        document.getElementById('ai-keywords-ru').value = currentKeywords;
        document.getElementById('ai-desc-uk').value = currentDescUk;
        document.getElementById('ai-desc-ru').value = currentDescRu;
        
        updateCounters();
        
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
                const textRes = data.result;

                if (type === 'title') {
                    document.getElementById('ai-name-uk').value = textRes || '';
                }
                if (type === 'keywords') {
                    document.getElementById('ai-keywords-uk').value = textRes || '';
                }
                if (type === 'description') {
                    document.getElementById('ai-desc-uk').value = textRes || '';
                }
                updateCounters();

            } catch (error) {
                alert(error.message);
            } finally {
                e.target.textContent = originalText;
                e.target.disabled = false;
            }
        });
    });

    // Кнопки перекладу на RU
    document.querySelectorAll('.translate-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const type = e.target.dataset.target;
            const originalText = e.target.innerHTML;
            
            let sourceText = '';
            let targetFieldId = '';

            if (type === 'title') {
                sourceText = document.getElementById('ai-name-uk').value;
                targetFieldId = 'ai-name-ru';
            } else if (type === 'keywords') {
                sourceText = document.getElementById('ai-keywords-uk').value;
                targetFieldId = 'ai-keywords-ru';
            } else if (type === 'description') {
                sourceText = document.getElementById('ai-desc-uk').value;
                targetFieldId = 'ai-desc-ru';
            }

            if (!sourceText.trim()) {
                alert('Спочатку згенеруйте або напишіть текст українською!');
                return;
            }

            e.target.textContent = '⏳ Перекладаю...';
            e.target.disabled = true;

            try {
                const anthropicToken = localStorage.getItem('anthropicToken');
                const response = await fetch(`${API_BASE}/translate`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-anthropic-token': anthropicToken
                    },
                    body: JSON.stringify({
                        text: sourceText,
                        type: type
                    })
                });

                if (!response.ok) throw new Error('Помилка перекладу');
                const data = await response.json();

                document.getElementById(targetFieldId).value = data.result;
                updateCounters();

            } catch (error) {
                alert(error.message);
            } finally {
                e.target.innerHTML = originalText;
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
            
            const nameUk = document.getElementById('ai-name-uk').value.trim();
            const nameRu = document.getElementById('ai-name-ru').value.trim();
            const descUk = document.getElementById('ai-desc-uk').value.trim();
            const descRu = document.getElementById('ai-desc-ru').value.trim();
            const keywordsUk = document.getElementById('ai-keywords-uk').value.trim();
            const keywordsRu = document.getElementById('ai-keywords-ru').value.trim();

            const updatedProduct = {
                id: currentEditingProduct.id,
                name: nameUk || currentEditingProduct.name, // дефолт для базового поля
                keywords: keywordsUk || currentEditingProduct.keywords, // базова мова - укр
                description: descUk || currentEditingProduct.description,
                name_multilang: {
                    ru: nameRu,
                    uk: nameUk
                },
                description_multilang: {
                    ru: descRu,
                    uk: descUk
                }
            };
            
            const translationData = {
                product_id: currentEditingProduct.id.toString(),
                lang: 'ru',
                name: nameRu,
                keywords: keywordsRu,
                description: descRu
            };

            const response = await fetch(`${API_BASE}/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-prom-token': promToken
                },
                body: JSON.stringify({ productData: updatedProduct, translationData: translationData })
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

    // Оновлення лічильників символів
    function updateCounters() {
        const updateCount = (inputId, counterId, limit) => {
            const input = document.getElementById(inputId);
            const counter = document.getElementById(counterId);
            if (input && counter) {
                const len = input.value.length;
                counter.textContent = `${len}/${limit}`;
                if (len > limit) counter.classList.add('error');
                else counter.classList.remove('error');
            }
        };

        updateCount('ai-name-uk', 'count-name-uk', 110);
        updateCount('ai-name-ru', 'count-name-ru', 110);
        updateCount('ai-keywords-uk', 'count-keywords-uk', 1024);
        updateCount('ai-keywords-ru', 'count-keywords-ru', 1024);
    }

    ['ai-name-uk', 'ai-name-ru', 'ai-keywords-uk', 'ai-keywords-ru'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCounters);
    });

    // Кнопки "Копіювати з поточних"
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.dataset.target;
            const ukVal = e.currentTarget.dataset.uk || '';
            const ruVal = e.currentTarget.dataset.ru || '';
            
            if (target === 'name') {
                document.getElementById('ai-name-uk').value = ukVal;
                document.getElementById('ai-name-ru').value = ruVal;
            } else if (target === 'keywords') {
                document.getElementById('ai-keywords-uk').value = ukVal;
                document.getElementById('ai-keywords-ru').value = ruVal;
            } else if (target === 'description') {
                document.getElementById('ai-desc-uk').value = ukVal;
                document.getElementById('ai-desc-ru').value = ruVal;
            }
            updateCounters();
        });
    });
});
