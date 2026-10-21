"""Alunas de 50k+ por mês no Controle Consultorias, com contato.

O faturamento é da aba do consultor — é a única fonte que tem faturamento.
O contato não está lá: vem da planilha de matrículas, casando pelo nome.

Decisões que mudam o resultado, todas conferidas linha a linha:

1. O corte é 50.000 no FATURAMENTO MÊS. Quando só o FATURAMENTO ANO está
   preenchido, vale ano/12 — nas abas o ano é sempre o mês × 12, então é a
   aritmética da própria planilha.
2. O consultor cola anotação no nome ('- ALUNA DANIEL X', '- Plano ok',
   '- pediu CA'). O corte é no hífen seguido de marcador conhecido, nunca em
   qualquer hífen.
3. Linha de casal ou sociedade separada por barra entra com uma chave por
   lado: o faturamento é da mesma empresa.
4. A aba do consultor divide as alunas em blocos 'MOONSHOT PRÓ' e
   'MOONSHOT CLUB'. O bloco em que a linha está é o produto dela.
"""
import difflib
import re
import unicodedata
import warnings

import openpyxl
import pandas as pd

warnings.filterwarnings('ignore')

CONSULTORIAS = 'dados/controle_consultorias_live.xlsx'
MATRICULAS = 'dados/matriculados_club_live.xlsx'
SAIDA = 'entregaveis/alto_faturamento_50k.xlsx'
CORTE = 50000
# 0.92 e o corte do REGRAS.md. Aqui desce para 0.86 porque 'Elisabete LIma'
# contra 'Elizabeth Lima' da 0.86 e e a mesma pessoa; o guarda e o prefixo do
# primeiro nome, que mantem fora 'Luciana Pereira' x 'Luciana Freitas' (0.80).
CORTE_DIGITACAO = 0.85
NOME_ALUNA = ('nome', 'aluna', 'aluno a', 'aluno', 'cliente nome')
# 'de', 'da', 'e' aparecem em metade dos nomes: contar como nome em comum
# faria 'Ana de Souza' e 'Ana de Lima' parecerem a mesma pessoa.
LIGACAO = {'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o'}

RX_ANOTACAO = re.compile(
    r'\s*[-–]\s*(alun[ao]\b|ok\b|pediu\b|plano\b|pausa\b|soci[ao]\b)', re.I)


def ch(n):
    n = unicodedata.normalize('NFKD', str(n)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z ]', ' ', n.lower())).strip()


def pessoas(bruto):
    limpo = RX_ANOTACAO.split(str(bruto))[0]
    partes = [limpo] + (limpo.split('/') if '/' in limpo else [])
    return [k for k in (ch(x) for x in partes) if k and 'moonshot' not in k]


def limpar(bruto):
    return re.sub(r'\s+', ' ', RX_ANOTACAO.split(str(bruto))[0]).strip(' -–')


def dinheiro(v):
    if v is None or pd.isna(v):
        return None
    if isinstance(v, (int, float)):
        return float(v) or None
    t = re.sub(r'[^\d,.]', '', str(v))
    if not t:
        return None
    if ',' in t:
        t = t.replace('.', '').replace(',', '.')
    elif t.count('.') > 1 or re.search(r'\.\d{3}$', t):
        t = t.replace('.', '')
    try:
        return float(t) or None
    except ValueError:
        return None


def texto(v):
    if v is None or pd.isna(v):
        return ''
    return re.sub(r'\s+', ' ', str(v)).strip()


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


def col(d, *nomes):
    for c in d.columns:
        if ch(c) in nomes:
            return d[c]
    for c in d.columns:
        if any(ch(c).startswith(p) for p in nomes):
            return d[c]
    return pd.Series([None] * len(d), index=d.index)


# ------------------------------------------- faturamento nas abas de consultor
linhas = []
for aba in openpyxl.load_workbook(CONSULTORIAS, read_only=True).sheetnames:
    if 'Relat' in aba:
        continue
    d = pd.read_excel(CONSULTORIAS, sheet_name=aba, header=1)
    cols = {ch(c): c for c in d.columns}
    cn = next((v for k, v in cols.items() if k.startswith('aluna')), None)
    if not cn:
        continue
    cm = next((v for k, v in cols.items() if 'faturamento mes' in k), None)
    ca = next((v for k, v in cols.items() if 'faturamento ano' in k), None)
    csit = next((v for k, v in cols.items() if 'situacao' in k), None)
    datas = [v for k, v in cols.items() if re.match(r'^\d\s*consult', k)]
    bloco = ''
    for _, r in d.iterrows():
        bruto = texto(r[cn])
        if not bruto:
            continue
        if 'moonshot' in ch(bruto):          # linha de cabecalho de bloco
            # O cabecalho do bloco vem 'MOONSHOT PRÓ' numa aba e
            # 'MOONSHOT PRO' na outra. E o mesmo produto.
            b = ch(bruto).replace('moonshot', '').strip()
            bloco = {'pro': 'Moonshot Pró', 'club': 'Moonshot Club',
                     'in company': 'Moonshot In Company'}.get(b, bruto.strip())
            continue
        mes = dinheiro(r[cm]) if cm is not None else None
        ano = dinheiro(r[ca]) if ca is not None else None
        if mes is None and ano is not None:
            mes = ano / 12
        if mes is None:
            continue
        linhas.append({
            'nome': limpar(bruto),
            'chaves': pessoas(bruto),
            'faturamento': mes,
            'de_ano': r[cm] is None or pd.isna(r[cm]) if cm is not None else True,
            'consultor': re.sub(r'\s+Geral\s*$', '', aba.strip()),
            'bloco': bloco or '(não identificado)',
            'cidade': texto(r[cols.get('cidade')]) if 'cidade' in cols else '',
            'ramo': texto(r[cols.get('ramo atividade')]) if 'ramo atividade' in cols else '',
            'situacao_aluna': texto(r[csit]) if csit else '',
            'consultorias': sum(1 for c in datas if pd.notna(r[c])),
        })

c = pd.DataFrame(linhas)
# Mesma aluna em duas abas: fica o maior faturamento.
c['k'] = c.chaves.map(lambda ks: ks[0] if ks else '')
c = c.sort_values('faturamento', ascending=False).drop_duplicates('k', keep='first')
alto = c[c.faturamento >= CORTE].copy()

def coluna_nome(d):
    """Metade das abas chama a coluna de nome de 'Nome' ou 'ALUNO(A)'; a outra
    metade deixou o cabecalho que o Sheets inventou ('Coluna 2'). O que nunca
    muda e a posicao: o nome e a coluna imediatamente a esquerda de Telefone.
    Procurar por 'coluna 2' nao funciona - a normalizacao tira o digito e
    'Coluna 1', que e numero de linha, passaria a casar tambem."""
    for c in d.columns:
        if ch(c) in NOME_ALUNA:
            return d[c]
    for i, c in enumerate(d.columns):
        if ch(c).startswith('telefone') and i > 0:
            return d[d.columns[i - 1]]
    return pd.Series([None] * len(d), index=d.index)


# ------------------------------------------------- contato nas matriculas
CONTATO = {}
for aba in openpyxl.load_workbook(MATRICULAS, read_only=True).sheetnames:
    for cab in (0, 1, 2):
        d = pd.read_excel(MATRICULAS, sheet_name=aba, header=cab)
        nome = coluna_nome(d)
        tel = col(d, 'telefone', 'contato')
        if nome.notna().any() and tel.notna().any():
            break
    else:
        continue
    reg = pd.DataFrame({
        'nome': nome.map(texto),
        'telefone': tel.map(telefone),
        'email': col(d, 'e mail', 'email', 'cliente email').map(texto),
        'produto': col(d, 'tipo de plano', 'plano').map(texto),
        'status': col(d, 'status contrato').map(texto),
        'status2': col(d, 'status').map(texto),
        'entrada': pd.to_datetime(col(d, 'data de inicio'), errors='coerce'),
        'termino': pd.to_datetime(col(d, 'data de termino'), errors='coerce'),
        'cs': col(d, 'cs responsavel').map(texto),
        'turma': aba.strip(),
    })
    for _, r in reg.iterrows():
        for k in pessoas(r.nome):
            # A primeira turma que tiver o campo ganha; depois so completa.
            atual = CONTATO.setdefault(k, {})
            for campo in ('telefone', 'email', 'produto', 'status', 'status2',
                          'entrada', 'termino', 'cs', 'turma'):
                v = r[campo]
                if not atual.get(campo) and not (v is None or pd.isna(v)
                                                 or str(v).strip() == ''):
                    atual[campo] = v

CHAVES = list(CONTATO)


def contato(nome):
    """As passadas do REGRAS.md, sem a de Jaccard solto: aqui casar errado
    entrega o telefone de outra pessoa para a comercial ligar.

    Tenta o nome inteiro e depois cada lado da barra, porque as duas planilhas
    escrevem o casal em ordem diferente: a aba do consultor tem 'Edgar
    Cenedezi / Andressa Almeida' e a matricula tem 'Andressa de Almeida
    Oliveira / Edgar'."""
    for cand in pessoas(nome):
        achado = _contato(cand)
        if achado:
            return achado
    return {}, 'não encontrada'


def _contato(k):
    if k in CONTATO:
        return CONTATO[k], 'nome igual'
    t = set(k.split())
    if len(t) >= 2:
        for u in CHAVES:
            tu = set(u.split())
            if len(tu) >= 2 and (t <= tu or tu <= t) and k.split()[0] == u.split()[0]:
                return CONTATO[u], 'nome parcial'
        # Sobrenome em ordem trocada ou abreviado: 'Edgar Cenedezi / Andressa
        # Almeida' na aba contra 'Andressa de Almeida Oliveira / Edgar' na
        # matricula. Exige o primeiro nome igual e dois nomes em comum fora
        # das ligacoes - com um só, 'Luciana Pereira' casaria com
        # 'Luciana Freitas'.
        for u in CHAVES:
            if k.split()[0] != u.split()[0]:
                continue
            if len((t & set(u.split())) - LIGACAO) >= 2:
                return CONTATO[u], 'sobrenome parcial'
        melhor, nota = None, 0.0
        for u in CHAVES:
            r = difflib.SequenceMatcher(None, k, u).ratio()
            if r > nota and r >= CORTE_DIGITACAO and k.split()[0][:3] == u.split()[0][:3]:
                melhor, nota = u, r
        if melhor:
            return CONTATO[melhor], 'digitação'
    return None


achado = alto.nome.map(contato)
alto['_c'] = achado.map(lambda a: a[0])
alto['_como'] = achado.map(lambda a: a[1])


def campo(nome):
    return alto._c.map(lambda d: d.get(nome) or '')


S = pd.DataFrame({
    'Aluna': alto.nome,
    'Faturamento (mês)': alto.faturamento,
    'Telefone': campo('telefone'),
    'E-mail': campo('email'),
    'Produto': alto.bloco,
    'Consultor': alto.consultor,
    'Cidade': alto.cidade,
    'Ramo': alto.ramo,
    'Situação do contrato': campo('status').where(campo('status') != '', campo('status2')),
    'Entrada': campo('entrada').map(lambda v: v.strftime('%d/%m/%Y') if hasattr(v, 'strftime') else ''),
    'Término previsto': campo('termino').map(lambda v: v.strftime('%d/%m/%Y') if hasattr(v, 'strftime') else ''),
    'CS': campo('cs'),
    'Turma': campo('turma'),
    'Consultorias feitas': alto.consultorias,
    'Relato do consultor': alto.situacao_aluna,
    'Contato localizado por': alto._como,
}).sort_values('Faturamento (mês)', ascending=False).reset_index(drop=True)

LARG = {'Aluna': 36, 'Faturamento (mês)': 17, 'Telefone': 19, 'E-mail': 32,
        'Produto': 16, 'Consultor': 14, 'Cidade': 24, 'Ramo': 28,
        'Situação do contrato': 22, 'Entrada': 13, 'Término previsto': 15,
        'CS': 16, 'Turma': 24, 'Consultorias feitas': 12,
        'Relato do consultor': 70, 'Contato localizado por': 20}

with pd.ExcelWriter(SAIDA, engine='xlsxwriter') as xw:
    wb = xw.book
    cab = wb.add_format({'bold': True, 'bg_color': '#1F2937', 'font_color': 'white',
                         'border': 1, 'align': 'center', 'valign': 'vcenter',
                         'text_wrap': True})
    cabv = wb.add_format({'bold': True, 'bg_color': '#047857', 'font_color': 'white',
                          'border': 1, 'align': 'center', 'valign': 'vcenter',
                          'text_wrap': True})
    txt = wb.add_format({'valign': 'top', 'border': 1})
    wrap = wb.add_format({'valign': 'top', 'border': 1, 'text_wrap': True})
    vaz = wb.add_format({'valign': 'top', 'border': 1, 'font_color': '#9CA3AF',
                         'align': 'center'})
    din = wb.add_format({'valign': 'top', 'border': 1, 'num_format': 'R$ #,##0',
                         'bold': True})
    w = wb.add_worksheet('50k+ por mês')
    for j, cl in enumerate(S.columns):
        w.write(0, j, cl, cabv if cl == 'Faturamento (mês)' else cab)
        w.set_column(j, j, LARG[cl])
    for i, row in S.iterrows():
        for j, cl in enumerate(S.columns):
            v = row[cl]
            if cl == 'Faturamento (mês)':
                w.write_number(i + 1, j, float(v), din)
            elif cl == 'Consultorias feitas':
                w.write_number(i + 1, j, int(v), txt)
            elif v == '' or pd.isna(v):
                w.write(i + 1, j, '—', vaz)
            else:
                w.write(i + 1, j, str(v), wrap if cl == 'Relato do consultor' else txt)
    w.set_row(0, 32)
    w.freeze_panes(1, 2)
    w.autofilter(0, 0, len(S), len(S.columns) - 1)

f = S['Faturamento (mês)']
print('alunas com faturamento na aba do consultor:', len(c))
print('com 50k+ por mes:', len(S))
print('soma: R$ %s/mes' % f'{f.sum():,.0f}'.replace(',', '.'))
print('mediana: R$ %s' % f'{f.median():,.0f}'.replace(',', '.'))
print('\ncontato:')
print('  com telefone:', int((S.Telefone != '').sum()), '| com e-mail:', int((S['E-mail'] != '').sum()))
print(S['Contato localizado por'].value_counts().to_string())
print('\npor produto:'); print(S.Produto.value_counts().to_string())
print('\npor consultor:'); print(S.Consultor.value_counts().to_string())
print('\nsituacao do contrato:')
print(S['Situação do contrato'].replace('', '(não encontrada na matrícula)').value_counts().to_string())
print('\nfaixas:')
for rot, m in (('>= 200k', f >= 200000), ('100k a 200k', (f >= 100000) & (f < 200000)),
               ('50k a 100k', (f >= 50000) & (f < 100000))):
    print(f'  {rot:14s} {int(m.sum()):3d}')
