// MULTANI SMM VIP - Customer App Logic

let currentUser = null;
let allServicesData = [];

document.addEventListener('DOMContentLoaded', async () => {
    // Check active session
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        showAppDashboard();
    } else {
        showAuthScreen();
    }
});

function toggleAuth() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    loginForm.classList.toggle('hidden');
    registerForm.classList.toggle('hidden');
}

async function handleRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    if (!name || !email || !password) {
        alert('Please fill in all fields.');
        return;
    }

    const { data, error } = await _supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: { full_name: name }
        }
    });

    if (error) {
        alert('Registration Error: ' + error.message);
    } else {
        alert('Registration successful! Please login.');
        toggleAuth();
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
        alert('Please enter email and password.');
        return;
    }

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        alert('Login Error: ' + error.message);
    } else {
        currentUser = data.user;
        showAppDashboard();
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    currentUser = null;
    showAuthScreen();
}

function showAuthScreen() {
    document.getElementById('auth-section').classList.remove('hidden');
    document.getElementById('app-section').classList.add('hidden');
}

async function showAppDashboard() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    document.getElementById('user-email-display').innerText = currentUser.email;

    await fetchUserProfile();
    await loadCategoriesAndServices();
    await fetchUserOrders();
}

async function fetchUserProfile() {
    const { data, error } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (data) {
        document.getElementById('user-balance').innerText = `PKR ${parseFloat(data.balance).toFixed(2)}`;
        document.getElementById('stat-balance').innerText = `PKR ${parseFloat(data.balance).toFixed(2)}`;
    }
}

function switchTab(tabName, event) {
    if (event) event.preventDefault();
    
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.nav-links a').forEach(link => link.classList.remove('active'));

    // Show selected tab
    document.getElementById(`tab-${tabName}`).classList.remove('hidden');
    if (event && event.target) event.target.classList.add('active');

    // Update title
    const titles = {
        'dashboard': 'Dashboard',
        'new-order': 'Place New Order',
        'orders': 'Order History',
        'add-funds': 'Add Funds (PKR)',
        'services': 'Services List',
        'tickets': 'Support Tickets'
    };
    document.getElementById('page-title').innerText = titles[tabName] || 'Dashboard';
}

async function loadCategoriesAndServices() {
    // Fetch Categories
    const { data: categories } = await _supabase.from('service_categories').select('*').order('sort_order');
    const catSelect = document.getElementById('order-category');
    catSelect.innerHTML = '<option value="">Select Category</option>';
    if (categories) {
        categories.forEach(cat => {
            catSelect.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });
    }

    // Fetch Services
    const { data: services } = await _supabase.from('services').select('*, service_categories(name)').eq('is_active', true);
    if (services) {
        allServicesData = services;
        const servicesTable = document.getElementById('services-table-body');
        servicesTable.innerHTML = '';
        services.forEach(srv => {
            servicesTable.innerHTML += `
                <tr>
                    <td>${srv.id}</td>
                    <td>${srv.name}</td>
                    <td>PKR ${srv.rate}</td>
                    <td>${srv.min} / ${srv.max}</td>
                </tr>
            `;
        });
    }
}

function loadServicesForCategory() {
    const catId = document.getElementById('order-category').value;
    const srvSelect = document.getElementById('order-service');
    srvSelect.innerHTML = '<option value="">Select Service</option>';

    const filtered = allServicesData.filter(s => s.category_id == catId);
    filtered.forEach(s => {
        srvSelect.innerHTML += `<option value="${s.id}">${s.name} (PKR ${s.rate}/1k)</option>`;
    });
}

function updateServiceDetails() {
    const srvId = document.getElementById('order-service').value;
    const infoBox = document.getElementById('service-info-box');
    if (!srvId) {
        infoBox.classList.add('hidden');
        return;
    }

    const service = allServicesData.find(s => s.id == srvId);
    if (service) {
        infoBox.classList.remove('hidden');
        infoBox.innerHTML = `<strong>Description:</strong> ${service.description || 'No description'}<br><strong>Min:</strong> ${service.min} | <strong>Max:</strong> ${service.max}`;
    }
}

function calculateTotalCharge() {
    const srvId = document.getElementById('order-service').value;
    const qty = document.getElementById('order-quantity').value;
    if (!srvId || !qty) {
        document.getElementById('order-total-price').innerText = 'PKR 0.00';
        return;
    }

    const service = allServicesData.find(s => s.id == srvId);
    if (service) {
        const total = (service.rate * qty) / 1000;
        document.getElementById('order-total-price').innerText = `PKR ${total.toFixed(2)}`;
    }
}

async function submitOrder() {
    const srvId = document.getElementById('order-service').value;
    const link = document.getElementById('order-link').value.trim();
    const qty = parseInt(document.getElementById('order-quantity').value);

    if (!srvId || !link || !qty) {
        alert('Please fill in all order fields.');
        return;
    }

    const service = allServicesData.find(s => s.id == srvId);
    if (qty < service.min || qty > service.max) {
        alert(`Quantity must be between ${service.min} and ${service.max}`);
        return;
    }

    const charge = (service.rate * qty) / 1000;

    // Call Supabase or Edge Function to place order
    const { data, error } = await _supabase.from('orders').insert([
        { user_id: currentUser.id, service_id: service.id, link: link, quantity: qty, charge: charge, status: 'Pending' }
    ]);

    if (error) {
        alert('Order Error: ' + error.message);
    } else {
        alert('Order placed successfully!');
        document.getElementById('order-link').value = '';
        document.getElementById('order-quantity').value = '';
        document.getElementById('order-total-price').innerText = 'PKR 0.00';
        fetchUserProfile();
        fetchUserOrders();
    }
}

async function fetchUserOrders() {
    const { data: orders } = await _supabase
        .from('orders')
        .select('*, services(name)')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

    const tbody = document.getElementById('orders-table-body');
    tbody.innerHTML = '';
    if (orders && orders.length > 0) {
        orders.forEach(ord => {
            tbody.innerHTML += `
                <tr>
                    <td>${ord.id.slice(0, 8)}...</td>
                    <td>${ord.services ? ord.services.name : 'Service'}</td>
                    <td><a href="${ord.link}" target="_blank" style="color: var(--cyan);">Link</a></td>
                    <td>${ord.quantity}</td>
                    <td>PKR ${ord.charge}</td>
                    <td><span class="badge badge-warning">${ord.status}</span></td>
                    <td>${new Date(ord.created_at).toLocaleDateString()}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No orders found.</td></tr>';
    }
}

async function submitDeposit() {
    const method = document.getElementById('deposit-method').value;
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const tid = document.getElementById('deposit-tid').value.trim();

    if (!amount || !tid) {
        alert('Please enter amount and Transaction ID.');
        return;
    }

    const { error } = await _supabase.from('deposits').insert([
        { user_id: currentUser.id, amount: amount, payment_method: method, transaction_id: tid, status: 'Pending' }
    ]);

    if (error) {
        alert('Deposit Error: ' + error.message);
    } else {
        alert('Deposit request submitted successfully! Admin will verify soon.');
        document.getElementById('deposit-amount').value = '';
        document.getElementById('deposit-tid').value = '';
    }
}

async function submitTicket() {
    const subject = document.getElementById('ticket-subject').value.trim();
    const message = document.getElementById('ticket-message').value.trim();

    if (!subject || !message) {
        alert('Please fill in all ticket fields.');
    }

    const { error } = await _supabase.from('support_tickets').insert([
        { user_id: currentUser.id, subject: subject, message: message, status: 'Open' }
    ]);

    if (error) {
        alert('Ticket Error: ' + error.message);
    } else {
        alert('Support ticket submitted successfully!');
        document.getElementById('ticket-subject').value = '';
        document.getElementById('ticket-message').value = '';
    }
}
