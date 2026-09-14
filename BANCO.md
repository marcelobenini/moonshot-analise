# Banco acumulativo Moonshot

Um arquivo SQLite (`dados/moonshot.db`) onde tudo que chega entra e nada sai.
A ideia é simples: **planilha que passa pelo banco não se perde nunca mais**, e
o cruzamento entre elas fica pronto para qualquer análise futura.

---

## Como mandar uma planilha nova

```bash
python banco.py ingerir caminho/da/planilha.xlsx
```

Só isso. O tipo é detectado pelo conteúdo, não pelo nome do arquivo — porque
nome de arquivo mente (`ALUNOS_MATRICULADOS_CLUB_1.xlsx` e `atualizada.xlsx`
eram a mesma coisa).

Se o tipo não for reconhecido, **o arquivo entra mesmo assim**: cada linha é
guardada crua, aba por aba, e o banco tenta descobrir sozinho qual coluna tem
nome de gente para ligar à identidade. Depois você me diz o que a planilha
significa e eu escrevo o leitor — o dado já está lá esperando.

Para forçar o tipo, ou para formulários (que não têm assinatura própria):

```bash
python banco.py ingerir nova.xlsx --tipo matriculas
python banco.py ingerir form.xlsx --tipo formulario_pro
python banco.py ingerir qualquer.xlsx --observacao "export do CRM, mar/27"
```

**Mandar o mesmo arquivo duas vezes não duplica nada** — o banco compara o
hash do conteúdo e ignora. Mas uma versão *atualizada* da mesma planilha vira
uma fonte nova, e a diferença entre as duas fica visível. Foi assim que a queda
de 604 para 502 contratos apareceu entre duas versões do cadastro.

---

## As quatro decisões de desenho

Cada uma responde a um jeito específico de perder informação.

**1. A linha crua é guardada sempre**, antes de qualquer interpretação. Se
amanhã eu entender melhor uma coluna que hoje ignoro, o dado ainda está lá.
Tabela `registro`, com a linha inteira em JSON.

**2. Identidade é persistente.** Nome resolvido uma vez fica resolvido. A
tabela `alias` guarda toda grafia já vista apontando para a mesma pessoa —
"Elizabeth Lima" e "Elisabete LIma" viram a mesma linha, e continuam assim na
próxima planilha. Sem isso, cada arquivo novo recomeçaria o casamento do zero.

**3. Toda afirmação carrega de onde veio.** Cada fato aponta para a fonte que o
disse. Quando duas planilhas discordam — e elas discordam — dá para ver quem
disse o quê e quando, em vez de escolher no escuro.

**4. Versão nova não apaga versão velha.** O histórico é o dado.

---

## Consultar

```bash
python banco.py resumo                 # o que já entrou, e onde as fontes discordam
python banco.py sql "SELECT ..."       # consulta livre
python banco.py sql "..." --saida x.csv
python banco.py exportar banco.xlsx    # tudo em Excel, uma aba por tabela
```

Três visões já prontas:

| Visão | Para que serve |
|---|---|
| `vw_pessoa_completa` | Uma linha por pessoa com tudo que se sabe dela, das três fontes |
| `vw_divergencia_consultor` | Onde o cadastro e a aba do consultor discordam sobre quem atende quem |
| `vw_cobertura` | Quem aparece em qual fonte — o ponto cego de cada planilha |

Exemplo — quem está em todas as fontes e termina contrato em maio:

```bash
python banco.py sql "
  SELECT nome_canonico, consultor_aba, termino_recente
  FROM vw_pessoa_completa
  WHERE formularios > 0 AND consultorias > 0
    AND termino_recente LIKE '2027-05%'"
```

---

## Corrigir identidade

O casamento automático de nomes acerta a maior parte e erra alguns. Os casos
duvidosos **não ficam escondidos dentro de uma média** — vão para uma fila:

```bash
python banco.py revisar               # o que passou perto do corte
python banco.py decidir 12 --ok       # sim, é a mesma pessoa
python banco.py decidir 12 --separar  # não é — vira pessoa própria
python banco.py unir 45 87            # 87 era a mesma pessoa que 45
```

Acima de 0,80 de similaridade o banco casa sozinho. Entre 0,55 e 0,80 casa mas
registra para conferência. Abaixo disso, cria pessoa nova.

---

## O que tem hoje

| Fonte | Linhas |
|---|---|
| Cadastro de matrículas | 810 |
| Controle de consultorias (13 abas) | 554 |
| Formulário Pró | 723 |
| Formulário Club | 21 |

**1.000 pessoas, 1.186 grafias, 2.108 linhas cruas.**

Cobertura — e é aqui que se vê o buraco de cada planilha:

| Onde a pessoa aparece | Pessoas |
|---|---|
| Nas três fontes | 348 |
| Só na matrícula | 201 |
| Matrícula + formulário | 158 |
| Só no formulário | 147 |
| Consultoria + formulário | 73 |
| Matrícula + consultoria | 37 |
| Só na consultoria | 36 |

---

## Privacidade

O banco fica em `dados/`, que **não vai para o git**. Ele carrega nome,
telefone, faturamento e o relato do consultor sobre pessoas reais — inclusive
menções a inadimplência e insatisfação. O código que o constrói é versionado;
o conteúdo, não.

Se precisar circular algum recorte, exporte só as colunas necessárias em vez de
mandar o arquivo do banco.

---

## Reconstruir do zero

O banco é derivado, não original. As planilhas em `dados/` são a fonte de
verdade, e o banco inteiro se reconstrói em segundos:

```bash
rm dados/moonshot.db
python banco.py ingerir dados/matriculados_club.xlsx dados/controle_consultorias.xlsx
python banco.py ingerir dados/moonshot_pro.xlsx  --tipo formulario_pro
python banco.py ingerir dados/moonshot_club.xlsx --tipo formulario_club
```

Isso é de propósito: se eu errar uma regra de casamento, corrijo a regra e
reconstruo, em vez de remendar o banco e ficar sem saber o que está lá dentro.
**As decisões manuais de identidade** (`unir`, `separar`, `decidir`) são a
exceção — essas se perdem na reconstrução. Quando começarem a existir em
quantidade, vale exportá-las antes.
