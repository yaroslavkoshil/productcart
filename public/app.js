const API_BASE = 'http://localhost:3000/api';

document.addEventListener('DOMContentLoaded', () => {
    // Елементи DOM
    const authSection = document.getElementById('auth-section');
    const catalogSection = document.getElementById('catalog-section');
    const headerActions = document.getElementById('header-actions');
    
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const promTokenInput = document.getElementById('prom-token');
    const geminiTokenInput = document.getElementById('gemini-token');
    const errorMsg = document.getElementById('auth-error');

    const groupsList = document.getElementById('groups-list');
    const productsGrid = document.getElementById('products-grid');
    const productsCount = document.getElementById('products-count');

    let currentProducts = [];

    // Завантаження збережених токенів
    const savedProm = localStorage.getItem('promToken');
    const savedGemini = localStorage.getItem('geminiToken');
    if (savedProm) promTokenInput.value = savedProm;
    if (savedGemini) geminiTokenInput.value = savedGemini;

    // Автоматичне підключення, якщо є токени
    if (savedProm && savedGemini) {
        connectToApi(savedProm, savedGemini);
    }

    // Обробники кнопок
    connectBtn.addEventListener('click', () => {
        const promToken = promTokenInput.value.trim();
        const geminiToken = geminiTokenInput.value.trim();

        if (!promToken || !geminiToken) {
            showError('Будь ласка, введіть обидва токени.');
            return;
        }

        connectBtn.disabled = true;
        connectBtn.textContent = 'Підключення...';
        errorMsg.style.display = 'none';

        connectToApi(promToken, geminiToken);
    });

    disconnectBtn.addEventListener('click', () => {
        localStorage.removeItem('promToken');
        localStorage.removeItem('geminiToken');
        catalogSection.style.display = 'none';
        headerActions.style.display = 'none';
        authSection.style.display = 'block';
        promTokenInput.value = '';
        geminiTokenInput.value = '';
    });

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
        connectBtn.disabled = false;
        connectBtn.textContent = 'Підключитися та завантажити товари';
    }

    // Головна функція підключення та завантаження
    async function connectToApi(promToken, geminiToken) {
        try {
            // Тестовий запит на отримання груп, щоб перевірити токен
            const response = await fetch(`${API_BASE}/groups`, {
                headers: { 'x-prom-token': promToken }
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Неправильний токен або помилка API');
            }

            const data = await response.json();
            
            // Якщо все ок - зберігаємо токени і показуємо каталог
            localStorage.setItem('promToken', promToken);
            localStorage.setItem('geminiToken', geminiToken);
            
            authSection.style.display = 'none';
            headerActions.style.display = 'block';
            catalogSection.style.display = 'block';
            
            renderGroups(data.groups);
            
            // Завантажуємо перші 50 товарів
            loadProducts(promToken);

        } catch (error) {
            showError(error.message);
        }
    }

    function renderGroups(groups) {
        if (!groups || groups.length === 0) {
            groupsList.innerHTML = '<div class="loading">Немає груп</div>';
            return;
        }

        groupsList.innerHTML = '<div class="group-item active" data-id="all">Усі товари</div>';
        
        groups.forEach(group => {
            const div = document.createElement('div');
            div.className = 'group-item';
            div.textContent = group.name;
            div.dataset.id = group.id;
            groupsList.appendChild(div);
        });
    }

    async function loadProducts(promToken, groupId = null) {
        productsGrid.innerHTML = '<div class="loading">Завантаження товарів...</div>';
        
        try {
            let url = `${API_BASE}/products?limit=50`;
            if (groupId && groupId !== 'all') {
                url += `&group_id=${groupId}`;
            }

            const response = await fetch(url, {
                headers: { 'x-prom-token': promToken }
            });

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
                        <span style="color: ${p.status === 'on_display' ? 'var(--primary)' : 'var(--text-muted)'}">
                            ${p.status}
                        </span>
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                alert(`Відкрито товар: ${p.name}\n(Тут буде модальне вікно для генерації ШІ)`);
            });
            
            productsGrid.appendChild(card);
        });
    }
});
