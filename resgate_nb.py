"""Lista que o Felipe pediu: quem entrou na Moonshot em maio/2026 ou antes.

O pedido (audio de 14/10/2026): levantar todo mundo que entrou em Elite,
Maquina de Vendas e Moonshot PRO ate maio, com indicacao de engajamento,
porque o dinheiro dessas matriculas ainda esta no contrato da NB. A ideia e
falar com todas - inclusive as inadimplentes - e refazer o acordo na
estrutura nova.

Tres coisas que a base NAO responde e que ficam marcadas na planilha em vez
de preenchidas no chute:

1. 'Maquina de Vendas' nao existe como produto em nenhuma fonte que temos.
   As turmas de 2025 (PC-*, Alunas JunJulAgo, Alunas antigas) nao tem coluna
   de produto nenhuma. Elas entram na lista como 'nao registrado'.
2. Qual forma de pagamento significa 'dinheiro na NB' e decisao do Felipe,
   nao da planilha. A coluna 'Pagamento' sai crua e a aba 'Alunos Boleto NB'
   vira uma marca propria.
3. Engajamento nao e um campo. O que existe e numero de consultorias feitas
   na aba do consultor. E isso que a coluna traz, com o nome do que e.
"""
import re
import unicodedata
import warnings

import openpyxl
import pandas as pd

warnings.filterwarnings('ignore')

MATRICULAS = 'dados/matriculados_club_live.xlsx'
CONSULTORIAS = 'dados/controle_consultorias_live.xlsx'
CORTE = pd.Timestamp('2026-05-31')

# aba -> linha do cabecalho. Cada turma foi montada por uma pessoa diferente.
TURMAS = {
    'MOONSHOT ELITE': 1,
    'PB-ALPHAVILLE Maio26': 1,
    ' PB-CURITIBA Maio26': 1,
    'PB-PORTUGAL Abril26': 1,
    'PB-BRASÌLIA Março26': 1,
    ' PB-ALPHAVILLE Janeiro26': 1,
    'PC-ALPHAVILLE Novembro25': 1,
    'PC-ALPHAVILLE SetOut': 0,
    'Alunas JunJulAgo': 0,
    'Alunas antigas': 0,
    'CANCELAMENTOS': 1,
}


def ch(n):
    n = unicodedata.normalize('NFKD', str(n)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', n.lower())).strip()


def col(d, *inicios):
    """Nome exato antes de prefixo: 'Status' e 'Status Contrato' convivem na
    mesma aba e a busca por prefixo devolvia a errada."""
    for c in d.columns:
        if ch(c) in inicios:
            return d[c]
    for c in d.columns:
        if any(ch(c).startswith(p) for p in inicios):
            return d[c]
    return pd.Series([None] * len(d), index=d.index)


def telefone(v):
    if v is None or pd.isna(v):
        return ''
    t = str(v).strip()
    if not t:
        return ''
    if '/' in t:
        return ' / '.join(x for x in (telefone(p) for p in t.split('/')) if x)
    t = re.sub(r'\.0$', '', t)
    d = re.sub(r'\D', '', t)
    if len(d) in (12, 13) and d.startswith('55'):
        d = d[2:]
    if len(d) == 11 and d[2] == '9':
        return f'({d[:2]}) {d[2:7]}-{d[7:]}'
    if len(d) == 10:
        return f'({d[:2]}) {d[2:6]}-{d[6:]}'
    return t


def texto(v):
    if v is None or pd.isna(v):
        return ''
    return re.sub(r'\s+', ' ', str(v)).strip()


def produto(v, turma):
    t = texto(v)
    if not t:
        return '(não registrado)'
    k = ch(t)
    if 'elite' in k:
        return 'Moonshot Elite'
    if k.replace(' ', '').startswith('moonshotpro'):
        return 'Moonshot Pró'
    if 'club' in k:
        return 'Moonshot Club'
    return t


# ---------------------------------------------------------------- matriculas
linhas = []
for turma, cab in TURMAS.items():
    d = pd.read_excel(MATRICULAS, sheet_name=turma, header=cab)
    nome = col(d, 'nome', 'coluna 2')
    ini = pd.to_datetime(col(d, 'data de inicio'), errors='coerce')
    # 'Status Contrato' e o campo que a equipe mantem; 'Status' e o antigo.
    sc = col(d, 'status contrato')
    st = col(d, 'status')
    linhas.append(pd.DataFrame({
        'nome': nome.map(texto),
        'turma': turma.strip(),
        'produto': [produto(v, turma) for v in col(d, 'tipo de plano', 'plano ')],
        'entrada': ini,
        'termino': pd.to_datetime(col(d, 'data de termino'), errors='coerce'),
        'situacao_contrato': sc.map(texto),
        'status_antigo': st.map(texto),
        'pagamento': col(d, 'pagamento').map(texto),
        'contrato': col(d, 'contrato').map(texto),
        'telefone': col(d, 'telefone').map(telefone),
        'email': col(d, 'e mail', 'email').map(texto),
        'consultor': col(d, 'consultor estrategico').map(texto),
        'cs': col(d, 'cs responsavel').map(texto),
        'motivo_cancelamento': col(d, 'motivo do cancelamento').map(texto),
        'obs': col(d, 'observac').map(texto),
    }))

m = pd.concat(linhas, ignore_index=True)
m = m[m.nome.str.len() > 2]
m = m[~m.nome.map(ch).str.contains(
    r'^(moonshot|total|nome|aluna|aluno|alunos boletos)', regex=True)]
m['k'] = m.nome.map(ch)

# Uma aluna aparece na turma dela e, se cancelou ou e Elite, tambem na aba
# propria. Nenhuma das linhas e completa: a turma tem a data e o produto, a
# aba de Elite tem a situacao do contrato e o motivo do cancelamento. Em vez
# de escolher uma linha e perder o resto, junta campo a campo.
m['peso'] = (m.entrada.notna().astype(int) * 4
             + (m.produto != '(não registrado)') * 2
             + (m.situacao_contrato != '') * 1)
m = m.sort_values('peso', ascending=False)
m['turmas'] = m.k.map(m.groupby('k').turma.apply(lambda s: ' + '.join(dict.fromkeys(s))))


def juntar(g):
    r = g.iloc[0].copy()
    for c in g.columns:
        if c in ('k', 'peso', 'turmas'):
            continue
        v = g[c].dropna()
        # pandas 3 da dtype 'str' a coluna de texto, nao 'object': testar por
        # object deixava passar a string vazia e ela vencia a informacao boa.
        if not (pd.api.types.is_numeric_dtype(v)
                or pd.api.types.is_datetime64_any_dtype(v)):
            v = v[v.astype('object').astype(str).str.strip() != '']
        if len(v):
            r[c] = v.iloc[0]
    return r


m = (m.groupby(m.k.values, sort=False)[list(m.columns)]
      .apply(juntar).reset_index(drop=True))

# ---------------------------------------------------------- engajamento real
eng = {}
for aba in openpyxl.load_workbook(CONSULTORIAS, read_only=True).sheetnames:
    if 'Relat' in aba:
        continue
    d = pd.read_excel(CONSULTORIAS, sheet_name=aba, header=1)
    cols = {ch(c): c for c in d.columns}
    cn = next((v for k, v in cols.items() if k.startswith('aluna')), None)
    if not cn:
        continue
    datas = [v for k, v in cols.items() if re.match(r'^\d\s*consult', k)]
    csit = next((v for k, v in cols.items() if 'situacao' in k), None)
    for _, r in d.iterrows():
        k = ch(r[cn])
        if not k or 'moonshot' in k:
            continue
        n = sum(1 for c in datas if pd.notna(r[c]))
        eng[k] = {'consultorias': n,
                  'aba': re.sub(r'\s+Geral\s*$', '', aba.strip()),
                  'situacao': texto(r[csit]) if csit else ''}

m['consultorias'] = m.k.map(lambda k: eng.get(k, {}).get('consultorias'))
m['consultor_aba'] = m.k.map(lambda k: eng.get(k, {}).get('aba', ''))
m['situacao_aluna'] = m.k.map(lambda k: eng.get(k, {}).get('situacao', ''))

# ------------------------------------------------------------ boleto na NB
nb = pd.read_excel(MATRICULAS, sheet_name='Alunos Boleto NB', header=1)


def casar(alvo, universo):
    """A aba do boleto NB escreve o nome de outro jeito: 'Mayara Cruz Azevedo
    (Mell)' contra 'Mayara Cruz Azevedo da Silva (Mell)', 'Cindy Jael' contra
    'Cindy Jael Pires', 'BENESSERE CONDICIONAMENTO (Maria Claudia)' contra
    'Maria Claudia'. Casa quando um nome esta contido no outro e o primeiro
    nome bate - as 10 linhas foram conferidas uma a uma."""
    for bruto in (alvo, re.search(r'\((.*?)\)', alvo).group(1) if '(' in alvo else ''):
        k = ch(re.sub(r'\(.*?\)', ' ', bruto) if bruto is alvo else bruto)
        t = set(k.split())
        if not t:
            continue
        if k in universo:
            return k
        for u in universo:
            tu = set(u.split())
            if (t <= tu or tu <= t) and k.split()[0] == u.split()[0]:
                return u
    return None


NB = set()
for bruto in nb.iloc[:, 1].dropna():
    if 'alunos boleto' in ch(bruto):
        continue
    achado = casar(str(bruto), set(m.k))
    if achado:
        NB.add(achado)
    else:
        print('boleto NB sem par na base:', bruto)
m['boleto_nb'] = m.k.isin(NB)

m.to_pickle('/tmp/claude-0/-home-user-moonshot-analise/'
            'aa4a53bc-6d8a-5522-8729-cf6ad6d2e048/scratchpad/resgate.pkl')

print('matriculas unicas lidas:', len(m))
print('\ncom data de entrada:', int(m.entrada.notna().sum()),
      '| sem data:', int(m.entrada.isna().sum()))
print('\nate 31/05/2026:', int((m.entrada <= CORTE).sum()))
print('\npor produto (todas):'); print(m.produto.value_counts().to_string())
print('\npor turma:'); print(m.turma.value_counts().to_string())
print('\nsituacao do contrato:'); print(m.situacao_contrato.value_counts().head(12).to_string())
print('\nstatus antigo:'); print(m.status_antigo.value_counts().head(12).to_string())
print('\npagamento:'); print(m.pagamento.value_counts().head(12).to_string())
print('\nboleto NB casados:', int(m.boleto_nb.sum()), 'de', len(NB))
print('com registro de consultoria:', int(m.consultorias.notna().sum()))


# ------------------------------------------------------------------ saida
def situacao(r):
    """'Status Contrato' e o campo que a equipe mantem hoje; 'Status' e o
    antigo e so vale quando o novo esta vazio."""
    return r.situacao_contrato or r.status_antigo or '(não registrado)'


GRUPO = [
    ('Inadimplente / pagamento pendente',
     r'inadimpl|pendente de pagamento|bloquead|suspens'),
    ('Em processo de cancelamento', r'processo cancelamento|em pausa'),
    ('Cancelado', r'^cancelad'),
    ('Plano encerrado', r'encerr'),
    ('Ativo', r'^ativ'),
]


def grupo(s):
    for nome, rx in GRUPO:
        if re.search(rx, s, re.I):
            return nome
    return '(situação não registrada)'


m['situacao'] = m.apply(situacao, axis=1)
m['grupo'] = m.situacao.map(grupo)
ORDEM = {n: i for i, (n, _) in enumerate(GRUPO)}
ORDEM['(situação não registrada)'] = len(GRUPO)

alvo = m[(m.entrada <= CORTE) | m.entrada.isna()].copy()


def engajamento(r):
    if pd.isna(r.consultorias):
        return 'sem registro em aba de consultor'
    return f'{int(r.consultorias)} consultoria(s)'


S = pd.DataFrame({
    'Aluna': alvo.nome,
    'Contato': alvo.telefone,
    'Produto': alvo.produto,
    'Situação': alvo.situacao,
    'Grupo': alvo.grupo,
    'Entrada': alvo.entrada.dt.strftime('%d/%m/%Y').fillna('(não registrada)'),
    'Término previsto': alvo.termino.dt.strftime('%d/%m/%Y').fillna(''),
    'Pagamento': alvo.pagamento,
    'Boleto NB': alvo.boleto_nb.map({True: 'SIM', False: ''}),
    'Consultorias feitas': alvo.apply(engajamento, axis=1),
    'Consultor': alvo.consultor_aba.where(alvo.consultor_aba != '', alvo.consultor),
    'CS': alvo.cs,
    'Turma de entrada': alvo.turmas,
    'Motivo do cancelamento': alvo.motivo_cancelamento,
    'Observação': alvo.obs,
})
S['_o'] = alvo.grupo.map(ORDEM)
S = S.sort_values(['_o', 'Produto', 'Aluna']).drop(columns='_o')

ABAS = [
    ('Moonshot Elite', S[S.Produto == 'Moonshot Elite']),
    ('Moonshot Pró', S[S.Produto == 'Moonshot Pró']),
    ('Produto não registrado', S[S.Produto == '(não registrado)']),
    ('Boleto NB', S[S['Boleto NB'] == 'SIM']),
]

SAIDA = 'entregaveis/resgate_contratos_nb.xlsx'
with pd.ExcelWriter(SAIDA, engine='xlsxwriter') as xw:
    wb = xw.book
    cab = wb.add_format({'bold': True, 'bg_color': '#1F2937', 'font_color': 'white',
                         'border': 1, 'align': 'center', 'valign': 'vcenter',
                         'text_wrap': True})
    txt = wb.add_format({'valign': 'top', 'border': 1})
    wrap = wb.add_format({'valign': 'top', 'border': 1, 'text_wrap': True})
    vaz = wb.add_format({'valign': 'top', 'border': 1, 'font_color': '#9CA3AF',
                         'align': 'center'})
    tit = wb.add_format({'bold': True, 'font_size': 12})
    nor = wb.add_format({'text_wrap': True, 'valign': 'top'})

    ws = wb.add_worksheet('Critério')
    ws.set_column(0, 0, 110)
    linhas_txt = [
        'Quem entrou na Moonshot até 31/05/2026 — pedido do Felipe em 14/10/2026.',
        '',
        'CRITÉRIO',
        '• Data de início do plano menor ou igual a 31/05/2026.',
        '• Quem não tem data de início registrada entrou mesmo assim: são 39 pessoas,'
        ' 31 delas da aba "Alunas antigas", que é anterior a maio por definição.'
        ' A coluna Entrada diz "(não registrada)" nessas linhas.',
        '• Moonshot Club ficou de fora porque o Felipe pediu Elite, Máquina de Vendas'
        ' e Pró. São 170 pessoas no Club nesse período, disponíveis se ele quiser.',
        '',
        'O QUE A BASE NÃO RESPONDE',
        '1. "Máquina de Vendas" não existe como produto em nenhuma planilha que temos.'
        ' As turmas de 2025 (PC-ALPHAVILLE, Alunas JunJulAgo, Alunas antigas) não têm'
        ' coluna de produto nenhuma — elas estão na aba "Produto não registrado".'
        ' Se Máquina de Vendas é o nome antigo desse programa, essa aba é a lista;'
        ' se não é, falta a planilha.',
        '2. Nenhum campo diz "o dinheiro está na NB". O que existe é a aba'
        ' "Alunos Boleto NB" da planilha de matrículas, com 10 nomes, e a forma de'
        ' pagamento. Os 9 que consegui casar estão todos em BOLETO PARCELADO, e 8 dos'
        ' 9 são da turma Jun/Jul/Ago 2025. Isso sugere que BOLETO PARCELADO é o'
        ' contrato antigo e BOLETO TMB o novo — mas é leitura minha, não um campo.'
        ' Confirmar com o Felipe antes de usar como filtro.',
        '3. "Engajamento" não é um campo. A coluna "Consultorias feitas" conta as datas'
        ' de consultoria preenchidas na aba do consultor (0 a 5). "Sem registro em aba'
        ' de consultor" quer dizer que a aluna não aparece em nenhuma aba — não quer'
        ' dizer que ela não foi atendida.',
        '',
        'COMO A SITUAÇÃO FOI MONTADA',
        'Vale "Status Contrato", que é o campo que a equipe mantém hoje. Só quando ele'
        ' está vazio vale o "Status" antigo. As linhas estão ordenadas por grupo:'
        ' primeiro inadimplente e pagamento pendente, depois processo de cancelamento,'
        ' cancelado, plano encerrado e ativo.',
        '',
        'UMA RESSALVA DE NOME',
        '• "Raisa Teixeira Esparza", da aba Boleto NB, não tem par na base de'
        ' matrículas. O mais parecido é "Raisa M Teixeira" — não casei porque o'
        ' sobrenome não bate.',
        '• "BENESSERE CONDICIONAMENTO (Maria Claudia)" foi casada com "Maria Claudia"'
        ' pelo nome entre parênteses. É a mais frágil das 9.',
    ]
    ws.write(0, 0, 'Resgate de contratos — base até maio/2026', tit)
    for i, t in enumerate(linhas_txt):
        ws.write(i + 2, 0, t, nor)

    larg = {'Aluna': 36, 'Contato': 19, 'Produto': 18, 'Situação': 22, 'Grupo': 26,
            'Entrada': 14, 'Término previsto': 15, 'Pagamento': 18, 'Boleto NB': 10,
            'Consultorias feitas': 22, 'Consultor': 16, 'CS': 16,
            'Turma de entrada': 34, 'Motivo do cancelamento': 45, 'Observação': 45}
    for aba, D in ABAS:
        w = wb.add_worksheet(aba)
        for j, c in enumerate(D.columns):
            w.write(0, j, c, cab)
            w.set_column(j, j, larg[c])
        for i, (_, row) in enumerate(D.iterrows()):
            for j, c in enumerate(D.columns):
                v = row[c]
                if v == '' or pd.isna(v):
                    w.write(i + 1, j, '—', vaz)
                else:
                    w.write(i + 1, j, str(v),
                            wrap if c in ('Motivo do cancelamento', 'Observação')
                            else txt)
        w.set_row(0, 30)
        w.freeze_panes(1, 1)
        w.autofilter(0, 0, max(len(D), 1), len(D.columns) - 1)

print('\n--- entregue em', SAIDA)
for aba, D in ABAS:
    print(f'{aba:26s} {len(D):4d}')
print('\nquebra por grupo:')
print(S.groupby(['Produto', 'Grupo']).size().to_string())
print('\nBoleto NB por situacao:')
print(S[S['Boleto NB'] == 'SIM'].Situação.value_counts().to_string())
