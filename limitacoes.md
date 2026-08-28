# Limitações — o que esta base não permite afirmar

Documento de contestação. Cada item aqui é um lugar onde a análise pode quebrar numa reunião.

---

## 1. Viés de autosseleção (o mais grave)

As 708 respondentes em escopo se inscreveram num programa de mentoria e preencheram um formulário longo. Elas já se identificaram como quem tem problema e busca ajuda.

**Não afirme:** "37,6% das empreendedoras de beleza têm dificuldade de reter equipe."
**Afirme:** "37,6% das alunas de beleza/estética inscritas no Moonshot citam retenção de equipe."

Não há grupo de controle, não há amostra do mercado, e não há como estimar quanto o programa atrai um perfil específico. Todo número deste relatório descreve a base do Moonshot, não o mercado de beleza.

## 2. O formulário Pro induz a resposta

As 5 perguntas de pilar ("o que você gostaria de melhorar no pilar Flow Mind / Business / Growth / Sales / Experience") nomeiam o tema antes de a aluna responder. Isso garante menções em todos os cinco temas.

Efeito medido na base filtrada: `mentalidade` aparece em 27,6% das respostas às perguntas induzidas e em 11,6% das espontâneas. `fidelizacao_recompra` vai de 35,0% para 6,6%. `reter_liderar` faz o caminho inverso, saltando para 37,6% quando a pergunta não sugere o tema.

**Consequência:** o ranking consolidado (painel A) mistura os dois enquadramentos e não deve ser usado sozinho. O resumo executivo usa o painel espontâneo por isso. Os quatro painéis estão na aba `Dores_Declaradas`.

## 3. O subconjunto com faturamento parseável é enviesado

Das 708 em escopo, 660 tiveram faturamento convertido em número. As 48 restantes **não são um recorte aleatório**:

| Variável | Com faturamento | Sem faturamento | Mann-Whitney |
|---|---|---|---|
| Funcionários (mediana) | 1 | 0 | p = 0,0009 |
| Anos de operação (mediana) | 5 | 1 | p < 0,0001 |

Quem não consegue declarar faturamento é sistematicamente mais nova e menor. **A distribuição de faturamento e a mediana de R$ 17.500 superestimam a maturidade da base.** A associação com nicho, medida antes do filtro, não é significativa (χ², p = 0,41) — não há viés de setor.

## 4. Conversões que são interpretação, não dado

- **Milhar inferido (~23 alunas):** "50" num campo de faturamento mensal foi lido como R$ 50.000. A leitura literal (R$ 50/mês) é implausível, mas é inferência. Marcadas em `fat_confianca`.
- **Ponto médio de faixa (~190 alunas):** "45 mil a 55 mil" virou R$ 50.000. A aluna nunca disse 50.
- **Câmbio (~85 alunas em EUR/USD):** convertido por taxa fixa (USD 5,40 / EUR 6,20) definida em `CONFIG['fx']` do `pipeline.py`. **É um parâmetro, não um dado.** Atualize antes de usar valores em decisão comercial.
- **Quarentena (2 alunas, ambas fora do escopo após o filtro):** valores acima de R$ 1 milhão/mês foram excluídos das estatísticas por virem de texto malformado ("3.200 mil euros"). O texto original está preservado.
- **Período não detectado (1 aluna):** "2609€ (de jan a junho deste ano)" foi lido como mensal. Pode ser o acumulado do semestre. Caso único, mantido.
- **Equipe:** sócias, PJ, comissionadas e aluguel de cadeira foram contadas como equipe. É uma escolha; contar só CLT daria outro número. Cerca de 50 classificações têm confiança "baixa" e 16 não foram classificáveis.

## 5. Onde o N é pequeno demais

- **Base Club: 21 respondentes (20 em escopo).** Nenhum percentual do Club sustenta decisão. Na aba `Dores_Declaradas` o painel D reporta números absolutos por isso. Não compare Club com Pro: são questionários diferentes.
- **Porte 16+: 10 alunas.** Qualquer estatística desse grupo é frágil, inclusive a mediana de produtividade que aparece no resumo executivo.
- **Multi-unidade: 6 alunas.** Não permite nenhuma leitura.
- **Saúde/clínica: 28 alunas.** Mantidas no escopo a pedido, mas não sustentam recorte próprio. A maior parte de quem faz harmonização facial e biomedicina estética foi classificada em beleza/estética, não aqui.
- **Faturamento zero declarado: 8 alunas.** Uma delas (A0142) declara 6 funcionários e faturamento zero — provável erro de preenchimento, não corrigido.

## 6. Hipótese, não achado

**"Contratar não aumenta a produtividade" (Kruskal-Wallis p = 0,26 na base filtrada, p = 0,40 na integral) é um corte transversal, não uma relação causal.** Estamos comparando empresas diferentes num mesmo momento, não a mesma empresa antes e depois de contratar. Leituras alternativas igualmente compatíveis com o dado: negócios que contratam podem estar em fase de investimento; o faturamento declarado pode ser menos preciso em operações maiores; pode haver seleção (quem contrata é quem já tinha demanda). Para afirmar causalidade seria preciso acompanhar as mesmas alunas ao longo do tempo.

O mesmo vale para toda a Etapa 1B: as dores inferidas são **hipóteses geradas por regra**, cada uma com os campos que a sustentam registrados em `campos_que_sustentam`. Elas não foram validadas contra nenhum desfecho.

## 7. O que o score não mede

O score de propensão (Etapa 5) **nunca foi validado contra conversão real** — não existe histórico de vendas do sistema para treinar ou testar. Os pesos (30/25/30/15) vieram do briefing, não dos dados. Ele ordena a fila por porte e aderência declarada; não prevê quem compra.

Especificamente ausentes: disposição a pagar, momento de decisão, quem decide, orçamento já comprometido, e experiência prévia com ferramentas parecidas.

**40 alunas ficaram sem score.** Faltou: dor classificável (38 — sem ela não dá para medir aderência ao produto), faturamento e equipe simultaneamente (1), cobertura de eixos (1).

## 8. Maturidade digital é medida por menção, não por uso

Os sinais (`usa_sistema_gestao`, `faz_trafego`, `usa_crm`, `usa_ia_automacao`) vêm de busca textual nas colunas de tecnologia, processo de vendas, canais e Instagram. Uma aluna que usa Trinks mas não citou aparece como não-usuária. **São mínimos, não medidas.** O formulário Club não tem coluna de tecnologia — para as 21 alunas do Club o eixo é medido em 3 colunas em vez de 4, e quando nenhuma fonte tem conteúdo o eixo fica em branco em vez de zero.

## 9. Clustering foi descartado, e isso é um resultado

Critério do briefing atendido: 607 casos completos (≥ 150) e 16 variáveis numéricas bem preenchidas (≥ 5). K-means rodado para k = 2 a 8.

**Melhor silhouette: 0,188 em k = 2** — abaixo do corte de 0,25. Os demais k ficaram entre 0,07 e 0,11. Não há estrutura de grupos separáveis nesta base: as alunas formam um contínuo, não aglomerados. Segmentação por regra explícita foi mantida. A varredura completa está na aba `Clustering`.

## 10. Escopo e generalização geográfica

- 53 alunas declaram atuação fora do Brasil (Portugal, Espanha, EUA, Angola e outros). Um agente com integração Meta, financeiro e recrutamento tem premissas locais (moeda, regime de contratação, meios de pagamento) que não valem para elas.
- ~66 respostas foram escritas em espanhol. A taxonomia foi construída sobre vocabulário português; **essas respostas estão sub-classificadas.**
- Escopo atual: 680 beleza/estética + 28 saúde/clínica = 708. 29 excluídas (aba `Excluidas_Por_Nicho`). Para rodar sem recorte: `python3 pipeline.py --nichos todos`.
- **A fronteira beleza × saúde é porosa por natureza.** Harmonização facial, biomedicina estética e enfermagem estética foram classificadas como beleza/estética porque é assim que essas alunas descrevem os próprios serviços. Uma leitura mais estrita levaria dezenas delas para saúde/clínica. A separação entre os dois grupos não deve ser usada para nada consequente; o que importa é que ambos estão dentro.
- **9 alunas em escopo vendem para o setor** além de atender (revenda de produtos, distribuição). Ficam marcadas em `vende_para_o_setor` na `Base_Tratada`, sem serem excluídas: um salão que também revende continua sendo um salão. Uma exceção conhecida entrou por arrasto — quem vende macas para salões casa com o vocabulário de beleza sem ser um salão.

## 11. Precisão do classificador de dores

Auditoria manual de 16 classificações sorteadas: 15 corretas (~94%). O erro encontrado ("constância na gestão do tempo" classificado como conteúdo/Instagram) levou ao ajuste do padrão. Dois padrões foram estreitados após medição — `constânci` e `processo` no singular — o que derrubou `processos_padronizacao` de 258 para 219 alunas e `conteudo_instagram` de 210 para 177.

**A auditoria de 16 casos é pequena.** Ela indica que o classificador não está grosseiramente errado; não estabelece a precisão por categoria. Toda evidência literal está na aba `Evidencias_Dores` para conferência.

## 12. O filtro de nicho é de escopo, não de correção

A análise foi rodada com e sem o recorte. A ordem das 13 dores é **idêntica posição por posição**, o faturamento mediano é o mesmo (R$ 17.500), e a divergência declarada × inferida vai de 63% para 64%. As 29 excluídas eram poucas demais para mover qualquer indicador.

**Consequência prática:** o recorte torna os números defensáveis ("estas são alunas de beleza") mas não os torna diferentes. Ninguém deve concluir que a análise anterior estava errada — ela estava apenas com o denominador mais largo.

## 13. O recorte de Portugal é hipótese, não dimensionamento

27 alunas. Os sub-recortes que sustentariam a tese de mercado têm de 2 a 6 pessoas: 3 usam sistema de gestão, 6 fazem tráfego pago, 2 são classe A. **Nenhum desses números suporta uma decisão de expansão** — por isso a tabela do relatório os mostra como "3 de 27", nunca como "11,1%".

O que se pode afirmar: entre as 27 alunas portuguesas desta base, a adoção de sistema de gestão é menor e o faturamento mediano é menos da metade do resto. O que **não** se pode afirmar: que o mercado português de beleza seja atrasado em sistema, que seja rentável, ou que escale. Uma amostra de 27 pessoas autosselecionadas num programa brasileiro de mentoria não representa o mercado português.

A classificação de país também tem erro possível: é deduzida de texto livre de localização e endereço. Nomes de rua ("Rua Ouvidor Portugal", "Avenida Álvaro Guimarães") são descartados antes da comparação e o CEP de 4 dígitos confirma Portugal, mas quem só escreveu o bairro sem cidade fica em Brasil por padrão.

## 14. A cobertura das frentes mede dor declarada, não intenção de compra

A tabela de frentes responde "quantas alunas citam uma dor que esta frente atende". Não responde "quantas contratariam". São coisas diferentes: 422 alunas citam dor de pessoas e processos, e isso não é um funil de 422 leads.

O **bot de dúvidas do nicho** é o caso extremo: nenhuma das 13 categorias validadas o alimenta, então sua demanda foi medida por um tema latente construído depois (protocolo, vigilância sanitária, escolha de produto). Os 37 casos vêm de um padrão que **não passou pela sua validação** — é o número mais frágil do relatório.

Os temas latentes em geral (metas/indicadores 139, dúvida técnica 37, precificação por procedimento 3) foram minerados do resíduo não coberto pela taxonomia. Servem para **propor** funcionalidade, não para dimensioná-la, e deliberadamente não entram no ranking de dores — misturá-los quebraria a comparabilidade com a rodada anterior.

## 15. O BI mostra recortes, não amostras novas

Os filtros do `bi_moonshot.html` recalculam sobre as mesmas 708 alunas. Filtrar não gera informação: reduz o N. A regra da célula pequena está no código (abaixo de 10 alunas o percentual vira contagem), mas ela protege contra ler mal um número — não contra o fato de que um recorte de 12 pessoas é frágil mesmo mostrando "%".

As seções de **Portugal** e **Divergência** ignoram os filtros de propósito: são contrastes contra a base inteira e perderiam o sentido calculados sobre um subconjunto já filtrado.

## 16. Dados pessoais

As abas do relatório contêm nome, e-mail, telefone e empresa de 708 pessoas. O arquivo Excel e a base bruta estão fora do versionamento. Para gerar uma versão circulável sem identificação: `python3 pipeline.py --sem-nomes` — vale para o Excel, o JSON e o BI.

O BI publicado leva nome e empresa (necessários para priorizar abordagem) mas **nunca e-mail, telefone ou endereço**. Ele é privado por padrão; ao compartilhar o link, você compartilha os nomes das 708 alunas.
