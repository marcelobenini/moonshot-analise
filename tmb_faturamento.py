"""Só as TMB, com o faturamento que a base já conhece preenchido.

Entrada:
  dados/recebido/alunas_maio_daniele.xlsx  - a planilha que a Daniele
      devolveu com a coluna TMB? preenchida (Drive 13lA9JS4f31O_...).
  dados/controle_consultorias_live.xlsx    - de onde sai o faturamento.

Corte: fica quem tem TMB escrito na coluna TMB?, nas tres grafias que ela
usou ('TMB', 'TMB Nbaw', 'TMB Natalia'). A grafia e preservada: Nbaw e
Natalia sao pessoas juridicas diferentes.

Faturamento: vem da coluna FATURAMENTO MÊS da aba do consultor. Quando so o
FATURAMENTO ANO esta preenchido, vale ano/12 - nas abas o ano e sempre o mes
vezes doze, entao e a propria aritmetica da planilha, nao um palpite meu.
Quem nao tem nenhum dos dois sai como 'nao informado', nunca como zero.

Tres coisas que o campo de nome da aba do consultor faz e que atrapalham o
casamento, tratadas de proposito:

1. O consultor cola anotacao no nome: 'Priscila Abreu Brandão - ALUNA DANIEL X',
   'Ana Paula Sarbok - Plano de ação entregue', 'Bruna Carol de Souza - OK'.
   Sao 89 das 577 linhas. O corte e no hifen seguido de um marcador conhecido,
   nunca em qualquer hifen - nome com hifen existe.
2. Uma linha as vezes e um casal ou uma sociedade: 'Amanda Cristina da Silva /
   Deleon Marido', 'Maisa ferreira / Gabriela Macrina'. Cada lado da barra
   entra como chave propria, porque o faturamento e da mesma empresa.
3. Nome digitado diferente: 'Claudia thais' na aba contra 'Claudia thays' na
   matricula. Entra a passada de digitacao do REGRAS.md, com o mesmo corte de
   0.92 de similaridade.

O que NAO foi casado de proposito: linha que nomeia duas alunas ligadas por
' e ' ('fabiana vieira e beatriz matos'), porque nao da para saber de qual
das duas e o numero.
"""
import difflib
import re
import sys
import unicodedata
import warnings

import openpyxl
import pandas as pd

warnings.filterwarnings('ignore')

ORIGEM = sys.argv[1] if len(sys.argv) > 1 else 'dados/recebido/alunas_maio_daniele.xlsx'
CONSULTORIAS = 'dados/controle_consultorias_live.xlsx'
SAIDA = 'entregaveis/tmb_faturamento.xlsx'


# Marcadores que o consultor cola depois do hifen. Sem 'e' nem iniciais:
# o corte tem que ser inequivoco.
RX_ANOTACAO = re.compile(
    r'\s*[-–]\s*(alun[ao]\b|ok\b|pediu\b|plano\b|pausa\b|soci[ao]\b)', re.I)
CORTE_DIGITACAO = 0.92


def ch(n):
    n = unicodedata.normalize('NFKD', str(n)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z ]', ' ', n.lower())).strip()


def pessoas(bruto):
    """Devolve as chaves que uma celula de nome contem: o nome sem a anotacao
    do consultor, e cada lado da barra quando a linha e de casal/sociedade."""
    limpo = RX_ANOTACAO.split(str(bruto))[0]
    partes = [limpo] + (limpo.split('/') if '/' in limpo else [])
    return [k for k in (ch(x) for x in partes) if k and 'moonshot' not in k]


def dinheiro(v):
    """A celula as vezes e numero, as vezes 'R$ 120.000,00', as vezes tem
    texto colado. Devolve None quando nao sobra numero - celula suja nao
    vira zero."""
    if v is None or pd.isna(v):
        return None
    if isinstance(v, (int, float)):
        return float(v) or None
    t = re.sub(r'[^\d,.]', '', str(v))
    if not t:
        return None
    # 120.000,00 (brasileiro) contra 120000.00
    if ',' in t:
        t = t.replace('.', '').replace(',', '.')
    elif t.count('.') > 1 or re.search(r'\.\d{3}$', t):
        t = t.replace('.', '')
    try:
        return float(t) or None
    except ValueError:
        return None


# -------------------------------------------------- faturamento por aluna
FAT = {}
for aba in openpyxl.load_workbook(CONSULTORIAS, read_only=True).sheetnames:
    if 'Relat' in aba:
        continue
    d = pd.read_excel(CONSULTORIAS, sheet_name=aba, header=1)
    cols = {ch(c): c for c in d.columns}
    cn = next((v for k, v in cols.items() if k.startswith('aluna')), None)
    cm = next((v for k, v in cols.items() if 'faturamento mes' in k), None)
    if not cn or cm is None:
        continue
    ca = next((v for k, v in cols.items() if 'faturamento ano' in k), None)
    for _, r in d.iterrows():
        val = dinheiro(r[cm])
        anual = dinheiro(r[ca]) if ca is not None else None
        if val is None and anual is not None:
            val = anual / 12
        if val is None:
            continue
        for k in pessoas(r[cn]):
            # A mesma aluna pode estar em duas abas. Fica o maior valor e o
            # nome da aba, para dar para rastrear de onde veio.
            if k not in FAT or val > FAT[k][0]:
                FAT[k] = (val, re.sub(r'\s+Geral\s*$', '', aba.strip()))

CHAVES = list(FAT)


def faturamento(nome):
    """Duas passadas, as mesmas do REGRAS.md: nome igual, e depois nome
    contido no outro com o primeiro nome batendo ('Ana Paula Adão maia'
    contra 'Ana Paula Adao'). Sem terceira passada por semelhanca solta:
    aqui o custo de casar errado e colar o faturamento de outra pessoa."""
    k = ch(nome)
    if k in FAT:
        return FAT[k] + ('nome igual',)
    t = set(k.split())
    # Com um token so, 'contido no outro' casa qualquer homonimo: 'Joyce'
    # casava com 'Joyce Luisa do Nascimento'. Exige dois nomes do lado curto.
    if len(t) < 2:
        return None
    for u in CHAVES:
        tu = set(u.split())
        if len(tu) < 2:
            continue
        if (t <= tu or tu <= t) and k.split()[0] == u.split()[0]:
            return FAT[u] + ('nome parcial',)
    # Ultima passada: erro de digitacao. Corte alto, e o primeiro nome ainda
    # tem de bater, senao 'Natalia Rodrigues' casaria com 'Amanda Rodrigues'.
    melhor, nota = None, 0.0
    for u in CHAVES:
        r = difflib.SequenceMatcher(None, k, u).ratio()
        if r > nota and r >= CORTE_DIGITACAO and k.split()[0][:3] == u.split()[0][:3]:
            melhor, nota = u, r
    if melhor:
        return FAT[melhor] + ('digitação',)
    return None


# ------------------------------------------------------------- recorte TMB
d = pd.ExcelFile(ORIGEM).parse('Maio e pós maio')
marca = d['TMB?'].fillna('').astype(str).str.strip()
e_tmb = marca.str.upper().str.startswith('TMB')

COLS = ['Aluna', 'Contato', 'Faturamento (mês)', 'TMB?', 'Validação', 'Produto',
        'Situação', 'Período de entrada', 'Entrada', 'Término previsto',
        'Consultorias feitas', 'Consultor', 'Pagamento (planilha)',
        'Motivo do cancelamento', 'Observação']
LARG = {'Aluna': 36, 'Contato': 19, 'Faturamento (mês)': 17, 'TMB?': 14,
        'Validação': 13, 'Produto': 17, 'Situação': 22, 'Período de entrada': 17,
        'Entrada': 13, 'Término previsto': 15, 'Consultorias feitas': 22,
        'Consultor': 15, 'Pagamento (planilha)': 19,
        'Motivo do cancelamento': 45, 'Observação': 45}


def montar(D):
    E = D.copy()
    achado = E.Aluna.map(faturamento)
    E['Faturamento (mês)'] = achado.map(lambda a: a[0] if a else None)
    E['_como'] = achado.map(lambda a: a[2] if a else 'não encontrada')
    E['TMB?'] = marca.reindex(D.index).replace('', '(não respondido)')
    return E[COLS + ['_como']]


tmb = montar(d[e_tmb]).sort_values('Faturamento (mês)', ascending=False,
                                   na_position='last')
fora = montar(d[~e_tmb])

with pd.ExcelWriter(SAIDA, engine='xlsxwriter') as xw:
    wb = xw.book
    cab = wb.add_format({'bold': True, 'bg_color': '#1F2937', 'font_color': 'white',
                         'border': 1, 'align': 'center', 'valign': 'vcenter',
                         'text_wrap': True})
    cabf = wb.add_format({'bold': True, 'bg_color': '#047857', 'font_color': 'white',
                          'border': 1, 'align': 'center', 'valign': 'vcenter',
                          'text_wrap': True})
    txt = wb.add_format({'valign': 'top', 'border': 1})
    wrap = wb.add_format({'valign': 'top', 'border': 1, 'text_wrap': True})
    vaz = wb.add_format({'valign': 'top', 'border': 1, 'font_color': '#9CA3AF',
                         'align': 'center'})
    din = wb.add_format({'valign': 'top', 'border': 1, 'bg_color': '#ECFDF5',
                         'num_format': 'R$ #,##0'})
    aprench = wb.add_format({'border': 1, 'bg_color': '#ECFDF5', 'align': 'center',
                             'font_color': '#6B7280', 'num_format': 'R$ #,##0'})
    livre2 = wb.add_format({'border': 1, 'bg_color': '#FAF5FF'})

    def escrever(nome, D):
        w = wb.add_worksheet(nome)
        for j, c in enumerate(COLS):
            w.write(0, j, c, cabf if c == 'Faturamento (mês)' else cab)
            w.set_column(j, j, LARG[c])
        for i, (_, row) in enumerate(D.iterrows()):
            for j, c in enumerate(COLS):
                if c == 'Faturamento (mês)':
                    v = row[c]
                    if pd.isna(v):
                        # Celula livre, ja formatada: quem souber digita aqui.
                        w.write(i + 1, j, 'não informado', aprench)
                    else:
                        w.write_number(i + 1, j, float(v), din)
                    continue
                if c == 'Validação':
                    w.write_blank(i + 1, j, None, livre2)
                    continue
                v = row[c]
                if pd.isna(v) or str(v).strip() in ('', '—'):
                    w.write(i + 1, j, '—', vaz)
                else:
                    w.write(i + 1, j, str(v),
                            wrap if c in ('Motivo do cancelamento', 'Observação')
                            else txt)
        w.set_row(0, 30)
        w.freeze_panes(1, 3)
        w.autofilter(0, 0, max(len(D), 1), len(COLS) - 1)
        j = COLS.index('Validação')
        w.data_validation(1, j, max(len(D), 1), j,
                          {'validate': 'list',
                           'source': ['Confere', 'Não confere', 'Pendente']})

    escrever('TMB', tmb)
    escrever('Sem resposta de TMB', fora)

f = tmb['Faturamento (mês)']
print('TMB:', len(tmb), '| fora:', len(fora))
print('\nfaturamento preenchido:', int(f.notna().sum()), 'de', len(tmb))
print(tmb['_como'].value_counts().to_string())
print('\nsoma do que foi encontrado: R$ %s/mes' % f'{f.sum():,.0f}'.replace(',', '.'))
print('mediana: R$ %s' % f'{f.median():,.0f}'.replace(',', '.'))
print('\nfaixas:')
for rot, m in (('>= 100k', f >= 100000), ('50k a 100k', (f >= 50000) & (f < 100000)),
               ('20k a 50k', (f >= 20000) & (f < 50000)),
               ('10k a 20k', (f >= 10000) & (f < 20000)),
               ('< 10k', f < 10000), ('não informado', f.isna())):
    print(f'  {rot:16s} {int(m.sum()):4d}')
print('\ngrafia de TMB:'); print(tmb['TMB?'].value_counts().to_string())
print('\nfaturamento medio por grafia:')
print(tmb.groupby('TMB?')['Faturamento (mês)'].agg(['count', 'sum']).to_string())
