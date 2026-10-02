# Projeto: Migalhas

Extensão de browser que:
1. Deteta banners de consentimento de cookies/anúncios e rejeita tudo exceto o essencial/obrigatório.
2. Limpa cookies automaticamente a cada 60 minutos por defeito (configurável: 15 min / 1 h / 24 h).

Browser alvo: Chrome (e outros baseados em Chromium: Edge, Brave, Opera)
Idioma do código e comentários: inglês

# Stack
- JavaScript simples, sem bibliotecas externas
- Manifest V3
- Sem npm e sem passo de build: os ficheiros são carregados diretamente pelo browser

# Testar
- IMPORTANT: testar sempre no perfil do Chrome "Migalhas teste" (sem contas nem sessões), nunca no perfil principal. A limpeza apaga cookies e termina sessões. A extensão só pode ir para o perfil principal quando existir a whitelist. Atenção: reiniciar o Chrome recarrega a extensão a partir da pasta, mesmo sem carregar no botão de recarregar.
- No perfil de teste: chrome://extensions → ativar modo programador → "Load unpacked" → escolher a pasta do projeto.
- Depois de cada alteração: carregar no botão de recarregar da extensão em chrome://extensions e fazer refresh à página de teste.
- Erros do content script: consola da página (F12).
- Erros do service worker: link "service worker" na extensão em chrome://extensions.

# Estrutura
- `manifest.json` — configuração da extensão (Manifest V3)
- `background.js` — service worker (temporizador e limpeza de cookies)
- `content.js` — deteção e recusa de banners nas páginas
- `rules/` — regras por plataforma de consentimento (CMP), uma por ficheiro
- `options/` — página de definições (whitelist, intervalo de limpeza)

# Regras importantes
- IMPORTANT: Manifest V3 não tem background persistente. O service worker é desligado quando está parado, por isso NÃO usar setInterval para a limpeza periódica — usar a API `chrome.alarms`.
- Recusar sempre: nunca clicar em "Aceitar tudo", mesmo que seja o único botão visível. Se não houver opção de recusar, abrir "Definições/Gerir opções" e desligar tudo o que não é obrigatório. Se nada disso existir, não fazer nada e registar em log.
- Pedir as permissões mínimas no manifest. Justificar qualquer permissão nova antes de a adicionar.
- Whitelist: sites escolhidos por mim nunca têm cookies limpos (para manter sessões e preferências). Adiciono e removo sites na página de definições; a lista é guardada com `chrome.storage`.
- Nunca limpar cookies de sites que tenham um separador aberto no momento da limpeza (para não me desligar a meio de usar o site). Esses sites ficam para a limpeza seguinte.
- Não enviar dados para servidores externos. Tudo corre localmente.

# Open source
- Licença: GPL-3.0 (ficheiro `LICENSE` na raiz). Versões modificadas que sejam distribuídas têm de continuar em código aberto sob a mesma licença.
- Repositório público no GitHub: https://github.com/SaltyQQ/migalhas
- `README.md` em inglês: o que a extensão faz, como instalar ("Load unpacked"), como contribuir. Manter atualizado quando uma funcionalidade muda.
- Antes de copiar código ou regras de outros projetos, confirmar a licença deles e se é compatível com GPL-3.0. Se for, dar crédito no README e manter o aviso de copyright original. Se não tiveres a certeza, perguntar-me primeiro.
- Nunca incluir no repositório dados pessoais, chaves ou ficheiros de teste com cookies reais.
- Mensagens de commit em inglês, curtas e descritivas.

# Estilo de código
- Funções pequenas e com nomes claros.
- Uma regra de CMP por ficheiro em `rules/`.
- Sem bibliotecas externas; se parecer necessária uma, perguntar primeiro.

# Fluxo de trabalho
- Trabalhar um problema de cada vez e testar antes de passar ao seguinte.
- Antes de alterações em vários ficheiros, apresentar um plano e esperar confirmação.
- Depois de cada alteração, dizer-me exatamente o que testar no browser e o que devo ver.
- Quando aparecer um erro, explicar a causa em linguagem simples antes de corrigir.
- Corrigir a causa do erro, não esconder o erro.

# Sites de teste
Um site por plataforma de consentimento (CMP), para testar a regra de cada uma em `rules/`. Todos em português, por isso também testam o texto dos botões em PT. CMP confirmada no HTML de cada site em 2026-09-26 (os sites podem mudar de CMP).
- OneTrust: https://www.ikea.com/pt/pt/
- Cookiebot: https://www.continente.pt
- InMobi Choice (ex-Quantcast): https://www.sapo.pt

Para o banner voltar a aparecer depois de recusado: usar janela anónima (ativar "Permitir no modo de navegação anónima" nos detalhes da extensão) ou apagar os cookies desse site.

# Problemas conhecidos
Claude mantém esta lista: acrescentar cada problema que fique por resolver ou cuja causa não seja óbvia (sintoma → causa → estado). Apagar a entrada quando deixar de se aplicar.
