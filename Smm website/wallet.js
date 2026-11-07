// Direct Supabase Configuration to prevent any loading errors
const SUPABASE_URL = "YAHAN_APNA_SUPABASE_URL_LIKHEIN";
const SUPABASE_ANON_KEY = "YAHAN_APNA_SUPABASE_ANON_KEY_LIKHEIN";

// NOTE: Agar aapke paas config.js mein URL aur Key hain, toh upar wale quotes mein daal dein. 
// Lekin agar window.supabaseClient pehle se hai toh wohi use ho jayega.

const PAYMENT_METHODS_DATA = {
    Easypaisa: { title: "Easypaisa Account:", number: "03186815926", name: "Title: Muhammad Nadeem" },
    Sadapay: { title: "Sadapay Account:", number: "03281926729", name: "Title: Muhammad Nadeem" }
};

function handlePaymentMethodChange(method) {
    const data = PAYMENT_METHODS_DATA[method] || PAYMENT_METHODS_DATA.Easypaisa;
    document.getElementById("accountTitleDisplay").innerText = data.title;
    document.getElementById("accountNumberDisplay").innerText = data.number;
    document.getElementById("accountHolderDisplay").innerText = data.name;
}

function calculateDepositUSD() {
    const pkr = parseFloat(document.getElementById("depAmountPKR").value) || 0;
    const usd = (pkr / 290.00).toFixed(4);
    document.getElementById("depUSDHint").innerText = pkr > 0 ? `Credit in Wallet: $${usd} USD` : '';
}

function getSafeSupabase() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        const url = window.SUPABASE_URL || SUPABASE_URL;
        const key = window.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
        if (url && key && url !== "YAHAN_APNA_SUPABASE_URL_LIKHEIN") {
            window.supabaseClient = window.supabase.createClient(url, key);
            return window.supabaseClient;
        }
    }
    return null;
}

async function handleDepositSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById("btnDepositSubmit");

    if (!currentUser || !currentUser.id) {
        const local = getLocalActiveUser();
        if (local && local.id) currentUser = local;
        else {
            alert("Please login first!");
            return;
        }
    }

    const pkr = parseFloat(document.getElementById("depAmountPKR").value);
    if (isNaN(pkr) || pkr <= 0) {
        alert("Please enter a valid amount");
        return;
    }

    let client = getSafeSupabase();
    if (!client && window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
        client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    }

    if (!client) {
        alert("Supabase client not loaded. Check your config.js file.");
        return;
    }

    const usd = parseFloat((pkr / 290.00).toFixed(4));
    const method = document.getElementById("depMethod").value;
    const sender = document.getElementById("depSenderNum").value.trim();
    const trx = document.getElementById("depTrxId").value.trim();

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

    try {
        const { data, error } = await client.from("deposits").insert([{
            user_id: currentUser.id,
            amount: usd,
            payment_method: method,
            sender_account: sender,
            transaction_id: trx,
            status: 'pending'
        }]).select();

        if (error) throw error;

        alert("Deposit request submitted successfully!");
        
        document.getElementById("depAmountPKR").value = "";
        document.getElementById("depSenderNum").value = "";
        document.getElementById("depTrxId").value = "";
        document.getElementById("depUSDHint").innerText = "";

        openPaymentHistoryView();
        await loadCustomerDepositsHistory();
    } catch (err) {
        console.error("Deposit error:", err);
        alert("Error: " + (err.message || "Failed to submit"));
    } finally {
        btn.disabled = false;
        btn.innerText = "SUBMIT DEPOSIT REQUEST";
    }
}

function openPaymentHistoryView() {
    switchTab('viewPaymentHistory');
}

async function loadCustomerDepositsHistory() {
    const container = document.getElementById("paymentHistoryListContainer");
    if (!container) return;

    if (!currentUser || !currentUser.id) {
        const local = getLocalActiveUser();
        if (local && local.id) currentUser = local;
        else {
            container.innerHTML = `<p style="text-align: center; color: #A7F3D0; font-size: 0.85rem; padding: 25px 0;">Please login to view history.</p>`;
            return;
        }
    }

    const client = getSafeSupabase();
    if (!client) {
        container.innerHTML = `<p style="text-align: center; color: #A7F3D0; font-size: 0.85rem; padding: 25px 0;">Database connection error.</p>`;
        return;
    }

    try {
        const { data, error } = await client
            .from("deposits")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allCustomerDeposits = data || [];
        renderPaymentHistoryList(activePaymentFilter);
    } catch (e) {
        console.error("History fetch error:", e);
        container.innerHTML = `<p style="text-align: center; color: #A7F3D0; font-size: 0.85rem; padding: 25px 0;">No records found.</p>`;
    }
}

function filterPaymentHistory(filterType, element) {
    activePaymentFilter = filterType;
    document.querySelectorAll(".filter-tabs-wrapper .filter-tab-pill").forEach(el => el.classList.remove("active"));
    if (element) element.classList.add("active");
    renderPaymentHistoryList(filterType);
}

function renderPaymentHistoryList(filterType = 'all') {
    const container = document.getElementById("paymentHistoryListContainer");
    if (!container) return;

    let filtered = allCustomerDeposits;
    if (filterType === 'pending') {
        filtered = allCustomerDeposits.filter(d => (d.status || '').toLowerCase() === 'pending');
    } else if (filterType === 'approved') {
        filtered = allCustomerDeposits.filter(d => (d.status || '').toLowerCase() === 'completed' || (d.status || '').toLowerCase() === 'approved');
    } else if (filterType === 'rejected') {
        filtered = allCustomerDeposits.filter(d => (d.status || '').toLowerCase() === 'rejected' || (d.status || '').toLowerCase() === 'cancelled');
    }

    if (!filtered || filtered.length === 0) {
        container.innerHTML = `<p style="text-align: center; color: #A7F3D0; font-size: 0.85rem; padding: 25px 0;">No ${filterType === 'all' ? '' : filterType} records found.</p>`;
        return;
    }

    container.innerHTML = filtered.map(d => {
        const rawStatus = (d.status || 'pending').toLowerCase();
        let statusText = 'PENDING';
        let statusBadgeClass = 'badge-pending';

        if (rawStatus === 'completed' || rawStatus === 'approved') {
            statusText = 'APPROVED';
            statusBadgeClass = 'badge-approved';
        } else if (rawStatus === 'rejected' || rawStatus === 'cancelled') {
            statusText = 'REJECTED';
            statusBadgeClass = 'badge-rejected';
        }

        const pkrAmount = (parseFloat(d.amount || 0) * 290.00).toFixed(0);

        return `
            <div class="deposit-record-card">
                <div class="deposit-record-row">
                    <strong style="color: #FFE873; font-size: 0.95rem;">${d.payment_method || 'Deposit'}</strong>
                    <span class="badge ${statusBadgeClass}">${statusText}</span>
                </div>
                <div class="deposit-record-row" style="color: #fff; font-size: 0.88rem; font-weight: 700;">
                    <span>Rs ${pkrAmount} PKR</span>
                    <span style="color: #34D399; font-family: var(--font-game); font-size: 1.05rem;">$${parseFloat(d.amount).toFixed(4)} USD</span>
                </div>
                <div class="deposit-record-row" style="color: #A7F3D0; font-size: 0.75rem; border-top: 1px dashed rgba(34,197,94,0.25); padding-top: 5px; margin-top: 3px;">
                    <span>TRX: <strong>${d.transaction_id || '-'}</strong></span>
                    <span>Sender: <strong>${d.sender_account || '-'}</strong></span>
                </div>
                <small style="color: rgba(167, 243, 208, 0.65); font-size: 0.68rem; text-align: right;">${new Date(d.created_at).toLocaleString()}</small>
            </div>
        `;
    }).join("");
}
