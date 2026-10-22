/**
 * Módulo de análise e normalização de cumprimentos e demandas para WhatsApp Web.
 */
const GreetingAnalyzer = {
  /**
   * Normaliza o texto removendo acentos, pontuações, repetições de letras e múltiplos espaços.
   * Ex: "Oiiii, Boooom Diaaaa!!!" -> "oi bom dia"
   */
  normalizeText(text) {
    if (!text || typeof text !== 'string') return '';

    // 1. Minúsculas
    let norm = text.toLowerCase();

    // 2. Remove acentos e diacríticos
    norm = norm.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 3. Remove pontuações e símbolos mantendo letras, números e espaços
    norm = norm.replace(/[^\w\s]/gi, ' ');

    // 4. Trata repetições frequentes em mensagens de WhatsApp
    norm = norm.replace(/\bb+o+m+\b/g, 'bom');
    norm = norm.replace(/\bb+o+a+\b/g, 'boa');
    norm = norm.replace(/\bd+i+a+\b/g, 'dia');
    norm = norm.replace(/\bt+a+r+d+e+\b/g, 'tarde');
    norm = norm.replace(/\bn+o+i+t+e+\b/g, 'noite');
    norm = norm.replace(/\bb+o+a*\s*t+a+r+d+e+\b/g, 'boa tarde');
    norm = norm.replace(/\bb+o+a*\s*n+o+i+t+e+\b/g, 'boa noite');
    norm = norm.replace(/\bb+o+m*\s*d+i+a+\b/g, 'bom dia');
    norm = norm.replace(/\bb+o+d+i+a+\b/g, 'bom dia');
    norm = norm.replace(/\bo+i+[ae]*\b/g, 'oi');
    norm = norm.replace(/\bo+l+a+\b/g, 'ola');
    norm = norm.replace(/\bo+p+a+\b/g, 'opa');
    norm = norm.replace(/(.)\1{2,}/g, '$1'); // Reduz 3+ caracteres repetidos

    // 5. Reduz múltiplos espaços e trim
    norm = norm.replace(/\s+/g, ' ').trim();

    return norm;
  },

  /**
   * Detecta se o texto é um cumprimento inicial (Bom dia, Boa tarde, Boa noite, Oi, etc.)
   */
  detectGreeting(rawText) {
    const norm = this.normalizeText(rawText);
    if (!norm) return null;

    // Se o texto for uma instrução ou pedido para mandar saudação (ex: "me mande um bom dia", "manda bom dia pfv")
    if (/(mande|manda|mandar|envie|envia|enviar|fala|falar|digite|digitar|pedir|pede)\s+(um|uma|o|a)?\s*(bom dia|boa tarde|boa noite|oi|opa|ola)/.test(norm)) {
      return null;
    }

    // Bom Dia
    if (/\b(bom dia|bodia|bon dia|bomdia)\b/.test(norm) || norm === 'dia') {
      return { type: 'bom_dia', label: 'Bom dia' };
    }

    // Boa Tarde
    if (/\b(boa tarde|boatarde|boa tardi)\b/.test(norm) || norm === 'tarde') {
      return { type: 'boa_tarde', label: 'Boa tarde' };
    }

    // Boa Noite
    if (/\b(boa noite|boanoite|boa noiti)\b/.test(norm) || norm === 'noite') {
      return { type: 'boa_noite', label: 'Boa noite' };
    }

    // Oi / Olá / Saudações informais
    if (/\b(oi|oie|ola|opa|helo|hello|hey|eae|e ai|eai|fala ai|salve|fala|coe)\b/.test(norm)) {
      return { type: 'oi', label: 'Oi' };
    }

    return null;
  },

  /**
   * Identifica se a mensagem é estritamente uma resposta de cortesia recíproca
   * (ex: "tudo bem também", "tudo bem e você?", "tudo joia", etc.)
   */
  isPureCourtesyReply(rawText) {
    const norm = this.normalizeText(rawText);
    if (!norm) return false;

    const courtesyExact = [
      'tudo bem',
      'tudo bem tambem',
      'tudo bem tambem e com voce',
      'tudo bem tambem e voce',
      'tudo bem tambem e vc',
      'tudo bem e com voce',
      'tudo bem e voce',
      'tudo bem e vc',
      'tudo bem e contigo',
      'tudo bem gracas a deus',
      'tudo e contigo',
      'tudo e voce',
      'tudo e vc',
      'tudo certinho',
      'tudo certo',
      'tudo joia',
      'tudo otimo',
      'tudo bem sim',
      'tudo 100',
      'tudo bem por aqui',
      'tudo em ordem',
      'tudo tranquilo',
      'comigo tambem tudo bem',
      'comigo tudo bem',
      'comigo tudo certo',
      'comigo tudo bem e voce',
      'bem tambem',
      'bem e voce',
      'bem e vc',
      'otimo e voce',
      'otimo e vc',
      'sim e voce',
      'sim e vc',
      'sim e contigo',
      'tranquilo e voce',
      'tranquilo e vc',
      'tranquilo',
      'suave e voce',
      'suave',
      'opa tudo bem',
      'opa tudo certo',
      'opa tudo joia'
    ];

    if (courtesyExact.includes(norm)) {
      return true;
    }

    // Se começa com cortesia, for curto e não contiver termos de demanda
    if ((norm.startsWith('tudo bem') || norm.startsWith('tudo certo') || norm.startsWith('tudo joia') || norm.startsWith('tudo otimo'))
        && norm.length < 32 && !this.containsDemandKeywords(norm)) {
      return true;
    }

    return false;
  },

  containsDemandKeywords(norm) {
    const keywords = [
      'demanda', 'demandas', 'por favor', 'porfavor', 'pfv', 'favor', 'plz',
      'preciso', 'ajuda', 'chamado', 'ticket', 'bug', 'erro', 'urgente',
      'servidor', 'sistema', 'cliente', 'reuniao', 'relatorio', 'acesso',
      'consegue', 'pode ver', 'da uma olhada', 'olha', 'me manda', 'manda',
      'solicito', 'problema', 'ajudar', 'duvida',
      'caso', 'chegou a ver', 'ver esse', 'veja', 've esse', 'veja esse',
      'chamados', 'link', 'aberto', 'pdv', 'ranking', 'ajuste', 'ajustar',
      'testar', 'teste', 'valida', 'validar', 'conferir', 'confere',
      'verificar', 'dar uma olhada', 'da uma olhada', 'da uma olhadinha'
    ];
    return keywords.some(k => norm.includes(k));
  },

  /**
   * Determina se a mensagem é considerada uma demanda.
   * Só é demanda se já tivermos passado pelo cumprimento (greeting_sent) e a pessoa responder algo fora da cortesia,
   * OU se contiver palavras-chave explícitas de demanda.
   */
  isDemand(rawText, stage) {
    const norm = this.normalizeText(rawText);
    if (!norm) return false;

    // Se contiver palavras-chave de demanda explícitas, já é demanda
    if (this.containsDemandKeywords(norm)) {
      return true;
    }

    // Se nós já enviamos o cumprimento ("greeting_sent"):
    if (stage === 'greeting_sent') {
      // Se for apenas resposta de cortesia ("tudo bem também etc"), não é demanda ainda
      if (this.isPureCourtesyReply(rawText)) {
        return false;
      }

      // Se for apenas outro cumprimento repetido isolado, não é demanda ainda
      if (this.detectGreeting(rawText) && norm.length < 20) {
        return false;
      }

      // Qualquer resposta diferente dos cumprimentos e de "tudo bem também etc" É A DEMANDA!
      return true;
    }

    return false;
  }
};

if (typeof module !== 'undefined') {
  module.exports = GreetingAnalyzer;
}
