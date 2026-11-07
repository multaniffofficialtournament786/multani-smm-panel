function checkImmediateSession() {
    const cachedUser = getLocalActiveUser();
    if (cachedUser) {
        currentUser = cachedUser;
        showPanelScreen();
        fillIdentityImmediately(cachedUser);
    }
}

async function initMultaniApp() {
    checkImmediateSession();

    const currSel = document.getElementById("currencySelect");
    if (currSel) currSel.value = activeCurrency;
    
    loadCachedCategoriesAndServices();

    const isOAuthRedirect = window.location.hash && (window.location.hash.includes("access_token") || window.location.hash.includes("refresh_token"));

    if (supabaseClient) {
        supabaseClient.auth.onAuthStateChange(async (event, session) => {
            if (session && session.user) {
                currentUser = session.user;
                saveLocalActiveUser(session.user);
                showPanelScreen();
                await postLoginSuccess(currentUser);
                if (isOAuthRedirect) {
                    window.history.replaceState(null, null, window.location.pathname);
                }
            } else if (event === 'SIGNED_OUT') {
                currentUser = null;
                currentUserProfile = null;
                clearLocalActiveUser();
                showAuthScreen();
            }
        });

        const timeoutWait = isOAuthRedirect ? 2500 : 800;
        const sessionPromise = supabaseClient.auth.getSession();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), timeoutWait));

        try {
            const res = await Promise.race([sessionPromise, timeoutPromise]);
            if (res && res.data && res.data.session && res.data.session.user) {
                currentUser = res.data.session.user;
                saveLocalActiveUser(res.data.session.user);
                showPanelScreen();
                postLoginSuccess(currentUser);
            } else if (!getLocalActiveUser() && !isOAuthRedirect) {
                showAuthScreen();
            }
        } catch(e) {
            if (!getLocalActiveUser() && !isOAuthRedirect) showAuthScreen();
        }
    } else {
        if (!getLocalActiveUser()) showAuthScreen();
    }

    fetchFreshServicesAndCategories();
    loadSiteAnnouncement();
}

window.addEventListener("DOMContentLoaded", initMultaniApp);

async function postLoginSuccess(user) {
    fillIdentityImmediately(user);
    await ensureUserProfile(user);
    await loadUserProfile();
    loadCustomerOrders();
    loadCustomerChat();
    await loadCustomerDepositsHistory();
}

function fillIdentityImmediately(user) {
    if (!user) return;
    const meta = user.user_metadata || {};
    const email = user.email || '';
    const name = meta.full_name || meta.name || (email ? email.split('@')[0] : 'Member');

    const customDp = localStorage.getItem(`cust_dp_${user.id}`);
    const avatar = customDp || meta.avatar_url || meta.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

    const profNameInput = document.getElementById("profFullName");
    const profEmailInput = document.getElementById("profEmail");
    const navAvatar = document.getElementById("navAvatarImg");
    const profAvatar = document.getElementById("profilePageAvatar");
    const profPwInput = document.getElementById("profPasswordDisplay");

    if (profNameInput && !profNameInput.value) profNameInput.value = name;
    if (profEmailInput) profEmailInput.value = email;
    if (navAvatar) navAvatar.src = avatar;
    if (profAvatar) profAvatar.src = avatar;

    const rememberedPw = localStorage.getItem(`cust_pw_${user.id}`) || localStorage.getItem(`last_typed_pw`);
    if (profPwInput && rememberedPw) {
        profPwInput.value = rememberedPw;
    }
}

function handleGalleryDpUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const base64Data = e.target.result;
        const profAvatar = document.getElementById("profilePageAvatar");
        const navAvatar = document.getElementById("navAvatarImg");

        if (profAvatar) profAvatar.src = base64Data;
        if (navAvatar) navAvatar.src = base64Data;

        if (currentUser) {
            localStorage.setItem(`cust_dp_${currentUser.id}`, base64Data);
            try {
                if (supabaseClient) {
                    await supabaseClient.from("profiles").update({ avatar_url: base64Data }).eq("id", currentUser.id);
                }
            } catch(err) {}
        }
        notify("Profile photo updated from gallery!", "success");
    };
    reader.readAsDataURL(file);
}

function switchAuthTab(mode) {
    const tabLog = document.getElementById("tabBtnLogin");
    const tabReg = document.getElementById("tabBtnRegister");
    const formLog = document.getElementById("customerLoginForm");
    const formReg = document.getElementById("customerRegisterForm");

    if (mode === 'login') {
        tabLog.classList.add("active");
        tabReg.classList.remove("active");
        formLog.classList.remove("hidden");
        formReg.classList.add("hidden");
    } else {
        tabReg.classList.add("active");
        tabLog.classList.remove("active");
        formReg.classList.remove("hidden");
        formLog.classList.add("hidden");
    }
}

async function handleGoogleOAuthLogin() {
    const currentCleanUrl = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: currentCleanUrl }
    });
    if (error) notify("Google Login Error: " + error.message, "error");
}

async function handleCustomerLogin(e) {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;
    const btn = document.getElementById("btnLoginSubmit");

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Logging in...`;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Login Account`;

    if (error) return notify(error.message, "error");
    
    if (data.user) {
        localStorage.setItem(`cust_pw_${data.user.id}`, password);
        localStorage.setItem(`last_typed_pw`, password);
    }

    notify("Welcome back!", "success");
    currentUser = data.user;
    saveLocalActiveUser(data.user);
    showPanelScreen();
    postLoginSuccess(currentUser);
}

async function handleCustomerRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById("regFullName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value;
    const btn = document.getElementById("btnRegisterSubmit");

    if (password.length < 6) return notify("Password must be at least 6 characters", "error");

    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Creating...`;

    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } }
    });

    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> Create Account`;

    if (error) return notify(error.message, "error");

    if (data.user) {
        localStorage.setItem(`cust_pw_${data.user.id}`, password);
        localStorage.setItem(`last_typed_pw`, password);
        currentUser = data.user;
        saveLocalActiveUser(data.user);
        await ensureUserProfile(data.user, fullName);
        showPanelScreen();
        postLoginSuccess(currentUser);
    }
    notify("Account created successfully!", "success");
}

async function ensureUserProfile(user, fallbackName = null) {
    try {
        if (!user || !user.id || !supabaseClient) return;
        const meta = user.user_metadata || {};
        const resolvedName = fallbackName || meta.full_name || meta.name || (user.email ? user.email.split('@')[0] : 'Member');
        const customDp = localStorage.getItem(`cust_dp_${user.id}`);
        const resolvedAvatar = customDp || meta.avatar_url || meta.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
        const resolvedEmail = user.email || '';

        const { data: existing } = await supabaseClient.from("profiles").select("id, email, full_name").eq("id", user.id).maybeSingle();
        if (!existing) {
            await supabaseClient.from("profiles").insert({
                id: user.id,
                full_name: resolvedName,
                email: resolvedEmail,
                avatar_url: resolvedAvatar,
                balance: 0.0000
            });
        } else {
            const updates = {};
            if (!existing.email && resolvedEmail) updates.email = resolvedEmail;
            if (!existing.full_name && resolvedName) updates.full_name = resolvedName;
            if (Object.keys(updates).length > 0) {
                await supabaseClient.from("profiles").update(updates).eq("id", user.id);
            }
        }
    } catch (err) {
        console.warn("Profile check:", err);
    }
}

async function directCleanLogout() {
    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("active");

    showAuthScreen();

    currentUser = null;
    currentUserProfile = null;
    allCustomerDeposits = [];
    loadedOrdersCache = [];
    clearLocalActiveUser();

    try {
        if (supabaseClient) {
            await supabaseClient.auth.signOut({ scope: 'local' });
        }
    } catch (e) {}

    localStorage.clear();
    sessionStorage.clear();
    window.location.hash = "";

    notify("Logged out successfully!", "info");
}

function switchTab(viewId, element) {
    document.querySelectorAll(".app-view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".mobile-nav-item").forEach(i => i.classList.remove("active"));
    document.querySelectorAll(".sidebar-menu li a").forEach(a => a.classList.remove("active"));

    const target = document.getElementById(viewId);
    if (target) target.classList.add("active");
    if (element) element.classList.add("active");

    if (viewId === 'viewDashboard') {
        const btn = document.getElementById("btnNavHome");
        if (btn) btn.classList.add("active");
        fetchFreshServicesAndCategories();
        loadCustomerOrders();
    } else if (viewId === 'viewServices') {
        const btn = document.getElementById("btnNavServices");
        if (btn) btn.classList.add("active");
        renderServicesPageTable();
    } else if (viewId === 'viewOrdersList') {
        const btn = document.getElementById("btnNavOrders");
        if (btn) btn.classList.add("active");
        loadCustomerOrders();
    } else if (viewId === 'viewSupport') {
        const btn = document.getElementById("btnNavSupport");
        if (btn) btn.classList.add("active");
        loadCustomerChat();
    } else if (viewId === 'viewProfile') {
        loadUserProfile();
    } else if (viewId === 'viewPaymentHistory') {
        loadCustomerDepositsHistory();
    }

    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("active");
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadSiteAnnouncement() {
    try {
        if (!supabaseClient) return;
        const { data } = await supabaseClient.from("site_settings").select("value").eq("key", "announcement").maybeSingle();
        if (data && data.value) {
            document.getElementById("scrollingAnnouncementText").innerText = data.value;
        }
    } catch (e) {}
}

async function loadUserProfile() {
    if (!currentUser) return;
    try {
        let dbProfile = null;
        if (supabaseClient) {
            const { data } = await supabaseClient.from("profiles").select("*").eq("id", currentUser.id).maybeSingle();
            dbProfile = data;
        }
        const meta = currentUser.user_metadata || {};
        const name = (dbProfile && dbProfile.full_name) || meta.full_name || meta.name || (currentUser.email ? currentUser.email.split('@')[0] : 'Member');
        const userEmail = (dbProfile && dbProfile.email) || currentUser.email || '';
        
        currentUserProfile = dbProfile || { balance: 0 };
        document.getElementById("profFullName").value = name;
        
        const emailInput = document.getElementById("profEmail");
        if (emailInput) emailInput.value = userEmail;

        const pwDisplay = document.getElementById("profPasswordDisplay");
        const savedPw = localStorage.getItem(`cust_pw_${currentUser.id}`) || localStorage.getItem(`last_typed_pw`);
        if (pwDisplay && savedPw) {
            pwDisplay.value = savedPw;
        }

        const savedWhatsapp = (dbProfile && dbProfile.whatsapp) || localStorage.getItem(`whatsapp_${currentUser.id}`) || '';
        const waInput = document.getElementById("profWhatsApp");
        if (waInput) waInput.value = savedWhatsapp;
        
        const customDp = localStorage.getItem(`cust_dp_${currentUser.id}`);
        const avatar = customDp || (dbProfile && dbProfile.avatar_url) || meta.avatar_url || meta.picture || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
        
        document.getElementById("navAvatarImg").src = avatar;
        document.getElementById("profilePageAvatar").src = avatar;
        updateWalletDisplay();
    } catch (e) {
        console.warn(e);
    }
}

function updateWalletDisplay() {
    if (!currentUserProfile) return;
    document.getElementById("headerBalanceDisplay").innerText = formatPrice(parseFloat(currentUserProfile.balance || 0));
}

async function handleSaveProfile() {
    const name = document.getElementById("profFullName").value.trim();
    const whatsapp = document.getElementById("profWhatsApp").value.trim();
    const btn = document.getElementById("btnSaveProfile");

    if (!name) return notify("Please enter your name", "error");
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

    try {
        if (supabaseClient && currentUser) {
            const updatePromise = supabaseClient.from("profiles").update({ 
                full_name: name,
                whatsapp: whatsapp 
            }).eq("id", currentUser.id);

            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve({ timeout: true }), 3000));
            await Promise.race([updatePromise, timeoutPromise]);
        }
        notify("Profile updated successfully!", "success");
    } catch (e) {
        notify("Saved!", "success");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Profile`;
        loadUserProfile();
    }
}
