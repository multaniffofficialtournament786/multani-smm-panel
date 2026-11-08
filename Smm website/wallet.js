// ================= MULTANI SMM WALLET SYSTEM =================
const WALLET_CURRENCY_RATE = 290;

const WALLET_PAYMENT_METHODS = {
    easypaisa: {
        name: "Easypaisa",
        number: "03186815926",
        title: "Muhammad Nadeem"
    },
    sadapay: {
        name: "Sadapay",
        number: "03281926729",
        title: "Muhammad Nadeem"
    }
};

let walletBusy = false;

// ---------------- HELPERS ----------------

function walletClient() {
    return typeof supabaseClient !== "undefined" ? supabaseClient : null;
}

function walletUser() {
    return typeof currentUser !== "undefined" ? currentUser : null;
}

function walletNotify(message, type = "info") {
    if (typeof notify === "function") notify(message, type);
    else alert(message);
}

function walletEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[c]);
}

// ---------------- PAYMENT ACCOUNT DETAILS ----------------

function handlePaymentMethodChange(value) {
    const method = WALLET_PAYMENT_METHODS[String(value).toLowerCase()];
    if (!method) return;

    const title = document.getElementById("accountTitleDisplay");
    const number = document.getElementById("accountNumberDisplay");
    const holder = document.getElementById("accountHolderDisplay");

    if (title) title.innerText = method.name + " Account:";
    if (number) number.innerText = method.number;
    if (holder) holder.innerText = "Title: " + method.title;

    updateDepositUSDHint();
}

// ---------------- AMOUNT CONVERSION ----------------

function calculateDepositUSD() {
    updateDepositUSDHint();
}

function updateDepositUSDHint() {
    const amount = Number(
        document.getElementById("depAmountPKR")?.value || 0
    );

    const hint = document.getElementById("depUSDHint");

    if (hint) {
        hint.innerText = "$" + (amount / WALLET_CURRENCY_RATE).toFixed(2);
    }
}

// ---------------- WALLET BALANCE ----------------

async function refreshCustomerWalletBalance() {
    const client = walletClient();
    const user = walletUser();

    if (!client || !user?.id) return false;

    try {
        const { data, error } = await client
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;
        if (!data) return false;

        currentUserProfile = {
            ...(currentUserProfile || {}),
            balance: Number(data.balance || 0)
        };

        if (typeof updateWalletDisplay === "function") {
            updateWalletDisplay();
        }

        return true;
    } catch (error) {
        console.error("Wallet balance:", error);
        return false;
    }
}

// ---------------- DEPOSIT SUBMISSION (WITH TIMEOUT PROTECTION) ----------------

async function handleDepositSubmit(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (walletBusy) return false;

    const client = walletClient();
    if (!client) {
        walletNotify("Database client not initialized.", "error");
        return false;
    }

    const methodInput = document.getElementById("depMethod");
    const amountInput = document.getElementById("depAmountPKR");
    const senderInput = document.getElementById("depSenderNum");
    const trxInput = document.getElementById("depTrxId");
    const button = document.getElementById("btnDepositSubmit");

    const method = String(methodInput?.value || "").trim();
    const methodKey = method.toLowerCase();
    const amountPKR = Number(amountInput?.value || 0);
    const sender = String(senderInput?.value || "").trim();
    const trx = String(trxInput?.value || "").trim();

    if (!WALLET_PAYMENT_METHODS[methodKey]) {
        walletNotify("Select a valid payment method.", "error");
        return false;
    }

    if (!Number.isFinite(amountPKR) || amountPKR < 200) {
        walletNotify("Minimum deposit is Rs 200.", "error");
        return false;
    }

    if (!sender || !trx) {
        walletNotify("Enter sender number and transaction ID.", "error");
        return false;
    }

    walletBusy = true;

    if (button) {
        button.disabled = true;
        button.dataset.oldText = button.innerHTML;
        button.innerHTML = "Submitting...";
    }

    // Safety Timeout: 8 seconds taake button kabhi atke nahi
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout. Check your internet connection.")), 8000)
    );

    try {
        const depositAction = async () => {
            // Fresh session get karein taake normal chrome me bhi session miss na ho
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            if (sessionError) throw sessionError;

            const authUser = sessionData?.session?.user || walletUser();
            if (!authUser?.id) {
                throw new Error("Your login session expired. Please login again.");
            }

            const amountUSD = Number((amountPKR / WALLET_CURRENCY_RATE).toFixed(4));

            const { error } = await client
                .from("deposits")
                .insert({
                    user_id: authUser.id,
                    amount: amountUSD,
                    payment_method: method,
                    sender_account: sender,
                    transaction_id: trx,
                    status: "pending"
                });

            if (error) throw error;
            return true;
        };

        await Promise.race([depositAction(), timeoutPromise]);

        walletNotify("Deposit request submitted! Waiting for admin approval.", "success");

        if (amountInput) amountInput.value = "";
        if (senderInput) senderInput.value = "";
        if (trxInput) trxInput.value = "";

        updateDepositUSDHint();
        await loadCustomerDepositsHistory();

    } catch (error) {
        console.error("Deposit error:", error);
        walletNotify(error.message || "Deposit submission failed.", "error");

    } finally {
        walletBusy = false;

        if (button) {
            button.disabled = false;
            button.innerHTML = button.dataset.oldText || "SUBMIT DEPOSIT REQUEST";
        }
    }

    return false;
}

// ---------------- PAYMENT HISTORY ----------------

async function loadCustomerDepositsHistory() {
    const client = walletClient();
    const container = document.getElementById("paymentHistoryListContainer");

    if (!client) {
        if (container) container.innerHTML = "Database client not initialized.";
        return;
    }

    if (container) {
        container.innerHTML = "Loading payment history...";
    }

    try {
        const { data: { session }, error: sessionError } = await client.auth.getSession();
        const authUser = session?.user || walletUser();

        if (sessionError || !authUser?.id) {
            if (container) container.innerHTML = "Please login again to view history.";
            return;
        }

        const { data, error } = await client
            .from("deposits")
            .select("id, amount, payment_method, sender_account, transaction_id, status, created_at")
            .eq("user_id", authUser.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allCustomerDeposits = data || [];
        renderPaymentHistoryList(activePaymentFilter);

    } catch (error) {
        console.error("Payment history error:", error);
        if (container) {
            container.innerHTML = "Unable to load payment history.";
        }
    }
}

function renderPaymentHistoryList(filter = "all") {
    activePaymentFilter = filter;

    const container = document.getElementById("paymentHistoryListContainer");
    if (!container) return;

    let records = [...(window.allCustomerDeposits || [])];

    if (filter !== "all") {
        records = records.filter(item => {
            const itemStatus = String(item.status || "").trim().toLowerCase();
            const targetFilter = String(filter).trim().toLowerCase();
            return itemStatus === targetFilter;
        });
    }

    if (!records.length) {
        container.innerHTML = '<p style="text-align:center;padding:25px 0;">No payment records found.</p>';
        return;
    }

    container.innerHTML = records.map(item => {
        const status = String(item.status || "pending").toLowerCase();
        const date = item.created_at ? new Date(item.created_at).toLocaleString() : "-";
        const pkr = (Number(item.amount) || 0) * WALLET_CURRENCY_RATE;

        return `
            <div class="payment-history-item">
                <div class="payment-history-info">
                    <strong>${walletEscape(item.payment_method)}</strong>
                    <small>${walletEscape(date)}</small>
                    <small>TRX: ${walletEscape(item.transaction_id)}</small>
                    <small>Sender: ${walletEscape(item.sender_account)}</small>
                </div>
                <div class="payment-history-amount">
                    <strong>Rs ${pkr.toFixed(2)}</strong>
                    <small>$${Number(item.amount || 0).toFixed(2)}</small>
                    <span class="status-${walletEscape(status)}">
                        ${walletEscape(status.toUpperCase())}
                    </span>
                </div>
            </div>
        `;
    }).join("");
}

// ---------------- FILTER BUTTONS ----------------

function filterPaymentHistory(filter, button) {
    renderPaymentHistoryList(filter);

    document.querySelectorAll(".filter-tab-pill").forEach(btn => {
        btn.classList.remove("active");
    });

    if (button) button.classList.add("active");
}

// ---------------- OPEN PAYMENT HISTORY ----------------

function openPaymentHistoryView() {
    if (typeof switchTab === "function") {
        switchTab("viewPaymentHistory", null);
    }
    loadCustomerDepositsHistory();
}

// ---------------- INITIALIZE ----------------

function initWalletSystem() {
    handlePaymentMethodChange(
        document.getElementById("depMethod")?.value || "Easypaisa"
    );

    updateDepositUSDHint();

    if (walletUser()?.id) {
        refreshCustomerWalletBalance();
        loadCustomerDepositsHistory();
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWalletSystem);
} else {
    initWalletSystem();
}
