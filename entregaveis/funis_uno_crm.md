# Especificação de funis — Uno CRM
### Grupo NB / Moonshot · para o time de implementação

Documento de especificação. Cada funil abaixo tem: quem usa, de qual planilha
atual ele nasce, as etapas, os campos obrigatórios e as automações. O que está
marcado **[NOVO]** não existe em planilha hoje e precisa ser criado do zero.

---

## 0. Decisão de arquitetura (ler antes de tudo)

**Uma aluna = um contato único no CRM.** Todos os funis referenciam o mesmo
registro de pessoa. Um card em cada funil, nunca um cadastro por funil.

Isso não é preferência de modelagem — é correção de um problema medido. Hoje a
mesma aluna aparece escrita de formas diferentes em cada planilha
("Claudia N. Benati", "CLÁUDIA BENATI", "Claudia Nogueira Benati"), e isso já
gerou **95 duplicatas** numa base de 1.108 registros. Se cada funil tiver seu
próprio cadastro, o CRM reproduz o problema em escala.

**Chave de deduplicação, nesta ordem:** e-mail → telefone → CPF → nome
normalizado. Na importação inicial, qualquer casamento abaixo de certeza total
vai para fila de revisão humana, não para merge automático.

### Campos do contato (compartilhados por todos os funis)

| Campo | Origem hoje | Obrigatório |
|---|---|---|
| Nome completo | Matriculados | sim |
| Telefone | Matriculados / Cancelamento | sim |
| E-mail | Matriculados | sim |
| CPF | Matriculados | não |
| Empresa | Formulário | não |
| Ramo de atividade | Controle Consultorias | não |
| Cidade / UF / País | Controle Consultorias + Matriculados | não |
| Faturamento mensal | Controle Consultorias | não |
| Nº de funcionários | Formulário | não |
| Turma de entrada | Matriculados | sim |
| Produto (Club / Elite / Private) | Matriculados | sim |
| Consultor estratégico | Matriculados | sim |
| CS responsável | Matriculados | sim |
| Data de início / término do contrato | Matriculados | sim |
| Status financeiro | Matriculados | sim |

**Atenção na importação:** o campo "Consultor Estratégico" da planilha de
matrículas **diverge da aba do próprio consultor em 59 casos**. A aba do
consultor é a mais confiável. Importar sem resolver isso leva divergência para
dentro do CRM.

---

## 1. Funil CS — Onboarding e Ativação

**Quem usa:** CS · **Nasce de:** Alunos Matriculados + planilha de Kit/Eventos
**Entra:** matrícula nova confirmada · **Sai:** aluna ativada → Funil Consultor

| # | Etapa | Critério de avanço | Campo de origem |
|---|---|---|---|
| 1 | Matrícula confirmada | Contrato assinado e pagamento ok | `Status`, `Pagamento` |
| 2 | Primeiro contato | CS falou com a aluna | — **[NOVO]** |
| 3 | Onboarding agendado | Data marcada | `Onboarding` |
| 4 | Onboarding realizado | Reunião aconteceu | `Onboarding` |
| 5 | Acesso liberado | Plataforma liberada | `Acesso Plataforma` |
| 6 | Grupo de avisos | Adicionada | `Adc no Grupo Avisos` |
| 7 | Kit enviado | Pijama/jaqueta despachado | `Tamanho`, `Entregue` |
| 8 | **Ativada** | Etapas 4, 5 e 6 concluídas | — |

**Automações:**
- Etapa 1 parada **3 dias** → alerta ao CS
- Etapa 3 ou 4 parada **7 dias** → alerta ao CS + coordenadoria
- Ao entrar em "Ativada" → cria card no Funil Consultor automaticamente
- Kit sem tamanho informado → tarefa para o CS coletar

**Campos próprios:** tamanho do kit, data de envio, código de rastreio,
presença em Check Point / Moonshot Day / eventos.

---

## 2. Funil Consultor — Ciclo de Consultoria

**Quem usa:** consultores · **Nasce de:** Controle Consultorias
**Entra:** aluna ativada pelo CS · **Sai:** ciclo concluído → Funil Renovação

Hoje cada consultor tem uma aba própria com colunas `ENTRADA`, `1.CONSULT.` a
`5.CONSULT.`. **O ciclo já existe — só não é um funil.**

| # | Etapa | Critério | Campo de origem |
|---|---|---|---|
| 1 | Carteira atribuída | Aluna alocada ao consultor | `Consultor Estratégico` |
| 2 | Entrada / diagnóstico | Primeira conversa | `ENTRADA` |
| 3 | 1ª consultoria | Realizada | `1.CONSULT.` |
| 4 | Plano de ação entregue | PA enviado | — **[NOVO]** |
| 5 | 2ª consultoria | Realizada | `2.CONSULT.` |
| 6 | 3ª consultoria | Realizada | `3.CONSULT.` |
| 7 | 4ª consultoria | Realizada | `4.CONSULT.` |
| 8 | 5ª consultoria / fechamento | Realizada | `5.CONSULT.` |
| 9 | **Ciclo concluído** | 5 consultorias feitas | — |

**Campo obrigatório em todas as etapas: `Situação da aluna`** (texto livre — é o
relato do consultor, hoje na coluna `SITUAÇÃO ALUNA`). É o campo mais valioso
das planilhas atuais e o que mais falta ser preenchido.

**Campo estruturado novo — Saúde da aluna** (seleção, obrigatório a cada
consultoria):
`Engajada` · `Oscilante` · `Sem contato` · `Risco de saída` · `Renovou/upsell`

Hoje isso só existe como texto livre e precisa ser interpretado. Estruturar
elimina a interpretação. **Sem esse campo, carteira de consultor que escreve
pouco parece saudável** — é uma distorção medida, não hipótese.

**Automações:**
- Consultoria agendada e não realizada → tarefa de reagendamento
- **90 dias sem consultoria registrada** → alerta ao consultor e à coordenadoria
- Saúde = `Risco de saída` ou `Sem contato` → **cria card no Funil Retenção**
- Saúde = `Engajada` ou `Renovou/upsell` **e** faturamento ≥ R$ 80 mil →
  sugere envio ao Funil Comercial

---

## 3. Funil Consultor — Oportunidades **[NOVO]**

**Quem usa:** consultores · **Nasce de:** coluna `PONTENCIAIS` (existe só em
algumas abas) · **Sai:** Funil Comercial

**Por que é um segundo funil e não uma etapa do primeiro:** são objetos
diferentes. O funil 2 acompanha *entrega* — onde a aluna está no ciclo de
consultorias. Este acompanha *venda* — se ela tem interesse em comprar algo a
mais. Uma aluna pode estar na 3ª consultoria **e** em negociação de upsell ao
mesmo tempo. Num funil só, o card não pode estar em duas etapas, e o consultor
teria que escolher qual verdade registrar.

| # | Etapa | Critério |
|---|---|---|
| 1 | Sinalizada | Consultor marcou como oportunidade |
| 2 | Qualificada pelo consultor | Porte, momento e interesse conferidos |
| 3 | **Enviada ao comercial** | Handoff formal |
| 4 | Devolvida | Comercial devolveu (sem fit ou fora de momento) |

**Campos obrigatórios no handoff (etapa 3):**
produto de interesse (`Elite` · `Private` · `Presencial` · `Clínica` ·
`Produtos`), faturamento atual, justificativa do consultor, melhor canal e
horário de contato.

**Regra de negócio a definir com o comercial:** como fica a comissão ou o
crédito do consultor que originou. Sem isso definido, o funil não é alimentado
— é a falha mais comum nesse tipo de handoff.

---

## 4. Funil Comercial — Expansão **[NOVO]**

**Quem usa:** time comercial · **Não existe planilha hoje**
**Entra:** funil 3, ou lista de elegíveis da coordenadoria

| # | Etapa | Critério |
|---|---|---|
| 1 | Oportunidade recebida | Veio do consultor ou de lista |
| 2 | Qualificada | Porte e momento confirmados |
| 3 | Contato realizado | Comercial falou com a aluna |
| 4 | Apresentação feita | Produto apresentado |
| 5 | Proposta enviada | Valor e condições formalizados |
| 6 | Em negociação | Contraproposta em andamento |
| 7 | **Ganha** | Contrato assinado |
| 8 | Perdida | Com motivo obrigatório |

**Campos:** produto, valor proposto, valor fechado, origem (consultor / lista /
inbound), consultor que originou, motivo da perda (seleção).

**Automações:**
- Etapa 3 parada **2 dias** → alerta
- Etapa 5 parada **7 dias** → alerta ao gestor
- Ganha → notifica o consultor que originou e atualiza o produto no contato
- Perdida → devolve ao funil 3 com o motivo

---

## 5. Funil Renovação **[NOVO — prioridade alta]**

**Quem usa:** CS + consultor · **Nasce de:** `Data de término do plano`

**Este funil não existe em planilha nenhuma hoje, e é onde está o dinheiro
mais previsível.** Medição de setembro/2026: **49 contratos vivos vencendo em
set e out, somando R$ 2,45 milhões/mês de faturamento**, e 44 deles vencem no
mesmo dia (29/09). Sem funil, isso é descoberto por consulta manual.

| # | Etapa | Gatilho |
|---|---|---|
| 1 | Vencimento em 120 dias | Automático pela data |
| 2 | Abordagem iniciada | Consultor ou CS falou |
| 3 | Interesse confirmado | Aluna sinalizou que fica |
| 4 | Proposta de renovação | Condições enviadas |
| 5 | **Renovada** | Novo contrato assinado |
| 6 | Não renovada | Com motivo obrigatório |
| 7 | Encaminhada à Retenção | Sinalizou saída |

**Automação principal:** card criado automaticamente **120 dias antes** do
`Data de término do plano`. Nenhuma entrada manual.

**Alerta de calendário:** as turmas entram em lote, então vencem em lote. Maio
de 2027 concentra 180 términos. O funil precisa de visão por mês de vencimento,
não só por etapa, senão o pico chega sem aviso.

---

## 6. Funil Cancelamento — Retenção

**Quem usa:** time de cancelamento · **Nasce de:** Cancelamento Atual

| # | Etapa | Critério | Campo de origem |
|---|---|---|---|
| 1 | Pedido recebido | Aluna solicitou | `Data`, `Solicitante` |
| 2 | Triagem de prazo | Dentro ou fora dos 7 dias | `Prazo` |
| 3 | Em contato | Retenção tentando | `Status` |
| 4 | Proposta de retenção | Downsell, pausa ou renegociação | `Observações` |
| 5 | **Retida** | Aluna permaneceu | `Status` = revertido |
| 6 | Cancelada | Distrato emitido | `Status` = cancelado |
| 7 | Jurídico / multa | Cobrança ou ação | `Resumo final` |

**Campos obrigatórios:** motivo (**seleção**, não texto livre), responsável por
seguir, prazo (dentro/fora dos 7 dias), valor da multa, proposta oferecida.

**Motivos como lista fechada** — medidos nos 378 pedidos atuais:
`Financeiro` (94) · `Insatisfação com a entrega` (65) ·
`Saúde ou pessoal` (14) · `Falta de tempo` (9) ·
`Fechou ou vendeu o negócio` (4) · `Outro`

**Duas regras que vêm de dado medido, não de opinião:**

**A etapa 2 precisa separar "dentro de 7 dias" do resto.** Pedido dentro do
prazo é direito de arrependimento (CDC art. 49) e **não é trabalho de
retenção** — misturar os dois derruba a taxa de retenção de 64% para 52% e
esconde o desempenho real do time.

**Downsell precisa ser etapa própria, não observação.** Nos dados atuais, dos
26 casos de migração para plano menor, **20 ficaram e nenhum saiu** — 77% contra
64% da média. É a alavanca de retenção mais eficaz que existe hoje e está
invisível dentro de texto livre.

**Automação:** ao entrar na etapa 1, notificar consultor e CS da aluna
imediatamente. Hoje o consultor costuma descobrir depois.

---

## 7. Permissões

| Perfil | Acesso |
|---|---|
| **CS** | Funis 1, 5 (edita) · 2, 6 (leitura) |
| **Consultor** | Funis 2, 3 (edita, **apenas a própria carteira**) · 5 (edita) |
| **Comercial** | Funil 4 (edita) · 3 (leitura) |
| **Cancelamento** | Funil 6 (edita) · 1, 2 (leitura) |
| **Coordenadoria** | Todos, edita, com relatórios gerenciais |

**Restrição de dado sensível:** o campo de relato do consultor e as observações
de cancelamento contêm menção a inadimplência, insatisfação e ação judicial.
Visíveis para o responsável pela aluna e para a coordenadoria — não para todos
os perfis.

---

## 8. Ordem de implementação sugerida

| Fase | O quê | Por quê |
|---|---|---|
| **1** | Contato único + deduplicação | Base de tudo. Errar aqui contamina todos os funis. |
| **2** | Funil 6 (Cancelamento) | Já é processo maduro, com planilha organizada. Migração de menor risco. |
| **3** | Funil 2 (Consultoria) | Maior volume de uso diário. |
| **4** | Funil 5 (Renovação) | Maior retorno imediato: R$ 2,45 mi/mês vencendo nos próximos 45 dias. |
| **5** | Funil 1 (CS) | Depende do 2 estar rodando. |
| **6** | Funis 3 e 4 (Comercial) | Precisa da regra de comissão definida antes. |

---

## 9. Pendências de decisão (não são de implementação)

1. **Comissão do consultor que origina oportunidade** — define se o funil 3 é alimentado
2. **Régua de faturamento** para marcar oportunidade — hoje uso R$ 80 mil/mês, é premissa, não medida
3. **Antecedência do gatilho de renovação** — sugerido 120 dias, não testado
4. **Quem é dono do funil 5** — CS ou consultor
5. **Política de retenção por faixa de faturamento** — o que pode ser oferecido, por quem, até que desconto
