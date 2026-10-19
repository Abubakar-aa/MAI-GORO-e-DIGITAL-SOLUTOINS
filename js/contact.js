// ============================================================
// MAI GORO — Frontend to Backend Contact Form Connector
// ============================================================
// This script intercepts the contact form submission and sends
// the data to your Node.js/Express backend API via fetch().

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const formStatus = document.getElementById('formStatus');
    const submitBtn = document.getElementById('submitBtn');

    if (!contactForm) return;

    // Dynamic API URL: works seamlessly on localhost and production domains (e.g. maigoro.com)
    const API_BASE = (window.location.protocol === 'file:' || (window.location.hostname === 'localhost' && window.location.port !== '5000'))
        ? 'http://localhost:5000/api'
        : '/api';
    const API_URL = `${API_BASE}/contact`;

    contactForm.addEventListener('submit', async (e) => {
        // 1. Prevent the default browser reload
        e.preventDefault();

        // 2. Clear any previous status message
        hideStatus();

        // 3. Extract user inputs from the form
        const formData = {
            name: contactForm.querySelector('input[name="name"]')?.value.trim(),
            email: contactForm.querySelector('input[name="email"]')?.value.trim(),
            subject: contactForm.querySelector('input[name="subject"]')?.value.trim(),
            phone: contactForm.querySelector('input[name="phone"]')?.value.trim(),
            message: contactForm.querySelector('textarea[name="message"]')?.value.trim()
        };

        // 4. Quick client-side check
        if (!formData.name || !formData.email || !formData.message) {
            showStatus('Please fill in all required fields (Name, Email, Message).', 'error');
            return;
        }

        // 5. Update button to show loading state
        const originalBtnHtml = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';

        try {
            // 6. Send the HTTP POST request to the backend server
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Success: Show confirmation and clear form fields
                showStatus(data.message || 'Thank you! Your message has been sent successfully.', 'success');
                contactForm.reset();
            } else {
                // Server returned validation error (400, etc.)
                showStatus(data.error || 'Failed to send message. Please try again.', 'error');
            }
        } catch (error) {
            console.error('Connection error:', error);
            // Network failure or backend server is not running
            showStatus(
                'Could not connect to the backend server. Make sure your server is running on http://localhost:5000.',
                'error'
            );
        } finally {
            // 7. Restore submit button
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    });

    function showStatus(message, type) {
        if (!formStatus) return;
        formStatus.textContent = message;
        formStatus.style.display = 'block';

        if (type === 'success') {
            formStatus.style.background = '#ecfdf5';
            formStatus.style.color = '#065f46';
            formStatus.style.border = '1px solid #a7f3d0';
        } else {
            formStatus.style.background = '#fef2f2';
            formStatus.style.color = '#991b1b';
            formStatus.style.border = '1px solid #fecaca';
        }
    }

    function hideStatus() {
        if (!formStatus) return;
        formStatus.style.display = 'none';
        formStatus.textContent = '';
    }
});
