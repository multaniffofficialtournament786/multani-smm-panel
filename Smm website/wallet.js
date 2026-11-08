
// ================= MULTANI SMM WALLET SYSTEM =================

const SUPABASE_URL = "https://kffkcfnawguztldjuxnu.supabase.co";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZW5hdXl5dXhvbmllZHd6YWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzI5ODgsImV4cCI6MjEwOTQ0ODk4OH0.NC1bx-akp0haMXxOQs4zrGzpID9H855J4Kno35znLTQ";

let directSupabaseClient = null;
let allCustomerDeposits = [];
let activePaymentFilter = "all";

const PKR_TO_USD_RATE = 290;

// ================= SUPABASE CLIENT =================

function getDirectClient() {
    if (window.supabaseClient) {
        return window.supabaseClient;
    }

    if (directSupabaseClient) {
        return directSupabaseClient;
    }

    if (
        window.supabase &&
        typeof window.supabase.createClient === "function"
    ) {
        directSupabaseClient = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY
        );

        return directSupabaseClient;
    }

    return null;
}

// ================= AUTH USER =================

async function getWalletUser() {
    const client = getDirectClient();

    if (!client) {
        throw new Error("Database connection not available.");
    }

    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    if (!data || !data.user) {
        throw new Error("Please login again.");
    }

    return data.user;
}

// ================= PAYMENT METHODS =================

const PAYMENT_METHODS_DATA = {
    Easypaisa: {
        title: "Easypaisa Account:",
        number: "03186815926",
        name: "Title: Muhammad Nadeem"
    },

    Sadapay: {
        title: "Sadapay Account:",
        number: "03281926729",
        name: "Title: Muhammad Nadeem"
    }
};

function handlePaymentMethodChange(method) {
    const data =
        PAYMENT_METHODS_DATA[method] ||
        PAYMENT_METHODS_DATA.Easypaisa;

    const title = document.getElementById("accountTitleDisplay");
    const number = document.getElementById("accountNumberDisplay");
    const holder = document.getElementById("accountHolderDisplay");

    if (title) title.innerText = data.title;
    if (number) number.innerText = data.number;
    if (holder) holder.innerText = data.name;
}

// ================= CURRENCY CALCULATION =================

function calculateDepositUSD() {
    const amountInput = document.getElementById("depAmountPKR");
    const hint = document.getElementById("depUSDHint");

    if (!amountInput || !hint) return;

    const pkr = parseFloat(amountInput.value) || 0;
    const usd = (pkr / PKR_TO_USD_RATE).toFixed(4);

    hint.innerText =
        pkr > 0 ? `Credit in Wallet: $${usd} USD` : "";
}

// ================= SUBMIT DEPOSIT =================

async function handleDepositSubmit(e) {
    if (e) e.preventDefault();

    const btn = document.getElementById("btnDepositSubmit");
    const pkrInput = document.getElementById("depAmountPKR");
    const methodInput = document.getElementById("depMethod");
    const senderInput = document.getElementById("depSenderNum");
    const trxInput = document.getElementById("depTrxId");

    if (!pkrInput || !methodInput || !senderInput || !trxInput) {
        alert("Deposit form elements missing.");
        return;
    }

    const pkr = Number(pkrInput.value);
    const method = methodInput.value;
    const sender = senderInput.value.trim();
    const trx = trxInput.value.trim();

    if (!Number.isFinite(pkr) || pkr < 200) {
        alert("Minimum deposit is Rs 200.");
        return;
    }

    if (!PAYMENT_METHODS_DATA[method]) {
        alert("Please select a valid payment method.");
        return;
    }

    if (!sender || !trx) {
        alert("Please enter sender account and transaction ID.");
        return;
    }

    const client = getDirectClient();

    if (!client) {
        alert("Database connection error. Please refresh.");
        return;
    }

    const originalText = btn
        ? btn.innerHTML
        : "SUBMIT DEPOSIT REQUEST";

    if (btn) {
        btn.disabled = true;
        btn.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    }

    try {
        const user = await getWalletUser();
        const usd = Number((pkr / PKR_TO_USD_RATE).toFixed(4));

        const { error } = await client
            .from("deposits")
            .insert({
                user_id: user.id,
                amount: usd,
                payment_method: method,
                sender_account: sender,
                transaction_id: trx,
                status: "pending"
            });

        if (error) throw error;

        alert("Deposit request submitted successfully!");

        pkrInput.value = "";
        senderInput.value = "";
        trxInput.value = "";

        const hint = document.getElementById("depUSDHint");
        if (hint) hint.innerText = "";

        openPaymentHistoryView();
        await loadCustomerDepositsHistory();

    } catch (err) {
        console.error("Deposit submission error:", err);
        alert("Deposit Error: " + (err.message || "Please try again."));

    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ================= PAYMENT HISTORY VIEW =================

function openPaymentHistoryView() {
    if (typeof switchTab === "function") {
        switchTab("viewPaymentHistory");
    }

    loadCustomerDepositsHistory();
}

// ================= LOAD CUSTOMER DEPOSITS =================

async function loadCustomerDepositsHistory() {
    const container = document.getElementById(
        "paymentHistoryListContainer"
    );

    if (!container) return;

    container.innerHTML =
        '<p style="text-align:center;padding:20px;">Loading deposits...</p>';

    try {
        const client = getDirectClient();
        if (!client) throw new Error("Database connection error.");

        const user = await getWalletUser();

        const { data, error } = await client
            .from("deposits")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allCustomerDeposits = data || [];
        renderPaymentHistoryList(activePaymentFilter);

    } catch (err) {
        console.error("Deposit history error:", err);

        container.innerHTML =
            '<p style="text-align:center;color:#FCA5A5;padding:20px;">' +
            "Unable to load deposit history. " +
            escapeWalletHTML(err.message || "") +
            "</p>";
    }
}

// ================= FILTER HISTORY =================

function filterPaymentHistory(filterType, element) {
    activePaymentFilter = filterType || "all";

    document
        .querySelectorAll(".filter-tabs-wrapper .filter-tab-pill")
        .forEach(el => el.classList.remove("active"));

    if (element) element.classList.add("active");

    renderPaymentHistoryList(activePaymentFilter);
}

// ================= RENDER HISTORY =================

function renderPaymentHistoryList(filterType = "all") {
    const container = document.getElementById(
        "paymentHistoryListContainer"
    );

    if (!container) return;

    let filtered = allCustomerDeposits;

    if (filterType === "pending") {
        filtered = allCustomerDeposits.filter(
            d => (d.status || "").toLowerCase() === "pending"
        );
    } else if (filterType === "approved") {
        filtered = allCustomerDeposits.filter(
            d => ["approved", "completed"].includes(
                (d.status || "").toLowerCase()
            )
        );
    } else if (filterType === "rejected") {
        filtered = allCustomerDeposits.filter(
            d => ["rejected", "cancelled"].includes(
                (d.status || "").toLowerCase()
            )
        );
    }

    if (!filtered.length) {
        container.innerHTML =
            '<p style="text-align:center;color:#A7F3D0;padding:25px;">' +
            "No " + escapeWalletHTML(filterType) +
            " records found.</p>";
        return;
    }

    container.innerHTML = filtered.map(d => {
        const status = (d.status || "pending").toLowerCase();

        let statusText = "PENDING";
        let badgeClass = "badge-pending";

        if (status === "approved" || status === "completed") {
            statusText = "APPROVED";
            badgeClass = "badge-approved";
        } else if (
            status === "rejected" ||
            status === "cancelled"
        ) {
            statusText = "REJECTED";
            badgeClass = "badge-rejected";
        }

        const usd = Number(d.amount || 0);
        const pkr = Math.round(usd * PKR_TO_USD_RATE);

        return `
            <div class="deposit-record-card">
                <div class="deposit-record-row">
                    <strong style="color:#FFE873;font-size:.95rem;">
                        ${escapeWalletHTML(d.payment_method || "Deposit")}
                    </strong>
                    <span class="badge ${badgeClass}">
                        ${statusText}
                    </span>
                </div>

                <div class="deposit-record-row"
                     style="color:#fff;font-size:.88rem;font-weight:700;">
                    <span>Rs ${pkr} PKR</span>
                    <span style="color:#34D399;font-size:1.05rem;">
                        $${usd.toFixed(4)} USD
                    </span>
                </div>

                <div class="deposit-record-row"
                     style="color:#A7F3D0;font-size:.75rem;
                     border-top:1px dashed rgba(34,197,94,.25);
                     padding-top:5px;margin-top:3px;">
                    <span>TRX:
                        <strong>${escapeWalletHTML(d.transaction_id || "-")}</strong>
                    </span>
                    <span>Sender:
                        <strong>${escapeWalletHTML(d.sender_account || "-")}</strong>
                    </span>
                </div>

                <small style="color:rgba(167,243,208,.65);
                font-size:.68rem;text-align:right;">
                    ${d.created_at ? new Date(d.created_at).toLocaleString() : ""}
                </small>
            </div>
        `;
    }).join("");
}

// ================= SAFE HTML =================

function escapeWalletHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

// ================= REFRESH WALLET BALANCE =================

async function refreshCustomerWalletBalance() {
    try {
        const client = getDirectClient();
        if (!client) return null;

        const user = await getWalletUser();

        const { data, error } = await client
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .single();

        if (error) throw error;

        const balance = Number(data.balance || 0);

        const selectors = [
            "#walletBalance",
            "#userWalletBalance",
            "#profileWalletBalance",
            "[data-wallet-balance]"
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.textContent = "$" + balance.toFixed(4) + " USD";
            });
        });

        return balance;

    } catch (err) {
        console.error("Wallet balance refresh error:", err);
        return null;
    }
}

// ================= INITIALIZE =================

document.addEventListener("DOMContentLoaded", () => {
    const method = document.getElementById("depMethod");

    if (method) {
        handlePaymentMethodChange(method.value);

        method.addEventListener("change", () => {
            handlePaymentMethodChange(method.value);
        });
    }

    const amount = document.getElementById("depAmountPKR");

    if (amount) {
        amount.addEventListener("input", calculateDepositUSD);
    }
});
