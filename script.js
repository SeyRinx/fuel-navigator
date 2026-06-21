// Глобальное состояние приложения
let isUserVip = false;
let isUserAuthorized = false;
let authorizedName = "";
let map = null; 

// Локальные базы данных в localStorage
let vipUsersDatabase = JSON.parse(localStorage.getItem('fuelMapVipUsers')) || {}; 
let historyDatabase = JSON.parse(localStorage.getItem('fuelMapUserHistories')) || {}; 

// Спутниковая точная база координат Майкопа [Широта, Долгота]
const cityAddresses = {
    "краснооктябрьская 20": [44.608332, 40.106201],
    "краснооктябрьская": [44.606621, 40.101732],    // Площадь Ленина
    "пионерская 150": [44.602741, 40.096711],
    "пионерская": [44.601112, 40.111423],
    "гагарина 34": [44.615211, 40.118934],
    "гагарина": [44.611421, 40.123211],
    "хакурате 200": [44.611143, 40.101242],
    "пролетарская 2": [44.600121, 40.141512],
    "чкалова 65": [44.619512, 40.091011]
};

// Реальные АЗС Майкопа
const stations = [
    { name: "Лукойл (ул. Хакурате / ул. Юннатов)", lat: 44.613312, lon: 40.081123, rating: 4.8, prices: { ai95: "56.40", ai92: "51.20", dt: "60.10" } },
    { name: "Роснефть (ул. Пролетарская / ул. Шесхарис)", lat: 44.594721, lon: 40.124812, rating: 4.5, prices: { ai95: "55.90", ai92: "50.80", dt: "59.50" } },
    { name: "Газпром (ул. Димитрова / Черемушки)", lat: 44.619511, lon: 40.082231, rating: 4.9, prices: { ai95: "56.10", ai92: "51.00", dt: "59.90" } },
    { name: "АЗС ТНС (ул. Пионерская / Квалитет)", lat: 44.601211, lon: 40.134512, rating: 4.2, prices: { ai95: "54.80", ai92: "49.90", dt: "58.20" } },
    { name: "ЭкоТоп (ул. Хакурате / на Белореченск)", lat: 44.614123, lon: 40.060112, rating: 4.0, prices: { ai95: "53.90", ai92: "48.50", dt: "57.00" } },
    { name: "Лукойл (ул. Курганная / Кожзавод)", lat: 44.588211, lon: 40.104121, rating: 4.7, prices: { ai95: "56.30", ai92: "51.10", dt: "60.05" } }
];

let mapMarkers = [];
let searchMarker = null; 
let userLocationMarker = null;

// Генерация SVG-маркеров
function createCustomIcon(color) {
    return L.divIcon({
        className: 'custom-svg-icon',
        html: `<svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.71573 23.2843 0 15 0ZM15 20.25C12.1005 20.25 9.75 18.3995 9.75 15.5C9.75 12.6005 12.1005 10.25 15 10.25C17.8995 10.25 20.25 12.6005 20.25 15.5C20.25 18.3995 17.8995 20.25 15 20.25Z" fill="${color}"/>
        </svg>`,
        iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -40]
    });
}

window.onload = function() {
    map = L.map('map', { zoomControl: true }).setView([44.606621, 40.101732], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);

    setTimeout(() => { map.invalidateSize(); }, 400);

    const geoBtn = document.createElement('button');
    geoBtn.className = 'geo-btn'; geoBtn.innerText = '📍 Найти меня';
    document.getElementById('map').appendChild(geoBtn);

    geoBtn.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const userLat = position.coords.latitude; const userLon = position.coords.longitude;
                    if (userLocationMarker) map.removeLayer(userLocationMarker);
                    userLocationMarker = L.marker([userLat, userLon], { icon: createCustomIcon('#10b981') }).addTo(map).bindPopup("<b>Вы здесь!</b>").openPopup();
                    map.setView([userLat, userLon], 16);
                },
                () => {
                    alert("📍 На ПК отсутствует GPS. Имитируем определение местоположения по сетевой вышке на ул. Краснооктябрьская.");
                    if (userLocationMarker) map.removeLayer(userLocationMarker);
                    userLocationMarker = L.marker([44.607201, 40.103112], { icon: createCustomIcon('#10b981') }).addTo(map).bindPopup("<b>Ваше примерное местоположение</b><br>ул. Краснооктябрьская").openPopup();
                    map.setView([44.607201, 40.103112], 16);
                }
            );
        }
    });

    renderInterface();
    updateHistoryUI();
    initApplicationEvents();
};

// Рендеринг заправок
function renderInterface() {
    if (!map) return;
    const listContainer = document.getElementById('station-list');
    listContainer.innerHTML = ''; 
    
    mapMarkers.forEach(m => map.removeLayer(m));
    mapMarkers = [];

    let displayStations = [...stations];

    const ratingSortOrder = document.getElementById('filter-rating-select').value;
    const priceSortOrder = document.getElementById('filter-price-select').value;

    if (ratingSortOrder === 'desc') {
        displayStations.sort((a, b) => b.rating - a.rating); 
    } else if (ratingSortOrder === 'asc') {
        displayStations.sort((a, b) => a.rating - b.rating); 
    }
    
    if (priceSortOrder === 'asc' && isUserVip) {
        displayStations.sort((a, b) => parseFloat(a.prices.ai95) - parseFloat(b.prices.ai95));
    }

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

        const marker = L.marker([s.lat, s.lon], { icon: createCustomIcon('#3b82f6') }).addTo(map).bindPopup(popupContent);
        mapMarkers.push(marker);

        const div = document.createElement('div');
        div.className = 'station-card';
        div.innerHTML = isUserVip ? `<h4>${s.name}</h4><p>★ ${s.rating} | АИ-95: ${s.prices.ai95} ₽</p>` : `<h4>${s.name}</h4><p>★ ${s.rating} | 🔒 Цены скрыты</p>`;
        
        div.addEventListener('click', () => {
            switchScreen('screen-main'); 
            map.setView([s.lat, s.lon], 16); 
            marker.openPopup();
        });
        listContainer.appendChild(div);
    });
}

// Поиск адреса
function executeSearch(address) {
    const cleanAddress = address.trim().toLowerCase();
    if (!cleanAddress || !map) return;

    let coords = cityAddresses[cleanAddress];
    if (!coords) {
        const foundKey = Object.keys(cityAddresses).find(key => cleanAddress.includes(key));
        coords = foundKey ? cityAddresses[foundKey] : [44.606621, 40.101732]; 
    }

    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker(coords, { icon: createCustomIcon('#ef4444') }).addTo(map).bindPopup(`<b>Искомый адрес:</b><br>${address}`).openPopup();
    map.setView(coords, 16); 

    if (isUserAuthorized) {
        let userHist = historyDatabase[authorizedName.toLowerCase()] || [];
        if (!userHist.includes(address)) {
            userHist.unshift(address);
            if (userHist.length > 5) userHist.pop();
            historyDatabase[authorizedName.toLowerCase()] = userHist;
            localStorage.setItem('fuelMapUserHistories', JSON.stringify(historyDatabase));
            updateHistoryUI();
        }
    }
    triggerAd();
}

function updateHistoryUI() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return; historyList.innerHTML = '';
    if (!isUserAuthorized) { historyList.innerHTML = '<li>Войдите, чтобы сохранять историю.</li>'; return; }
    currentHistory = historyDatabase[authorizedName.toLowerCase()] || [];
    currentHistory.forEach((address) => {
        const li = document.createElement('li'); li.innerText = address;
        li.addEventListener('click', () => { document.getElementById('search-input').value = address; executeSearch(address); });
        historyList.appendChild(li);
    });
}

function switchScreen(screenId) {
    document.querySelectorAll('.app-screen').forEach(screen => screen.style.display = 'none');
    document.getElementById(screenId).style.display = 'flex';
    if (screenId === 'screen-main' && map) {
        setTimeout(() => { map.invalidateSize(); }, 50);
    }
}

// Привязка всех событий
function initApplicationEvents() {
    const ratingSelect = document.getElementById('filter-rating-select');
    const priceSelect = document.getElementById('filter-price-select');

    ratingSelect.addEventListener('change', renderInterface);
    priceSelect.addEventListener('change', () => {
        if (!isUserVip && priceSelect.value !== 'default') {
            alert("🔒 Доступ ограничен! Сортировка по стоимости топлива доступна только для пользователей со статусом VIP. Пожалуйста, активируйте VIP в Магазине.");
            priceSelect.value = 'default';
            return;
        }
        renderInterface();
    });

    document.getElementById('footer-support-btn').addEventListener('click', (e) => { e.preventDefault(); switchScreen('screen-support'); });
    document.getElementById('footer-help-btn').addEventListener('click', (e) => { e.preventDefault(); switchScreen('screen-help'); });
    document.getElementById('brand-logo').addEventListener('click', (e) => { e.preventDefault(); switchScreen('screen-main'); });

    document.querySelectorAll('.back-to-map-btn').forEach(btn => {
        btn.addEventListener('click', () => { switchScreen('screen-main'); });
    });

    const helpTabs = document.querySelectorAll('.help-menu-list li');
    helpTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            helpTabs.forEach(t => t.classList.remove('active-help-tab'));
            tab.classList.add('active-help-tab');
            document.querySelectorAll('.help-tab-content').forEach(content => content.style.display = 'none');
            document.getElementById(tab.dataset.target).style.display = 'block';
        });
    });

    document.getElementById('search-btn').addEventListener('click', () => { executeSearch(document.getElementById('search-input').value); });
    document.getElementById('history-btn').addEventListener('click', (e) => { e.preventDefault(); const box = document.getElementById('history-box'); box.style.display = box.style.display === 'none' ? 'block' : 'none'; updateHistoryUI(); });
    document.getElementById('clear-history-btn').addEventListener('click', () => { if (isUserAuthorized) { historyDatabase[authorizedName.toLowerCase()] = []; localStorage.setItem('fuelMapUserHistories', JSON.stringify(historyDatabase)); updateHistoryUI(); if (searchMarker) map.removeLayer(searchMarker); } });

    const profileBtn = document.getElementById('profile-btn');
    const shopBtn = document.getElementById('shop-btn');

    profileBtn.addEventListener('click', (e) => { e.preventDefault(); if (isUserAuthorized) { document.getElementById('profile-user-name').innerText = authorizedName; document.getElementById('profile-status-text').innerText = isUserVip ? "👑 VIP-Пользователь" : "Обычный аккаунт"; document.getElementById('profile-modal').style.display = 'flex'; } else { document.getElementById('auth-modal').style.display = 'flex'; } });
    document.getElementById('register-form').addEventListener('submit', (e) => { e.preventDefault(); isUserAuthorized = true; authorizedName = document.getElementById('reg-name').value.trim(); document.getElementById('auth-modal').style.display = 'none'; profileBtn.innerText = `👤 ${authorizedName}`; isUserVip = vipUsersDatabase[authorizedName.toLowerCase()] || false; if (isUserVip) { shopBtn.innerText = '👑 VIP АКТИВЕН'; shopBtn.className = 'vip-active-status'; } else { shopBtn.innerText = 'Магазин (VIP)'; shopBtn.className = ''; } renderInterface(); updateHistoryUI(); alert(`Добро пожаловать, ${authorizedName}!`); });
    document.getElementById('logout-btn').addEventListener('click', () => { isUserAuthorized = false; authorizedName = ""; isUserVip = false; document.getElementById('profile-modal').style.display = 'none'; profileBtn.innerText = "Профиль"; shopBtn.innerText = 'Магазин (VIP)'; shopBtn.className = ''; document.getElementById('history-box').style.display = 'none'; ratingSelect.value = 'default'; priceSelect.value = 'default'; if (searchMarker) map.removeLayer(searchMarker); if (userLocationMarker) map.removeLayer(userLocationMarker); renderInterface(); alert("Вы вышли из системы. VIP-привилегии приостановлены."); });

    shopBtn.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('shop-modal').style.display = 'flex'; });
    document.getElementById('buy-vip-btn').addEventListener('click', () => { if (!isUserAuthorized) { alert("Ошибка! Активация VIP недоступна. Пожалуйста, сначала пройдите регистрацию в меню «Профиль»!"); document.getElementById('shop-modal').style.display = 'none'; document.getElementById('auth-modal').style.display = 'flex'; return; } isUserVip = true; vipUsersDatabase[authorizedName.toLowerCase()] = true; localStorage.setItem('fuelMapVipUsers', JSON.stringify(vipUsersDatabase)); document.getElementById('shop-modal').style.display = 'none'; shopBtn.innerText = '👑 VIP АКТИВЕН'; shopBtn.className = 'vip-active-status'; renderInterface(); alert("Поздравляем! VIP успешно привязан к вашему аккаунту. Реклама отключена."); });

    document.getElementById('close-auth').addEventListener('click', () => { document.getElementById('auth-modal').style.display = 'none'; });
    document.getElementById('close-profile').addEventListener('click', () => { document.getElementById('profile-modal').style.display = 'none'; });
    document.getElementById('close-shop').addEventListener('click', () => { document.getElementById('shop-modal').style.display = 'none'; });
    document.getElementById('close-ad').addEventListener('click', () => { document.getElementById('ad-modal').style.display = 'none'; });
    document.getElementById('ad-close-btn').addEventListener('click', () => { document.getElementById('ad-modal').style.display = 'none'; });
}

function triggerAd() { if (isUserVip) return; document.getElementById('ad-modal').style.display = 'flex'; }
setTimeout(() => { triggerAd(); }, 15000);

window.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay')) { e.target.style.display = 'none'; } });