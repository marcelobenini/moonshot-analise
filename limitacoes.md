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

## 16. Os bolsões por linha de negócio são elegibilidade, não demanda

Este é o ponto mais frágil de tudo que entreguei, e o que mais pode ser mal usado.

**O formulário nunca perguntou sobre curso, clínica, franquia ou produto.** Não existe uma única resposta na base dizendo "eu compraria um curso". Os quatro bolsões (455 / 351 / 105 / 37) são construídos por regra minha sobre sinais indiretos — dores de conhecimento, menção a expansão, menção a produto, porte. A regra de cada um está visível na aba `Oportunidade_Linhas` e no cartão do BI justamente para ser contestada.

Consequências práticas:
- **"455 elegíveis para curso" não é um funil de 455 leads.** É o número de alunas cuja dor declarada *poderia* ser endereçada por curso.
- A fronteira entre "dor de conhecimento" (curso) e "dor de execução" (software) é uma escolha editorial. Precificação, por exemplo, pode ser resolvida ensinando a calcular ou automatizando o cálculo. Coloquei em conhecimento; discordar é legítimo e muda o número.
- **Clínica/franquia (37 alunas) usa "sinal de expansão" no texto livre**, que captura desde "quero escalar" até menção casual a franquia. É o bolsão mais frágil dos quatro.
- A calculadora de receita do BI não tem ticket padrão de propósito. Qualquer número que ela mostre é premissa sua multiplicada por público meu.

## 17. As 14 Nabeauty foram achadas por nome, não por cadastro

A identificação do ecossistema Nabeauty vem de busca textual por "nabeauty"/"na beauty" em setor, empresa e produtos. Isso significa: **pode haver franqueada que não citou a marca** (e ficou de fora) e pode haver homônimo ou aluna que apenas menciona a marca sem vínculo (e entrou indevidamente). Confira contra o cadastro real de franqueadas antes de usar a lista comercialmente. Duas das 14 não têm faturamento classificável e uma tem R$ 1.000/mês, o que sugere vínculos de naturezas diferentes no mesmo balde.

## 18. Geografia: 95,2% de UF, 82% de município, e o que sobra

A UF é deduzida em três passadas, nesta ordem: **faixa de CEP** (524 casos, a mais confiável), **cidade nomeada** (71) e **sigla solta no texto** (41). Cobertura: 636 de 668 brasileiras.

**32 brasileiras ficaram sem estado** — escreveram só o bairro ou nada reconhecível. Some-se a elas as 40 que atuam fora do Brasil, e o mapa deixa 72 das 708 de fora. Essa exclusão não é aleatória: quem escreve endereço completo tende a ser diferente de quem escreve "atendo em casa".

O município saiu em **581 alunas**, casando o texto contra os 5.565 municípios do IBGE com a busca restrita à UF. As **55 que têm estado mas não cidade** são majoritariamente bairros da capital paulista escritos sem o nome da cidade ("Freguesia do Ó", "Itaquera", "Parque São Lucas"). Elas aparecem no mapa como SP mas não entram na lista de cidades — **o número de São Paulo capital, portanto, está subestimado.**

Riscos residuais do casamento de município: nomes curtos e palavras comuns em endereço ("Centro", "Bonito", "Boa Vista", "Porto") foram excluídos da busca para evitar falso positivo, o que também derruba as alunas que realmente moram nessas cidades. Auditoria manual de 16 casamentos: 16 corretos.

O corte de 10 alunas para "turma presencial fecha" é arbitrário — escolhi-o para ser conservador, não porque haja evidência de que 10 seja o mínimo viável. Ajuste ao seu modelo.

## 18b. A escala de cor do mapa não é linear

Nas métricas de contagem (alunas, classe A) a intensidade usa **raiz quadrada**, não proporção direta. Sem isso, SP com 409 alunas contra 47 do segundo colocado transformaria os outros 26 estados numa mancha clara indistinguível.

A consequência é que **comparar duas cores do mapa a olho não dá a razão entre os números**: um estado com o dobro da cor não tem o dobro de alunas. A legenda avisa, e a lista ao lado do mapa traz sempre o número absoluto — use a lista para comparar, o mapa para localizar.

Na métrica de risco, estados com menos de 5 alunas com relato ficam neutros de propósito: uma taxa sobre 2 pessoas coloriria o mapa com ruído.

## 19. A matriz de urgência é a parte mais sólida, com uma ressalva

O cruzamento induzida × espontânea é dado real: as duas perguntas existem, foram respondidas pela mesma pessoa, e a classificação é a mesma taxonomia nos dois lados. A leitura de que "latente = precisa de conteúdo" e "crua = vende com diagnóstico" é **interpretação comercial**, não achado estatístico. O que o dado diz é mais estreito: *esta dor só aparece quando a pergunta a nomeia.*

Há um efeito de instrumento embutido: as perguntas induzidas dos pilares Flow cobrem fidelização, conteúdo e vendas de forma muito mais direta do que cobrem retenção de equipe. Parte da alta latência dessas categorias vem de a pergunta existir, não de a aluna ser indiferente a elas. A comparação entre categorias é sólida em direção, frágil em magnitude.

## 20. O casamento de nomes é textual, não cadastral

458 de 554 registros da planilha de consultoria casaram com a base do estudo (82,7%), e sobraram **96 nomes sem correspondência**. As causas prováveis se misturam e não dá para separá-las: aluna que não respondeu o formulário, grafia muito diferente, apelido, ou nome de sócia no lugar do nome da titular.

Dos que casaram, 407 foram por nome exato normalizado (seguro), 32 por primeiro+último nome (razoável, e único quando o par é único na base) e **19 por sobreposição de tokens acima de 0,62** — esses últimos são os que podem estar errados. Todos estão listados com o método na aba `Consultoria_Casamento`; audite os 19 antes de agir sobre eles individualmente.

Também houve deduplicação: uma aluna aparece em mais de uma aba quando o consultor mudou ou quando há relatório consolidado. Ficou o registro mais informativo, o que significa que **relatos anteriores do mesmo caso foram descartados** — o histórico existe na planilha original e não neste relatório.

## 21. O engajamento é lido de texto livre, com o vocabulário do consultor

Não existe campo estruturado de engajamento. O estado (engajada, oscilante, sem contato, risco de saída, renovou) é inferido por padrão textual sobre a coluna "situação da aluna". Três consequências:

- **178 alunas com acompanhamento não têm relato nenhum** e ficam fora de toda a análise de engajamento. A base efetiva é 305, não 415.
- **118 caem em "relato sem sinal claro"** — o texto existe mas não casa com nenhum padrão. É o maior grupo, e ele pode conter tanto engajadas quanto em risco.
- A régua é do consultor, não minha: "engajada" para um pode ser "oscilante" para outro, e não há calibração entre as 13 abas.

A classificação foi validada apenas por leitura de amostra. Não medi precisão por categoria.

## 22. O confronto de faturamento tem um problema de origem

44,7% dos valores do consultor são idênticos ao do formulário. A leitura conservadora é que **esses 143 casos não informam nada** — podem ser confirmação genuína ou o número copiado sem verificação. Todas as conclusões sobre evolução de faturamento usam só as 177 que mudaram, o que reduz a base e pode enviesar: é plausível que o consultor atualize justamente quando houve mudança notável, o que inflaria a magnitude média da variação.

Além disso, os dois números não têm a mesma data. O formulário foi respondido na entrada; a planilha é atualizada em momentos variados e sem carimbo de data por campo. **Não é uma série temporal, é uma comparação entre dois instantes desconhecidos.**

## 23. Um teste que falhou, registrado

A hipótese de que a divergência entre dor declarada e inferida prediria desengajamento **foi testada e rejeitada** (χ² p = 0,19; 20,0% de risco entre divergentes contra 27,4% entre convergentes — direção inversa à esperada). Não use essa relação em nenhuma argumentação: ela não está nos dados.

## 24. A projeção de término agora vem de dado declarado — e o que ainda falta nela

A planilha de matrículas do Moonshot Club tem **data de início e de término declaradas em formato de data completa**, além do período do plano e do status por aluna. Isso elimina a inferência: 723 das 764 matrículas têm término escrito, 2 foram calculadas pelo período e **39 não têm data alguma**.

O que ainda limita:

- **A planilha cobre o Moonshot Club, não a base inteira do estudo.** Das 605 ativas terminando de set/26 em diante, 435 casam com a base de 708 alunas analisadas. As demais não estão no estudo — responderam outro formulário, ou nenhum.
- **4 alunas com pedido de cancelamento registrado ainda constam como ativas.** Estão contadas nos 605. A divergência entre a aba de pedidos e o status da matrícula está na aba `Cancelamento_Divergente`.
- **60 das 78 linhas de pedido de cancelamento não casam com nenhum nome da lista de matrículas.** Podem ser alunas do Moonshot Pro, grafias diferentes, ou registros antigos. Não sei distinguir.
- **A contagem principal é por contrato, não por pessoa.** 36 alunas aparecem em mais de uma turma; elas entram na turma antiga e na nova, porque são dois contratos com dois vencimentos. Uma contagem por pessoa única dá um número menor e está na aba `Matriculas_Resumo`. **Qual das duas usar depende da pergunta:** para dimensionar esforço de renovação, conta contrato; para dimensionar base de alunas, conta pessoa.
- **Três abas foram excluídas por não serem turma**, por uma regra baseada no dado: se mais da metade das alunas de uma aba também aparece em outras, é recorte. `MOONSHOT ELITE` tem 73% de sobreposição — é nível de plano, e contá-la duplicaria 33 alunas em meses diferentes. `Alunas antigas` não tem nenhuma data. `CANCELAMENTOS` é controle. O limiar de 50% é escolha minha; a aba `Matriculas_Abas` mostra a sobreposição de cada uma para você contestar.
- **Término declarado não é saída efetiva.** É a data em que o contrato completa; não diz quem renovou, quem saiu antes nem quem vai sair.
- O período varia: 747 planos de 12 meses, 15 de 6, e uma dúzia com períodos atípicos (21 a 31 meses). A premissa de "12 meses para todos" que usei antes desta planilha era errada.

### A projeção anterior, inferida, estava errada

Antes desta planilha eu deduzia a entrada do controle de consultorias e somava 12 meses. **O resultado subestimava em 42%** (349 contra 605 reais) com erros mensais de até 95 contratos, e em fevereiro de 2027 apontava zero onde havia 89.

Isso é uma lição sobre a análise inteira, não só sobre esta seção: **onde existe um campo declarado, ele vence qualquer inferência minha, por mais bem fundamentada que a regra pareça.** As regras que usei para desambiguar as datas do controle de consultorias eram defensáveis e mesmo assim produziram um número que erraria a decisão. A projeção inferida permanece no Excel apenas como conferência.

## 25. Dados pessoais

As abas do relatório contêm nome, e-mail, telefone e empresa de 708 pessoas. O arquivo Excel e a base bruta estão fora do versionamento. Para gerar uma versão circulável sem identificação: `python3 pipeline.py --sem-nomes` — vale para o Excel, o JSON e o BI.

O BI publicado leva nome e empresa (necessários para priorizar abordagem) mas **nunca e-mail, telefone ou endereço**. Ele agora inclui também **o relato livre do consultor sobre cada aluna em risco** — texto que descreve inadimplência, insatisfação e conflitos de sociedade. É material sensível sobre pessoas identificadas: pense duas vezes antes de compartilhar o link fora do time comercial. Ele é privado por padrão; ao compartilhar o link, você compartilha os nomes das 708 alunas.
