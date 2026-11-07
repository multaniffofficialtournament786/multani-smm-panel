async function loadCustomerChat() {
    if (!currentUser || !supabaseClient) return;
    const body = document.getElementById("customerChatWindow");
    try {
        const { data } = await supabaseClient
            .from("chat_messages")
            .select("*")
            .eq("user_id", currentUser.id)
            .order("created_at", { ascending: true });

        if (data && data.length > 0) {
            body.innerHTML = `
                <div class="bubble-admin">Assalam-o-Alaikum! Leave your question or TRX ID here. Admin will reply live.</div>
            ` + data.map(m => `
                <div class="${m.sender_type === 'admin' ? 'bubble-admin' : 'bubble-user'}">${m.message}</div>
            `).join("");
            body.scrollTop = body.scrollHeight;
        }
    } catch (e) {
        console.warn("Chat load:", e);
    }
}

async function handleSendCustomerChat(e) {
    e.preventDefault();
    if (!currentUser) return notify("Please login first!", "error");
    
    const input = document.getElementById("customerChatInput");
    const btn = document.getElementById("btnSendChat");
    const msg = input.value.trim();
    if (!msg) return;

    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from("chat_messages").insert([{
            user_id: currentUser.id,
            sender_type: 'user',
            message: msg,
            is_read: false
        }]);

        if (error) throw error;
        
        input.value = "";
        await loadCustomerChat();
    } catch (err) {
        console.error("Chat send:", err);
        notify("Could not send message: " + err.message, "error");
    } finally {
        btn.disabled = false;
    }
}
