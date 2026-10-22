/**
 * Script do Popup de Controle da Extensão.
 */

let currentConfig = {
  enabled: true,
  contacts: [
    'Contato Exemplo'
  ],
  requirePrefix: false,
  prefixText: '',
  greetingResponses: {
    bom_dia: 'Bom dia, tudo bem e contigo?',
    boa_tarde: 'Boa tarde, tudo bem e contigo?',
    boa_noite: 'Boa noite, tudo bem e contigo?',
    oi: 'Opa, bão, tudo bem?'
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  renderUI();
  setupEventListeners();
  loadLogs();
});

async function loadConfig() {
  const data = await chrome.storage.local.get(['config']);
  if (data.config) {
    currentConfig = Object.assign(currentConfig, data.config);
  }
}

async function saveConfig() {
  await chrome.storage.local.set({ config: currentConfig });
  renderStatus();
}

function renderUI() {
  // Status switch
  document.getElementById('toggleEnabled').checked = currentConfig.enabled;
  renderStatus();

  // Contatos
  renderContactTags();

  // Opções de prefixo
  const requirePrefixCheckbox = document.getElementById('requirePrefix');
  const prefixTextInput = document.getElementById('prefixTextInput');
  requirePrefixCheckbox.checked = !!currentConfig.requirePrefix;
  prefixTextInput.value = currentConfig.prefixText || '';

  // Respostas de cumprimentos
  if (currentConfig.greetingResponses) {
    document.getElementById('respBomDia').value = currentConfig.greetingResponses.bom_dia || '';
    document.getElementById('respBoaTarde').value = currentConfig.greetingResponses.boa_tarde || '';
    document.getElementById('respBoaNoite').value = currentConfig.greetingResponses.boa_noite || '';
    document.getElementById('respOi').value = currentConfig.greetingResponses.oi || '';
  }
}

function renderStatus() {
  const indicator = document.querySelector('.status-indicator');
  const text = document.getElementById('statusText');

  if (currentConfig.enabled) {
    indicator.classList.add('active');
    text.textContent = 'Bot Ativo e Monitorando';
    text.style.color = '#25d366';
  } else {
    indicator.classList.remove('active');
    text.textContent = 'Bot Pausado';
    text.style.color = '#ff3b30';
  }
}

function renderContactTags() {
  const container = document.getElementById('contactTags');
  container.innerHTML = '';

  if (!currentConfig.contacts || currentConfig.contacts.length === 0) {
    container.innerHTML = '<span style="color:#8696a0;font-size:11px;">Nenhum contato adicionado.</span>';
    return;
  }

  currentConfig.contacts.forEach((contact, index) => {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.innerHTML = `
      <span>${escapeHtml(contact)}</span>
      <span class="tag-remove" data-index="${index}" title="Remover">&times;</span>
    `;
    container.appendChild(tag);
  });
}

function setupEventListeners() {
  // Toggle Switch
  document.getElementById('toggleEnabled').addEventListener('change', async (e) => {
    currentConfig.enabled = e.target.checked;
    await saveConfig();
  });

  // Adicionar Contato
  const inputContact = document.getElementById('newContactInput');
  const btnAdd = document.getElementById('addContactBtn');

  const addContact = async () => {
    const val = inputContact.value.trim();
    if (!val) return;

    if (!currentConfig.contacts.some(c => c.toLowerCase() === val.toLowerCase())) {
      currentConfig.contacts.push(val);
      await saveConfig();
      renderContactTags();
      inputContact.value = '';
    }
  };

  btnAdd.addEventListener('click', addContact);
  inputContact.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addContact();
  });

  // Remover Contato
  document.getElementById('contactTags').addEventListener('click', async (e) => {
    if (e.target.classList.contains('tag-remove')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      currentConfig.contacts.splice(idx, 1);
      await saveConfig();
      renderContactTags();
    }
  });

  // Filtro de Prefixo
  document.getElementById('requirePrefix').addEventListener('change', async (e) => {
    currentConfig.requirePrefix = e.target.checked;
    await saveConfig();
  });

  document.getElementById('prefixTextInput').addEventListener('input', async (e) => {
    currentConfig.prefixText = e.target.value.trim();
    await saveConfig();
  });

  // Salvar Respostas
  document.getElementById('saveGreetingsBtn').addEventListener('click', async () => {
    currentConfig.greetingResponses = {
      bom_dia: document.getElementById('respBomDia').value.trim(),
      boa_tarde: document.getElementById('respBoaTarde').value.trim(),
      boa_noite: document.getElementById('respBoaNoite').value.trim(),
      oi: document.getElementById('respOi').value.trim()
    };
    await saveConfig();

    const btn = document.getElementById('saveGreetingsBtn');
    const oldText = btn.textContent;
    btn.textContent = '✓ Salvo com sucesso!';
    btn.style.borderColor = '#25d366';
    setTimeout(() => {
      btn.textContent = oldText;
      btn.style.borderColor = '#2a3942';
    }, 1500);
  });

  // Testar Notificação
  document.getElementById('testNotificationBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'TEST_NOTIFICATION' });
  });
}

async function loadLogs() {
  const data = await chrome.storage.local.get(['logs']);
  const logsContainer = document.getElementById('logsContainer');

  if (!data.logs || data.logs.length === 0) {
    logsContainer.innerHTML = '<div class="empty-logs">Nenhuma atividade recente registrada.</div>';
    return;
  }

  logsContainer.innerHTML = data.logs.map(log => `
    <div class="log-item">
      <span class="log-time">[${log.time}]</span>
      <span>${escapeHtml(log.text)}</span>
    </div>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
