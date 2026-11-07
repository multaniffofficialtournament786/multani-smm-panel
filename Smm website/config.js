const SUPABASE_URL = "https://ghenauyyuxoniedwzabk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZW5hdXl5dXhvbmllZHd6YWJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NzI5ODgsImV4cCI6MjEwOTQ0ODk4OH0.NC1bx-akp0haMXxOQs4zrGzpID9H855J4Kno35znLTQ";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: false,
        detectSessionInUrl: true,
        storage: window.localStorage
    }
}) : null;

let currentUser = null;
let currentUserProfile = null;
let allServices = [];
let allCategories = [];
let allCustomerDeposits = [];
let loadedOrdersCache = [];
let selectedService = null;
let activePaymentFilter = 'all';

const CURRENCIES = {
    PKR: { symbol: "Rs ", rate: 290.00 },
    USD: { symbol: "$", rate: 1.00 },
    INR: { symbol: "₹", rate: 94.35 },
    AED: { symbol: "AED ", rate: 3.67 },
    SAR: { symbol: "SAR ", rate: 3.75 }
};
let activeCurrency = localStorage.getItem("app_currency") || "PKR";

function formatPrice(amountInUSD) {
    const c = CURRENCIES[activeCurrency] || CURRENCIES.PKR;
    const converted = (parseFloat(amountInUSD) || 0) * c.rate;
    return `${c.symbol}${converted.toFixed(2)}`;
}

function handleCurrencyChange(curr) {
    activeCurrency = curr;
    localStorage.setItem("app_currency", curr);
    updateWalletDisplay();
    const catSelect = document.getElementById("orderCatSelect");
    renderServiceDropdown(catSelect ? catSelect.value : "");
    renderServicesPageTable();
    calculateTotalCharge();
    calculateDashboardMetrics();
    renderPaymentHistoryList(activePaymentFilter);
}

function notify(msg, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

function toggleSidebar() {
    document.getElementById("sidebarDrawer").classList.toggle("open");
    document.getElementById("sidebarOverlay").classList.toggle("active");
}

function handleShareApp() {
    const shareUrl = window.location.origin + window.location.pathname;
    if (navigator.share) {
        navigator.share({ title: 'MULTANI VIP CLUB', text: 'Join MULTANI SMM VIP Panel!', url: shareUrl }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareUrl);
        notify("Link copied to clipboard!", "success");
    }
    toggleSidebar();
}

function showAuthScreen() {
    document.getElementById("mainAppWrapper").classList.add("hidden");
    document.getElementById("authGateContainer").classList.remove("hidden");
}

function showPanelScreen() {
    document.getElementById("authGateContainer").classList.add("hidden");
    document.getElementById("mainAppWrapper").classList.remove("hidden");
}

function openForgotPwModal() {
    document.getElementById("forgotPwModal").classList.remove("hidden");
}
function closeForgotPwModal() {
    document.getElementById("forgotPwModal").classList.add("hidden");
}

function toggleProfilePasswordView() {
    const input = document.getElementById("profPasswordDisplay");
    const icon = document.getElementById("toggleProfPwBtn");
    if (input.type === "password") {
        input.type = "text";
        icon.classList.remove("fa-eye");
        icon.classList.add("fa-eye-slash");
    } else {
        input.type = "password";
        icon.classList.remove("fa-eye-slash");
        icon.classList.add("fa-eye");
    }
}

function saveLocalActiveUser(user) {
    if (!user) return;
    try {
        localStorage.setItem("multani_active_session", JSON.stringify({
            id: user.id,
            email: user.email || '',
            user_metadata: user.user_metadata || {}
        }));
    } catch(e) {}
}

function getLocalActiveUser() {
    try {
        const s = localStorage.getItem("multani_active_session");
        return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
}

function clearLocalActiveUser() {
    localStorage.removeItem("multani_active_session");
}
