// Глобальное состояние приложения
let isUserVip = false;
let isUserAuthorized = false;
let authorizedName = "";
let map = null; 
let routingLine = null; 

// Управление рекламой
let stationsViewedCount = 0; 
let lastAdClosedTime = 0;    
let adTimerInterval = null;  

// Локальные базы данных в localStorage
let vipUsersDatabase = JSON.parse(localStorage.getItem('fuelMapVipUsers')) || {}; 
let historyDatabase = JSON.parse(localStorage.getItem('fuelMapUserHistories')) || {}; 
let registeredAccounts = JSON.parse(localStorage.getItem('fuelMapAccounts')) || {}; // База данных аккаунтов

// Реальная гео-база заправок Майкопа
const stations = [
    { id: 1, name: "Лукойл (ул. Хакурате, 194)", lat: 44.611132, lon: 40.089423, rating: 4.8, prices: { ai95: "56.40", ai92: "51.20", dt: "60.10" } },
    { id: 2, name: "Роснефть (ул. Привокзальная, 290)", lat: 44.598211, lon: 40.114512, rating: 4.5, prices: { ai95: "55.90", ai92: "50.80", dt: "59.50" } },
    { id: 3, name: "Газпром (ул. Димитрова, 37)", lat: 44.619511, lon: 40.082231, rating: 4.9, prices: { ai95: "56.10", ai92: "51.00", dt: "59.90" } },
    { id: 4, name: "Eco Premium (ул. Пионерская, 283А)", lat: 44.601112, lon: 40.128412, rating: 4.2, prices: { ai95: "54.80", ai92: "49.90", dt: "58.20" } },
    { id: 5, name: "Метрополис (ул. Хакурате, 644/1)", lat: 44.612512, lon: 40.063211, rating: 4.0, prices: { ai95: "53.90", ai92: "48.50", dt: "57.00" } },
    { id: 6, name: "Лукойл (ул. Хакурате, 651)", lat: 44.613312, lon: 40.081123, rating: 4.7, prices: { ai95: "56.30", ai92: "51.10", dt: "60.05" } }
];

let mapMarkers = [];
let userLocationCoords = null; 

function createCustomIcon(color) {
    return L.divIcon({
        className: 'custom-svg-icon',
        html: `<svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.71573 23.2843 0 15 0ZM15 20.25C12.1005 20.25 9.75 18.3995 9.75 15.5C9.75 12.6005 12.1005 10.25 15 10.25C17.8995 10.25 20.25 12.6005 20.25 15.5C20.25 18.3995 17.8995 20.25 15 20.25Z" fill="${color}"/></svg>`,
        iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -40]
    });
}

window.onload = function() {
    let vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);

    map = L.map('map', { zoomControl: true }).setView([44.606621, 40.101732], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 400);

    const geoBtn = document.createElement('button');
    geoBtn.className = 'geo-btn'; geoBtn.innerText = '📍 Где я?';
    document.getElementById('map').appendChild(geoBtn);

    geoBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    userLocationCoords = [position.coords.latitude, position.coords.longitude];
                    focusOnUser();
                },
                () => {
                    userLocationCoords = [44.607201, 40.103112];
                    focusOnUser();
                }
            );
        }
    });

    checkSavedUserSession();
    renderInterface(stations);
    initApplicationEvents();
};

function checkSavedUserSession() {
    const savedSession = localStorage.getItem('fuelMapCurrentSession');
    if (savedSession) {
        isUserAuthorized = true;
        authorizedName = savedSession;
        
        document.getElementById('profile-btn').innerText = `👤 Профиль`; 
        document.getElementById('history-btn').style.display = 'inline-block'; 
        
        isUserVip = vipUsersDatabase[authorizedName.toLowerCase()] || false;
        const shopBtn = document.getElementById('shop-btn');
        if (isUserVip) {
            shopBtn.innerText = '👑 VIP';
            shopBtn.className = 'nav-item-btn vip-active-status';
        }
        updateHistoryUI();
    }
}

function focusOnUser() {
    L.marker(userLocationCoords, { icon: createCustomIcon('#10b981') }).addTo(map).bindPopup("<b>Вы находитесь здесь!</b>").openPopup();
    map.setView(userLocationCoords, 16);
    renderInterface(stations); 
}

function renderInterface(stationsArray) {
    if (!map) return;
    const listContainer = document.getElementById('station-list');
    listContainer.innerHTML = ''; 
    
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    let displayStations = [...stationsArray];

    const ratingSortOrder = document.getElementById('filter-rating-select').value;
    const priceSortOrder = document.getElementById('filter-price-select').value;

    if (ratingSortOrder === 'desc') displayStations.sort((a, b) => b.rating - a.rating); 
    else if (ratingSortOrder === 'asc') displayStations.sort((a, b) => a.rating - b.rating); 
    
    if (priceSortOrder === 'asc' && isUserVip) displayStations.sort((a, b) => parseFloat(a.prices.ai95) - parseFloat(b.prices.ai95));

    displayStations.forEach(s => {
        let popupContent = `<b>${s.name}</b><br>Рейтинг: ★ ${s.rating}<br>`;
        if (isUserVip) {
            popupContent += `
                <div class="fuel-price-row">⛽ <b>АИ-95:</b> ${s.prices.ai95} ₽</div>
                <div class="fuel-price-row">⛽ <b>АИ-92:</b> ${s.prices.ai92} ₽</div>
                <div class="fuel-price-row"> Diesel <b>ДТ:</b> ${s.prices.dt} ₽</div>
            `;
        } else {
            popupContent += `<div class="vip-locked-text">🔒 Цены скрыты. Нужен статус VIP.</div>`;
        }

        if (userLocationCoords) {
            popupContent += `<button class="route-build-btn" onclick="buildRouteToStation(${s.lat}, ${s.lon})">🗺️ Построить маршрут</button>`;
        }

        const marker = L.marker([s.lat, s.lon], { icon: createCustomIcon('#3b82f6') }).addTo(map).bindPopup(popupContent);
        mapMarkers.push(marker);

        marker.on('click', () => { handleStationTracking(s); });

        const div = document.createElement('div');
        div.className = 'station-card';
        div.innerHTML = isUserVip ? `<h4>${s.name}</h4><p>★ ${s.rating} | АИ-95: ${s.prices.ai95} ₽</p>` : `<h4>${s.name}</h4><p>★ ${s.rating} | 🔒 Цены скрыты</p>`;
        
        div.addEventListener('click', () => {
            closeSidebarDrawer();
            map.setView([s.lat, s.lon], 16); 
            marker.openPopup();
            handleStationTracking(s);
        });
        listContainer.appendChild(div);
    });
}

function handleStationTracking(stationObj) {
    stationsViewedCount++; 
    if (isUserAuthorized) {
        let userHist = historyDatabase[authorizedName.toLowerCase()] || [];
        userHist = userHist.filter(id => id !== stationObj.id);
        userHist.unshift(stationObj.id);
        if (userHist.length > 5) userHist.pop();
        historyDatabase[authorizedName.toLowerCase()] = userHist;
        localStorage.setItem('fuelMapUserHistories', JSON.stringify(historyDatabase));
        updateHistoryUI();
    }
    const currentTime = Date.now();
    const timeSinceLastAd = (currentTime - lastAdClosedTime) / 1000;
    if (stationsViewedCount % 2 === 0 && timeSinceLastAd >= 30) { triggerAd(); }
}

function buildRouteToStation(destLat, destLon) {
    if (!userLocationCoords) return;
    if (routingLine) map.removeLayer(routingLine);
    routingLine = L.polyline([userLocationCoords, [destLat, destLon]], { color: '#0284c7', weight: 5, opacity: 0.7, dashArray: '10, 10' }).addTo(map);
    map.fitBounds(routingLine.getBounds(), { padding: [50, 50] });
}

function closeSidebarDrawer() {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    sidebar.classList.remove('drawer-open');
    toggleBtn.classList.remove('control-shifted');
    toggleBtn.innerText = "☰ Меню АЗС";
}

function openSidebarDrawer() {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    sidebar.classList.add('drawer-open');
    toggleBtn.classList.add('control-shifted');
    toggleBtn.innerText = "✕ Скрыть";
}

function handleRealtimeSearch(queryText) {
    const cleanQuery = queryText.trim().toLowerCase();
    if (!cleanQuery) { renderInterface(stations); return; }
    const filtered = stations.filter(s => s.name.toLowerCase().includes(cleanQuery));
    renderInterface(filtered);
}

function updateHistoryUI() {
    const historyList = document.getElementById('history-list');
    if (!historyList || !isUserAuthorized) return;
    historyList.innerHTML = '';
    const userHistIds = historyDatabase[authorizedName.toLowerCase()] || [];
    if (userHistIds.length === 0) { historyList.innerHTML = '<li>Вы еще не просматривали АЗС</li>'; return; }
    userHistIds.forEach((id) => {
        const foundStation = stations.find(s => s.id === id);
        if (foundStation) {
            const li = document.createElement('li'); li.innerText = foundStation.name;
            li.addEventListener('click', () => {
                closeSidebarDrawer(); map.setView([foundStation.lat, foundStation.lon], 16);
                mapMarkers.forEach(m => { if (m.getLatLng().lat === foundStation.lat && m.getLatLng().lng === foundStation.lon) m.openPopup(); });
            });
            historyList.appendChild(li);
        }
    });
}

function switchScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(screen => screen.style.display = 'none');
    document.getElementById(screenId).style.display = 'flex';
    if (screenId === 'screen-main' && map) { setTimeout(() => { map.invalidateSize(); }, 50); }
}

function triggerAd() {
    if (isUserVip) return;
    const adModal = document.getElementById('ad-modal');
    const adBtn = document.getElementById('ad-close-btn');
    const adCloseCross = document.getElementById('close-ad');
    adBtn.disabled = true; adBtn.classList.add('disabled-ad-btn'); adCloseCross.style.display = 'none';
    let timeLeft = 3; adBtn.innerText = `Скрыть через ${timeLeft} сек...`;
    adModal.style.display = 'flex';
    if (adTimerInterval) clearInterval(adTimerInterval);
    adTimerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft > 0) adBtn.innerText = `Скрыть через ${timeLeft} сек...`;
        else { clearInterval(adTimerInterval); adBtn.disabled = false; adBtn.classList.remove('disabled-ad-btn'); adBtn.innerText = "Продолжить работу"; adCloseCross.style.display = 'inline'; }
    }, 1000);
}

function validateEmail(email) {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(String(email).toLowerCase());
}

function initApplicationEvents() {
    const sidebar = document.getElementById('app-sidebar');
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    const historyHeaderBtn = document.getElementById('history-btn');
    const searchInput = document.getElementById('search-input');
    
    toggleBtn.addEventListener('click', (e) => { 
        e.preventDefault(); 
        if (sidebar.classList.contains('drawer-open')) closeSidebarDrawer(); else openSidebarDrawer();
    });

    searchInput.addEventListener('input', (e) => { handleRealtimeSearch(e.target.value); });

    document.getElementById('brand-logo').addEventListener('click', (e) => { e.preventDefault(); window.location.reload(); });

    historyHeaderBtn.addEventListener('click', (e) => { 
        e.preventDefault(); switchScreen('screen-main'); openSidebarDrawer();
        const box = document.getElementById('history-box'); box.style.display = 'block'; updateHistoryUI(); 
    });

    const ratingSelect = document.getElementById('filter-rating-select');
    const priceSelect = document.getElementById('filter-price-select');

    ratingSelect.addEventListener('change', () => renderInterface(stations));
    priceSelect.addEventListener('change', () => {
        if (!isUserVip && priceSelect.value !== 'default') { alert("🔒 Доступ ограничен! Сортировка по стоимости топлива доступна только для пользователей со статусом VIP."); priceSelect.value = 'default'; return; }
        renderInterface(stations);
    });

    document.getElementById('footer-support-btn').addEventListener('click', (e) => { e.preventDefault(); switchScreen('screen-support'); });
    document.getElementById('footer-help-btn').addEventListener('click', (e) => { e.preventDefault(); switchScreen('screen-help'); });
    document.querySelectorAll('.back-to-map-btn').forEach(btn => { btn.addEventListener('click', () => { switchScreen('screen-main'); }); });

    const helpTabs = document.querySelectorAll('.help-menu-list li');
    helpTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            helpTabs.forEach(t => t.classList.remove('active-help-tab')); tab.classList.add('active-help-tab');
            document.querySelectorAll('.help-tab-content').forEach(content => content.style.display = 'none');
            document.getElementById(tab.dataset.target).style.display = 'block';
        });
    });

    document.getElementById('clear-history-btn').addEventListener('click', () => { if (isUserAuthorized) { historyDatabase[authorizedName.toLowerCase()] = []; localStorage.setItem('fuelMapUserHistories', JSON.stringify(historyDatabase)); updateHistoryUI(); if (routingLine) map.removeLayer(routingLine); renderInterface(stations); } });

    const profileBtn = document.getElementById('profile-btn');
    const shopBtn = document.getElementById('shop-btn');

    profileBtn.addEventListener('click', (e) => { 
        e.preventDefault(); 
        if (isUserAuthorized) { 
            document.getElementById('profile-user-name').innerText = authorizedName; 
            document.getElementById('profile-status-text').innerText = isUserVip ? "👑 VIP-Пользователь" : "Обычный аккаунт"; 
            document.getElementById('profile-modal').style.display = 'flex'; 
        } else { 
            document.getElementById('login-modal').style.display = 'flex'; 
        } 
    });

    document.getElementById('go-to-register').addEventListener('click', () => {
        document.getElementById('login-modal').style.display = 'none';
        document.getElementById('auth-modal').style.display = 'flex';
    });
    document.getElementById('go-to-login').addEventListener('click', () => {
        document.getElementById('auth-modal').style.display = 'none';
        document.getElementById('login-modal').style.display = 'flex';
    });

    // АВТОРИЗАЦИЯ
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;
        const userAccount = registeredAccounts[email];

        if (!userAccount) { alert("❌ Ошибка: Пользователь с таким e-mail не найден в системе!"); return; }
        if (userAccount.password !== password) { alert("❌ Ошибка: Введен неверный пароль!"); return; }

        isUserAuthorized = true;
        authorizedName = userAccount.name;
        localStorage.setItem('fuelMapCurrentSession', authorizedName);

        document.getElementById('login-modal').style.display = 'none';
        profileBtn.innerText = `👤 Профиль`;
        historyHeaderBtn.style.display = 'inline-block';

        isUserVip = vipUsersDatabase[authorizedName.toLowerCase()] || false; 
        if (isUserVip) { shopBtn.innerText = '👑 VIP'; shopBtn.className = 'nav-item-btn vip-active-status'; } 
        else { shopBtn.innerText = 'Магазин (VIP)'; shopBtn.className = 'nav-item-btn'; }

        renderInterface(stations);
        updateHistoryUI();
        alert(`🔓 Авторизация успешна! С возвращением, ${authorizedName}.`);
    });

    // РЕГИСТРАЦИЯ С ФИКСИРОВАННОЙ ЗАЩИТОЙ ДУБЛИКАТОВ ИМЕН И VIP-СТАТУСОВ
    document.getElementById('register-form').addEventListener('submit', (e) => { 
        e.preventDefault(); 
        const name = document.getElementById('reg-name').value.trim();
        const email = document.getElementById('reg-email').value.trim().toLowerCase();
        const password = document.getElementById('reg-password').value;

        if (!validateEmail(email)) { alert("❌ Ошибка: Введен некорректный адрес электронной почты!"); return; }
        if (password.length < 6 || password.length > 12) { alert("❌ Ошибка: Пароль должен содержать от 6 до 12 символов!"); return; }
        if (registeredAccounts[email]) { alert(`❌ Ошибка: Пользователь с адресом ${email} уже зарегистрирован!`); return; }

        // ИНЖЕНЕРНЫЙ ФИКС: Проверка уникальности имени (никнейма) по всей базе данных
        const isNameTaken = Object.values(registeredAccounts).some(account => account.name.toLowerCase() === name.toLowerCase());
        if (isNameTaken) {
            alert(`❌ Ошибка: Никнейм "${name}" уже занят другим пользователем! Выберите другое имя.`);
            return;
        }

        registeredAccounts[email] = { name: name, password: password };
        localStorage.setItem('fuelMapAccounts', JSON.stringify(registeredAccounts));

        isUserAuthorized = true; 
        authorizedName = name; 
        localStorage.setItem('fuelMapCurrentSession', authorizedName);

        document.getElementById('auth-modal').style.display = 'none'; 
        profileBtn.innerText = `👤 Профиль`; 
        historyHeaderBtn.style.display = 'inline-block'; 
        
        isUserVip = vipUsersDatabase[authorizedName.toLowerCase()] || false; 
        if (isUserVip) { shopBtn.innerText = '👑 VIP'; shopBtn.className = 'nav-item-btn vip-active-status'; } 
        else { shopBtn.innerText = 'Магазин (VIP)'; shopBtn.className = 'nav-item-btn'; } 
        
        renderInterface(stations); 
        updateHistoryUI(); 
        alert(`🎉 Регистрация успешна! Добро пожаловать, ${authorizedName}.`);
    });
    
    // РУЧНОЙ ВЫХОД
    document.getElementById('logout-btn').addEventListener('click', () => { 
        isUserAuthorized = false; authorizedName = ""; isUserVip = false; userLocationCoords = null; 
        localStorage.removeItem('fuelMapCurrentSession');

        document.getElementById('profile-modal').style.display = 'none'; 
        profileBtn.innerText = "Войти"; 
        shopBtn.innerText = 'Магазин (VIP)'; shopBtn.className = 'nav-item-btn'; 
        
        historyHeaderBtn.style.display = 'none'; 
        document.getElementById('history-box').style.display = 'none'; 
        
        ratingSelect.value = 'default'; priceSelect.value = 'default'; 
        if (routingLine) map.removeLayer(routingLine); 
        renderInterface(stations); 
        alert("Вы успешно вышли из системы.");
    });

    shopBtn.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('shop-modal').style.display = 'flex'; });
    document.getElementById('buy-vip-btn').addEventListener('click', () => { if (!isUserAuthorized) { alert("Пожалуйста, сначала авторизуйтесь под своим аккаунтом!"); document.getElementById('shop-modal').style.display = 'none'; document.getElementById('login-modal').style.display = 'flex'; return; } isUserVip = true; vipUsersDatabase[authorizedName.toLowerCase()] = true; localStorage.setItem('fuelMapVipUsers', JSON.stringify(vipUsersDatabase)); document.getElementById('shop-modal').style.display = 'none'; shopBtn.innerText = '👑 VIP'; shopBtn.className = 'nav-item-btn vip-active-status'; renderInterface(stations); });

    document.querySelectorAll('#close-ad, #ad-close-btn').forEach(el => el.addEventListener('click', () => { document.getElementById('ad-modal').style.display = 'none'; lastAdClosedTime = Date.now(); if (adTimerInterval) clearInterval(adTimerInterval); }));
    document.getElementById('close-auth').addEventListener('click', () => { document.getElementById('auth-modal').style.display = 'none'; });
    document.getElementById('close-login').addEventListener('click', () => { document.getElementById('login-modal').style.display = 'none'; });
    document.getElementById('close-profile').addEventListener('click', () => { document.getElementById('profile-modal').style.display = 'none'; });
    document.getElementById('close-shop').addEventListener('click', () => { document.getElementById('shop-modal').style.display = 'none'; });
}

window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) { e.target.style.display = 'none'; if (e.target.id === 'ad-modal' && !document.getElementById('ad-close-btn').disabled) { lastAdClosedTime = Date.now(); if (adTimerInterval) clearInterval(adTimerInterval); } } });
window.addEventListener('resize', () => { if (map) { let vh = window.innerHeight * 0.01; document.documentElement.style.setProperty('--vh', `${vh}px`); map.invalidateSize(); } });