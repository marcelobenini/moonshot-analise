"""Localizacao: municipio brasileiro a partir de texto livre.

A UF ja vem resolvida em base.py (CEP > cidade nomeada > sigla). Aqui usamos
essa UF para restringir a busca do municipio: 242 nomes de cidade se repetem
entre estados, e sem a restricao "Bom Jesus" casaria com qualquer um dos onze.
"""
import json
import os
import re

from .texto import norm, tem_conteudo

_CAMINHO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'municipios.json')

# Nomes curtos ou que sao palavra comum em endereco geram falso positivo
# ("Bonito", "Sul", "Centro", "Boa Vista" dentro de "Rua Boa Vista").
_RUIDO = {'bonito', 'centro', 'sul', 'norte', 'boa vista', 'santa cruz', 'bom jesus',
          'cristal', 'brasil', 'campo', 'serra', 'palmas', 'jardim', 'vitoria',
          'colina', 'esperanca', 'uniao', 'progresso', 'porto', 'lagoa', 'ipe'}


def carregar_municipios(caminho=_CAMINHO):
    with open(caminho, encoding='utf-8') as fh:
        return json.load(fh)


_MUN = None


def _mun():
    global _MUN
    if _MUN is None:
        _MUN = carregar_municipios()
    return _MUN


def _busca(texto, lista):
    """Maior nome de municipio presente no texto. Maior primeiro para que
    'Sao Jose dos Campos' vença 'Sao Jose'."""
    achado = None
    for m in sorted(lista, key=lambda x: -len(x['k'])):
        k = m['k']
        if len(k) < 4 or k in _RUIDO:
            continue
        if re.search(r'\b' + re.escape(k) + r'\b', texto):
            achado = m['n']
            break
    return achado


def municipio(cidade_consultor, localizacao, endereco, uf):
    """Devolve (municipio, fonte). A cidade escrita pelo consultor tem prioridade:
    e campo dedicado, nao texto livre de endereco."""
    mun = _mun()
    fontes = [('planilha do consultor', cidade_consultor),
              ('localizacao declarada', localizacao),
              ('endereco', endereco)]
    candidatos = mun.get(uf, []) if uf else [x for v in mun.values() for x in v]

    for rotulo, valor in fontes:
        if not tem_conteudo(valor):
            continue
        t = norm(valor)
        achado = _busca(t, candidatos)
        if achado:
            return achado, rotulo
    # Sem UF conhecida nao tentamos a busca global: o risco de homonimo e alto
    # e um municipio errado no mapa e pior do que um "nao identificado".
    return None, None


def enriquecer(base):
    """Adiciona municipio e a fonte de onde ele veio."""
    b = base.copy()
    cidade_cons = b['cidade'] if 'cidade' in b.columns else [None] * len(b)
    achados = [municipio(c, l, e, u) for c, l, e, u in
               zip(cidade_cons, b['localizacao'], b['endereco'], b['uf'])]
    b['municipio'] = [a[0] for a in achados]
    b['municipio_fonte'] = [a[1] for a in achados]
    return b


def tabela_estados(base):
    """Uma linha por UF, com o que o mapa precisa."""
    import pandas as pd
    d = base[base['uf'].notna()]
    if not len(d):
        return pd.DataFrame()
    g = d.groupby('uf').agg(
        alunas=('id_aluna', 'size'),
        fat_mediano=('fat_brl', 'median'),
        classe_A=('classe', lambda s: int((s == 'A').sum())),
        com_acompanhamento=('tem_acompanhamento', 'sum'),
        em_risco=('em_risco', 'sum'),
        com_municipio=('municipio', lambda s: int(s.notna().sum()))).reset_index()
    g['taxa_risco_pct'] = (100 * g['em_risco'] / g['alunas']).round(1)
    return g.sort_values('alunas', ascending=False)


def tabela_municipios(base):
    """Uma linha por municipio."""
    import pandas as pd
    d = base[base['municipio'].notna()]
    if not len(d):
        return pd.DataFrame()
    g = d.groupby(['uf', 'municipio']).agg(
        alunas=('id_aluna', 'size'),
        fat_mediano=('fat_brl', 'median'),
        classe_A=('classe', lambda s: int((s == 'A').sum())),
        em_risco=('em_risco', 'sum')).reset_index()
    return g.sort_values(['uf', 'alunas'], ascending=[True, False])
