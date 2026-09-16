# Regras da base Moonshot

**As planilhas no Google Drive são a verdade. O banco é derivado.** Nada é
digitado direto no banco; tudo entra por ingestão. Se um número no banco está
errado, ou a planilha está errada, ou uma regra abaixo está errada — e as duas
coisas se corrigem em lugares diferentes.

Este documento é a regra estabelecida. Ele existe para ser contestado: cada
número tem a razão ao lado, e mudar a razão é mudar o resultado.

---

## 1. As fontes

Quatro planilhas, identificadas por ID (não por nome — nome muda quando alguém
renomeia). Os IDs estão em `FONTES_DRIVE.md`.

| Fonte | O que ela sabe | O que ela não sabe |
|---|---|---|
| ALUNOS MATRICULADOS | contrato, turma, consultor, telefone, e-mail, CPF | faturamento |
| Controle Consultorias | faturamento atual, cidade, ramo, relato do consultor | contrato |
| Cancelamentos | pedido de saída, motivo, desfecho, contato | faturamento, contrato |
| Formulários Pró e Club | porte na entrada, dor, maturidade digital | qualquer coisa posterior à entrada |

**Nenhuma sabe as quatro coisas.** É por isso que o banco existe.

---

## 2. Ciclo de atualização

```
Drive  →  banco.py ingerir  →  SQLite local  →  supabase/carregar.py  →  Supabase
```

Quando uma planilha for atualizada:

```bash
# 1. baixar do Drive (peça a mim, ou exporte como .xlsx)
# 2. ingerir — o tipo é detectado pelo conteúdo
python banco.py ingerir dados/<arquivo>.xlsx

# 3. conferir o que mudou e o que precisa de olho humano
python banco.py resumo
python banco.py revisar

# 4. exportar e carregar no Supabase
python supabase/exportar.py
python supabase/carregar.py --recarregar
```

**Reingerir o mesmo arquivo é no-op** — o sha256 do conteúdo é comparado.
**Versão atualizada da mesma planilha vira fonte nova**, e a anterior permanece.
Foi assim que a queda de 604 para 502 contratos ficou visível.

---

## 3. Identidade — quem é a mesma pessoa

O problema central: a mesma aluna aparece escrita de jeitos diferentes em cada
planilha. Quatro passes, nesta ordem. **O primeiro que casar vence.**

| Passe | Regra | Corte |
|---|---|---|
| 1. Alias conhecido | O nome normalizado já foi visto antes | exato |
| 2. Digitação | Quase todos os caracteres iguais (`difflib` sobre o nome inteiro) | **0,92** |
| 3. Nome parcial | Tokens de um contêm os do outro **E o primeiro nome bate** | automático |
| 4. Tokens | Jaccard sobre as palavras do nome | **0,80** automático · **0,55–0,80** vai para revisão |

Abaixo de 0,55, cria pessoa nova.

**Por que o passe 3 exige o primeiro nome:** sem isso, `Thays Lopes` casaria com
`Claudia Thays das Neves Braga Lopes` — pessoas diferentes.

**Por que o passe 2 existe:** `Fideli` e `Fidelis` têm Jaccard 0,5 e viravam
duas pessoas, apesar de quase todos os caracteres serem iguais.

Casamento entre 0,55 e 0,80 **não some dentro de uma média** — vai para
`revisao_identidade` e espera decisão de gente:

```bash
python banco.py revisar               # os duvidosos
python banco.py decidir 12 --ok       # é a mesma pessoa
python banco.py decidir 12 --separar  # não é
python banco.py unir 45 87            # era, e o banco não viu
```

O método de cada casamento fica em `alias.metodo`. Toda decisão é reversível.

### O que não é pessoa

A coluna de nomes das planilhas mistura nome, rótulo de seção e recado.
São rejeitados: `FRANQUIAS`, `Inadimplentes`, `reunião 05/06`, cabeçalhos
(`nome`, `cliente`, `status`), e qualquer coisa com menos de 3 letras.

**O filtro erra para o lado de manter:** nome estranho ainda pode ser gente,
rótulo de seção nunca é.

### Nome do consultor

Normalizado à parte: sem acento, sem o sufixo "Geral", com apelido resolvido
por um de-para escrito à mão em `CONSULTOR_ALIAS` (`moonshot/db.py`).

**Consultor novo com apelido precisa de linha nova nessa lista.** Nome de gente
não se resolve por algoritmo — alguém precisa dizer que a "Carol" da aba é a
"Carol Leão" do cadastro.

---

## 4. Faturamento — qual valor vence

| Ordem | Fonte | Por quê |
|---|---|---|
| 1 | Relato do consultor (`fat_mes`) | É o mais recente |
| 2 | Formulário de entrada (`fat_declarado`) | Pode ter um ano |

A origem fica em `fat_origem`, e os dois valores continuam visíveis lado a lado.
**A diferença entre eles é informação, não ruído.**

O valor do formulário é texto livre e passa por parser. Só entra com confiança
**alta**, **média** ou **inferida_milhar**. Faixa ambígua e valor implausível
(acima de R$ 1 milhão/mês) ficam **só na camada bruta**.

**Ausência de faturamento não é ausência de valor.** 238 das pessoas sem valor
aparecem apenas em planilhas que não perguntam faturamento.

---

## 5. Contrato — o que conta como vivo

Vivo: `ativo`, `pendente de pagamento`, `bloqueado`.
Fora: `cancelado`, `encerrado`.

Pendente e bloqueado **são contrato**, só em atraso — tirar da conta esconderia
inadimplência, que é justamente o que precisa aparecer.

Quando a aluna tem várias linhas de matrícula (reentrou em turma nova, está em
turma e no Elite), **vale a mais viva**: ativo > pendente > bloqueado >
encerrado > cancelado. Quem cancelou em 2025 e voltou em 2026 é aluna ativa.

---

## 6. Retenção — pedido de saída e desfecho

| Desfecho | Como é lido |
|---|---|
| **Ficou** | Status diz "não", "revertido", ou o texto conta que voltou atrás |
| **Saiu** | Status diz cancelado, reembolso, distrato, acesso removido |
| **Em aberto** | Em contato, verificando, em processo |
| **Sem registro** | Nada preenchido |

Três armadilhas tratadas, e que voltam a morder se alguém mexer no parser:

1. **O relato conta a história inteira numa frase.** "Pediu, voltou atrás, pediu
   de novo" tem os dois sinais. **Vale o último.**
2. **"Voltou" nem sempre é voltar para nós.** "Voltou para o CLT" não é retenção.
3. **Cancelar o Elite não é cancelar a Moonshot.** Cai o upsell, o contrato base
   continua.

**A aba "Cancelamento 7 dias" fica fora da taxa de retenção** — é direito de
arrependimento do CDC, não retenção. Incluindo ela, a taxa cai de 64% para 52%
e a conclusão fica errada.

---

## 7. Potencial

Seis regras, **excludentes**, avaliadas em ordem. Vivem na tabela
`regra_potencial` do Supabase, em português, com condição, ação e cuidado.

A ordem é por **urgência de calendário, não por tamanho do cheque** — renovação
tem data, upsell não.

Os números que governam estão em `parametro`, editáveis sem tocar em SQL:

| Parâmetro | Valor | O que é |
|---|---|---|
| `corte_porte` | 20.000 | Mediana do faturamento de quem tem contrato vivo. Descreve a operação, não é alvo. |
| `meses_renovacao` | 4 | Janela em que renovação vira urgente. Escolha comercial. |
| `meses_contrato` | 12 | Duração padrão. |

**A classificação é view, nunca coluna gravada.** Coluna gravada envelhece em
silêncio: o contrato vence, a aluna cancela, e o rótulo continua o mesmo.

---

## 8. Princípios que não mudam

**Nada se perde.** A linha crua de toda planilha entra em `registro` como JSON,
antes de qualquer interpretação. Se amanhã eu entender melhor uma coluna que
hoje ignoro, o dado ainda está lá.

**Planilha de tipo desconhecido não é recusada.** Entra crua e o banco tenta
achar a coluna de nome. O leitor vem depois; o dado já está guardado.

**Toda afirmação carrega de onde veio.** Cada fato aponta para a `fonte` que o
disse — porque as fontes discordam, e a discordância é informação.

**Campo em branco é informação.** Não é zero, não é média, não é estimativa.

**Célula pequena, número absoluto.** Recorte com menos de 10 respostas reporta
contagem, não percentual.

**O que foi dito e o que foi interpretado ficam em colunas separadas.**
`status_cadastro` é registro; `desfecho` é leitura minha.

---

## 9. O que o banco não sabe

Nenhum destes existe nas planilhas. **Não estime — pergunte.**

- Taxa de renovação de contrato (a de retenção após pedido de saída existe; a de
  renovação no vencimento, não)
- Salários e custo por consultor
- Qual é a carteira sustentável por consultor (os 45–46 são mediana observada)
- Carga real por porte de aluna (o modelo conta cabeças)
- A carteira do Pró — este banco cobre o Club

---

## 10. Privacidade

O banco tem nome, telefone, e-mail, CPF, faturamento e relato dos consultores —
incluindo inadimplência, insatisfação e menção a processo judicial.

- **O código é versionado; o conteúdo não.** `dados/`, `supabase/csv/` e o zip
  de carga estão no `.gitignore`.
- **CPF fica só na camada bruta** (`registro.dados`), fora das tabelas de
  trabalho. `exportar.py --sem-cpf` tira também de lá.
- **RLS ligada em todas as tabelas** do Supabase, com as views em
  `security_invoker` — sem isso elas passariam por cima da RLS.
- Duas planilhas no Drive estão como **"qualquer pessoa com o link pode editar"**
  (Controle Consultorias e franquia_nabeauty). Isso precisa ser fechado.
