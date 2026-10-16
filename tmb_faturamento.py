"""Só as TMB, com uma coluna em branco para lançar o faturamento.

Entrada: a planilha `alunas_maio_em_diante.xlsx` depois que a Daniele
preencheu a coluna TMB? no Drive (id 13lA9JS4f31O_6YiHoRRUFWjnx5ebMXzP).

Regra do corte: fica quem tem TMB escrito na coluna TMB?, em qualquer das
tres grafias que ela usou - 'TMB', 'TMB Nbaw' e 'TMB Natalia'. A grafia e
preservada: 'Nbaw' e 'Natalia' separam duas pessoas juridicas diferentes e
juntar as duas num 'TMB' so apagaria essa informacao.

Quem nao tem TMB nao foi tratado como 'nao e TMB'. Das 196 que saem da aba
principal, 192 estao com o tracinho que eu mesmo escrevi quando gerei a
planilha, ou seja ninguem respondeu, e 3 estao marcadas 'Sem Informação'.
Nenhuma dessas e uma negativa. Elas vao para a segunda aba em vez de sumir.
"""
import sys
import warnings

import pandas as pd

warnings.filterwarnings('ignore')

ORIGEM = sys.argv[1] if len(sys.argv) > 1 else 'dados/recebido/alunas_maio_daniele.xlsx'
SAIDA = 'entregaveis/tmb_faturamento.xlsx'

d = pd.ExcelFile(ORIGEM).parse('Maio e pós maio')
marca = d['TMB?'].fillna('').astype(str).str.strip()
e_tmb = marca.str.upper().str.startswith('TMB')

COLS = ['Aluna', 'Contato', 'Faturamento', 'TMB?', 'Validação', 'Produto',
        'Situação', 'Período de entrada', 'Entrada', 'Término previsto',
        'Consultorias feitas', 'Consultor', 'Pagamento (planilha)',
        'Motivo do cancelamento', 'Observação']
LARG = {'Aluna': 36, 'Contato': 19, 'Faturamento': 16, 'TMB?': 14, 'Validação': 13,
        'Produto': 17, 'Situação': 22, 'Período de entrada': 17, 'Entrada': 13,
        'Término previsto': 15, 'Consultorias feitas': 22, 'Consultor': 15,
        'Pagamento (planilha)': 19, 'Motivo do cancelamento': 45, 'Observação': 45}


def montar(D):
    E = D.copy()
    E['Faturamento'] = ''
    E['TMB?'] = marca.reindex(D.index).replace('', '(não respondido)')
    return E[COLS]


tmb = montar(d[e_tmb])
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
    livre = wb.add_format({'border': 1, 'bg_color': '#ECFDF5', 'num_format': 'R$ #,##0'})
    livre2 = wb.add_format({'border': 1, 'bg_color': '#FAF5FF'})

    def escrever(nome, D):
        w = wb.add_worksheet(nome)
        for j, c in enumerate(COLS):
            w.write(0, j, c, cabf if c == 'Faturamento' else cab)
            w.set_column(j, j, LARG[c])
        for i, (_, row) in enumerate(D.iterrows()):
            for j, c in enumerate(COLS):
                if c == 'Faturamento':
                    w.write_blank(i + 1, j, None, livre)
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
        w.freeze_panes(1, 2)
        w.autofilter(0, 0, max(len(D), 1), len(COLS) - 1)
        j = COLS.index('Validação')
        w.data_validation(1, j, max(len(D), 1), j,
                          {'validate': 'list',
                           'source': ['Confere', 'Não confere', 'Pendente']})
        return w

    escrever('TMB', tmb)
    escrever('Sem resposta de TMB', fora)

print('TMB:', len(tmb), '| fora:', len(fora))
print('\ngrafia de TMB mantida:')
print(tmb['TMB?'].value_counts().to_string())
print('\no que ficou de fora:')
print(fora['TMB?'].replace('—', '(ninguém respondeu)').value_counts().to_string())
print('\nTMB por produto:'); print(tmb.Produto.value_counts().to_string())
print('\nTMB por situação:'); print(tmb['Situação'].value_counts().to_string())
print('\nTMB por período:'); print(tmb['Período de entrada'].value_counts().to_string())
print('\ncom telefone:', int((tmb.Contato.astype(str) != '—').sum()), 'de', len(tmb))
