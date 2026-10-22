/**
 * Content Script da Extensão WhatsApp Bot Auto-Responder.
 * Injetado silenciosamente na aba do WhatsApp Web (web.whatsapp.com).
 * Roda 100% em segundo plano, sem elementos visuais sobrepondo o chat.
 */

console.log('%c[WhatsAppBot] WhatsApp Bot Auto-Responder Ativo (Modo Silencioso)', 'background: #25d366; color: #fff; font-weight: bold; padding: 4px 8px; border-radius: 4px;');

if (typeof GreetingAnalyzer !== 'undefined') {
  window.GreetingAnalyzer = GreetingAnalyzer;
}

let botConfig = {
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
  },
  inactivityResetHours: 4
};

let contactStates = {};
let isProcessing = false;

// Remove qualquer HUD ou elemento residual caso exista
function removeAnyExistingHUD() {
  const oldHud = document.getElementById('bot-hud');
  if (oldHud) oldHud.remove();
  const oldBadge = document.getElementById('bot-floating-badge');
  if (oldBadge) oldBadge.remove();
}

// Carrega configurações e estados salvos
async function loadStorage() {
  try {
    const data = await chrome.storage.local.get(['config', 'states']);
    if (data.config) {
      botConfig = Object.assign(botConfig, data.config);
    }
    if (data.states) {
      contactStates = data.states;
    }
  } catch (e) {
    console.warn('[WhatsAppBot] Erro ao carregar storage:', e);
  }
}

// Salva estados atualizados
async function saveStates() {
  try {
    await chrome.storage.local.set({ states: contactStates });
  } catch (e) {
    console.warn('[WhatsAppBot] Erro ao salvar states:', e);
  }
}

// Escuta mudanças de configuração em tempo real feitas pelo popup da extensão
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.config) {
    botConfig = Object.assign(botConfig, changes.config.newValue);
    console.log('[WhatsAppBot] Configurações atualizadas via popup:', botConfig);
  }
});

/**
 * Limpa caracteres invisíveis de controle Unicode (como \u200e que o WhatsApp usa nos nomes).
 */
function cleanUnicode(str) {
  if (!str) return '';
  return str.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
}

/**
 * Verifica se um contato deve ser monitorado pelo bot.
 * Grupos são categoricamente excluídos.
 */
function isMonitored(rawName) {
  if (!rawName || typeof rawName !== 'string') return false;
  const name = cleanUnicode(rawName);
  const lowerName = name.toLowerCase().trim();

  // Rejeita categoricamente qualquer indício de grupo
  if (lowerName.includes('grupo') || lowerName.includes('group') || lowerName.includes('equipe') || lowerName.includes('squad') || lowerName.includes('time ') || lowerName.includes('família') || lowerName.includes('familia') || lowerName.includes('galera') || lowerName.includes('comunidade')) {
    return false;
  }

  // 1. Se estiver expressamente cadastrado na lista de contatos (correspondência estrita com suporte a diacríticos)
  const normLower = lowerName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (Array.isArray(botConfig.contacts)) {
    for (const c of botConfig.contacts) {
      if (!c) continue;
      const cleanC = cleanUnicode(c).toLowerCase().trim();
      const normC = cleanC.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (cleanC === lowerName || normC === normLower) {
        return true;
      }
    }
  }

  // 2. Filtro por prefixo configurado
  if (botConfig.requirePrefix && botConfig.prefixText) {
    const cleanPrefix = cleanUnicode(botConfig.prefixText).toLowerCase().trim();
    if (cleanPrefix) {
      const normPrefix = cleanPrefix.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lowerName.startsWith(cleanPrefix) || normLower.startsWith(normPrefix)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Verifica de forma definitiva se uma linha da lista lateral (#pane-side) é um grupo ou item de sistema.
 * A extensão NUNCA deve abrir grupos para ler conversas!
 */
function isGroupRow(row) {
  if (!row) return false;

  // 0. Botão de "Arquivadas" ou itens de sistema da lista
  if (row.closest('[data-testid="chatlist-panel-archived-button"]') || row.querySelector('[data-testid="chatlist-panel-archived-button"]')) {
    return true;
  }
  const text = (row.innerText || '').toLowerCase();
  if (text.startsWith('arquivadas') || text === 'arquivadas') {
    return true;
  }

  // 1. Subgrupos e comunidades do WhatsApp
  if (row.querySelector('[data-testid="subgroup-identity"], [data-testid="cell-frame-label"]')) {
    return true;
  }

  // 2. Ícones SVG com title ou data-icon característicos de grupo/comunidade
  const svgTitles = Array.from(row.querySelectorAll('svg title')).map(t => (t.textContent || '').toLowerCase());
  if (svgTitles.some(t => t.includes('group') || t.includes('comunidade') || t.includes('community'))) {
    return true;
  }

  const groupIcon = row.querySelector(
    '[data-icon="default-group"], [data-icon="group"], [data-icon="community"], [data-icon="community-outline"], [data-icon="newsletter"], [data-icon="announcement"], [data-icon="channel-chat"]'
  );
  if (groupIcon) return true;

  // 3. SEPARADOR DE AUTOR NA PRÉVIA DA MENSAGEM (EXCLUSIVO DE GRUPOS)
  // Em grupos, o WhatsApp SEMPRE renderiza o nome do autor seguido de span com ":\u00A0" ou ":"
  // Exemplo: <span>Daniel</span><span>:&nbsp;</span>
  // Em conversas privadas de 1 para 1, NUNCA existe esse separador de dois pontos com espaço!
  const lastMsg = row.querySelector('[data-testid="last-msg-status"]');
  if (lastMsg) {
    const spans = Array.from(lastMsg.querySelectorAll('span'));
    const hasAuthorColon = spans.some(s => s.textContent === ':\u00A0' || s.textContent.trim() === ':');
    if (hasAuthorColon) return true;
  }

  // 4. Termos típicos de grupo no título do chat
  const title = getSidebarChatTitle(row).toLowerCase();
  if (title) {
    if (title.includes('grupo') || title.includes('group') || title.includes('equipe') || title.includes('squad') || title.includes('time ') || title.endsWith(' time') || title.includes('família') || title.includes('familia') || title.includes('clube') || title.includes('comunidade') || title.includes('vagas')) {
      return true;
    }
  }

  // 5. Avatar de grupo (alt com termos de grupo ou src com @g.us)
  const avatar = row.querySelector('img');
  if (avatar) {
    const alt = (avatar.getAttribute('alt') || '').toLowerCase();
    const src = avatar.getAttribute('src') || '';
    if (alt.includes('grupo') || alt.includes('group') || alt.includes('comunidade') || alt.includes('community') || src.includes('@g.us') || src.includes('%40g.us')) {
      return true;
    }
  }

  // 6. Atributo aria-label da linha
  const aria = (row.getAttribute('aria-label') || '').toLowerCase();
  if (aria.includes('grupo') || aria.includes('group') || aria.includes('comunidade') || aria.includes('community') || aria.includes('canal')) {
    return true;
  }

  // 7. JID estrito de grupos do WhatsApp (@g.us)
  if (row.innerHTML.includes('@g.us') || row.innerHTML.includes('%40g.us')) {
    return true;
  }

  return false;
}

/**
 * Extrai o título real do chat da lista lateral (topo do item),
 * ignorando spans de contagem de mensagens não lidas e autores de prévias.
 */
function getSidebarChatTitle(row) {
  if (!row) return '';

  // 1. Procura no container específico de título (cell-frame-title)
  const titleContainer = row.querySelector(
    'div[data-testid="cell-frame-title"], div[class*="cell-frame-title"], div._ak8q, div._amig'
  );
  if (titleContainer) {
    // No HTML do WhatsApp Web, o título real do contato está SEMPRE no span com atributo title!
    // Spans auxiliares (como "1 mensagem não lida") NÃO possuem o atributo title.
    const spanWithTitle = titleContainer.querySelector('span[title]');
    if (spanWithTitle) {
      const t = cleanUnicode(spanWithTitle.getAttribute('title') || spanWithTitle.innerText || '');
      if (t) return t;
    }

    // Se não houver span[title], procura span[dir="auto"] que não seja mensagem de não lida
    const dirSpans = titleContainer.querySelectorAll('span[dir="auto"], [dir="auto"]');
    for (const el of dirSpans) {
      const text = cleanUnicode(el.innerText || '').trim();
      const lower = text.toLowerCase();
      if (text && !lower.includes('não lida') && !lower.includes('nao lida') && !lower.includes('unread')) {
        return text;
      }
    }
  }

  // 2. Fallback: procurar primeiro span com title dentro de gridcell ou no próprio row
  const firstSpanWithTitle = row.querySelector('div[role="gridcell"] span[title], span[title]');
  if (firstSpanWithTitle) {
    const t = cleanUnicode(firstSpanWithTitle.getAttribute('title') || '');
    if (t && !t.toLowerCase().includes('não lida') && !t.toLowerCase().includes('nao lida')) {
      return t;
    }
  }

  // 3. Fallback: linhas do innerText excluindo horários, badges e texto de não lida
  const lines = (row.innerText || '').split('\n').map(l => cleanUnicode(l).trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(line) &&
        !/^\d{1,4}$/.test(line) &&
        !lower.includes('não lida') &&
        !lower.includes('nao lida') &&
        !lower.includes('unread')) {
      return line;
    }
  }

  return '';
}

/**
 * Verifica se o chat atualmente aberto na tela (#main) é um grupo.
 * O bot NUNCA deve responder ou ler mensagens dentro de grupos.
 */
function isOpenChatGroup() {
  const main = document.querySelector('#main');
  if (!main) return false;

  const header = main.querySelector('header');
  if (header) {
    // 0. Se no cabeçalho houver "Dados do perfil", é CATEGORICAMENTE uma conversa 1 a 1 (não é grupo)!
    const profileBtn = header.querySelector('[aria-label="Dados do perfil"], [title="Dados do perfil"], [aria-label*="perfil"]');
    if (profileBtn) {
      return false;
    }

    // 1. Ícones de grupo no cabeçalho
    const groupIcon = header.querySelector(
      '[data-icon="default-group"], [data-icon="group"], [data-icon="community"], [data-icon="community-outline"], [data-icon="newsletter"], [data-icon="announcement"]'
    );
    if (groupIcon) return true;

    // 2. Avatar de grupo no cabeçalho
    const avatarImg = header.querySelector('img');
    if (avatarImg) {
      const alt = (avatarImg.getAttribute('alt') || '').toLowerCase();
      const src = avatarImg.getAttribute('src') || '';
      if (alt.includes('grupo') || alt.includes('group') || alt.includes('comunidade') || src.includes('@g.us') || src.includes('%40g.us')) {
        return true;
      }
    }

    // 3. Botão de dados do grupo no cabeçalho
    const groupBtn = header.querySelector('[aria-label="Dados do grupo"], [title="Dados do grupo"], [aria-label*="grupo"], [aria-label*="group"]');
    if (groupBtn) return true;

    // 4. Subtítulo com lista de participantes (separados por vírgula) ou termos de grupo
    const headerText = cleanUnicode(header.innerText || '').toLowerCase();
    const lines = headerText.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.includes(',') && !line.includes('visto por último') && !line.includes('online') && !line.includes('digitando')) {
        return true;
      }
      if (line.includes('dados do grupo') || line.includes('group info') || line.includes('participante') || line.includes('membro') || line.includes('admin')) {
        return true;
      }
    }
  }

  // 5. Data-id das mensagens no container (@g.us indica grupo no protocolo WhatsApp)
  const messagesWithId = main.querySelectorAll('div[data-id]');
  for (let i = 0; i < Math.min(messagesWithId.length, 15); i++) {
    const did = messagesWithId[i].getAttribute('data-id') || '';
    if (did.includes('@g.us') || did.includes('%40g.us')) {
      return true;
    }
  }

  return false;
}

/**
 * Obtém ou inicializa o estado de um contato com array de mensagens processadas.
 */
function getContactState(contactName) {
  const key = cleanUnicode(contactName);
  let state = contactStates[key];
  const now = Date.now();
  const resetMs = (botConfig.inactivityResetHours || 4) * 60 * 60 * 1000;

  if (!state) {
    state = {
      contactName: key,
      stage: 'idle', // 'idle' | 'awaiting_reply' | 'demand_notified'
      processedIds: [],
      lastActivityTime: now
    };
    contactStates[key] = state;
  } else {
    if (!Array.isArray(state.processedIds)) {
      state.processedIds = state.lastMessageId ? [state.lastMessageId] : [];
    }
    // Se passou do tempo de inatividade, reseta para idle para permitir nova saudação
    if (now - state.lastActivityTime > resetMs) {
      console.log(`[WhatsAppBot] Resetando estado de ${key} para 'idle' após inatividade.`);
      state.stage = 'idle';
      state.processedIds = [];
    }
  }

  return state;
}

/**
 * Identifica o nome do contato cujo chat está aberto no WhatsApp Web.
 * Retorna vazio se a conversa aberta for um grupo.
 */
function getOpenChatContactName() {
  // 0. Se for um grupo, NUNCA retorna como contato monitorado!
  if (isOpenChatGroup()) {
    return '';
  }

  // 1. Procura no cabeçalho (#main header)
  const header = document.querySelector('#main header');
  if (header) {
    const candidateElements = header.querySelectorAll(
      'div[role="button"] span[title], [data-testid="conversation-info-header-chat-title"], div[role="button"] [dir="auto"]'
    );
    for (const el of candidateElements) {
      const text = cleanUnicode(el.getAttribute('title') || el.innerText || '');
      const lower = text.toLowerCase();
      if (text && !lower.includes('online') && !lower.includes('visto por') && !lower.includes('digitando') && !lower.includes('clique para') && text.length > 0) {
        if (isMonitored(text)) return text;
      }
    }
  }

  // 2. Procura no chat selecionado na barra lateral (#pane-side)
  const activeSideChat = document.querySelector(
    '#pane-side div[aria-selected="true"] span[title], #pane-side div[data-testid="cell-frame-container"].selected span[title]'
  );
  if (activeSideChat) {
    const title = cleanUnicode(activeSideChat.getAttribute('title') || '');
    if (title && isMonitored(title)) return title;
  }

  // 3. Fallback: primeiro título do header
  if (header) {
    const firstTitleSpan = header.querySelector('div[role="button"] span[title]');
    if (firstTitleSpan) {
      const t = cleanUnicode(firstTitleSpan.getAttribute('title') || '');
      if (t && isMonitored(t)) return t;
    }
  }

  return '';
}

/**
 * Verifica com rigor absoluto se um elemento de mensagem foi enviado pelo usuário da conta .
 * Mensagens enviadas pelo próprio usuário NUNCA devem ser respondidas pelo bot.
 */
function isMessageFromMe(el, contactName) {
  if (!el) return false;

  // 1. Procura o container mais amplo da mensagem
  const row = el.closest('[data-id], .message-out, .message-in, div[role="row"], div[data-testid="msg-container"]') || el;

  // 2. Marcações explícitas de mensagem enviada no WhatsApp Web moderno
  if (row.querySelector('[data-testid="tail-out"], [data-icon="tail-out"], span[aria-label="Você:"]')) {
    return true;
  }

  // 3. Classes CSS (message-out) no elemento, no row ou em qualquer ancestral
  if (el.closest('.message-out, [class*="message-out"]') || row.closest('.message-out, [class*="message-out"]')) {
    return true;
  }
  if (row.classList.contains('message-out') || Array.from(row.classList).some(c => c.includes('message-out'))) {
    return true;
  }

  // 4. Atributo data-id no elemento ou em qualquer ancestral (true_ = fromMe)
  const idEl = el.closest('[data-id]') || row.closest('[data-id]');
  if (idEl) {
    const dataId = idEl.getAttribute('data-id') || '';
    if (dataId.startsWith('true_') || dataId.includes('_true_')) {
      return true;
    }
  }

  // 5. Ícones de status de envio (checks / relógio só existem em mensagens enviadas pelo usuário)
  const checkIcons = row.querySelectorAll(
    '[data-icon="msg-time"], [data-icon="msg-check"], [data-icon="msg-dblcheck"], [data-icon="msg-dblcheck-ack"], [data-icon="wds-ic-msg-check"], [data-icon="wds-ic-msg-dblcheck"], [data-testid="msg-check"], [data-testid="msg-dblcheck"], [data-icon*="check"], span[aria-label*="Lida"], span[aria-label*="Entregue"], span[aria-label*="Enviada"], title'
  );
  if (checkIcons && checkIcons.length > 0) {
    for (const c of checkIcons) {
      const title = (c.innerText || c.getAttribute('aria-label') || '').toLowerCase();
      if (title.includes('lida') || title.includes('entregue') || title.includes('enviada') || title.includes('read') || title.includes('check')) {
        return true;
      }
    }
  }

  // 6. Atributo data-pre-plain-text (ex: "[12:56, 15/10/2026] o usu�rio: ")
  const copyable = row.querySelector('.copyable-text') || el.closest('.copyable-text') || (el.classList.contains('copyable-text') ? el : null);
  if (copyable) {
    const preText = copyable.getAttribute('data-pre-plain-text') || '';
    if (preText) {
      const match = preText.match(/\]\s*([^:]+):/);
      if (match && match[1]) {
        const sender = cleanUnicode(match[1]).toLowerCase().trim();
        // Se for "Você" ou contiver "o usu�rio" (nome do usuário da conta)
        if (sender === 'você' || sender === 'voce' || sender.includes('o usu�rio')) {
          return true;
        }
        // Se o remetente não tiver qualquer relação com o contato da conversa
        if (contactName) {
          const cleanContact = cleanUnicode(contactName).toLowerCase().trim();
          const contactWords = cleanContact.split(/\s+/).filter(w => w.length > 2 && w !== '');
          const isFromContact = contactWords.some(w => sender.includes(w)) || sender.includes(cleanContact) || cleanContact.includes(sender);
          if (!isFromContact) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Verifica se um elemento é categoricamente uma mensagem recebida do contato monitorado.
 */
function isIncomingMessageFromContact(el, contactName) {
  if (!el) return false;

  // Se foi detectada como enviada por mim, não é recebida
  if (isMessageFromMe(el, contactName)) {
    return false;
  }

  const row = el.closest('[data-id], .message-out, .message-in, div[role="row"], div[data-testid="msg-container"]') || el;

  // 1. Marcações explícitas de recebida no WhatsApp Web moderno
  if (row.querySelector('[data-testid="tail-in"], [data-icon="tail-in"]')) {
    return true;
  }

  // 2. Se tiver classe message-in
  if (el.closest('.message-in, [class*="message-in"]') || row.closest('.message-in, [class*="message-in"]')) {
    return true;
  }

  // 3. Se tiver data-id começando com false_
  const idEl = el.closest('[data-id]') || row.closest('[data-id]');
  if (idEl) {
    const dataId = idEl.getAttribute('data-id') || '';
    if (dataId.startsWith('false_')) {
      return true;
    }
  }

  // 4. Se tiver aria-label com o nome do contato
  if (contactName) {
    const ariaEl = row.querySelector(`span[aria-label*="${contactName}"]`);
    if (ariaEl) return true;
  }

  // 5. Se tiver data-pre-plain-text válido do contato
  const copyable = row.querySelector('.copyable-text') || el.closest('.copyable-text') || (el.classList.contains('copyable-text') ? el : null);
  if (copyable) {
    const preText = copyable.getAttribute('data-pre-plain-text') || '';
    if (preText) {
      const match = preText.match(/\]\s*([^:]+):/);
      if (match && match[1]) {
        const sender = cleanUnicode(match[1]).toLowerCase().trim();
        if (sender !== 'você' && sender !== 'voce' && !sender.includes('o usu�rio')) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Extrai o timestamp em milissegundos a partir do atributo data-pre-plain-text.
 * Exemplo de formato: "[12:56, 15/10/2026] Bruno: "
 */
function getMessageTimestamp(msgEl) {
  try {
    const copyable = msgEl.querySelector('.copyable-text') || msgEl.closest('.copyable-text') || (msgEl.classList.contains('copyable-text') ? msgEl : null);
    if (copyable) {
      const preText = copyable.getAttribute('data-pre-plain-text') || '';
      const match = preText.match(/\[(\d{1,2}):(\d{2})(?::\d{2})?,\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\]/);
      if (match) {
        const [, hours, minutes, day, month, year] = match;
        const fullYear = year.length === 2 ? 2000 + parseInt(year) : parseInt(year);
        const msgDate = new Date(fullYear, parseInt(month) - 1, parseInt(day), parseInt(hours), parseInt(minutes));
        return msgDate.getTime();
      }
    }
  } catch (e) { }
  return null;
}

/**
 * Retorna todas as mensagens da conversa aberta (#main) em ordem cronológica (DOM order),
 * classificando quem enviou cada mensagem.
 */
function getAllChatMessages(contactName) {
  const container = document.querySelector('div[data-testid="conversation-panel-messages"], div.copyable-area, #main') || document.body;
  const elements = Array.from(container.querySelectorAll('div[data-id]'));

  const list = [];
  const seenIds = new Set();

  for (const el of elements) {
    const id = el.getAttribute('data-id');
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);

    const fromMe = isMessageFromMe(el, contactName);
    list.push({
      element: el,
      dataId: id,
      fromMe: fromMe
    });
  }

  // Fallback caso div[data-id] não seja encontrado diretamente
  if (list.length === 0) {
    const rows = Array.from(container.querySelectorAll('div[role="row"]'));
    for (const r of rows) {
      const dataIdEl = r.querySelector('[data-id]') || r;
      const id = dataIdEl.getAttribute('data-id') || r.innerText;
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);

      const fromMe = isMessageFromMe(r, contactName);
      list.push({
        element: r,
        dataId: id,
        fromMe: fromMe
      });
    }
  }

  return list;
}

/**
 * Coleta todas as mensagens recebidas da conversa aberta de forma estrita,
 * excluindo absolutamente qualquer mensagem enviada pelo usuário .
 */
function getIncomingMessages(contactName) {
  const all = getAllChatMessages(contactName);
  return all.filter(m => !m.fromMe).map(m => m.element);
}

/**
 * Extrai o texto limpo de uma mensagem recebida, removendo citações prévias, metadados e hora.
 */
function extractMessageText(msgEl) {
  if (!msgEl) return '';

  // Clona o elemento da mensagem para isolar sem afetar o DOM original
  const clone = msgEl.cloneNode(true);

  // 1. Remove metadados de hora, status e CITAÇÕES (quoted messages para não ler chamados citados como texto digitado)
  clone.querySelectorAll('[data-testid="quoted-message"], [data-testid="msg-meta"], [data-testid="addon-bubble-container"]').forEach(el => el.remove());

  // 2. Procura o texto real digitado pelo contato fora da citação
  const selectableSpan = clone.querySelector('span[data-testid="selectable-text"], .selectable-text, span._ao3e');
  if (selectableSpan && selectableSpan.innerText && selectableSpan.innerText.trim()) {
    return cleanUnicode(selectableSpan.innerText).trim();
  }

  // 3. Fallback: copyable-text sem a citação e sem hora
  const copyable = clone.querySelector('.copyable-text') || (clone.classList.contains('copyable-text') ? clone : null);
  if (copyable) {
    const text = cleanUnicode(copyable.innerText || '').trim();
    if (text) return text;
  }

  return cleanUnicode(clone.innerText || '').trim();
}

/**
 * Digita e envia uma mensagem no chat ativo do WhatsApp Web UMA ÚNICA VEZ de forma 100% limpa.
 */
async function sendTextMessage(text) {
  console.log(`[WhatsAppBot] Enviando resposta automática: "${text}"...`);

  const composeBox = document.querySelector(
    '#main footer div[contenteditable="true"], footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"], footer [role="textbox"]'
  );

  if (!composeBox) {
    console.error('[WhatsAppBot] Caixa de mensagem não encontrada no footer.');
    return false;
  }

  composeBox.focus();

  // 1. Limpa seleção e apaga qualquer texto existente
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(composeBox);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('delete', false, null);

  // 2. Insere a mensagem UMA ÚNICA VEZ
  document.execCommand('insertText', false, text);

  // Dispara evento de input para o React habilitar o botão Enviar
  composeBox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));

  // 3. Aguarda o botão de envio aparecer e clica nele
  let clicked = false;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 100));

    const sendBtn = document.querySelector(
      'button[data-testid="compose-btn-send"], span[data-icon="send"], button[aria-label="Enviar"], button[aria-label="Send"], span[data-icon="send-light"], span[data-icon="send-round"], footer button[data-tab="11"], span[data-icon="wds-ic-send-filled"]'
    );

    if (sendBtn) {
      const btn = sendBtn.closest('button') || sendBtn;
      btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      btn.click();
      clicked = true;
      console.log('[WhatsAppBot] ✓ Mensagem enviada com sucesso!');
      break;
    }
  }

  // 4. Fallback: tecla Enter caso o botão não tenha respondido
  if (!clicked) {
    console.log('[WhatsAppBot] Tentando envio via Enter...');
    const enterOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    composeBox.dispatchEvent(new KeyboardEvent('keydown', enterOpts));
    composeBox.dispatchEvent(new KeyboardEvent('keypress', enterOpts));
    composeBox.dispatchEvent(new KeyboardEvent('keyup', enterOpts));
  }

  return true;
}

/**
 * Toca um aviso sonoro leve.
 */
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) { }
}

/**
 * Detecta se uma mensagem de saudação também contém uma demanda ou solicitação na mesma mensagem.
 * A regra estrita do usuário: saudação com a palavra "demanda", "por favor", "pfv", chamados, links, etc.
 */
function hasDemandContent(text, msgEl) {
  if (!text && !msgEl) return false;

  const norm = GreetingAnalyzer.normalizeText(text);

  // 1. Se contiver termos explícitos de demanda (demanda, por favor, pfv, chamado, caso, preciso, etc.)
  if (norm && GreetingAnalyzer.containsDemandKeywords(norm)) {
    return true;
  }

  // 2. Se contiver links explícitos
  if (text && (text.includes('http://') || text.includes('https://') || text.includes('clickup') || text.includes('app.clickup'))) {
    return true;
  }

  // 3. Se houver citação de mensagem (quoted-message) ou imagem anexada junto da saudação
  if (msgEl) {
    const quoted = msgEl.querySelector('[data-testid="quoted-message"]');
    if (quoted) return true;
    const imageThumb = msgEl.querySelector('[data-testid="image-thumb"]');
    if (imageThumb) return true;
  }

  return false;
}

/**
 * Processa a conversa aberta na tela (#main) de acordo com o fluxo exato exigido:
 * 1. Saudação COM demanda na mesma mensagem ("demanda", "por favor", "pfv", etc.) -> Responde e Notifica.
 * 2. Apenas Saudação -> Responde à saudação e aguarda. Quando o contato mandar a 1ª mensagem seguinte -> Notifica sem responder.
 * 3. Conversas contínuas sem saudação (áudios, mensagens normais) -> NÃO notifica e NÃO responde.
 * 4. NUNCA responde mensagens enviadas pelo usuário .
 */
async function processActiveChat() {
  // 0. BLOQUEIO DE GRUPOS: O bot NUNCA responde nem processa mensagens dentro de grupos!
  if (isOpenChatGroup()) {
    return;
  }

  const contactName = getOpenChatContactName();
  if (!contactName || !isMonitored(contactName)) {
    return;
  }

  const allChatMessages = getAllChatMessages(contactName);
  if (allChatMessages.length === 0) {
    return;
  }

  const state = getContactState(contactName);

  // =========================================================================
  // REGRA DE OURO 1:
  // "a extensão só responde por mim quando a última mensagem do chat tiver sido enviada pelo contato."
  // Se a última mensagem do chat foi enviada pelo o usu�rio (seja pelo celular ou pelo PC),
  // o usuário já está no controle ou já respondeu. A extensão NUNCA responde!
  // =========================================================================
  const lastChatMessage = allChatMessages[allChatMessages.length - 1];
  if (lastChatMessage && lastChatMessage.fromMe) {
    if (state.stage === 'awaiting_reply') {
      state.stage = 'demand_notified';
    }
    for (const m of allChatMessages) {
      if (!state.processedIds.includes(m.dataId)) {
        state.processedIds.push(m.dataId);
      }
    }
    if (state.processedIds.length > 50) {
      state.processedIds = state.processedIds.slice(-50);
    }
    state.lastActivityTime = Date.now();
    await saveStates();
    return;
  }

  const inMessages = allChatMessages.filter(m => !m.fromMe).map(m => m.element);
  if (inMessages.length === 0) {
    return;
  }

  // Analisa as últimas mensagens da conversa
  const recentMessages = inMessages.slice(-5);

  for (const msgEl of recentMessages) {
    // 1. REJEIÇÃO TOTAL SE FOR MENSAGEM DO USUÁRIO 
    if (isMessageFromMe(msgEl, contactName)) {
      const containerWithId = msgEl.closest('[data-id]') || msgEl;
      const messageId = containerWithId.getAttribute('data-id');
      if (messageId && !state.processedIds.includes(messageId)) {
        state.processedIds.push(messageId);
      }
      if (state.stage === 'awaiting_reply') {
        state.stage = 'demand_notified';
        state.lastActivityTime = Date.now();
        await saveStates();
      }
      continue;
    }

    const messageText = extractMessageText(msgEl);
    if (!messageText) continue;

    const containerWithId = msgEl.closest('[data-id]') || msgEl;
    const messageId = containerWithId.getAttribute('data-id') || (contactName + '_' + messageText);

    // Se for mensagem com identificador de grupo (@g.us), ignora e encerra
    if (messageId.includes('@g.us')) {
      return;
    }

    // Se já processou essa mensagem anteriormente, pula
    if (state.processedIds.includes(messageId)) continue;

    // =========================================================================
    // REGRA DE OURO 2:
    // "se eu já respondi a saudação antes da extensão então a extensão não deve responder"
    // Se no histórico do chat houver QUALQUER mensagem enviada por o usu�rio após esta mensagem,
    // significa que a saudação já foi atendida pelo usuário (no celular ou PC).
    // =========================================================================
    const msgIndex = allChatMessages.findIndex(m => m.dataId === messageId || m.element === msgEl);
    if (msgIndex !== -1) {
      const hasMyReplyAfter = allChatMessages.slice(msgIndex + 1).some(m => m.fromMe);
      if (hasMyReplyAfter) {
        console.log(`[WhatsAppBot] o usu�rio já respondeu a esta conversa após esta mensagem. Ignorando resposta automática.`);
        if (!state.processedIds.includes(messageId)) {
          state.processedIds.push(messageId);
        }
        if (state.stage === 'awaiting_reply') {
          state.stage = 'demand_notified';
        }
        state.lastActivityTime = Date.now();
        await saveStates();
        continue;
      }
    }

    // Registra o ID da mensagem como vista
    state.processedIds.push(messageId);
    if (state.processedIds.length > 50) state.processedIds.shift();

    // Se o contato já está em demand_notified, o ciclo deste atendimento já foi concluído!
    // Mensagens subsequentes da conversa (áudios, textos) não devem gerar nova notificação nem resposta.
    if (state.stage === 'demand_notified') {
      state.lastActivityTime = Date.now();
      await saveStates();
      continue;
    }

    // 2. Proteção contra mensagens antigas (mais de 15 minutos) ao abrir o chat
    const msgTime = getMessageTimestamp(msgEl);
    if (msgTime && (Date.now() - msgTime > 15 * 60 * 1000) && state.stage === 'idle') {
      console.log(`[WhatsAppBot] Mensagem antiga de ${contactName} ignorada (${new Date(msgTime).toLocaleTimeString()}).`);
      continue;
    }

    const greeting = GreetingAnalyzer.detectGreeting(messageText);
    const hasDemand = hasDemandContent(messageText, msgEl);
    console.log(`[WhatsAppBot] 📩 Msg recebida de ${contactName}: "${messageText}" | Saudação: ${greeting !== null} | Demanda: ${hasDemand} | Estágio atual: ${state.stage}`);

    // =========================================================================
    // ETAPA 1: O CONTATO MANDOU SAUDAÇÃO (estágio 'idle')
    // =========================================================================
    if (state.stage === 'idle') {
      if (greeting) {
        // Determina a resposta correspondente:
        // Oi / Opa / Olá / etc -> "Opa, bão, tudo bem?"
        // Bom dia -> "Bom dia, tudo bem e contigo?"
        // Boa tarde -> "Boa tarde, tudo bem e contigo?"
        // Boa noite -> "Boa noite, tudo bem e contigo?"
        let reply = '';
        if (greeting.type === 'oi') {
          reply = botConfig.greetingResponses.oi || 'Opa, bão, tudo bem?';
        } else {
          reply = botConfig.greetingResponses[greeting.type] || `${greeting.label}, tudo bem e contigo?`;
        }

        console.log(`[WhatsAppBot] 🎯 Respondendo saudação para ${contactName} (UMA VEZ): "${reply}"`);
        await sendTextMessage(reply);

        chrome.runtime.sendMessage({
          action: 'LOG_ACTION',
          data: { text: `💬 Respondeu "${greeting.label}" de ${contactName} com: "${reply}"` }
        });

        // REGRA 1 DO USUÁRIO:
        // "um contato monitorado mandou uma saudação com a palavra 'demanda', 'por favor', 'pfv', na mesma mensagem => a extensão responde e me manda notificação."
        if (hasDemand) {
          console.log(`[WhatsAppBot] 🚨 SAUDAÇÃO COM DEMANDA NA MESMA MENSAGEM de ${contactName}: "${messageText}"`);
          state.stage = 'demand_notified';
          state.lastActivityTime = Date.now();
          await saveStates();

          playAlertSound();
          chrome.runtime.sendMessage({
            action: 'NOTIFY_DEMAND',
            data: {
              contactName: contactName,
              messageText: messageText
            }
          });
          chrome.runtime.sendMessage({
            action: 'LOG_ACTION',
            data: { text: `🚨 Notificação disparada para saudação com demanda de ${contactName}: "${messageText}"` }
          });
          return;
        }

        // REGRA 2 DO USUÁRIO:
        // "O contato mandou uma saudação => extensão responde, contato manda uma mensagem => extensão manda notificação de Demanda no Whatsapp."
        // Avança para 'awaiting_reply' para aguardar a 1ª mensagem subsequente do contato
        state.stage = 'awaiting_reply';
        state.lastActivityTime = Date.now();
        await saveStates();
        return;
      }

      // REGRA CRÍTICA: Se NÃO houver saudação no estágio idle, o bot NÃO faz nada!
      // Conversas em andamento ou áudios sem saudação NUNCA devem disparar notificação.
      state.lastActivityTime = Date.now();
      await saveStates();
      continue;
    }

    // =========================================================================
    // ETAPA 2: A PESSOA MANDOU A 1ª MENSAGEM APÓS A SAUDAÇÃO (estágio 'awaiting_reply')
    // Lê a mensagem, NÃO responde nada e DISPARA A NOTIFICAÇÃO NO WINDOWS!
    // =========================================================================
    if (state.stage === 'awaiting_reply' || state.stage === 'greeting_sent') {
      console.log(`[WhatsAppBot] 🚨 1ª MENSAGEM APÓS SAUDAÇÃO de ${contactName}: "${messageText}"`);

      // Atualiza o estado para 'demand_notified' para encerrar o ciclo deste atendimento
      state.stage = 'demand_notified';
      state.lastActivityTime = Date.now();
      await saveStates();

      // Toca o som de alerta
      playAlertSound();

      // Dispara a Notificação no Windows
      chrome.runtime.sendMessage({
        action: 'NOTIFY_DEMAND',
        data: {
          contactName: contactName,
          messageText: messageText
        }
      });

      chrome.runtime.sendMessage({
        action: 'LOG_ACTION',
        data: { text: `🚨 Notificação disparada para 1ª msg pós saudação de ${contactName}: "${messageText}"` }
      });

      return; // Encerra o ciclo sem responder
    }

    state.lastActivityTime = Date.now();
    await saveStates();
  }
}

/**
 * Verifica se QUALQUER conversa está atualmente aberta e ativa na tela.
 * Retorna true se houver uma conversa aberta com caixa de digitação no rodapé.
 * Retorna false se o WhatsApp estiver na tela inicial de introdução ou sem conversa selecionada.
 */
function isAnyChatCurrentlyOpen() {
  // 1. Se existe a tela de introdução / boas-vindas do WhatsApp Web, NENHUM chat está aberto.
  const introEl = document.querySelector(
    '[data-testid="intro-title"], [data-testid="intro-text"], [data-icon="intro-md-beta"], [data-icon="laptop"], div[data-testid="intro-image"], div._ak27'
  );
  if (introEl && introEl.offsetParent !== null) {
    return false;
  }

  // 2. Um chat só está genuinamente aberto se houver o container #main
  const main = document.querySelector('#main');
  if (!main) {
    return false;
  }

  // 3. E se houver o cabeçalho do chat e a caixa de digitação no footer
  const header = main.querySelector('header');
  const composeBox = main.querySelector(
    'footer div[contenteditable="true"], div[data-testid="conversation-compose-box-input"], footer [role="textbox"]'
  );
  if (!header || !composeBox) {
    return false;
  }

  // 4. Verifica se a caixa de texto está realmente visível na tela
  return composeBox.offsetParent !== null || composeBox.offsetHeight > 0;
}

/**
 * Detecta de forma robusta se uma linha da lista lateral possui mensagem não lida.
 */
function hasUnreadSidebarMessage(row) {
  if (!row) return false;

  // 1. Badge de contagem com data-testid específico
  const unreadBadge = row.querySelector(
    '[data-testid="icon-unread-count"], [data-icon="unread-count"], [data-testid="unread-count"], [data-testid="unread-pill"]'
  );
  if (unreadBadge) {
    return true;
  }

  // 2. Span de acessibilidade injetado pelo WhatsApp na versão atual (ex: class xzpqnlu com texto "1 mensagem não lida")
  const unreadSpans = row.querySelectorAll('span.xzpqnlu, span[class*="unread"]');
  for (const s of unreadSpans) {
    const text = (s.textContent || '').toLowerCase();
    if (text.includes('não lida') || text.includes('nao lida') || text.includes('unread')) {
      return true;
    }
  }

  // 3. Checa aria-label no row ou em qualquer descendente
  const rowAria = (row.getAttribute('aria-label') || '').toLowerCase();
  if (rowAria.includes('não lida') || rowAria.includes('nao lida') || rowAria.includes('unread')) {
    return true;
  }

  const ariaElements = row.querySelectorAll('[aria-label]');
  for (const el of ariaElements) {
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (aria.includes('não lida') || aria.includes('nao lida') || aria.includes('unread')) {
      return true;
    }
  }

  // 4. Checa linhas numéricas isoladas no innerText (ex: "1", "2")
  const lines = (row.innerText || '').split('\n').map(l => cleanUnicode(l).trim()).filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\d{1,4}$/.test(l) && !/^\d{1,2}:\d{2}$/.test(l)) {
      return true;
    }
  }

  return false;
}

/**
 * Processa mensagens não lidas na lista lateral (#pane-side).
 * Só abre a conversa se NÃO HOUVER NENHUM CHAT ABERTO na tela.
 */
async function processUnreadSidebarChats() {
  // REGRA CRÍTICA DO USUÁRIO:
  // Se o usuário estiver com QUALQUER conversa aberta na tela, a extensão NUNCA pode
  // abrir nenhuma outra conversa (para nunca interromper a conversa atual com outro contato).
  if (isAnyChatCurrentlyOpen()) {
    return;
  }

  const sidebar = document.querySelector('#pane-side');
  if (!sidebar) return;

  // Busca os containers de cada item da lista
  const rows = sidebar.querySelectorAll('div[data-testid="cell-frame-container"], div[role="row"], div[role="listitem"]');
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    // 0. BLOQUEIO TOTAL DE GRUPOS: O bot NUNCA abre grupos para ler conversas!
    if (isGroupRow(row)) {
      continue;
    }

    const title = getSidebarChatTitle(row);
    if (!title || !isMonitored(title)) continue;

    // Detecta badge de mensagem não lida
    if (hasUnreadSidebarMessage(row)) {
      console.log(`[WhatsAppBot] Nenhuma conversa aberta na tela. Nova mensagem em chat direto de: ${title}. Abrindo...`);

      // No WhatsApp Web moderno, o elemento interativo principal é o ancestral com role="gridcell" ou tabindex
      const gridCell = row.closest('div[role="gridcell"]') || row.closest('div[tabindex="-1"]') || row.parentElement;
      const targetToClick = gridCell || row;

      const pointerOpts = { bubbles: true, cancelable: true, view: window, pointerType: 'mouse', button: 0 };
      const mouseOpts = { bubbles: true, cancelable: true, view: window, button: 0 };

      // Dispara sequência completa de interação do ponteiro e clique
      targetToClick.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
      targetToClick.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
      targetToClick.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
      targetToClick.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
      targetToClick.click();
      row.click();

      // Aguarda abrir a conversa e carregar os elementos (até 3 segundos)
      for (let w = 0; w < 20; w++) {
        await new Promise(r => setTimeout(r, 150));
        if (isAnyChatCurrentlyOpen()) break;
      }
      await new Promise(r => setTimeout(r, 200));

      // Se por qualquer motivo o chat aberto for um grupo, aborta imediatamente
      if (isOpenChatGroup()) {
        console.warn(`[WhatsAppBot] Chat aberto detectado como grupo. Abortando.`);
        return;
      }

      // Processa a mensagem e executa o fluxo (responder saudação ou notificar a 1ª mensagem)
      await processActiveChat();
      break;
    }
  }
}

/**
 * Loop principal de monitoramento.
 */
async function runLoop() {
  if (isProcessing || !botConfig.enabled) return;
  isProcessing = true;

  try {
    await processUnreadSidebarChats();
    await processActiveChat();
  } catch (err) {
    console.error('[WhatsAppBot] Erro no ciclo:', err);
  } finally {
    isProcessing = false;
  }
}

/**
 * Conecta canal Keep-Alive com o background worker para garantir que o bot nunca pare
 * mesmo quando a aba estiver em segundo plano ou em outra aba.
 */
function setupKeepAlivePort() {
  try {
    const port = chrome.runtime.connect({ name: 'bot-keepalive' });
    port.onMessage.addListener((msg) => {
      if (msg.type === 'HEARTBEAT') {
        runLoop();
      }
    });
    port.onDisconnect.addListener(() => {
      setTimeout(setupKeepAlivePort, 2000);
    });
  } catch (e) {
    setTimeout(setupKeepAlivePort, 3000);
  }
}

// Inicialização imediata silenciosa
(async function init() {
  removeAnyExistingHUD();
  await loadStorage();
  setupKeepAlivePort();

  // Executa o loop a cada 1.5s
  setInterval(runLoop, 1500);

  // Observer no DOM para reagir instantaneamente quando novas mensagens chegam
  const observer = new MutationObserver(() => {
    runLoop();
  });

  const checkAppLoaded = setInterval(() => {
    const appEl = document.querySelector('#app, #pane-side, div[role="application"]');
    if (appEl) {
      clearInterval(checkAppLoaded);
      observer.observe(appEl, { childList: true, subtree: true });
      console.log('[WhatsAppBot] Observer do WhatsApp Web conectado com sucesso (Silencioso).');
    }
  }, 800);
})();
