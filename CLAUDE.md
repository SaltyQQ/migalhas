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
- Testes automáticos em Node.js, só com módulos nativos (sem npm): pasta `tests/`

# Testar
- IMPORTANT: testar alterações sempre no perfil do Chrome "Migalhas teste" (sem contas nem sessões), nunca no perfil principal: a limpeza apaga cookies e termina sessões. Reiniciar o Chrome recarrega a extensão a partir da pasta, mesmo sem carregar no botão de recarregar, por isso o perfil principal nunca carrega a pasta do projeto: usa uma cópia separada (fora do projeto), atualizada só com versões já testadas.
- Teste automático: `node tests/settings.test.mjs` (Chrome invisível, perfil temporário, sem internet; capturas de ecrã em `tests/output/`). Claude corre os testes e vê as capturas depois de cada alteração, e acrescenta testes para cada funcionalidade nova. O teste manual no perfil "Migalhas teste" fica para a confirmação final.
- No perfil de teste: chrome://extensions → ativar modo programador → "Load unpacked" → escolher a pasta do projeto.
- Depois de cada alteração: carregar no botão de recarregar da extensão em chrome://extensions e fazer refresh à página de teste.
- Erros do content script: consola da página (F12).
- Erros do service worker: link "service worker" na extensão em chrome://extensions.

# Estrutura
- `manifest.json` — configuração da extensão (Manifest V3)
- `background.js` — service worker (limpeza de cookies quando o alarme dispara ou a página de definições pede)
- `schedule.js` — intervalo de limpeza e alarme (partilhado pelo background e pela página de definições)
- `sites.js` — sites com cookies e sites guardados (partilhado pelo background e pela página de definições)
- `content.js` — deteção e recusa de banners nas páginas
- `rules/` — regras por plataforma de consentimento (CMP), uma por ficheiro
- `options/` — página de definições (lista de sites com interruptor guardar/apagar e cadeado, intervalo, "Clean now")
- `tests/` — testes automáticos: `harness.mjs` lança e controla o Chrome; um `*.test.mjs` por funcionalidade

# Regras importantes
- IMPORTANT: Manifest V3 não tem background persistente. O service worker é desligado quando está parado, por isso NÃO usar setInterval para a limpeza periódica — usar a API `chrome.alarms`.
- Recusar sempre: nunca clicar em "Aceitar tudo", mesmo que seja o único botão visível. Se não houver opção de recusar, abrir "Definições/Gerir opções" e desligar tudo o que não é obrigatório. Se nada disso existir, não fazer nada e registar em log.
- Pedir as permissões mínimas no manifest. Justificar qualquer permissão nova antes de a adicionar.
- Sites guardados (whitelist): sites ligados nunca têm cookies limpos (para manter sessões e preferências). A página de definições lista todos os sites com cookies, com um interruptor por site (ligado = guardar, desligado = apagar). Na primeira execução, todos os sites que já existem ficam ligados (instalar nunca termina sessões); os que aparecem depois começam desligados. Cada site tem um cadeado: bloqueado, o interruptor fica fixo (nem um clique nem "Switch all on/off" o mudam). Guardar com `chrome.storage.local`, nunca `sync` (o sync envia os dados para a conta Google).
- Nunca limpar cookies de sites que tenham um separador aberto no momento da limpeza (para não me desligar a meio de usar o site). Esses sites ficam para a limpeza seguinte. Sem acesso a todos os sites não dá para ver os separadores abertos: nesse caso, não limpar nada.
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

# Upgrades futuros
- Alargar a limpeza a outros dados dos sites (localStorage, IndexedDB, Cache Storage, service workers): alguns sites guardam o login fora dos cookies e continuam com sessão depois da limpeza. O `chrome.browsingData` já suporta estes tipos com `excludeOrigins`, mas para eles a exclusão é por origem exata (ex.: `https://mail.google.com`) e não pelo domínio inteiro como nos cookies, por isso os sites guardados vão ter de guardar origens.
- Traduzir a interface para português com `chrome.i18n` (pastas `_locales/en` e `_locales/pt_PT`).
