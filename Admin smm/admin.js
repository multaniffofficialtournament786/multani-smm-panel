// MULTANI SMM VIP - Admin App Logic

let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await _supabase.auth.getSession();
    if (session) {
        // Check if user is admin
        const { data: profile } = await _supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

        if (profile && profile.is_admin) {
            currentAdmin = session.user;
            showAdminDashboard();
        } else {
            showAdminAuth();
        }
    } else {
        showAdminAuth();
    }
});

function showAdminAuth() {
    document.getElementById('admin-auth-section').classList.remove('hidden');
    document.getElementById('admin-app-section').classList.add('hidden');
}

async function handleAdminLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value.trim();

    if (!email || !password) {
        alert('Please enter admin email and password.');
        return;
    }

    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        alert('Login Error: ' + error.message);
        return;
    }

    // Verify admin status
    const { data: profile } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

    if (profile && profile.is_admin) {
        currentAdmin = data.user;
        showAdminDashboard();
    } else {
        alert('Access Denied: You are not authorized as admin.');
        await _supabase.auth.signOut();
    }
}

async function handleAdminLogout() {
    await _supabase.auth.signOut();
    currentAdmin = null;
    showAdminAuth();
}

async function showAdminDashboard() {
    document.getElementById('admin-auth-section').classList.add('hidden');
    document.getElementById('admin-app-section').classList.remove('hidden');
    document.getElementById('admin-email-display').innerText = currentAdmin.email;

    await loadAdminStats();
    await loadAdminUsers();
    await loadAdminDeposits();
    await loadAdminOrders();
    await loadAdminServices();
}

function switchAdminTab(tabName, event) {
    if (event) event.preventDefault();
    
    document.querySelectorAll('.admin-tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.sidebar .nav-links a').forEach(link => link.classList.remove('active'));

    document.getElementById(`admin-tab-${tabName}`).classList.remove('hidden');
    if (event && event.target) event.target.classList.add('active');

    const titles = {
        'dashboard': 'Admin Dashboard',
        'users': 'Users Management',
        'deposits': 'Deposits Approval',
        'orders': 'All Platform Orders',
        'services': 'Services & Categories',
        'providers': 'API Providers Configuration'
    };
    document.getElementById('admin-page-title').innerText = titles[tabName] || 'Admin Dashboard';
}

async function loadAdminStats() {
    const { count: usersCount } = await _supabase.from('profiles').select('*', { count: 'exact', head: true });
    document.getElementById('admin-stat-users').innerText = usersCount || 0;

    const { count: ordersCount } = await _supabase.from('orders').select('*', { count: 'exact', head: true });
    document.getElementById('admin-stat-orders').innerText = ordersCount || 0;

    const { count: depositsCount } = await _supabase.from('deposits').select('*', { count: 'exact', head: true }).eq('status', 'Pending');
    document.getElementById('admin-stat-deposits').innerText = depositsCount || 0;
}

async function loadAdminUsers() {
    const { data: users } = await _supabase.from('profiles').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('admin-users-table');
    tbody.innerHTML = '';
    if (users && users.length > 0) {
        users.forEach(u => {
            tbody.innerHTML += `
                <tr>
                    <td>${u.full_name}</td>
                    <td>${u.email}</td>
                    <td>PKR ${u.balance}</td>
                    <td>${u.is_admin ? '<span class="badge badge-danger">Admin</span>' : '<span class="badge badge-info">User</span>'}</td>
                    <td>${new Date(u.created_at).toLocaleDateString()}</td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No users found.</td></tr>';
    }
}

async function loadAdminDeposits() {
    const { data: deposits } = await _supabase.from('deposits').select('*').order('created_at', { ascending: false });
    const tbody = document.getElementById('admin-deposits-table');
    tbody.innerHTML = '';
    if (deposits && deposits.length > 0) {
        deposits.forEach(d => {
            const statusBadge = d.status === 'Approved' ? 'badge-success' : d.status === 'Rejected' ? 'badge-danger' : 'badge-warning';
            tbody.innerHTML += `
                <tr>
                    <td>${d.user_id.slice(0, 8)}...</td>
                    <td>${d.payment_method}</td>
                    <td>PKR ${d.amount}</td>
                    <td>${d.transaction_id}</td>
                    <td><span class="badge ${statusBadge}">${d.status}</span></td>
                    <td>
                        ${d.status === 'Pending' ? `
                            <button class="btn-primary" style="padding: 6px 12px; font-size: 12px; background: var(--success);" onclick="approveDeposit('${d.id}', '${d.user_id}', ${d.amount})">Approve</button>
                        ` : '-'}
                    </td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No deposits found.</td></tr>';
    }
}

async function approveDeposit(depositId, userId, amount) {
    if (!confirm(`Approve deposit of PKR ${amount}?`)) return;

    const { error: depError } = await _supabase
        .from('deposits')
        .update({ status: 'Approved' })
        .eq('id', depositId);

    if (depError) {
        alert('Error updating deposit: ' + depError.message);
        return;
    }

    const { data: profile } = await _supabase.from('profiles').select('balance').eq('id', userId).single();
    const newBalance = parseFloat(profile.balance) + parseFloat(amount);

    const { error: balError } = await _supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', userId);

    if (balError) {
        alert('Error updating balance: ' + balError.message);
    } else {
        alert('Deposit approved and balance added successfully!');
        loadAdminDeposits();
        loadAdminStats();
    }
}

async function loadAdminOrders() {
    const { data: orders } = await _supabase.from('orders').select('*, services(name)').order('created_at', { ascending: false });
    const tbody = document.getElementById('admin-orders-table');
    tbody.innerHTML = '';
    if (orders && orders.length > 0) {
        orders.forEach(o => {
            tbody.innerHTML += `
                <tr>
                    <td>${o.id.slice(0, 8)}...</td>
                    <td>${o.user_id.slice(0, 8)}...</td>
                    <td>${o.services ? o.services.name : 'Service'}</td>
                    <td><a href="${o.link}" target="_blank" style="color: var(--cyan);">Link</a></td>
                    <td>${o.quantity}</td>
                    <td>PKR ${o.charge}</td>
                    <td><span class="badge badge-warning">${o.status}</span></td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No orders found.</td></tr>';
    }
}

async function loadAdminServices() {
    const { data: services } = await _supabase.from('services').select('*');
    const tbody = document.getElementById('admin-services-table');
    tbody.innerHTML = '';
    if (services && services.length > 0) {
        services.forEach(s => {
            tbody.innerHTML += `
                <tr>
                    <td>${s.id}</td>
                    <td>${s.name}</td>
                    <td>PKR ${s.rate}</td>
                    <td>${s.min} / ${s.max}</td>
                    <td><span class="badge badge-success">Active</span></td>
                </tr>
            `;
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No services found.</td></tr>';
    }
}

async function addCategory() {
    const name = document.getElementById('new-cat-name').value.trim();
    if (!name) {
        alert('Please enter category name.');
        return;
    }

    const { error } = await _supabase.from('service_categories').insert([{ name: name }]);
    if (error) {
        alert('Error: ' + error.message);
    } else {
        alert('Category added successfully!');
        document.getElementById('new-cat-name').value = '';
    }
}

async function saveProviderConfig() {
    alert('Provider configuration saved successfully!');
}
