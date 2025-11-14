// Add real-time input validation to allow only letters in the search field
document.getElementById('searchInput').addEventListener('input', function(e) {
    // Keep only alphabetic characters, remove everything else
    this.value = this.value.replace(/[^a-zA-Z]/g, '');
});
// Trigger search when the search button is clicked
document.getElementById('searchBtn').addEventListener('click', searchWord);
// Allow pressing Enter key in the input field to trigger search
document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchWord();
    }
});
// Perform asynchronous word search via API
async function searchWord() {
    const searchInput = document.getElementById('searchInput');
    const word = searchInput.value.trim();

    document.getElementById('searchBtn').textContent = 'Aranıyor...';
    document.getElementById('searchBtn').disabled = true;

    try {
        const response = await fetch(`/api/data?search=${encodeURIComponent(word)}`);
        const data = await response.json();

        if (response.ok) {
            if (word) {
                // Kelime girildiyse → normal sonuç göster, JSON kutusunu sil
                const jsonBox = document.getElementById('rawJsonSection');
                if (jsonBox) jsonBox.remove();
                showResult(data);
            } else {
                // Boş arama → yeni rastgele JSON göster
                showRawJsonResponse(data);
            }
        } else if (response.status === 404) {
            showError(`"${word}" kelimesi bulunamadı.`);
        } else {
            showError('Bir hata oluştu. Lütfen tekrar deneyin.');
        }
    } catch (error) {
        showError('Bağlantı hatası! Sunucu çalışıyor mu?');
    } finally {
        document.getElementById('searchBtn').textContent = 'Ara';
        document.getElementById('searchBtn').disabled = false;
    }
}
// Display search results including word, synonyms, and antonyms
function showResult(data) {
    // Hide any existing error message
    hideError();
    // Show the result section
    document.getElementById('resultSection').style.display = 'block';
    // Display the searched word
    document.getElementById('resultWord').textContent = data.word;

    // YENİ: synonyms her zaman array olsun
    const synonyms = Array.isArray(data.synonyms) ? data.synonyms : [];
    document.getElementById('synonymsList').innerHTML = synonyms.length > 0 ? synonyms.join(', ') : 'None';

    // YENİ: antonyms aktif hale getirildi
    const antonyms = Array.isArray(data.antonyms) ? data.antonyms : [];
    document.getElementById('antonymsList').innerHTML = antonyms.length > 0 ? antonyms.join(', ') : 'None';
}

// API'den gelen ham JSON'u siyah-yeşil terminal tarzında göster
function showRawJsonResponse(data) {
    // Eski kutuyu her zaman temizle
    const existing = document.getElementById('rawJsonSection');
    if (existing) existing.remove();

    const rawDiv = document.createElement('div');
    rawDiv.id = 'rawJsonSection';
    rawDiv.className = 'raw-json-section';

    const prettyJson = JSON.stringify(data, null, 2);
    const highlighted = prettyJson
        .replace(/"([^"]+)":/g, '<span class="key">"$1"</span>:')
        .replace(/"([^"]*)"/g, '<span class="string">"$1"</span>')
        .replace(/(\d+)/g, '<span class="number">$1</span>')
        .replace(/(true|false|null)/g, '<span class="boolean">$1</span>');

    rawDiv.innerHTML = `
        <div class="raw-header">
            <span>API Response (Raw JSON)</span>
        </div>
        <pre><code>${highlighted}</code></pre>
    `;

    // Container'ın en altına ekle
    document.querySelector('.container').appendChild(rawDiv);

    // Scroll'u hafif aşağı kaydır ki kutu gözüksün
    setTimeout(() => {
        rawDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}


// Rastgele kelimeyi siyah zemin + yeşil yazı ile göster
function showRandomResult(data) {
    // Eski rastgele sonucu temizle (varsa)
    const existing = document.getElementById('randomResultSection');
    if (existing) existing.remove();

    // Yeni bölüm oluştur
    const randomDiv = document.createElement('div');
    randomDiv.id = 'randomResultSection';
    randomDiv.className = 'random-result-section';

    // İçerik
    randomDiv.innerHTML = `
        <h3>Rastgele Kelime: ${data.word}</h3>
        <div class="random-data">
            <div><strong>Eş Anlamlılar:</strong> ${Array.isArray(data.synonyms) && data.synonyms.length > 0 ? data.synonyms.join(', ') : 'Yok'}</div>
            <div><strong>Zıt Anlamlılar:</strong> ${Array.isArray(data.antonyms) && data.antonyms.length > 0 ? data.antonyms.join(', ') : 'Yok'}</div>
        </div>
    `;

    // Ana container'a ekle
    document.querySelector('.container').appendChild(randomDiv);
}



// Show an error message in the UI
function showError(message) {
    // Hide any previous result
    hideResult();
    // Update and display the error message
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}
// Hide the error message from the UI
function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}
// Hide the result section from the UI
function hideResult() {
    document.getElementById('resultSection').style.display = 'none';
}

// Sayfa yüklendiğinde otomatik rastgele JSON göster
window.addEventListener('DOMContentLoaded', async () => {
    await fetchRandomOnLoad();
});

// Sayfa açıldığında rastgele kelime getir (ham JSON)
async function fetchRandomOnLoad() {
    try {
        const response = await fetch('/api/data'); // search parametresi yok → rastgele
        if (response.ok) {
            const data = await response.json();
            showRawJsonResponse(data); // Ham JSON'u göster
        }
    } catch (error) {
        console.warn('Otomatik rastgele yüklenemedi:', error);
        // Hata olursa sessiz kal, kullanıcı fark etmez
    }
}