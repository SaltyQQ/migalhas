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
- Testes automáticos (Chrome invisível com perfil temporário; capturas de ecrã em `tests/output/`):
  - `node tests/settings.test.mjs` — página de definições e limpeza (sem internet).
  - `node tests/banners.test.mjs` — recusa de banners com a extensão instalada, em cópias locais dos banners (`tests/fixtures/`), incluindo armadilhas (sem internet).
  - `node tests/i18n.test.mjs` — traduções em inglês e português (sem internet; os outros testes correm o Chrome em inglês).
  - `node tests/real-sites.test.mjs` — regras nos sites de teste reais (precisa de internet; o Chrome corre sem privilégios de administrador).
- No GitHub, `.github/workflows/tests.yml` corre os testes offline a cada push (Ubuntu + Chrome); o de sites reais não, porque depende de sites de terceiros. Ver o resultado: separador "Actions" do repositório ou o selo "Tests" no README.
- Claude corre os testes e vê as capturas depois de cada alteração, e acrescenta testes para cada funcionalidade nova (para cada regra nova: cópia local do banner em `tests/fixtures/` e site real em `real-sites.test.mjs`). O teste manual no perfil "Migalhas teste" fica para a confirmação final.
- No perfil de teste: chrome://extensions → ativar modo programador → "Load unpacked" → escolher a pasta do projeto.
- Depois de cada alteração: carregar no botão de recarregar da extensão em chrome://extensions e fazer refresh à página de teste.
- Erros do content script: consola da página (F12).
- Erros do service worker: link "service worker" na extensão em chrome://extensions.

# Estrutura
- `manifest.json` — configuração da extensão (Manifest V3)
- `background.js` — service worker (limpeza de cookies quando o alarme dispara ou a página de definições pede)
- `schedule.js` — intervalo de limpeza e alarme (partilhado pelo background e pela página de definições)
- `sites.js` — sites com cookies e sites guardados (partilhado pelo background e pela página de definições)
- `content.js` — motor da recusa de banners: encontra o banner, chama a regra da CMP e confirma o que o site guardou. O `clickSafely` recusa clicar em qualquer botão com ar de "Aceitar"/"Permitir todos"
- `rules/` — regras por plataforma de consentimento (CMP), uma por ficheiro (ex.: `rules/cookiebot.js`). Cada regra nova entra no `content_scripts` do manifest, antes do `content.js`
- `options/` — página de definições (lista de sites com interruptor guardar/apagar e cadeado, intervalo, "Clean now")
- `_locales/` — textos da interface em inglês (`en`, por defeito) e português (`pt_PT`). Todo o texto novo da página de definições ou do ícone entra nos dois `messages.json` (o `i18n.test.mjs` falha se faltar uma chave). As mensagens da consola ficam em inglês.
- `icons/` — ícone: `icon.svg` é a fonte; os PNG (16/32/48/128) geram-se com `node tools/render-icons.mjs`
- `tools/` — scripts de desenvolvimento (não fazem parte da extensão)
- Indicador na barra: o `content.js` envia `banner-result` ao `background.js`, que mostra ✓ (recusado), ! (deixado como estava) ou ✗ (guardou mais do que o necessário) no ícone do separador; clicar no ícone abre as definições
- `tests/` — testes automáticos: `harness.mjs` lança e controla o Chrome; um `*.test.mjs` por funcionalidade; `fixtures/` com cópias locais dos banners

# Regras importantes
- IMPORTANT: Manifest V3 não tem background persistente. O service worker é desligado quando está parado, por isso NÃO usar setInterval para a limpeza periódica — usar a API `chrome.alarms`.
- Recusar sempre: nunca clicar em "Aceitar tudo", mesmo que seja o único botão visível. Se não houver opção de recusar, abrir "Definições/Gerir opções" e desligar tudo o que não é obrigatório. Se nada disso existir, não fazer nada e registar em log.
- Depois de recusar, confirmar o que a CMP guardou (só os necessários) e registar o resultado na consola da página. Se ficar ligado algo além do necessário, registar como erro.
- Pedir as permissões mínimas no manifest. Justificar qualquer permissão nova antes de a adicionar.
- Sites guardados (whitelist): sites ligados nunca têm cookies limpos (para manter sessões e preferências). A página de definições lista todos os sites com cookies, com um interruptor por site (ligado = guardar, desligado = apagar). Na primeira execução, todos os sites que já existem ficam ligados (instalar nunca termina sessões); os que aparecem depois começam desligados. Cada site tem um cadeado: bloqueado, o interruptor fica fixo (nem um clique nem "Switch all on/off" o mudam). Guardar com `chrome.storage.local`, nunca `sync` (o sync envia os dados para a conta Google).
- Nunca limpar cookies de sites que tenham um separador aberto no momento da limpeza (para não me desligar a meio de usar o site). Esses sites ficam para a limpeza seguinte. Sem acesso a todos os sites não dá para ver os separadores abertos: nesse caso, não limpar nada.
- Outros dados dos sites (localStorage, IndexedDB, Cache Storage, service workers) só são apagados nos sites que estão a ser limpos. O Chrome apaga-os por origem exata (ex.: `https://mail.google.com`), não pelo domínio inteiro como nos cookies, por isso as origens vêm dos hosts com cookies; e, por segurança, nunca se apagam dados de um domínio base (últimos dois rótulos) que esteja guardado ou aberto. Limitação: dados de origens que nunca tiveram cookies não são apagados.
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
- OneTrust: https://www.ikea.com/pt/pt/ (regra feita: `rules/onetrust.js`. "Rejeitar todos os cookies" está no 1.º ecrã; as categorias são numeradas 1–4 em vez de C0001–C0004, por isso as opcionais são as que têm interruptor no painel; o banner fecha com animação)
- Cookiebot: https://www.continente.pt (regra feita: `rules/cookiebot.js`. O 1.º ecrã só mostra "Personalizar" e "Permitir todos"; "Rejeitar todos" aparece depois de "Personalizar")
- InMobi Choice (ex-Quantcast): https://www.sapo.pt (regra feita: `rules/inmobi.js`. Botões sem id, só `mode="primary|secondary|link"`, por isso o botão de rejeitar é reconhecido pelo texto. 1.º ecrã: "MAIS OPÇÕES" e "ACEITAR"; "REJEITAR TODOS" no ecrã seguinte grava e fecha. A escolha lê-se pela API TCF (`readTcfConsent` no `content.js`), reutilizável para outras CMPs TCF)

Para o banner voltar a aparecer depois de recusado: usar janela anónima (ativar "Permitir no modo de navegação anónima" nos detalhes da extensão) ou apagar os cookies desse site.

# Problemas conhecidos
Claude mantém esta lista: acrescentar cada problema que fique por resolver ou cuja causa não seja óbvia (sintoma → causa → estado). Apagar a entrada quando deixar de se aplicar.
- Testes: o Chrome lançado pelos testes fechava logo (código 0) e não respondia → o VS Code corre como administrador e o Chrome recusa-se a correr assim: relança-se sem privilégios num processo novo, que perde a ligação do teste → contornado: o modo offline usa `--do-not-de-elevate` (seguro, porque não abre sites reais); o modo de sites reais deixa o Chrome relançar-se sem privilégios e liga-se por porta. Se o VS Code deixar de correr como administrador, tudo continua a funcionar.
- SAPO (InMobi): depois de "Rejeitar todos", os consentimentos ficam todos recusados, mas as finalidades 2, 7, 8, 9, 10 e 11 continuam ativas por "interesse legítimo" (390 fornecedores) → testado em 2026-10-07: nem "REJEITAR TUDO" no separador "Interesses legítimos" + "Gravar", nem abrindo primeiro uma finalidade, mudam isso (só muda o número do ecrã na TC string) → por resolver: a extensão avisa na consola (`console.warn`) em vez de registar erro. Próxima ideia: ver se cada parceiro/finalidade tem um interruptor "Opor-se" ao expandir.
- O `--load-extension` já não funciona no Chrome oficial (desde a versão 137): os testes instalam a extensão com `Extensions.loadUnpacked` pelo protocolo DevTools (exige `--remote-debugging-pipe` e `--enable-unsafe-extension-debugging`).

# Upgrades futuros
