
const chatBox = document.getElementById('chat');
const input = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');

async function loadMessages() {
    const res = await fetch('/messages');
    const messages = await res.json();
    chatBox.innerHTML = '';
    for(const msg of messages){
        const el = document.createElement('div');
        el.innerHTML = `<b style="color:${msg.is_admin?'gold':'pink'}">${msg.username}</b>: ${msg.text}`;
        chatBox.appendChild(el);
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage(){
    const text = input.value.trim();
    if(!text) return;
    await fetch('/send', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ text })
    });
    input.value = '';
    loadMessages();
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keydown', e => { if(e.key==='Enter') sendMessage(); });

setInterval(loadMessages, 2000);
loadMessages();
