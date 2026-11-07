// Updated orders.js for Multani SMM Panel
function loadCachedCategoriesAndServices() {
    try {
        const cachedCats = localStorage.getItem("multani_cached_cats");
        const cachedSrvs = localStorage.getItem("multani_cached_srvs");
        if (cachedCats) allCategories = JSON.parse(cachedCats);
        if (cachedSrvs) allServices = JSON.parse(cachedSrvs);
        if (allCategories.length > 0) populateCategoryDropdown();
        if (allServices.length > 0) renderServicesPageTable();
    } catch (e) {}
}

async function fetchFreshServicesAndCategories() {
    if (!supabaseClient) return;

    try {
        const [catsRes, srvsRes] = await Promise.all([
            supabaseClient.from("categories").select("*").order("name", { ascending: true }),
            supabaseClient.from("services").select("*").order("created_at", { ascending: false })
        ]);

        if (catsRes && catsRes.data && catsRes.data.length > 0) {
            allCategories = catsRes.data;
            localStorage.setItem("multani_cached_cats", JSON.stringify(allCategories));
        }

        if (srvsRes && srvsRes.data && srvsRes.data.length > 0) {
            allServices = srvsRes.data.filter(s => s.is_active !== false && s.is_active !== 'false');
            localStorage.setItem("multani_cached_srvs", JSON.stringify(allServices));
        }

        if ((!allCategories || allCategories.length === 0) && allServices.length > 0) {
            const uniqueCats = {};
            allServices.forEach(s => {
                const cId = s.category_id || 'general';
                uniqueCats[cId] = { id: cId, name: s.category_name || `Category #${cId}` };
            });
            allCategories = Object.values(uniqueCats);
        }

        populateCategoryDropdown();
        renderServicesPageTable();
    } catch (e) {
        console.warn("Categories fetch note:", e);
        populateCategoryDropdown();
    }
}

function populateCategoryDropdown() {
    const catSelect = document.getElementById("orderCatSelect");
    if (!catSelect) return;

    if (!allCategories || allCategories.length === 0) {
        catSelect.innerHTML = '<option value="">Select Category</option>';
        return;
    }

    const currentVal = catSelect.value;
    catSelect.innerHTML = '<option value="">Select Category</option>' + 
        allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");

    if (currentVal) {
        catSelect.value = currentVal;
    }
    renderServiceDropdown(catSelect.value);
}

function handleCategoryFilter(catId) { 
    renderServiceDropdown(catId); 
}

function renderServiceDropdown(catId) {
    const srvSelect = document.getElementById("orderServiceSelect");
    if (!srvSelect) return;
    
    if (!catId) {
        srvSelect.innerHTML = '<option value="">Select Category First</option>';
        selectedService = null;
        calculateTotalCharge();
        return;
    }

    const filtered = allServices.filter(s => String(s.category_id).trim() === String(catId).trim());
    
    if (filtered.length === 0) {
        srvSelect.innerHTML = '<option value="">No services in this category</option>';
        selectedService = null;
        calculateTotalCharge();
        return;
    }

    srvSelect.innerHTML = '<option value="">Select Service</option>' + 
        filtered.map(s => `<option value="${s.id}">${s.name} - (${formatPrice(parseFloat(s.rate_per_1k))}/1k)</option>`).join("");

    selectedService = null;
    calculateTotalCharge();
}

function renderServicesPageTable() {
    const body = document.getElementById("servicesListBody");
    if (!body) return;
    if (!allServices || allServices.length === 0) {
        body.innerHTML = `<p style="text-align: center; color: #A7F3D0; padding: 16px 0;">No services found.</p>`;
        return;
    }

    body.innerHTML = allServices.map(s => `
        <div class="service-item-box">
            <div class="service-item-title">${s.name}</div>
            <div class="service-item-meta">
                <span>Min/Max: <strong>${s.min_quantity} - ${s.max_quantity}</strong></span>
                <strong style="color: #FFE873; font-size: 0.95rem; font-family: var(--font-game);">${formatPrice(parseFloat(s.rate_per_1k))} / 1k</strong>
            </div>
        </div>
    `).join("");
}

function handleServiceSelect(srvId) {
    selectedService = allServices.find(s => String(s.id).trim() === String(srvId).trim()) || null;
    const hint = document.getElementById("qtyLimitHint");
    if (selectedService && hint) {
        hint.innerText = `Min: ${selectedService.min_quantity} | Max: ${selectedService.max_quantity}`;
    } else if (hint) {
        hint.innerText = "";
    }
    calculateTotalCharge();
}

function calculateTotalCharge() {
    const qty = parseInt(document.getElementById("orderQuantity").value) || 0;
    const display = document.getElementById("orderTotalDisplay");
    if (!selectedService || qty <= 0) {
        if (display) display.innerText = formatPrice(0);
        return;
    }
    const chargeUSD = (qty / 1000) * parseFloat(selectedService.rate_per_1k);
    if (display) display.innerText = formatPrice(chargeUSD);
}

async function handlePlaceOrder(e) {
    e.preventDefault();
    if (!currentUser) return notify("Please login first!", "error");
    if (!selectedService) return notify("Select a service first!", "error");

    const qty = parseInt(document.getElementById("orderQuantity").value);
    if (qty < selectedService.min_quantity || qty > selectedService.max_quantity) {
        return notify(`Quantity must be between ${selectedService.min_quantity} and ${selectedService.max_quantity}`, "error");
    }

    const chargeUSD = (qty / 1000) * parseFloat(selectedService.rate_per_1k);
    if (parseFloat((currentUserProfile && currentUserProfile.balance) || 0) < chargeUSD) {
        return notify("Insufficient wallet balance. Please deposit funds.", "error");
    }

    const link = document.getElementById("orderTargetLink").value.trim();
    const btn = document.getElementById("btnPlaceOrder");
    btn.disabled = true;
    btn.innerText = "Placing Order...";

    try {
        const { data: newOrderData, error: orderErr } = await supabaseClient.from("orders").insert({
            user_id: currentUser.id,
            service_id: selectedService.id,
            target_link: link,
            quantity: qty,
            charge: chargeUSD,
            status: 'pending'
        }).select().maybeSingle();

        if (orderErr) throw orderErr;

        await supabaseClient.from("profiles").update({
            balance: parseFloat(currentUserProfile.balance) - chargeUSD
        }).eq("id", currentUser.id);

        try {
            if (newOrderData && newOrderData.id) {
                await supabaseClient.rpc("place_auto_provider_order", { p_order_id: newOrderData.id });
            }
        } catch (e) {}

        notify("Order placed successfully!", "success");
        document.getElementById("orderTargetLink").value = "";
        document.getElementById("orderQuantity").value = "";
        loadUserProfile();
        loadCustomerOrders();
    } catch (err) {
        notify("Order failed: " + err.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerText = "Confirm Order";
    }
}

async function loadCustomerOrders() {
    const recentBody = document.getElementById("dashRecentOrdersBody");
    const list = document.getElementById("customerOrdersList");

    if (!currentUser || !supabaseClient) {
        if (recentBody) recentBody.innerHTML = `<p style="text-align: center; color: #A7F3D0; padding: 14px 0; font-size: 0.85rem;">No orders yet.</p>`;
        if (list) list.innerHTML = `<p style="text-align: center; color: #A7F3D0; font-size: 0.85rem; padding: 14px 0;">No orders placed yet.</p>`;
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from("orders")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: false });

        loadedOrdersCache = data || [];
        calculateDashboardMetrics();
        
        if (loadedOrdersCache.length === 0) {
            if (recentBody) recentBody.innerHTML = `<p style="text-align: center; color: #A7F3D0; padding: 14px 0; font-size: 0.85rem;">No orders yet.</p>`;
            if (list) list.innerHTML = `<p style="text-align: center; color: #A7F3D0; font-size: 0.85rem; padding: 14px 0;">No orders placed yet.</p>`;
            return;
        }

        if (recentBody) {
            recentBody.innerHTML = loadedOrdersCache.slice(0, 5).map(o => {
                const srv = allServices.find(s => String(s.id) === String(o.service_id));
                return `
                    <div style="background: rgba(2, 20, 15, 0.9); border: 1.5px solid var(--border-glass); border-radius: 12px; padding: 10px 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.82rem; margin-bottom: 4px;">
                            <strong style="color: #FFE873;">#${o.order_number || (o.id ? String(o.id).substring(0,5) : '')}</strong>
                            <span class="badge badge-${o.status || 'pending'}">${(o.status || 'pending').toUpperCase()}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #fff;">${srv ? srv.name : 'Service'}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #A7F3D0; margin-top: 4px;">
                            <span>Qty: ${o.quantity}</span>
                            <strong style="color: #FFE873;">${formatPrice(parseFloat(o.charge))}</strong>
                        </div>
                    </div>
                `;
            }).join("");
        }

        if (list) {
            list.innerHTML = loadedOrdersCache.map(o => {
                const srv = allServices.find(s => String(s.id) === String(o.service_id));
                return `
                    <div style="background: rgba(2, 20, 15, 0.9); border: 1.5px solid var(--border-glass); border-radius: 12px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 5px;">
                            <strong style="color: #FFE873;">#${o.order_number || (o.id ? String(o.id).substring(0,5) : '')}</strong>
                            <span class="badge badge-${o.status || 'pending'}">${(o.status || 'pending').toUpperCase()}</span>
                        </div>
                        <div style="font-size: 0.85rem; color: #fff;">${srv ? srv.name : 'Service'}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #A7F3D0; margin-top: 6px;">
                            <span>Qty: ${o.quantity}</span>
                            <strong style="color: #FFE873;">${formatPrice(parseFloat(o.charge))}</strong>
                        </div>
                    </div>
                `;
            }).join("");
        }
    } catch (err) {
        console.error("Orders load:", err);
    }
}

function calculateDashboardMetrics() {
    const total = loadedOrdersCache.length;
    const completed = loadedOrdersCache.filter(o => (o.status || '').toLowerCase() === 'completed').length;
    const pending = loadedOrdersCache.filter(o => (o.status || '').toLowerCase() === 'pending' || (o.status || '').toLowerCase() === 'in_progress').length;
    const totalSpentUSD = loadedOrdersCache.reduce((sum, o) => sum + (parseFloat(o.charge) || 0), 0);

    document.getElementById("statTotalOrders").innerText = total;
    document.getElementById("statCompletedOrders").innerText = completed;
    document.getElementById("statPendingOrders").innerText = pending;
    document.getElementById("statTotalSpent").innerText = formatPrice(totalSpentUSD);
}

function scrollToOrderForm() {
    switchTab('viewDashboard');
    const target = document.getElementById("homeOrderCard");
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const btnOrder = document.getElementById("btnNavOrder");
    const btnHome = document.getElementById("btnNavHome");
    if (btnOrder) btnOrder.classList.add("active");
    if (btnHome) btnHome.classList.remove("active");
    document.getElementById("sidebarDrawer").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("active");
}
