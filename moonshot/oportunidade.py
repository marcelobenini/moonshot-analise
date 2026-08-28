"""Cruzamento induzida x espontanea e oportunidades por linha de negocio do grupo NB.

Duas coisas distintas moram aqui, e o relatorio nunca deve confundi-las:

1. A MATRIZ DE URGENCIA e dado. Sai do cruzamento entre a dor que a aluna
   levanta sozinha (pergunta espontanea) e a que ela elabora quando o tema e
   sugerido (pergunta induzida do pilar Flow).

2. O MAPA DE LINHAS DE NEGOCIO e interpretacao. O formulario NUNCA perguntou
   sobre curso, clinica, franquia ou produto. O que existe sao sinais indiretos,
   listados em cada regra abaixo. Nenhum numero daqui e demanda declarada.
"""
import re

import pandas as pd

from .taxonomia import ROTULOS_DOR
from .texto import norm

# --------------------------------------------------------------------------
# 1. Matriz de urgencia — dado
# --------------------------------------------------------------------------
QUADRANTES = {
    'confirmada': ('Dor confirmada',
                   'Ela levanta sozinha E elabora quando provocada. Convicção alta, ciclo curto.'),
    'crua': ('Dor crua',
             'Levanta sozinha mas não elabora quando o tema é sugerido. Urgente e mal formulada: '
             'precisa de diagnóstico antes da oferta.'),
    'latente': ('Interesse latente',
                'Só aparece quando a pergunta sugere o tema. Não vira busca espontânea: '
                'é onde conteúdo e campanha criam a demanda.'),
    'ausente': ('Fora do radar', 'Não aparece em nenhum dos dois enquadramentos.'),
}


def _quadrante(esp, ind):
    if esp and ind:
        return 'confirmada'
    if esp:
        return 'crua'
    if ind:
        return 'latente'
    return 'ausente'


def matriz_urgencia(base):
    """Cruza os dois enquadramentos por categoria de dor. Uma linha por categoria."""
    linhas = []
    n = len(base)
    for cat, rot in ROTULOS_DOR.items():
        if cat == 'pre_operacional':
            continue
        q = {k: 0 for k in QUADRANTES}
        for esp, ind in zip(base['dores_espontaneas'], base['dores_induzidas']):
            q[_quadrante(cat in esp, cat in ind)] += 1
        cita = n - q['ausente']
        linhas.append({
            'categoria': cat, 'dor': rot,
            'confirmada': q['confirmada'], 'crua': q['crua'], 'latente': q['latente'],
            'ausente': q['ausente'], 'cita_de_algum_modo': cita,
            # Quanto da menção só existe porque a pergunta sugeriu o tema.
            'pct_latente_entre_quem_cita': round(100 * q['latente'] / cita, 1) if cita else None,
        })
    return pd.DataFrame(linhas).sort_values('cita_de_algum_modo', ascending=False)


# --------------------------------------------------------------------------
# 2. Sinais por linha de negocio — interpretacao, com a regra a vista
# --------------------------------------------------------------------------
RX_APRENDER = (r'aprender|nao sei (fazer|como|por onde)|falta de conhecimento|preciso aprender|'
               r'me capacitar|capacitac|treinament|formacao|\bcursos?\b|mentoria|estudar|'
               r'nao tenho conhecimento|nao domino')
RX_EXPANSAO = (r'expandir|expansao|escalar|franqu|abrir (uma |outra |nova |mais )?(unidade|loja|'
               r'filial|espaco|clinica|studio|salao)|segunda (unidade|loja)|outra unidade|'
               r'crescer para|novas unidades|replicar')
RX_PRODUTO = (r'\bprodutos?\b|revend|marca propria|linha propria|\bestoque\b|fornecedor|'
              r'cosmetic|vender produto|venda de produto')
RX_NABEAUTY = r'nabeauty|na beauty'

# Dor que se resolve aprendendo (curso) x dor que se resolve automatizando (sistema).
DOR_CONHECIMENTO = ['mentalidade', 'precificacao_margem', 'conversao_venda',
                    'reter_liderar', 'contratar', 'conteudo_instagram']
DOR_EXECUCAO = ['controle_financeiro', 'atendimento_agenda', 'trafego_pago',
                'captacao_clientes', 'processos_padronizacao', 'fidelizacao_recompra',
                'sobrecarga_delegacao']


def _blob(base, campos):
    return base[[c for c in campos if c in base.columns]].fillna('').agg(' '.join, axis=1).map(norm)


def marcar_sinais(base):
    """Adiciona os sinais indiretos que sustentam o mapa de linhas de negocio."""
    b = base.copy()
    texto = _blob(b, ['texto_dor_induzida', 'texto_dor_espontanea'])
    perfil = _blob(b, ['produtos', 'setor', 'empresa', 'proc_vendas', 'canais'])
    tudo = texto + ' ' + perfil

    b['sinal_quer_aprender'] = texto.str.contains(RX_APRENDER, regex=True)
    b['sinal_expansao'] = tudo.str.contains(RX_EXPANSAO, regex=True) | b['multi_unidade']
    b['sinal_produto'] = tudo.str.contains(RX_PRODUTO, regex=True)
    b['ja_vende_produto'] = perfil.str.contains(
        r'\bprodutos?\b|cosmetic|revend|linha de|shampoo|creme|\bkit\b', regex=True)
    b['ja_da_curso'] = perfil.str.contains(
        r'\bcursos?\b|formacao|capacitac|mentoria|treinament|\baulas?\b', regex=True)
    b['e_nabeauty'] = tudo.str.contains(RX_NABEAUTY, regex=True)

    dores = b['dores_declaradas_todas'].fillna('')
    b['dor_de_conhecimento'] = dores.apply(
        lambda d: sum(1 for c in str(d).split('; ') if c in DOR_CONHECIMENTO))
    b['dor_de_execucao'] = dores.apply(
        lambda d: sum(1 for c in str(d).split('; ') if c in DOR_EXECUCAO))
    return b


# nome -> (rotulo, funcao de qualificacao, regra em texto)
def _q_sistema(b):
    return b['classe'].isin(['A', 'B']) & (b['dor_de_execucao'] >= 1)


def _q_curso(b):
    return (b['dor_de_conhecimento'] >= 2) | (
        b['sinal_quer_aprender'] & (b['dor_de_conhecimento'] >= 1))


def _q_clinica(b):
    porte = (b['fat_brl'] >= 40000) | (b['equipe_total'] >= 6)
    return porte & b['sinal_expansao'] & ~b['e_nabeauty']


def _q_produtos(b):
    return ((b['equipe_total'] >= 3) | b['ja_vende_produto']) & b['sinal_produto']


LINHAS = {
    'sistema': ('Sistema (software)', _q_sistema,
                'classe A ou B e ao menos uma dor de execução (financeiro, agenda, tráfego, '
                'captação, processos, fidelização, delegação)'),
    'curso': ('Cursos presenciais', _q_curso,
              'duas ou mais dores de conhecimento (mentalidade, precificação, conversão, '
              'liderança, contratação, conteúdo), ou uma delas somada a sinal explícito de '
              'querer aprender'),
    'clinica': ('Clínica / franquia', _q_clinica,
                'faturamento ≥ R$ 40 mil ou equipe ≥ 6, com sinal de expansão no texto, '
                'excluindo quem já é Nabeauty'),
    'produtos': ('Produtos', _q_produtos,
                 'equipe ≥ 3 ou já vende produto, somado a menção a produto, estoque, '
                 'revenda ou marca própria'),
}


def pools_por_linha(base):
    """Tamanho e perfil do bolsao de cada linha de negocio."""
    b = base
    n = len(b)
    linhas = []
    for chave, (rot, qualifica, regra) in LINHAS.items():
        m = qualifica(b).fillna(False)
        d = b[m]
        linhas.append({
            'linha': rot, 'chave': chave,
            'alunas': int(m.sum()),
            'pct_ou_absoluto': f'{100*m.sum()/n:.1f}%' if m.sum() >= 10 else f'{int(m.sum())} alunas (N<10)',
            'fat_mediano': round(d['fat_brl'].median(), 0) if len(d) else None,
            'equipe_mediana': round(d['equipe_total'].median(), 1) if len(d) else None,
            'classe_A': int((d['classe'] == 'A').sum()),
            'em_SP': int((d['uf'] == 'SP').sum()) if 'uf' in d.columns else None,
            'regra_de_qualificacao': regra,
        })
    df = pd.DataFrame(linhas).sort_values('alunas', ascending=False)
    df.insert(0, 'posicao', range(1, len(df) + 1))
    return df


def sobreposicao_linhas(base):
    """Quantas alunas qualificam para 1, 2, 3 ou 4 linhas — mede venda cruzada."""
    b = base
    marcas = pd.DataFrame({k: LINHAS[k][1](b).fillna(False) for k in LINHAS})
    quantas = marcas.sum(axis=1)
    linhas = [{'linhas_que_qualifica': int(k), 'alunas': int(v),
               'leitura': {0: 'nenhuma oferta atual encaixa',
                           1: 'oferta única',
                           2: 'venda cruzada de duas frentes',
                           3: 'conta multiproduto',
                           4: 'conta multiproduto completa'}.get(int(k), '')}
              for k, v in quantas.value_counts().sort_index().items()]
    pares = []
    chaves = list(LINHAS)
    for i, a in enumerate(chaves):
        for bkey in chaves[i + 1:]:
            n = int((marcas[a] & marcas[bkey]).sum())
            pares.append({'par': f'{LINHAS[a][0]} + {LINHAS[bkey][0]}', 'alunas': n})
    return pd.DataFrame(linhas), pd.DataFrame(pares).sort_values('alunas', ascending=False)


def geografia(base, minimo=10):
    """Densidade por UF. Curso presencial e clinica dependem de massa local."""
    if 'uf' not in base.columns:
        return pd.DataFrame()
    b = base[base['uf'].notna()]
    marcas = {k: LINHAS[k][1](base).fillna(False) for k in LINHAS}
    g = b.groupby('uf').agg(alunas=('id_aluna', 'size'),
                            fat_mediano=('fat_brl', 'median'),
                            classe_A=('classe', lambda s: int((s == 'A').sum())))
    for k, rot in [('curso', 'pool_curso'), ('clinica', 'pool_clinica'), ('produtos', 'pool_produtos')]:
        g[rot] = base[marcas[k]].groupby('uf').size().reindex(g.index).fillna(0).astype(int)
    g['viavel_presencial'] = [
        'sim' if a >= minimo else f'não ({a} alunas, mínimo {minimo})' for a in g['alunas']]
    return g.reset_index().sort_values('alunas', ascending=False)


def nabeauty(base):
    """Quem ja esta no ecossistema Nabeauty — motion de upsell, nao de aquisicao."""
    d = base[base['e_nabeauty']] if 'e_nabeauty' in base.columns else base.iloc[:0]
    cols = [c for c in ['id_aluna', 'nome', 'empresa', 'setor', 'uf', 'fat_brl', 'equipe_total',
                        'classe', 'score_oportunidade', 'produto_ancora', 'dor_inferida_1']
            if c in d.columns]
    return d[cols].sort_values('fat_brl', ascending=False)
