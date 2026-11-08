
// ================= MULTANI SMM WALLET SYSTEM =================
// Uses existing Supabase client and login from config.js / auth.js

const WALLET_CURRENCY_RATE = 290;

const WALLET_PAYMENT_METHODS = {
    easypaisa: {
        name: "Easypaisa",
        number: "03186815926",
        title: "Muhammad Nadeem"
    },
    sadapay: {
        name: "SadaPay",
        number: "03281926729",
        title: "Muhammad Nadeem"
    }
};

let allCustomerDeposits = [];
let activePaymentFilter = "all";
let walletBusy = false;

// ---------------- BASIC HELPERS ----------------

function walletClient() {
    return (typeof supabaseClient !== "undefined" && supabaseClient)
        ? supabaseClient
        : null;
}

function walletUser() {
    return (typeof currentUser !== "undefined" && currentUser && currentUser.id)
        ? currentUser
        : null;
}

function walletNotify(message, type = "info") {
    if (typeof notify === "function") {
        notify(message, type);
    } else {
        alert(message);
    }
}

function walletEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function walletFormatPKR(amount) {
    return "Rs " + (Number(amount) || 0).toFixed(2);
}

function walletFormatDisplay(amountUSD) {
    if (typeof formatPrice === "function") {
        return formatPrice(Number(amountUSD) || 0);
    }
    return "$" + (Number(amountUSD) || 0).toFixed(2);
}

// ---------------- WALLET BALANCE ----------------

async function refreshCustomerWalletBalance() {
    const client = walletClient();
    const user = walletUser();

    if (!client || !user) return false;

    try {
        const { data, error } = await client
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .maybeSingle();

        if (error) throw error;

        if (!data) {
            console.warn("Wallet profile not found.");
            return false;
        }

        if (typeof currentUserProfile !== "undefined") {
            currentUserProfile = {
                ...(currentUserProfile || {}),
                balance: Number(data.balance || 0)
            };
        }

        if (typeof updateWalletDisplay === "function") {
            updateWalletDisplay();
        }

        return true;

    } catch (error) {
        console.error("Wallet balance error:", error);
        return false;
    }
}

// ---------------- PAYMENT METHOD ----------------

function updateDepositPaymentDetails() {
    const methodInput = document.getElementById("depMethod");
    const numberInput = document.getElementById("depSenderNum");

    if (!methodInput || !numberInput) return;

    const method = WALLET_PAYMENT_METHODS[
        String(methodInput.value || "").toLowerCase()
    ];

    const accountDisplay = document.getElementById("depositAccountDetails");

    if (method) {
        if (accountDisplay) {
            accountDisplay.innerText =
                method.name + " | " + method.number +
                " | " + method.title;
        }
    }
}

function updateDepositUSDHint() {
    const amountInput = document.getElementById("depAmountPKR");
    const hint = document.getElementById("depUSDHint");

    if (!amountInput || !hint) return;

    const pkr = Number(amountInput.value || 0);
    const usd = pkr / WALLET_CURRENCY_RATE;

    hint.innerText = "$" + usd.toFixed(2);
}

// ---------------- SUBMIT DEPOSIT ----------------

async function handleDepositSubmit(event) {
    if (event) event.preventDefault();

    if (walletBusy) return;

    const client = walletClient();
    const user = walletUser();

    if (!client) {
        return walletNotify("Supabase connection unavailable.", "error");
    }

    if (!user) {
        return walletNotify("Please login again before depositing.", "error");
    }

    const methodInput = document.getElementById("depMethod");
    const amountInput = document.getElementById("depAmountPKR");
    const senderInput = document.getElementById("depSenderNum");
    const trxInput = document.getElementById("depTrxId");
    const submitButton = document.getElementById("btnDepositSubmit");

    const method = String(methodInput?.value || "").toLowerCase();
    const amountPKR = Number(amountInput?.value || 0);
    const senderAccount = String(senderInput?.value || "").trim();
    const transactionId = String(trxInput?.value || "").trim();

    if (!WALLET_PAYMENT_METHODS[method]) {
        return walletNotify("Please select a valid payment method.", "error");
    }

    if (!Number.isFinite(amountPKR) || amountPKR < 200) {
        return walletNotify("Minimum deposit is Rs 200.", "error");
    }

    if (!senderAccount || !transactionId) {
        return walletNotify("Enter sender account and transaction ID.", "error");
    }

    const amountUSD = Number((amountPKR / WALLET_CURRENCY_RATE).toFixed(4));

    walletBusy = true;

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.oldText = submitButton.innerHTML;
        submitButton.innerHTML =
            '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
    }

    try {
        // Verify real Supabase Auth session
        const { data: sessionData, error: sessionError } =
            await client.auth.getSession();

        if (sessionError) throw sessionError;

        const authenticatedUser = sessionData?.session?.user;

        if (!authenticatedUser || authenticatedUser.id !== user.id) {
            throw new Error("Login session expired. Please login again.");
        }

        // Insert pending deposit
        const { data, error } = await client
            .from("deposits")
            .insert({
                user_id: authenticatedUser.id,
                amount: amountUSD,
                payment_method: method,
                sender_account: senderAccount,
                transaction_id: transactionId,
                status: "pending"
            })
            .select()
            .single();

        if (error) throw error;

        walletNotify(
            "Deposit request submitted successfully. Waiting for admin approval.",
            "success"
        );

        if (amountInput) amountInput.value = "";
        if (senderInput) senderInput.value = "";
        if (trxInput) trxInput.value = "";

        updateDepositUSDHint();
        await loadCustomerDepositsHistory();

    } catch (error) {
        console.error("Deposit submission error:", error);
        walletNotify(error.message || "Deposit submission failed.", "error");

    } finally {
        walletBusy = false;

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML =
                submitButton.dataset.oldText ||
                '<i class="fa-solid fa-paper-plane"></i> Submit Deposit';
        }
    }
}

// ---------------- DEPOSIT HISTORY ----------------

async function loadCustomerDepositsHistory() {
    const client = walletClient();
    const user = walletUser();

    if (!client || !user) return;

    const container = document.getElementById(
        "paymentHistoryListContainer"
    );

    if (container) {
        container.innerHTML =
            '<div class="text-center">Loading payment history...</div>';
    }

    try {
        const { data, error } = await client
            .from("deposits")
            .select("id, amount, payment_method, sender_account, transaction_id, status, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        allCustomerDeposits = data || [];

        renderPaymentHistoryList(activePaymentFilter);

    } catch (error) {
        console.error("Deposit history error:", error);

        if (container) {
            container.innerHTML =
                '<div class="text-center">Unable to load payment history.</div>';
        }
    }
}

function renderPaymentHistoryList(filter = "all") {
    activePaymentFilter = filter;

    const container = document.getElementById(
        "paymentHistoryListContainer"
    );

    if (!container) return;

    let deposits = [...allCustomerDeposits];

    if (filter !== "all") {
        deposits = deposits.filter(item =>
            String(item.status || "").toLowerCase() === filter
        );
    }

    if (!deposits.length) {
        container.innerHTML =
            '<div class="text-center">No deposit records found.</div>';
        return;
    }

    container.innerHTML = deposits.map(item => {
        const status = String(item.status || "pending").toLowerCase();

        const statusClass = {
            pending: "pending",
            approved: "approved",
            rejected: "rejected"
        }[status] || "pending";

        const date = item.created_at
            ? new Date(item.created_at).toLocaleString()
            : "-";

        return `
            <div class="payment-history-item">
                <div class="payment-history-info">
                    <strong>${walletEscape(item.payment_method || "Deposit")}</strong>
                    <small>${walletEscape(date)}</small>
                    <small>Transaction: ${walletEscape(item.transaction_id || "-")}</small>
                    <small>Sender: ${walletEscape(item.sender_account || "-")}</small>
                </div>

                <div class="payment-history-amount">
                    <strong>${walletFormatPKR(
                        (Number(item.amount) || 0) * WALLET_CURRENCY_RATE
                    )}</strong>
                    <small>${walletFormatDisplay(item.amount)}</small>
                    <span class="status-${statusClass}">
                        ${walletEscape(status.toUpperCase())}
                    </span>
                </div>
            </div>
        `;
    }).join("");
}

// ---------------- HISTORY FILTER ----------------

function filterPaymentHistory(filter) {
    renderPaymentHistoryList(filter);
}

function openPaymentHistoryView() {
    if (typeof switchTab === "function") {
        switchTab("viewPaymentHistory", null);
    }
    loadCustomerDepositsHistory();
}

// ---------------- INITIALIZATION ----------------

function initWalletSystem() {
    const methodInput = document.getElementById("depMethod");
    const amountInput = document.getElementById("depAmountPKR");

    if (methodInput) {
        methodInput.addEventListener(
            "change",
            updateDepositPaymentDetails
        );
    }

    if (amountInput) {
        amountInput.addEventListener(
            "input",
            updateDepositUSDHint
        );
    }

    updateDepositPaymentDetails();
    updateDepositUSDHint();

    if (walletUser()) {
        refreshCustomerWalletBalance();
        loadCustomerDepositsHistory();
    }
}

window.addEventListener("DOMContentLoaded", initWalletSystem);
