"""Cobertura das frentes do sistema e mineracao de lacunas de funcionalidade.

Responde duas perguntas:
  1. Cada frente do produto tem demanda declarada? (cobertura)
  2. O que as alunas pedem que nenhuma frente atende? (lacuna)
"""
import re

import pandas as pd

from .taxonomia import (DEFINICOES, FRENTES_PRODUTO, FRENTES_ROTULO,
                        TEMAS_LATENTES, _COMPILADO)
from .texto import norm


def _texto_dor(base):
    return (base['texto_dor_induzida'].fillna('') + '\n' +
            base['texto_dor_espontanea'].fillna(''))


def marcar_temas_latentes(base):
    """Adiciona uma coluna booleana por tema latente. Temas latentes NAO entram
    no ranking de dores: a taxonomia validada tem 13 categorias e misturar as
    duas coisas quebraria a comparabilidade entre rodadas."""
    base = base.copy()
    txt = _texto_dor(base).map(norm)
    for tema, (_, padrao) in TEMAS_LATENTES.items():
        base[f'tema_{tema}'] = txt.str.contains(padrao, regex=True)
    return base


def cobertura_frentes(base):
    """Demanda declarada por frente do produto.

    Uma aluna 'demanda' uma frente quando cita ao menos uma das categorias de
    dor que a alimentam. Frente sem categoria alimentadora (bot de duvidas) e
    reportada com demanda medida pelo tema latente correspondente.
    """
    n = len(base)
    dores = base['dores_declaradas_todas'].fillna('')
    linhas = []
    for frente, cats in FRENTES_PRODUTO.items():
        if cats:
            tem = dores.apply(lambda d: bool(set(str(d).split('; ')) & set(cats)))
            origem = 'categorias de dor: ' + ', '.join(cats)
        else:
            col = 'tema_duvida_tecnica_nicho'
            tem = base[col] if col in base.columns else pd.Series(False, index=base.index)
            origem = 'sem categoria de dor; medido pelo tema latente duvida_tecnica_nicho'
        alunas = int(tem.sum())
        classe_a = int((tem & (base['classe'] == 'A')).sum())
        linhas.append({
            'frente': FRENTES_ROTULO[frente],
            'chave': frente,
            'alunas_com_demanda': alunas,
            'pct_ou_absoluto': f'{100*alunas/n:.1f}%' if alunas >= 10 else f'{alunas} alunas (N<10)',
            'alunas_classe_A': classe_a,
            'e_produto_ancora_de': int((base['produto_ancora'] == frente).sum()),
            'fat_mediano_do_grupo': round(base.loc[tem, 'fat_brl'].median(), 0)
                                    if alunas else None,
            'de_onde_vem_o_numero': origem,
        })
    df = pd.DataFrame(linhas).sort_values('alunas_com_demanda', ascending=False)
    df.insert(0, 'posicao', range(1, len(df) + 1))
    return df


def lacunas(base):
    """Onde produto e dor nao se encontram, nas duas direcoes."""
    n = len(base)
    cobertas = {c for cats in FRENTES_PRODUTO.values() for c in cats}
    dores = base['dores_declaradas_todas'].fillna('')
    linhas = []

    # (a) dor sem frente que a atenda
    for cat in DEFINICOES:
        if cat in cobertas:
            continue
        alunas = int(dores.str.contains(cat, regex=False).sum())
        linhas.append({'tipo': 'DOR SEM FRENTE',
                       'item': cat, 'descricao': DEFINICOES[cat],
                       'alunas': alunas,
                       'pct_ou_absoluto': f'{100*alunas/n:.1f}%' if alunas >= 10
                                          else f'{alunas} alunas (N<10)',
                       'leitura': 'a aluna nomeia, e nenhuma frente do sistema atende'})

    # (b) frente sem dor que a sustente
    for frente, cats in FRENTES_PRODUTO.items():
        if cats:
            continue
        linhas.append({'tipo': 'FRENTE SEM DOR',
                       'item': FRENTES_ROTULO[frente],
                       'descricao': 'nenhuma das 13 categorias validadas alimenta esta frente',
                       'alunas': int(base.get('tema_duvida_tecnica_nicho',
                                              pd.Series(False, index=base.index)).sum()),
                       'pct_ou_absoluto': '',
                       'leitura': 'demanda so aparece como tema latente, nao como dor declarada'})

    # (c) tema pedido que nao virou frente nem categoria
    for tema, (defi, _) in TEMAS_LATENTES.items():
        col = f'tema_{tema}'
        if col not in base.columns:
            continue
        alunas = int(base[col].sum())
        linhas.append({'tipo': 'TEMA SEM FRENTE (funcionalidade candidata)',
                       'item': tema, 'descricao': defi, 'alunas': alunas,
                       'pct_ou_absoluto': f'{100*alunas/n:.1f}%' if alunas >= 10
                                          else f'{alunas} alunas (N<10)',
                       'leitura': 'aparece no texto das alunas e nao esta na taxonomia nem nas frentes'})

    df = pd.DataFrame(linhas)
    return df.sort_values(['tipo', 'alunas'], ascending=[True, False]).reset_index(drop=True)


def recorte_pais(base, pais='Portugal'):
    """Perfil comparado de um pais contra o resto da base.

    Indicadores binarios saem como "n de N" e nao como percentual: num recorte
    de poucas dezenas de alunas, "11,1%" sao 3 pessoas, e o percentual sugere
    uma solidez que o numero nao tem.
    """
    dentro = base[base['pais'] == pais]
    fora = base[base['pais'] != pais]
    if not len(dentro):
        return pd.DataFrame()
    nd, nf = len(dentro), len(fora)

    def contagem(serie_d, serie_f, rotulo):
        d, f = int(serie_d.sum()), int(serie_f.sum())
        return {'indicador': rotulo,
                pais: f'{d} de {nd}' + (f' ({100*d/nd:.0f}%)' if d >= 10 else ''),
                'resto da base': f'{f} de {nf}' + (f' ({100*f/nf:.0f}%)' if f >= 10 else ''),
                'base_do_contraste': 'contagem absoluta; % so quando n >= 10'}

    def mediana(col, rotulo, fmt='{:,.0f}'):
        md, mf = dentro[col].median(), fora[col].median()
        return {'indicador': rotulo,
                pais: fmt.format(md) if pd.notna(md) else 'sem dado',
                'resto da base': fmt.format(mf) if pd.notna(mf) else 'sem dado',
                'base_do_contraste': f'mediana sobre {dentro[col].notna().sum()} e '
                                     f'{fora[col].notna().sum()} alunas com dado'}

    linhas = [
        {'indicador': 'alunas no recorte', pais: nd, 'resto da base': nf,
         'base_do_contraste': 'total'},
        mediana('fat_brl', 'faturamento mensal mediano (BRL)', 'R$ {:,.0f}'),
        mediana('equipe_total', 'equipe mediana (pessoas)', '{:,.0f}'),
        mediana('score_oportunidade', 'score mediano', '{:,.0f}'),
        contagem(dentro['equipe_n'] == 0, fora['equipe_n'] == 0, 'trabalha sozinha'),
        contagem(dentro['usa_sistema_gestao'], fora['usa_sistema_gestao'],
                 'usa sistema de gestao/agenda'),
        contagem(dentro['faz_trafego'], fora['faz_trafego'], 'faz trafego pago'),
        contagem(dentro['usa_crm'], fora['usa_crm'], 'usa CRM'),
        contagem(dentro['usa_ia_automacao'], fora['usa_ia_automacao'], 'usa IA ou automacao'),
        contagem(dentro['processos_mapeados'] == 'nao', fora['processos_mapeados'] == 'nao',
                 'processos NAO mapeados'),
        contagem(dentro['classe'] == 'A', fora['classe'] == 'A', 'classe A'),
    ]
    return pd.DataFrame(linhas)


def maturidade_por_pais(base, minimo=5):
    """Sinais de maturidade digital por pais. Paises abaixo do minimo ficam
    agrupados para nao gerar percentual sobre 1 ou 2 pessoas."""
    d = base.copy()
    contagem = d['pais'].value_counts()
    d['pais_agrupado'] = d['pais'].where(d['pais'].map(contagem) >= minimo, 'outros (N<%d)' % minimo)
    sinais = ['usa_sistema_gestao', 'usa_crm', 'faz_trafego', 'usa_ia_automacao']
    g = d.groupby('pais_agrupado').agg(
        alunas=('id_aluna', 'size'),
        fat_mediano=('fat_brl', 'median'),
        **{s: (s, 'mean') for s in sinais})
    for s in sinais:
        g[s] = (100 * g[s]).round(1)
    g['reportar'] = ['percentual' if a >= 10 else 'absoluto (N<10)' for a in g['alunas']]
    return g.reset_index().sort_values('alunas', ascending=False)
