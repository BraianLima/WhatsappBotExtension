# WhatsApp Bot Auto-Responder & Notifier (Extensão Microsoft Edge)

Extensão nativa para o **Microsoft Edge / Google Chrome** (Manifest V3) que roda diretamente dentro do navegador, monitorando o **WhatsApp Web** sem depender de console, scripts .bat ou portas de depuração.

---

## ✨ Como Funciona

1. **Totalmente Independente**:
   - Roda direto no Edge/Chrome como extensão oficial.
   - Não depende de porta 9222, nem de arquivos `.bat`, nem de processos de console.
   - Funciona em segundo plano mesmo que você esteja navegando em outra aba.

2. **Abertura Automática de Conversas (Importante)**:
   - **Nenhum chat aberto na tela**: Para que o bot abra automaticamente uma conversa a partir da barra lateral para responder saudações, a tela principal do WhatsApp Web precisa estar sem nenhum chat aberto (na tela inicial padrão do WhatsApp Web).
   - **Proteção contra interrupções**: Se você já estiver com qualquer conversa aberta na tela, o bot **não** fechará nem trocará de conversa automaticamente, garantindo que suas interações manuais nunca sejam interrompidas.
   - **Chat já aberto**: Caso o contato monitorado envie mensagem na conversa que já estiver aberta no momento, o bot processará normalmente o fluxo de respostas e notificações.

3. **Fluxo de Atendimento Inteligente**:
   - **Filtro de Contatos**: Você pode cadastrar contatos específicos por nome completo e/ou ativar a opção de **filtro por prefixo** (por exemplo: monitorar qualquer contato que comece com `Suporte`, `Cliente`, etc.).
   - **Primeira mensagem (Saudação)**:
     - Quando um contato monitorado manda *"Bom dia"*, *"Boa tarde"*, *"Boa noite"* ou *"Oi"* (com qualquer variação: *"oiiiii"*, *"boooom diaaaa"*, *"boa tardeee"*, *"boanoiteee"*, etc.), o bot responde imediatamente com o cumprimento espelhado:
       - *"Bom dia, tudo bem e contigo?"*
       - *"Boa tarde, tudo bem e contigo?"*
       - *"Boa noite, tudo bem e contigo?"*
       - *"Oi, tudo bem e contigo?"*
     - **Não gera notificação ainda** (atendendo à regra de aguardar a demanda).
   - **Próximas mensagens**:
     - Se o contato responder apenas a cortesia de praxe (*"Tudo bem também"*, *"Tudo bem e você?"*, *"Tudo joia"*, *"Tudo certo"*), o bot aguarda.
     - No momento em que o contato mandar qualquer coisa fora dos cumprimentos/cortesia (ou seja, a **demanda**), o bot emite um alerta sonoro e dispara a **Notificação no Windows**:
       > **Demanda no whatsapp**  
       > *[Nome do Contato]: [Texto da demanda]*

---

## 🚀 Como Instalar no Navegador (Edge / Chrome)

1. Abra seu navegador (Microsoft Edge ou Google Chrome).
2. Na barra de endereços, digite:
   - Para Edge: `edge://extensions`
   - Para Chrome: `chrome://extensions`
   e pressione **Enter**.
3. Ative a chave **"Modo do desenvolvedor"** (Developer Mode).
4. Clique no botão **"Carregar sem pacote"** (Load unpacked).
5. Selecione a pasta onde clonou este repositório.
6. Pronto! A extensão **WhatsApp Bot Auto-Responder** está instalada!
7. Abra ou recarregue a aba do seu **WhatsApp Web** (`https://web.whatsapp.com`).

---

## 🎛️ Painel de Controle (Popup)

Clique no ícone da extensão para:
- Ativar / Pausar o bot com uma chave Liga/Desliga.
- Adicionar ou remover contatos da lista em tempo real.
- Personalizar os textos de resposta de cada cumprimento.
- Clicar em **"Testar Notificação no Windows"** para testar os avisos na hora.
- Ver o histórico recente de mensagens respondidas e demandas notificadas.
