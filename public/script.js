
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

    // Validate that a word has been entered
    if (!word) {
        showError('Please enter a word!');
        return;
    }

    // Update button to show loading state
    document.getElementById('searchBtn').textContent = 'Searching...';
    document.getElementById('searchBtn').disabled = true;

    try {
        // Fetch data from the server using the search term
        const response = await fetch(`/api/data?search=${encodeURIComponent(word)}`);

        if (response.ok) {
            // Successfully received data, parse and display
            const data = await response.json();
            showResult(data);
        } else if (response.status === 404) {
            // Word not found in the database
            showError(`"${word}" word not found.`);
        } else if (response.status === 400) {
            // Bad request, show server-provided error message
            const errorData = await response.json();
            showError(errorData.message);
        } else {
            // Handle other HTTP errors
            showError('An error occurred. Please try again.');
        }
    } catch (error) {
        // Handle network or other unexpected errors
        showError('Connection error! Is the server running?');
    } finally {
        // Always reset the button state after operation completes
        document.getElementById('searchBtn').textContent = 'Search';
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

    // Display synonyms (fallback to 'None' if not available)
    const synonyms = data.synonyms || 'None';
    document.getElementById('synonymsList').innerHTML = 
        Array.isArray(synonyms) ? synonyms.join(', ') : synonyms;

    // Display antonyms (fallback to 'None' if not available)
    const antonyms = data.antonyms || 'None';
    document.getElementById('antonymsList').innerHTML = 
        Array.isArray(antonyms) ? antonyms.join(', ') : antonyms;
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
