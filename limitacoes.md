# Limitações — o que esta base não permite afirmar

Documento de contestação. Cada item aqui é um lugar onde a análise pode quebrar numa reunião.

---

## 1. Viés de autosseleção (o mais grave)

As 737 respondentes se inscreveram num programa de mentoria e preencheram um formulário longo. Elas já se identificaram como quem tem problema e busca ajuda.

**Não afirme:** "37,7% das empreendedoras de beleza têm dificuldade de reter equipe."
**Afirme:** "37,7% das alunas que se inscreveram no Moonshot citam retenção de equipe."

Não há grupo de controle, não há amostra do mercado, e não há como estimar quanto o programa atrai um perfil específico. Todo número deste relatório descreve a base do Moonshot, não o mercado de beleza.

## 2. O formulário Pro induz a resposta

As 5 perguntas de pilar ("o que você gostaria de melhorar no pilar Flow Mind / Business / Growth / Sales / Experience") nomeiam o tema antes de a aluna responder. Isso garante menções em todos os cinco temas.

Efeito medido: `mentalidade` aparece em 27,5% das respostas às perguntas induzidas e em 11,6% das espontâneas. `fidelizacao_recompra` vai de 33,1% para 6,5%. `reter_liderar` faz o caminho inverso: 10,6% induzida, 37,7% espontânea.

**Consequência:** o ranking consolidado (painel A) mistura os dois enquadramentos e não deve ser usado sozinho. O resumo executivo usa o painel espontâneo por isso. Os quatro painéis estão na aba `Dores_Declaradas`.

## 3. O subconjunto com faturamento parseável é enviesado

Das 737, 685 tiveram faturamento convertido em número. As 52 restantes **não são um recorte aleatório**:

| Variável | Com faturamento | Sem faturamento | Mann-Whitney |
|---|---|---|---|
| Funcionários (mediana) | 1 | 0 | p = 0,0004 |
| Anos de operação (mediana) | 5 | 1 | p < 0,0001 |

Quem não consegue declarar faturamento é sistematicamente mais nova e menor. **A distribuição de faturamento e a mediana de R$ 17.500 superestimam a maturidade da base.** A associação com nicho, em compensação, não é significativa (χ², p = 0,41) — não há viés de setor.

## 4. Conversões que são interpretação, não dado

- **Milhar inferido (23 alunas):** "50" num campo de faturamento mensal foi lido como R$ 50.000. A leitura literal (R$ 50/mês) é implausível, mas é inferência. Marcadas em `fat_confianca`.
- **Ponto médio de faixa (193 alunas):** "45 mil a 55 mil" virou R$ 50.000. A aluna nunca disse 50.
- **Câmbio (88 alunas em EUR/USD):** convertido por taxa fixa (USD 5,40 / EUR 6,20) definida em `CONFIG['fx']` do `pipeline.py`. **É um parâmetro, não um dado.** Atualize antes de usar valores em decisão comercial.
- **Quarentena (2 alunas):** valores acima de R$ 1 milhão/mês foram excluídos das estatísticas por virem de texto malformado ("3.200 mil euros"). O texto original está preservado.
- **Equipe:** sócias, PJ, comissionadas e aluguel de cadeira foram contadas como equipe. É uma escolha; contar só CLT daria outro número. 53 classificações têm confiança "baixa" e 18 não foram classificáveis.

## 5. Onde o N é pequeno demais

- **Base Club: 21 respondentes.** Nenhum percentual do Club sustenta decisão. Na aba `Dores_Declaradas` o painel D reporta números absolutos por isso. Não compare Club com Pro: são questionários diferentes.
- **Porte 16+: 12 alunas.** A mediana de R$ 155 mil/mês desse grupo é frágil.
- **Multi-unidade: 6 alunas.** Não permite nenhuma leitura.
- **Faturamento zero declarado: 8 alunas.** Uma delas (A0142) declara 6 funcionários e faturamento zero — provável erro de preenchimento, não corrigido.

## 6. Hipótese, não achado

**"Contratar não aumenta a produtividade" (Kruskal-Wallis p = 0,40) é um corte transversal, não uma relação causal.** Estamos comparando empresas diferentes num mesmo momento, não a mesma empresa antes e depois de contratar. Leituras alternativas igualmente compatíveis com o dado: negócios que contratam podem estar em fase de investimento; o faturamento declarado pode ser menos preciso em operações maiores; pode haver seleção (quem contrata é quem já tinha demanda). Para afirmar causalidade seria preciso acompanhar as mesmas alunas ao longo do tempo.

O mesmo vale para toda a Etapa 1B: as dores inferidas são **hipóteses geradas por regra**, cada uma com os campos que a sustentam registrados em `campos_que_sustentam`. Elas não foram validadas contra nenhum desfecho.

## 7. O que o score não mede

O score de propensão (Etapa 5) **nunca foi validado contra conversão real** — não existe histórico de vendas do sistema para treinar ou testar. Os pesos (30/25/30/15) vieram do briefing, não dos dados. Ele ordena a fila por porte e aderência declarada; não prevê quem compra.

Especificamente ausentes: disposição a pagar, momento de decisão, quem decide, orçamento já comprometido, e experiência prévia com ferramentas parecidas.

**41 alunas ficaram sem score.** Faltou: dor classificável (38 — sem ela não dá para medir aderência ao produto), faturamento e equipe simultaneamente (1), cobertura de eixos (1).

## 8. Maturidade digital é medida por menção, não por uso

Os sinais (`usa_sistema_gestao`, `faz_trafego`, `usa_crm`, `usa_ia_automacao`) vêm de busca textual nas colunas de tecnologia, processo de vendas, canais e Instagram. Uma aluna que usa Trinks mas não citou aparece como não-usuária. **São mínimos, não medidas.** O formulário Club não tem coluna de tecnologia — para as 21 alunas do Club o eixo é medido em 3 colunas em vez de 4, e quando nenhuma fonte tem conteúdo o eixo fica em branco em vez de zero.

## 9. Clustering foi descartado, e isso é um resultado

Critério do briefing atendido: 626 casos completos (≥ 150) e 16 variáveis numéricas bem preenchidas (≥ 5). K-means rodado para k = 2 a 8.

**Melhor silhouette: 0,189 em k = 2** — abaixo do corte de 0,25. Os demais k ficaram entre 0,07 e 0,11. Não há estrutura de grupos separáveis nesta base: as alunas formam um contínuo, não aglomerados. Segmentação por regra explícita foi mantida. A varredura completa está na aba `Clustering`.

## 10. Escopo e generalização geográfica

- 55 alunas declaram atuação fora do Brasil (Portugal, Espanha, EUA, Angola e outros). Um agente com integração Meta, financeiro e recrutamento tem premissas locais (moeda, regime de contratação, meios de pagamento) que não valem para elas.
- ~66 respostas foram escritas em espanhol. A taxonomia foi construída sobre vocabulário português; **essas respostas estão sub-classificadas.**
- 548 alunas são de beleza/estética, 43 de saúde/clínica, 112 de outros setores e 25 responderam o cargo em vez do setor. Por decisão do cliente a análise é integral, sem recorte de nicho. Ao usar os números para um produto de beleza, filtre `nicho_grupo == 'beleza'` na aba `Base_Tratada`.

## 11. Precisão do classificador de dores

Auditoria manual de 16 classificações sorteadas: 15 corretas (~94%). O erro encontrado ("constância na gestão do tempo" classificado como conteúdo/Instagram) levou ao ajuste do padrão. Dois padrões foram estreitados após medição — `constânci` e `processo` no singular — o que derrubou `processos_padronizacao` de 258 para 219 alunas e `conteudo_instagram` de 210 para 177.

**A auditoria de 16 casos é pequena.** Ela indica que o classificador não está grosseiramente errado; não estabelece a precisão por categoria. Toda evidência literal está na aba `Evidencias_Dores` para conferência.

## 12. Dados pessoais

As abas do relatório contêm nome, e-mail, telefone e empresa de 737 pessoas. O arquivo Excel e a base bruta estão fora do versionamento. Para gerar uma versão circulável sem identificação: `python3 pipeline.py --sem-nomes`.
