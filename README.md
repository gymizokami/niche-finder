# Niche Finder

Encontra nichos validados no YouTube: canais **novos**, com **poucos vídeos** e **poucos inscritos**, que já estão com **média de views alta**. Shorts ficam de fora.

**Usar online:** https://gymizokami.github.io/niche-finder/

| Ferramenta | Para quê |
|---|---|
| [Canais Dark](https://gymizokami.github.io/niche-finder/dark.html) | Histórias, mistérios, curiosidades, true crime, documentários… |
| [Música](https://gymizokami.github.io/niche-finder/musica.html) | Lofi, sleep, relax, piano, phonk, ambient, música com IA… |

Cada ferramenta tem duas abas:

- **Mineração**: busca vídeos recentes por palavra-chave, filtra canais novos e pequenos e ranqueia pelo **Viral Score (0–100)**.
- **Analisar canal**: cole o link, o @handle, um link de vídeo ou o nome de um canal e receba as métricas e uma **nota de 0 a 10 para modelar**.

---

## Chave da API (cada pessoa usa a sua)

1. [Google Cloud Console](https://console.cloud.google.com) → criar projeto → ativar **YouTube Data API v3**.
2. **Credenciais → Criar credenciais → Chave de API**. Tipo de dados: **dados públicos**.
3. Restrinja a chave:
   - **Restrições de API:** só *YouTube Data API v3*.
   - **Restrições de aplicativo:** *Referenciadores HTTP* → `https://gymizokami.github.io/*`
     (para usar abrindo o arquivo direto do computador, crie uma segunda chave sem restrição de aplicativo).
4. Cole a chave na barra lateral da ferramenta.

A chave fica salva **só no seu navegador** (localStorage). Ela não está no código e não vai para o GitHub.
**Nunca cole a chave dentro dos arquivos do projeto.**

Cota grátis: **10.000 unidades/dia** por chave. Cada palavra-chave × duração custa ~100 unidades; analisar um canal pelo link custa ~3–10 (pelo nome, +100).

---

## Estrutura

```
index.html            página inicial (escolher a ferramenta)
dark.html             ferramenta de canais dark (só a marcação da página)
musica.html           ferramenta de música
modos/
  dark.js             configurações do modo dark: palavras sugeridas, regra de Shorts, limites
  musica.js           configurações do modo música + formatos (faixas / mixes / horas)
shared/
  util.js             API do YouTube, cota, formatação, Viral Score
  mineracao.js        aba Mineração (busca, filtros, cards, exportar CSV/JSON)
  analise.js          aba Analisar canal (nota para modelar, relatório)
  app.js              abas e inicialização
  estilo.css          visual das duas ferramentas (cores de cada modo em body.modo-xxx)
testes/
  mock-api.js         API falsa usada no modo teste
```

Tudo que está em `shared/` vale para as duas ferramentas: **uma melhoria feita lá aparece nas duas**.
O que é específico de um modo fica em `modos/`.

Não tem build nem instalação: é HTML + CSS + JavaScript puro. Edite e recarregue a página.

---

## Como contribuir

1. **Teste sem gastar cota:** abra `dark.html?teste` ou `musica.html?teste`. A API é simulada (5 canais falsos) e nada é gravado nos seus dados reais.
2. **Teste de verdade:** abra sem `?teste`, faça uma mineração pequena (1 palavra-chave) e analise 1 canal.
3. **Envie a mudança:**
   - Mudança pequena: edite direto no GitHub (ícone de lápis) e salve com uma descrição clara.
   - Mudança grande: crie uma *branch*, faça as alterações e abra um *Pull Request* para o outro revisar.
4. Combinem quem está mexendo em qual arquivo para não editarem o mesmo ao mesmo tempo.
5. O site atualiza sozinho ~1 minuto depois de cada alteração na branch `main`.

### Onde mexer

| Quero… | Arquivo |
|---|---|
| Mudar palavras-chave sugeridas, limites, regra de Shorts | `modos/dark.js` ou `modos/musica.js` |
| Mudar textos/campos da barra lateral | `dark.html` / `musica.html` |
| Mudar filtros, cards ou exportação da mineração | `shared/mineracao.js` |
| Mudar a nota para modelar ou o relatório | `shared/analise.js` |
| Mudar cores e visual | `shared/estilo.css` |
| Criar uma ferramenta para outro nicho | copie `modos/dark.js` + `dark.html`, troque o `id`, as chaves `ls` e a classe `modo-xxx` |

---

## Como as notas são calculadas

### Viral Score (0–100) — mineração

Escalas logarítmicas (cada uma de 0 a 1):

| Peso | Métrica | 1,0 = |
|---|---|---|
| 35% | média de views (sem Shorts) | 1 milhão |
| 25% | views por dia desde o 1º vídeo | 100 mil |
| 20% | mediana de views | 1 milhão |
| 20% | views por inscrito | 50× |

Faixas: **Explosivo** ≥ 80 · **Forte** ≥ 68 · **Promissor** ≥ 55 · **Morno**.

### Nota para modelar (0–10) — Analisar canal

| Peso | Componente | O que mede |
|---|---|---|
| 30% | Tração | média, mediana e views/dia |
| 25% | Consistência | % de vídeos acima do "hit" (10 mil dark / 5 mil música) e mediana/média |
| 20% | Alcance | views por inscrito: o algoritmo entrega para quem não é inscrito |
| 15% | Momento | vídeos recentes vs anteriores |
| 10% | Entrada | canal novo e pequeno = nicho aberto |

Ajustes: sem tração a nota cai até 45%; canal só de Shorts ×0,5; mais de 50% Shorts ×0,85; menos de 3 vídeos ×0,9.
Vereditos: **Modele agora** ≥ 7,5 · **Viável** ≥ 6 · **Arriscado** ≥ 4,5 · **Não recomendado**.

### Shorts

- **Dark:** vídeo com até 3 min.
- **Música:** vídeo **vertical** (ou quadrado) com até 3 min — faixas horizontais de 2–3 min contam normalmente. Se a API não informar a proporção, vale até 60 s.
