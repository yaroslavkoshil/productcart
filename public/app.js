document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-btn');
    const promTokenInput = document.getElementById('prom-token');
    const geminiTokenInput = document.getElementById('gemini-token');

    // Load saved tokens if any
    const savedProm = localStorage.getItem('promToken');
    const savedGemini = localStorage.getItem('geminiToken');
    
    if (savedProm) promTokenInput.value = savedProm;
    if (savedGemini) geminiTokenInput.value = savedGemini;

    connectBtn.addEventListener('click', () => {
        const promToken = promTokenInput.value.trim();
        const geminiToken = geminiTokenInput.value.trim();

        if (!promToken || !geminiToken) {
            alert('Будь ласка, введіть обидва токени.');
            return;
        }

        // Save tokens locally
        localStorage.setItem('promToken', promToken);
        localStorage.setItem('geminiToken', geminiToken);

        // TODO: Validate tokens and load products
        console.log('Connecting...');
        alert('Дані збережено! Підключення до API...');
    });
});
