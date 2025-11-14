// Add real-time input validation to allow only letters in the search field
document.getElementById('searchInput').addEventListener('input', function(e) {
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
                const jsonBox = document.getElementById('rawJsonSection');
                if (jsonBox) jsonBox.remove();
                showRawJsonResponse(data);
            } else {
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

// API'den gelen ham JSON'u siyah-yeşil terminal tarzında göster
// API'den gelen ham JSON'u siyah-yeşil terminal tarzında göster
function showRawJsonResponse(data) {
    const existing = document.getElementById('rawJsonSection');
    if (existing) existing.remove();

    const rawDiv = document.createElement('div');
    rawDiv.id = 'rawJsonSection';
    rawDiv.className = 'raw-json-section';

    const prettyJson = JSON.stringify(data, null, 2);

    // HTML entity'leri güvenli hale getir
    const escapedJson = prettyJson
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Syntax highlighting: Sadece değerleri renklendir, anahtarlara dokunma
    const highlighted = escapedJson
        .replace(/"([^"]+)":/g, '<span class="key">"</span><span class="key-value">$1</span><span class="key">"</span>:') // Anahtar
        .replace(/: ("[^"]*")/g, ': <span class="string">$1</span>') // String değerler
        .replace(/: (-?\d+\.?\d*)/g, ': <span class="number">$1</span>') // Sayılar
        .replace(/: (true|false|null)\b/g, ': <span class="boolean">$1</span>') // Boolean / null
        .replace(/(\[|\]|\{|\})/g, '<span class="bracket">$1</span>'); // Parantezler

    rawDiv.innerHTML = `
        <div class="raw-header">
            <span>API Response (Raw JSON)</span>
        </div>
        <pre><code>${highlighted}</code></pre>
    `;

    document.querySelector('.container').appendChild(rawDiv);

    setTimeout(() => {
        rawDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
}

// Show an error message in the UI
function showError(message) {
    hideError();
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    const jsonBox = document.getElementById('rawJsonSection');
    if (jsonBox) jsonBox.remove();
}

function hideError() {
    document.getElementById('errorMessage').style.display = 'none';
}

// Sayfa yüklendiğinde otomatik rastgele JSON göster
window.addEventListener('DOMContentLoaded', async () => {
    await fetchRandomOnLoad();
});

async function fetchRandomOnLoad() {
    try {
        const response = await fetch('/api/data');
        if (response.ok) {
            const data = await response.json();
            showRawJsonResponse(data);
        }
    } catch (error) {
        console.warn('Otomatik rastgele yüklenemedi:', error);
    }
}