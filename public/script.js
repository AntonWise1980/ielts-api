
// Search function
document.getElementById('searchInput').addEventListener('input', function(e) {
    // Sadece harf bırak, diğerlerini sil
    this.value = this.value.replace(/[^a-zA-Z]/g, '');
    
    // Eğer silinen karakter varsa küçük bir ipucu göster (opsiyonel)
    if (this.value !== e.target.value) {
        // Kısa süreli ipucu gösterebilirsin ama şimdilik basit tutalım
    }
});

document.getElementById('searchBtn').addEventListener('click', searchWord);
document.getElementById('searchInput').addEventListener('keypress', function(e) {
if (e.key === 'Enter') searchWord();
        });
async function searchWord() {
const searchInput = document.getElementById('searchInput');
const word = searchInput.value.trim();
// Empty check
if (!word) {
showError('Please enter a word!');
return;
            }
// Show loading
document.getElementById('searchBtn').textContent = 'Searching...';
document.getElementById('searchBtn').disabled = true;
try {
const response = await fetch(`/api/data?search=${encodeURIComponent(word)}`);
if (response.ok) {
const data = await response.json();
showResult(data);
                } else if (response.status === 404) {
showError(`"${word}" word not found.`);
                } else if (response.status === 400) {
const errorData = await response.json();
showError(errorData.message);
                } else {
showError('An error occurred. Please try again.');
                }
            } catch (error) {
showError('Connection error! Is the server running?');
            } finally {
// Reset button
document.getElementById('searchBtn').textContent = 'Search';
document.getElementById('searchBtn').disabled = false;
            }
        }
function showResult(data) {
// Hide error and result sections
hideError();
document.getElementById('resultSection').style.display = 'block';
// Show the word
document.getElementById('resultWord').textContent = data.word;
// Synonyms
const synonyms = data.synonyms || 'None';
document.getElementById('synonymsList').innerHTML =
Array.isArray(synonyms) ? synonyms.join(', ') : synonyms;
// Antonyms
const antonyms = data.antonyms || 'None';
document.getElementById('antonymsList').innerHTML =
Array.isArray(antonyms) ? antonyms.join(', ') : antonyms;
        }
function showError(message) {
hideResult();
const errorDiv = document.getElementById('errorMessage');
errorDiv.textContent = message;
errorDiv.style.display = 'block';
        }
function hideError() {
document.getElementById('errorMessage').style.display = 'none';
        }
function hideResult() {
document.getElementById('resultSection').style.display = 'none';
        }
