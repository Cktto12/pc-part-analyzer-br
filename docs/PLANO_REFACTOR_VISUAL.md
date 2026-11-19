# Plano de Refactor Visual

Branch: `feature/refactor-visual`
Objetivo: deixar o site **simples, bonito e fácil de entender de cara**, sem remover nenhuma funcionalidade. Só muda a apresentação.

---

## 1. Diagnóstico (estado atual)

**Stack:** site estático no GitHub Pages. `index.html` (~2.800 linhas) + ~14,5 mil linhas de JS puro (`app.js`, `app_features.js`, `laptop_mode.js`). Visual via Tailwind por CDN; boa parte do HTML é montada dentro do JS com `innerHTML`.

| Problema | Evidência |
|---|---|
| Texto pequeno demais | ~85% dos textos entre 9px e 12px; só 29 elementos com 18px ou mais |
| Texto demais | Radar ~117 mil caracteres, Custo-Benefício ~99 mil, Duelo ~41 mil; explicações longas sempre abertas |
| Sem página inicial | O site abre direto no Duelo; os 8 recursos ficam escondidos atrás do menu hambúrguer, com nomes longos |
| Cores sem significado | 7 cores de destaque (azul, verde, roxo, âmbar, rosa, ciano, rosa-choque) usadas sem regra; verde nem sempre quer dizer "bom" |
| Alertas cobrindo a tela | Até 3 cards grandes de oferta empilhados no canto direito, por cima do conteúdo |

## 2. Decisão de tecnologia

**Manter HTML + JS puro. Não reescrever em React/Vue.**

- Reescrever 14 mil linhas é um risco enorme para ganho visual zero.
- O deploy estático e a atualização automática pelo GitHub Actions continuam iguais.
- O ganho vem de um **design system próprio**: um CSS com variáveis de cor, escala de tipografia e componentes reutilizáveis. As telas migram para esses componentes aos poucos.

## 3. Regra geral para todas as telas

- **Número e veredito primeiro, explicação depois.**
- Cada parágrafo explicativo vira uma dica num ícone ⓘ ou um "Ver detalhes" recolhido.
- Tipografia mínima: 13px para texto, 12px para rótulos.
- Cores com significado fixo:
  - Cor da marca: navegação e ações principais
  - Verde: vale a pena
  - Âmbar: aguarde
  - Vermelho: caro / não compensa
  - Duas cores fixas para **A vs B** em todas as comparações

## 4. Fases (um commit por fase)

### Fase 0 — Base visual
- [x] Criar `styles/ui.css` com as variáveis de cor e a escala de fontes
- [x] Componentes: card, bloco de número em destaque, selo, botão, seletor segmentado, ícone ⓘ com dica
- [x] Tema único para todos os gráficos do Chart.js

### Fase 1 — Navegação
- [x] Trocar o hambúrguer por um menu sempre visível: barra lateral no desktop, barra inferior no celular
- [x] Agrupar as 8 abas em 4 áreas:
  - **Início**
  - **Comparar** (Duelo + Simulador)
  - **Preços** (Custo-benefício + Black Friday + Promoções)
  - **Montar** (Montagem + Upgrades)
- [x] Configurações no ícone de engrenagem
- [x] Seletor GPU / CPU / Notebook em destaque no topo
- [x] Avisos de oferta: no máximo um por vez, compacto, some sozinho

### Fase 2 — Página inicial nova
- [x] Números grandes no topo: ofertas ativas, produtos no mínimo histórico hoje, dias até a Black Friday
- [x] As 5 melhores ofertas do dia e o top de custo-benefício em cards visuais
- [x] Quatro cards grandes "O que você quer fazer?", que levam a cada área

### Fase 3 — Duelo: veredito primeiro
- [x] Card grande com a resposta em uma frase: **Vale / Aguarde / Não compensa**, mais a diferença de preço
- [x] Barras de desempenho no lugar dos parágrafos
- [x] Explicações detalhadas em "Ver detalhes" recolhido

### Fase 4 — Custo-benefício
- [ ] Tabela mais enxuta, com selo de status do preço (abaixo do alvo / no alvo / caro)
- [ ] Minigráfico de tendência em cada linha
- [ ] Filtros em botões clicáveis em vez de listas suspensas

### Fase 5 — Black Friday e Promoções
- [ ] Painel do Radar vira a aba Promoções: grade de cards com % de desconto em destaque, faixa "Mínimo histórico" e filtros
- [ ] Aba Black Friday: medidor visual de onde o preço de hoje está dentro da faixa esperada

### Fase 6 — Simulador, Montagem e Upgrades
- [ ] Aplicar os mesmos componentes
- [ ] Números em destaque em vez de texto corrido

### Fase 7 — Configurações e acabamento
- [ ] Configurações agrupadas em seções recolhíveis
- [ ] Ajustes para celular
- [ ] Animações de carregamento e mensagens para telas vazias

## 5. Processo

- Cada fase é testada no navegador (desktop e celular) antes do commit.
- Nenhuma funcionalidade é removida; só a apresentação muda.
- Commits na branch `feature/refactor-visual`, um por fase.

## 6. Estimativa de tokens

Estimativa grosseira; a ordem de grandeza está certa.

| Item | Estimativa |
|---|---|
| Saída (código escrito) | ~150 a 300 mil tokens |
| Entrada processada no total | ~25 a 60 milhões de tokens |
| Custo efetivo (com cache a ~10% do preço) | equivale a ~4 a 9 milhões de tokens a preço cheio |

- Fases mais caras: **3 (Duelo)** e **5 (Promoções)**, por terem mais texto e mais HTML gerado pelo JS.
- Fases mais baratas: **0 e 1**, que mexem em pouca coisa.
- **Para economizar:** usar uma sessão nova a cada 1 ou 2 fases, retomando a partir deste arquivo. Isso pode cortar o total pela metade.
