"""Leitura da planilha de acompanhamento dos consultores.

Cada aba e um consultor; dentro dela, secoes por programa (Moonshot Pro / Club).
O cabecalho real nao esta na primeira linha e o conjunto de colunas varia entre
abas, entao localizamos a linha que contem "ALUNA" e mapeamos por apelido.
"""
import re
import unicodedata

import pandas as pd

from .texto import norm, tem_conteudo

# apelido interno -> variantes encontradas nos cabecalhos das abas
COLUNAS = {
    'aluna': ['aluna'],
    'consultor_col': ['consultor'],
    'cidade': ['cidade'],
    'ramo': ['ramo atividade', 'ramo'],
    'fat_mes': ['faturamento mes'],
    'fat_ano': ['faturamento ano'],
    'contato': ['contato'],
    'potenciais': ['pontenciais', 'potenciais'],
    'entrada': ['entrada', 'data inicio'],
    'situacao': ['situacao aluna', 'situacao'],
}
RX_CONSULTORIA = re.compile(r'^\d\s*\.?\s*consult|consultoria')


def _cab(valor):
    return re.sub(r'\s+', ' ', norm(valor)).strip()


def _localizar_cabecalho(df):
    for i in range(min(8, len(df))):
        linha = [_cab(v) for v in df.iloc[i].tolist()]
        if any(c.startswith('aluna') for c in linha):
            return i
    return None


def _mapear(linha):
    """Cabecalho -> {apelido: indice}. Colunas de consultoria viram lista."""
    mapa, consultorias = {}, []
    for j, bruto in enumerate(linha):
        c = _cab(bruto)
        if not c or c == 'nan':
            continue
        if RX_CONSULTORIA.match(c) or c.startswith('entrega do'):
            consultorias.append(j)
            continue
        for apelido, variantes in COLUNAS.items():
            if apelido in mapa:
                continue
            if any(c.startswith(v) for v in variantes):
                mapa[apelido] = j
                break
    return mapa, consultorias


def _numero(v):
    """Faturamento da planilha do consultor: numero limpo, ja em reais."""
    if v is None or str(v).strip() in ('', 'nan'):
        return None
    t = re.sub(r'[^\d,.-]', '', str(v))
    if not t:
        return None
    if ',' in t and '.' in t:
        t = t.replace('.', '').replace(',', '.') if t.rfind(',') > t.rfind('.') else t.replace(',', '')
    elif ',' in t:
        t = t.replace(',', '.') if re.search(r',\d{1,2}$', t) else t.replace(',', '')
    try:
        return float(t)
    except ValueError:
        return None


def _consultorias_feitas(valores):
    """Conta encontros com data preenchida e os marcados como nao realizados."""
    feitas = nao = 0
    for v in valores:
        s = norm(v)
        if not s or s == 'nan':
            continue
        if 'nao realizada' in s or 'nao realizado' in s or s in ('x', '-'):
            nao += 1
        elif re.search(r'\d{4}-\d{2}-\d{2}|/\d{2}|\d{1,2}/\d{1,2}', s) or \
                re.match(r'(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)', s):
            feitas += 1
    return feitas, nao


def carregar(caminho):
    """Le todas as abas e devolve um DataFrame achatado, uma linha por aluna."""
    xl = pd.ExcelFile(caminho)
    linhas = []
    for aba in xl.sheet_names:
        df = xl.parse(aba, header=None, dtype=str)
        i = _localizar_cabecalho(df)
        if i is None:
            continue
        mapa, cons = _mapear(df.iloc[i].tolist())
        if 'aluna' not in mapa:
            continue
        programa = None
        for j in range(i + 1, len(df)):
            linha = df.iloc[j].tolist()
            nome = linha[mapa['aluna']]
            n = norm(nome)
            if not n or n == 'nan':
                continue
            # linha de secao ("MOONSHOT PRO" / "MOONSHOT CLUB"), nao e aluna
            if n.startswith('moonshot') or 'consultorias moonshot' in n:
                programa = 'CLUB' if 'club' in n else 'PRO'
                continue
            feitas, naofeitas = _consultorias_feitas([linha[k] for k in cons])
            reg = {
                'consultor': (str(linha[mapa['consultor_col']]).strip()
                              if 'consultor_col' in mapa and
                              tem_conteudo(linha[mapa['consultor_col']]) else aba.strip()),
                'aba': aba.strip(),
                'programa': programa,
                'nome_consultoria': re.sub(r'\s+', ' ', str(nome)).strip(),
                'consultorias_feitas': feitas,
                'consultorias_nao_realizadas': naofeitas,
            }
            for apelido in ('cidade', 'ramo', 'contato', 'potenciais', 'situacao', 'entrada'):
                v = linha[mapa[apelido]] if apelido in mapa else None
                reg[apelido] = re.sub(r'\s+', ' ', str(v)).strip() if tem_conteudo(v) else None
            reg['fat_mes_consultor'] = _numero(linha[mapa['fat_mes']]) if 'fat_mes' in mapa else None
            reg['fat_ano_consultor'] = _numero(linha[mapa['fat_ano']]) if 'fat_ano' in mapa else None
            linhas.append(reg)
    return pd.DataFrame(linhas)


# --------------------------------------------------------------------------
# Engajamento — lido do relato do consultor, com o vocabulario dele
# --------------------------------------------------------------------------
# Ordem importa: a primeira regra que casar decide. Risco de saida vence
# "engajada", porque uma aluna pode estar engajada e pedindo cancelamento.
ENGAJAMENTO = [
    ('risco_saida', r'cancelament|cancelar|cancelou|inadimplent|insatisfeit|nao esta feliz|'
                    r'nao ficou feliz|quer sair|desistiu|reembolso|processo juridico|'
                    r'problemas? na sociedade|encerrou'),
    ('ganho', r'renovou|fechou elite|ganhou|virou elite|\belite\b|upsell|comprou o'),
    ('sem_contato', r'nao (me )?responde|nao (me )?retorn|sem retorno|sem contato|sumiu|'
                    r'nao consigo contato|nao respondeu mais|nao da retorno|desengajad|'
                    r'nao participa|nao apareceu'),
    ('oscilante', r'engaja e desengaja|as vezes|oscil|bem devagar|faz pouc|pouquissimo do plano|'
                  r'nao faz o que|demora (muito )?para|dificil a comunicacao|'
                  r'tem dificuldade|esta perdida|nao coloca em pratica'),
    ('engajada', r'engajad|sempre responde|seguindo o plano|colocando em pratica|'
                 r'esta executando|participa|comprometid|dedicad|responde as mensagens|'
                 r'esta fazendo|implementou|aplicou'),
]
RX_RESULTADO = (r'aument(ou|o do)|cresceu|crescimento|dobrou|triplicou|alavancou|'
                r'resultados? (expressiv|positiv|otimo|bom|crescente)|melhorou|'
                r'bons resultados|otimo resultado|teve resultado|superou')
RX_SEM_RESULTADO = r'sem resultado|nao teve resultado|resultados? timid|piorou|caiu o faturamento'


def classificar_engajamento(texto):
    """Relato livre do consultor -> (estado, teve_resultado). None se sem relato."""
    if not tem_conteudo(texto):
        return None, None
    n = norm(texto)
    estado = 'neutro'
    for rotulo, padrao in ENGAJAMENTO:
        if re.search(padrao, n):
            estado = rotulo
            break
    if re.search(RX_SEM_RESULTADO, n):
        resultado = 'nao'
    elif re.search(RX_RESULTADO, n):
        resultado = 'sim'
    else:
        resultado = None
    return estado, resultado


ROTULO_ENGAJAMENTO = {
    'ganho': 'Renovou ou fez upsell',
    'engajada': 'Engajada',
    'oscilante': 'Oscilante',
    'sem_contato': 'Sem contato',
    'risco_saida': 'Risco de saída',
    'neutro': 'Relato sem sinal claro',
}


# --------------------------------------------------------------------------
# Casamento de nomes com a base do estudo
# --------------------------------------------------------------------------
def _chave(nome):
    """Nome normalizado, sem sufixos de anotacao do consultor ('- OK', '- nao responde')."""
    n = norm(nome)
    n = re.split(r'\s+-\s+|\s*\(', n)[0]
    n = re.sub(r'[^a-z\s]', ' ', n)
    return re.sub(r'\s+', ' ', n).strip()


def _tokens(nome):
    return {t for t in _chave(nome).split() if len(t) > 2}


def casar(consultoria, base, minimo=0.62):
    """Casa nomes da planilha de consultoria com a base do estudo.

    Tres passadas, da mais segura para a mais frouxa, e cada casamento carrega
    o metodo usado para poder ser auditado:
      1. nome normalizado identico
      2. primeiro + ultimo nome identicos
      3. sobreposicao de tokens acima do minimo (Jaccard)
    """
    alvo = base[['id_aluna', 'nome']].dropna(subset=['nome']).copy()
    alvo['_k'] = alvo['nome'].map(_chave)
    alvo['_t'] = alvo['nome'].map(_tokens)
    alvo['_pu'] = alvo['_k'].map(lambda k: (k.split()[0], k.split()[-1]) if k.split() else None)

    por_chave = dict(zip(alvo['_k'], alvo['id_aluna']))
    por_pu = {}
    for pu, i in zip(alvo['_pu'], alvo['id_aluna']):
        if pu:
            por_pu.setdefault(pu, []).append(i)

    saida = []
    for nome in consultoria['nome_consultoria']:
        k, t = _chave(nome), _tokens(nome)
        if k in por_chave:
            saida.append((por_chave[k], 'nome exato', 1.0))
            continue
        pu = (k.split()[0], k.split()[-1]) if k.split() else None
        if pu and len(por_pu.get(pu, [])) == 1:
            saida.append((por_pu[pu][0], 'primeiro + ultimo nome', 0.9))
            continue
        melhor, escore = None, 0.0
        if t:
            for i, tt in zip(alvo['id_aluna'], alvo['_t']):
                if not tt:
                    continue
                j = len(t & tt) / len(t | tt)
                if j > escore:
                    melhor, escore = i, j
        if escore >= minimo:
            saida.append((melhor, f'tokens em comum ({escore:.2f})', round(escore, 2)))
        else:
            saida.append((None, 'sem correspondencia', round(escore, 2)))

    d = consultoria.copy()
    d['id_aluna'] = [s[0] for s in saida]
    d['metodo_casamento'] = [s[1] for s in saida]
    d['confianca_casamento'] = [s[2] for s in saida]
    return d


# --------------------------------------------------------------------------
# Integracao com a base do estudo
# --------------------------------------------------------------------------
def integrar(base, caminho):
    """Le, classifica, casa e acopla o acompanhamento a base. Devolve
    (base_enriquecida, registros_da_consultoria, log_de_casamento)."""
    d = carregar(caminho)
    eng = d['situacao'].map(classificar_engajamento)
    d['engajamento'] = [e[0] for e in eng]
    d['resultado_relatado'] = [e[1] for e in eng]
    d = casar(d, base)

    log = d[['nome_consultoria', 'aba', 'metodo_casamento', 'confianca_casamento',
             'id_aluna']].copy()

    # Uma aluna pode aparecer em mais de uma aba (consultor que assumiu a conta,
    # relatorio consolidado). Fica o registro mais informativo.
    d = d.dropna(subset=['id_aluna']).copy()
    d['_info'] = (d[['situacao', 'fat_mes_consultor']].notna().sum(axis=1)
                  + d['consultorias_feitas'] / 10)
    d = d.sort_values('_info', ascending=False).drop_duplicates('id_aluna').drop(columns='_info')

    cols = ['id_aluna', 'consultor', 'programa', 'nome_consultoria', 'cidade', 'ramo',
            'fat_mes_consultor', 'fat_ano_consultor', 'situacao', 'potenciais',
            'engajamento', 'resultado_relatado', 'consultorias_feitas',
            'consultorias_nao_realizadas', 'metodo_casamento', 'confianca_casamento']
    b = base.merge(d[[c for c in cols if c in d.columns]], on='id_aluna', how='left')

    b['tem_acompanhamento'] = b['nome_consultoria'].notna()
    b['em_risco'] = b['engajamento'].isin(['risco_saida', 'sem_contato'])
    # Delta de faturamento: so onde os dois existem E o consultor mudou o valor.
    b['fat_delta'] = b['fat_mes_consultor'] - b['fat_brl']
    b['fat_razao'] = (b['fat_mes_consultor'] / b['fat_brl']).where(
        (b['fat_brl'] > 0) & (b['fat_mes_consultor'] > 0))
    b['fat_confirmado_igual'] = (b['fat_mes_consultor'] == b['fat_brl']) & b['fat_brl'].notna()
    return b, d, log


def tabela_engajamento(base):
    """Perfil por estado de engajamento."""
    d = base.dropna(subset=['engajamento'])
    if not len(d):
        return pd.DataFrame()
    g = d.groupby('engajamento').agg(
        alunas=('id_aluna', 'size'),
        score_mediano=('score_oportunidade', 'median'),
        fat_formulario=('fat_brl', 'median'),
        fat_consultor=('fat_mes_consultor', 'median'),
        equipe_mediana=('equipe_total', 'median'),
        classe_A=('classe', lambda s: int((s == 'A').sum())),
        consultorias_medianas=('consultorias_feitas', 'median')).reset_index()
    g['rotulo'] = g['engajamento'].map(ROTULO_ENGAJAMENTO)
    g['pct_ou_absoluto'] = [f'{100*a/len(d):.1f}%' if a >= 10 else f'{a} alunas (N<10)'
                            for a in g['alunas']]
    return g.sort_values('alunas', ascending=False)


def risco_por_perfil(base, minimo=10):
    """Taxa de risco (sem contato ou pedindo saida) por recorte. So celulas >= minimo."""
    d = base.dropna(subset=['engajamento'])
    linhas = []
    for var, rot in [('classe', 'Classe de oportunidade'),
                     ('porte_equipe', 'Porte da equipe'),
                     ('faixa_faturamento', 'Faixa de faturamento'),
                     ('produto_ancora', 'Produto-âncora')]:
        if var not in d.columns:
            continue
        g = d.groupby(var, observed=True).agg(n=('id_aluna', 'size'), risco=('em_risco', 'sum'))
        for idx, r in g.iterrows():
            if r['n'] < minimo:
                continue
            linhas.append({'recorte': rot, 'valor': str(idx), 'alunas': int(r['n']),
                           'em_risco': int(r['risco']),
                           'taxa_risco_pct': round(100 * r['risco'] / r['n'], 1)})
    return pd.DataFrame(linhas).sort_values(['recorte', 'taxa_risco_pct'], ascending=[True, False])


def confronto_faturamento(base):
    """Formulario x planilha do consultor. Separa quem foi atualizado de quem
    repetiu o mesmo numero — a diferenca muda o que se pode concluir."""
    d = base.dropna(subset=['fat_brl', 'fat_mes_consultor'])
    d = d[d['fat_mes_consultor'] > 0]
    if not len(d):
        return pd.DataFrame()
    igual = d['fat_confirmado_igual']
    mudou = d[~igual]
    linhas = [
        {'item': 'alunas com os dois valores', 'valor': len(d), 'leitura': ''},
        {'item': 'valor idêntico ao do formulário', 'valor': int(igual.sum()),
         'leitura': 'não dá para distinguir confirmação de cópia'},
        {'item': 'valor diferente (efetivamente atualizado)', 'valor': int((~igual).sum()),
         'leitura': 'única parte que informa evolução'},
        {'item': 'subiu', 'valor': int((mudou['fat_delta'] > 0).sum()), 'leitura': ''},
        {'item': 'caiu', 'valor': int((mudou['fat_delta'] < 0).sum()), 'leitura': ''},
        {'item': 'mediana no formulário (onde mudou)',
         'valor': round(mudou['fat_brl'].median(), 0), 'leitura': 'R$/mês'},
        {'item': 'mediana no consultor (onde mudou)',
         'valor': round(mudou['fat_mes_consultor'].median(), 0), 'leitura': 'R$/mês'},
        {'item': 'dobraram ou mais', 'valor': int((mudou['fat_razao'] >= 2).sum()), 'leitura': ''},
        {'item': 'caíram à metade ou menos',
         'valor': int((mudou['fat_razao'] <= 0.5).sum()), 'leitura': ''},
    ]
    return pd.DataFrame(linhas)


def carteiras_por_aba(caminho, abas=None, ignorar=('Relatório Felipe',)):
    """Quem cada consultor diz atender, aba por aba.

    O campo `consultor` da matricula registra quem foi atribuido um dia; a aba
    registra quem ele acompanha hoje. Onde os dois discordam, a aba ganha.
    `ignorar` tira abas que sao relatorio, nao carteira — elas repetem nomes
    de outras abas e inflariam a conta.
    """
    d = carregar(caminho)
    fora = {str(x).strip().lower() for x in ignorar}
    d = d[~d['aba'].str.strip().str.lower().isin(fora)]
    if abas is not None:
        alvo = {str(x).strip().lower() for x in abas}
        d = d[d['aba'].str.strip().str.lower().isin(alvo)]
    return {ab.strip(): g['nome_consultoria'].dropna().tolist()
            for ab, g in d.groupby('aba')}


def destinos_declarados(caminho, aba):
    """Para quem cada aluna de uma aba foi, quando a aba registra o destino.

    A aba do Daniel tem uma coluna de consultor por linha: e o registro de
    quem ficou com quem, que nao existe em lugar nenhum da matricula.
    """
    x = pd.ExcelFile(caminho)
    if aba not in x.sheet_names:
        return {}
    d = x.parse(aba, header=None)
    lin = _localizar_cabecalho(d)
    if lin is None:
        return {}
    cab = [_cab(v) for v in d.iloc[lin]]
    try:
        c_nome = cab.index('aluna')
        c_dest = cab.index('consultor')
    except ValueError:
        return {}
    corpo = d.iloc[lin + 1:]
    saida = {}
    for _, r in corpo.iterrows():
        nome, dest = r.iloc[c_nome], r.iloc[c_dest]
        if pd.isna(nome) or pd.isna(dest):
            continue
        nome, dest = str(nome).strip(), str(dest).strip()
        if len(nome) < 3 or len(dest) < 3 or _cab(dest) == 'consultor':
            continue
        saida[nome] = dest
    return saida


def entradas_por_aba(caminho, ignorar=('Relatório Felipe',)):
    """Data de entrada declarada por aluna, aba por aba.

    Serve de desempate no casamento de nomes: a grafia varia entre as duas
    planilhas, a data de entrada nao.
    """
    d = carregar(caminho)
    fora = {str(x).strip().lower() for x in ignorar}
    d = d[~d['aba'].str.strip().str.lower().isin(fora)]
    saida = {}
    for ab, g in d.groupby('aba'):
        m = {r['nome_consultoria']: r['entrada'] for _, r in g.iterrows()
             if pd.notna(r.get('nome_consultoria')) and pd.notna(r.get('entrada'))}
        if m:
            saida[ab.strip()] = m
    return saida
