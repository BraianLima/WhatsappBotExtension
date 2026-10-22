/**
 * Background Service Worker da extensão WhatsApp Bot Auto-Responder.
 */

// Ao instalar ou recarregar, sincroniza a lista de contatos do contacts.json
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const res = await fetch(chrome.runtime.getURL('contacts.json'));
    const initialConfig = await res.json();
    const existing = await chrome.storage.local.get(['config', 'states']);
    if (!existing.config) {
      await chrome.storage.local.set({ config: initialConfig, states: {}, logs: [] });
      console.log('[WhatsAppBot] Configurações iniciais carregadas a partir de contacts.json.');
    } else {
      // Atualiza a lista de contatos mantendo as outras opções personalizadas
      existing.config.contacts = initialConfig.contacts;
      await chrome.storage.local.set({ config: existing.config });
      console.log('[WhatsAppBot] Lista de contatos sincronizada a partir de contacts.json:', initialConfig.contacts);
    }
  } catch (e) {
    console.error('[WhatsAppBot] Falha ao ler contacts.json:', e);
  }
});

// Mantém canal persistente de Keep-Alive e Heartbeat para evitar suspensão de abas em segundo plano
let activePorts = [];
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'bot-keepalive') {
    activePorts.push(port);
    console.log('[WhatsAppBot Background] Canal Keep-Alive conectado com aba do WhatsApp Web.');

    port.onDisconnect.addListener(() => {
      activePorts = activePorts.filter(p => p !== port);
      console.log('[WhatsAppBot Background] Canal Keep-Alive desconectado.');
    });
  }
});

// Envia pulsos periódicos de heartbeat a cada 1.5 segundos para todas as abas ativas do WhatsApp Web
setInterval(() => {
  activePorts.forEach((port) => {
    try {
      port.postMessage({ type: 'HEARTBEAT', time: Date.now() });
    } catch (e) { }
  });
}, 1500);

// Listener para disparar notificações e registrar logs
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'NOTIFY_DEMAND') {
    const { contactName, messageText } = request.data;
    const notificationId = `demand_${Date.now()}`;

    const snippet = messageText.length > 120 ? messageText.substring(0, 117) + '...' : messageText;

    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Demanda no whatsapp',
      message: `${contactName}: ${snippet}`,
      contextMessage: 'WhatsApp Web - Auto-Responder Bot',
      priority: 2,
      requireInteraction: true
    }, (createdId) => {
      console.log('[WhatsAppBot] Notificação exibida no Windows:', createdId);
    });

    // Registra log da demanda
    appendLog(`🚨 Notificação de demanda disparada para ${contactName}: "${snippet}"`);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'LOG_ACTION') {
    appendLog(request.data.text);
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'TEST_NOTIFICATION') {
    chrome.notifications.create(`test_${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Demanda no whatsapp',
      message: 'Notificação de teste do WhatsApp Bot no Windows!',
      priority: 2
    });
    sendResponse({ success: true });
    return true;
  }
});

// Ao clicar na notificação, foca a janela e a aba do WhatsApp Web
chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    const tabs = await chrome.tabs.query({ url: '*://web.whatsapp.com/*' });
    if (tabs.length > 0) {
      const waTab = tabs[0];
      await chrome.tabs.update(waTab.id, { active: true });
      if (waTab.windowId) {
        await chrome.windows.update(waTab.windowId, { focused: true });
      }
    }
    chrome.notifications.clear(notificationId);
  } catch (err) {
    console.error('[WhatsAppBot] Erro ao focar aba do WhatsApp:', err);
  }
});

async function appendLog(text) {
  try {
    const data = await chrome.storage.local.get(['logs']);
    const logs = data.logs || [];
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    logs.unshift({ time: timestamp, text });
    if (logs.length > 50) logs.pop();
    await chrome.storage.local.set({ logs });
  } catch (e) {
    console.error(e);
  }
}
