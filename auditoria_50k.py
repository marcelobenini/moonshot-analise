"""Confere as 88 alunas de 50k+ contra matrícula e contra as duas planilhas
de cancelamento.

Por que isso não era automático: a lista de 50k+ pega o faturamento na aba do
consultor e o contato na matrícula, e para o contato basta a primeira ocorrência
do nome. Para cancelamento isso não serve — a mesma aluna aparece na aba da
turma dela como ATIVO e na aba CANCELAMENTOS como cancelada, e quem responde é
a segunda. Aqui toda ocorrência do nome é lida, em todas as abas das duas
planilhas, e as divergências ficam na planilha em vez de serem resolvidas no
meu critério.

Três fontes de sinal de cancelamento:

1. Campo de status nas abas de matrícula ('Status Contrato' quando existe,
   senão 'Status').
2. Abas de lista da matrícula: 'CANCELAMENTOS' e 'PEDIDOS DE CANCELAMENTO'.
   Estar nelas é sinal por si, independente do que o status diga.
3. As duas planilhas de pedido de cancelamento ('Cancelamentos - Moonshot' e
   'Cancelamentos Atual - Moonshot'), lidas pelo parser que já existe, que
   separa quem pediu e ficou de quem pediu e saiu.

O desfecho do pedido manda sobre o status da matrícula: 'Não será cancelado,
pois fez onboarding' é informação mais nova e mais específica que um 'ATIVO'
que ninguém mexeu.
"""
import importlib.util
import io
import contextlib
import re
import sys
import warnings

import openpyxl
import pandas as pd

from moonshot import cancelamento_planilha as cp

warnings.filterwarnings('ignore')

MATRICULAS = 'dados/matriculados_club_live.xlsx'
CANCELAMENTOS = [('Cancelamentos - Moonshot', 'dados/cancelamentos_live.xlsx'),
                 ('Cancelamentos Atual', 'dados/cancelamento_atual_live.xlsx')]
SAIDA = 'entregaveis/alto_faturamento_50k.xlsx'

# Reaproveita o leitor e as passadas de nome da lista de 50k+.
_spec = importlib.util.spec_from_file_location('af', 'alto_faturamento.py')
af = importlib.util.module_from_spec(_spec)
_argv, sys.argv = sys.argv, ['af']
with contextlib.redirect_stdout(io.StringIO()):
    _spec.loader.exec_module(af)
sys.argv = _argv

ch, pessoas, texto = af.ch, af.pessoas, af.texto
BASE = af.S.copy()

RX_SAIDA = re.compile(r'cancel|bloquead|suspens|inadimpl|distrato|encerr|pausa', re.I)
ABA_DE_SAIDA = re.compile(r'cancelamento', re.I)


def casar(k, universo):
    """As mesmas passadas da lista de 50k+, na mesma ordem."""
    if k in universo:
        return k
    t = set(k.split())
    if len(t) < 2:
        return None
    for u in universo:
        tu = set(u.split())
        if len(tu) >= 2 and (t <= tu or tu <= t) and k.split()[0] == u.split()[0]:
            return u
    for u in universo:
        if k.split()[0] == u.split()[0] and len((t & set(u.split())) - af.LIGACAO) >= 2:
            return u
    import difflib
    melhor, nota = None, 0.0
    for u in universo:
        r = difflib.SequenceMatcher(None, k, u).ratio()
        if r > nota and r >= af.CORTE_DIGITACAO and k.split()[0][:3] == u.split()[0][:3]:
            melhor, nota = u, r
    return melhor


# ------------------------------- toda ocorrencia do nome nas matriculas
OCORRE = {}
for aba in openpyxl.load_workbook(MATRICULAS, read_only=True).sheetnames:
    for cab in (0, 1, 2):
        d = pd.read_excel(MATRICULAS, sheet_name=aba, header=cab)
        nome = af.coluna_nome(d)
        if nome.notna().any():
            break
    sc = af.col(d, 'status contrato')
    st = af.col(d, 'status')
    for i in range(len(d)):
        bruto = texto(nome.iloc[i]) if i < len(nome) else ''
        if not bruto or len(bruto) < 3:
            continue
        # 'Status Contrato' e o campo que a equipe mantem; 'Status' e o antigo.
        valor = texto(sc.iloc[i]) or texto(st.iloc[i])
        for k in pessoas(bruto):
            OCORRE.setdefault(k, []).append((aba.strip(), valor))

UNIV_MAT = list(OCORRE)

# ------------------------------- pedidos nas duas planilhas de cancelamento
PEDIDO = {}
for rotulo, arq in CANCELAMENTOS:
    p = cp.carregar(arq)
    for _, r in p.iterrows():
        for k in pessoas(r['nome']):
            PEDIDO.setdefault(k, []).append({
                'planilha': rotulo, 'aba': r['aba'], 'desfecho': r['desfecho'],
                'motivo': texto(r.get('motivo')), 'obs': texto(r.get('observacoes')),
                'data': r.get('data_pedido'),
            })

UNIV_PED = list(PEDIDO)
PESO = {'saiu': 3, 'em_aberto': 2, 'ficou': 1, 'sem_registro': 0}


def auditar(nome):
    km = next((casar(k, UNIV_MAT) for k in pessoas(nome)
               if casar(k, UNIV_MAT)), None)
    occ = OCORRE.get(km, []) if km else []
    status = [f'{a}: {v}' for a, v in occ if v]
    abas_saida = sorted({a for a, _ in occ if ABA_DE_SAIDA.search(a)})
    sinal_status = sorted({v for _, v in occ if v and RX_SAIDA.search(v)})

    kp = next((casar(k, UNIV_PED) for k in pessoas(nome)
               if casar(k, UNIV_PED)), None)
    peds = PEDIDO.get(kp, []) if kp else []
    # Entre dois registros da mesma aluna vale o desfecho mais grave.
    peds = sorted(peds, key=lambda p: -PESO[p['desfecho']])

    if peds:
        desfecho = cp.ROTULO_DESFECHO[peds[0]['desfecho']]
    elif sinal_status or abas_saida:
        desfecho = 'Sem pedido registrado, mas a matrícula sinaliza saída'
    else:
        desfecho = 'Sem sinal de cancelamento'

    return {
        'Status na matrícula': ' | '.join(dict.fromkeys(status)),
        'Em aba de cancelamento da matrícula': ', '.join(abas_saida),
        'Pediu cancelamento': 'SIM' if peds else '',
        'Desfecho do pedido': desfecho,
        'Onde está o pedido': ' | '.join(
            dict.fromkeys(f'{p["planilha"]} / {p["aba"]}' for p in peds)),
        'Data do pedido': next((p['data'].strftime('%d/%m/%Y') for p in peds
                                if p['data'] is not None and pd.notna(p['data'])), ''),
        'Motivo do cancelamento': next((p['motivo'] for p in peds if p['motivo']), ''),
        'Observação do cancelamento': next((p['obs'] for p in peds if p['obs']), ''),
        # Conflito e o que precisa de olho humano: a matricula diz ativo e o
        # pedido diz que saiu, ou o contrario.
        'Conflito': ('matrícula diz ativo, pedido diz saída'
                     if peds and peds[0]['desfecho'] == 'saiu' and not sinal_status
                     else 'matrícula diz saída, pedido diz que ficou'
                     if peds and peds[0]['desfecho'] == 'ficou' and sinal_status
                     else ''),
    }


aud = pd.DataFrame([auditar(n) for n in BASE.Aluna], index=BASE.index)
S = pd.concat([BASE.drop(columns=['Situação do contrato', 'Contato localizado por']),
               aud, BASE[['Contato localizado por']]], axis=1)

ORDEM = ['Aluna', 'Faturamento (mês)', 'Telefone', 'E-mail', 'Produto', 'Consultor',
         'Pediu cancelamento', 'Desfecho do pedido', 'Status na matrícula',
         'Em aba de cancelamento da matrícula', 'Onde está o pedido',
         'Data do pedido', 'Motivo do cancelamento', 'Observação do cancelamento',
         'Conflito', 'Cidade', 'Ramo', 'Entrada', 'Término previsto', 'CS', 'Turma',
         'Consultorias feitas', 'Relato do consultor', 'Contato localizado por']
S = S[ORDEM]

RISCO = S[(S['Pediu cancelamento'] == 'SIM')
          | (S['Desfecho do pedido'] != 'Sem sinal de cancelamento')]

LARG = {'Aluna': 34, 'Faturamento (mês)': 16, 'Telefone': 19, 'E-mail': 30,
        'Produto': 15, 'Consultor': 13, 'Pediu cancelamento': 11,
        'Desfecho do pedido': 26, 'Status na matrícula': 44,
        'Em aba de cancelamento da matrícula': 26, 'Onde está o pedido': 34,
        'Data do pedido': 13, 'Motivo do cancelamento': 50,
        'Observação do cancelamento': 50, 'Conflito': 28, 'Cidade': 22, 'Ramo': 26,
        'Entrada': 13, 'Término previsto': 15, 'CS': 15, 'Turma': 22,
        'Consultorias feitas': 12, 'Relato do consultor': 60,
        'Contato localizado por': 18}
LARGO = ('Motivo do cancelamento', 'Observação do cancelamento',
         'Relato do consultor', 'Status na matrícula')

with pd.ExcelWriter(SAIDA, engine='xlsxwriter') as xw:
    wb = xw.book
    cab = wb.add_format({'bold': True, 'bg_color': '#1F2937', 'font_color': 'white',
                         'border': 1, 'align': 'center', 'valign': 'vcenter',
                         'text_wrap': True})
    cabv = wb.add_format({'bold': True, 'bg_color': '#047857', 'font_color': 'white',
                          'border': 1, 'align': 'center', 'valign': 'vcenter',
                          'text_wrap': True})
    cabr = wb.add_format({'bold': True, 'bg_color': '#B91C1C', 'font_color': 'white',
                          'border': 1, 'align': 'center', 'valign': 'vcenter',
                          'text_wrap': True})
    txt = wb.add_format({'valign': 'top', 'border': 1})
    wrap = wb.add_format({'valign': 'top', 'border': 1, 'text_wrap': True})
    vaz = wb.add_format({'valign': 'top', 'border': 1, 'font_color': '#9CA3AF',
                         'align': 'center'})
    din = wb.add_format({'valign': 'top', 'border': 1, 'num_format': 'R$ #,##0',
                         'bold': True})
    alerta = wb.add_format({'valign': 'top', 'border': 1, 'bg_color': '#FEE2E2',
                            'text_wrap': True})

    def escrever(nome, D):
        w = wb.add_worksheet(nome)
        for j, cl in enumerate(ORDEM):
            w.write(0, j, cl, cabv if cl == 'Faturamento (mês)'
                    else cabr if cl in ('Pediu cancelamento', 'Desfecho do pedido',
                                        'Conflito') else cab)
            w.set_column(j, j, LARG[cl])
        for i, (_, row) in enumerate(D.iterrows()):
            for j, cl in enumerate(ORDEM):
                v = row[cl]
                if cl == 'Faturamento (mês)':
                    w.write_number(i + 1, j, float(v), din)
                elif cl == 'Consultorias feitas':
                    w.write_number(i + 1, j, int(v), txt)
                elif v == '' or pd.isna(v):
                    w.write(i + 1, j, '—', vaz)
                elif cl == 'Conflito':
                    w.write(i + 1, j, str(v), alerta)
                else:
                    w.write(i + 1, j, str(v), wrap if cl in LARGO else txt)
        w.set_row(0, 46)
        w.freeze_panes(1, 2)
        w.autofilter(0, 0, max(len(D), 1), len(ORDEM) - 1)

    escrever('50k+ auditada', S)
    escrever('Com sinal de cancelamento', RISCO)

print('auditadas:', len(S))
print('\ndesfecho:'); print(S['Desfecho do pedido'].value_counts().to_string())
print('\npediu cancelamento em alguma das duas planilhas:',
      int((S['Pediu cancelamento'] == 'SIM').sum()))
print('aparece em aba de cancelamento da matricula:',
      int((S['Em aba de cancelamento da matrícula'] != '').sum()))
print('\nconflitos:')
print(S[S.Conflito != ''][['Aluna', 'Faturamento (mês)', 'Conflito']].to_string(index=False))
print('\nfaturamento em risco: R$ %s/mes' %
      f'{RISCO["Faturamento (mês)"].sum():,.0f}'.replace(',', '.'))
print('de um total de R$ %s' % f'{S["Faturamento (mês)"].sum():,.0f}'.replace(',', '.'))
