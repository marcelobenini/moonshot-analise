"""Analises das Etapas 1 a 5: dores, equipe, faturamento, diagnostico e score."""
import numpy as np
import pandas as pd

from .taxonomia import DEFINICOES, FRENTES_PRODUTO, classificar

# --------------------------------------------------------------------------
# Etapa 1A - dor declarada
# --------------------------------------------------------------------------
def classificar_base(base, max_cats=3):
    """Classifica os textos de dor e devolve (base_enriquecida, tabela_evidencias).

    A tabela de evidencias e longa: uma linha por (aluna, enquadramento, categoria),
    sempre com o trecho literal que justificou a categoria.
    """
    base = base.copy()
    linhas = []
    for enq in ('induzida', 'espontanea'):
        col = f'texto_dor_{enq}'
        for _, r in base.iterrows():
            for cat, n, ev in classificar(r[col], max_cats=max_cats):
                linhas.append({'id_aluna': r['id_aluna'], 'origem': r['origem'],
                               'enquadramento': enq, 'categoria': cat,
                               'n_ocorrencias': n, 'evidencia_literal': ev})
    evid = pd.DataFrame(linhas)

    # Consolidado por aluna: soma o sinal dos dois enquadramentos.
    if len(evid):
        forca = (evid.groupby(['id_aluna', 'categoria'])['n_ocorrencias'].sum()
                 .reset_index().sort_values(['id_aluna', 'n_ocorrencias'], ascending=[True, False]))
        prim = evid.sort_values('n_ocorrencias', ascending=False) \
                   .drop_duplicates(['id_aluna', 'categoria']).set_index(['id_aluna', 'categoria'])
        top = forca.groupby('id_aluna').head(max_cats)
        for i in range(max_cats):
            nesimo = top.groupby('id_aluna').nth(i).set_index('id_aluna')
            base[f'dor_declarada_{i+1}'] = base['id_aluna'].map(nesimo['categoria'])
            base[f'evidencia_{i+1}'] = [
                prim.loc[(a, c), 'evidencia_literal'] if pd.notna(c) and (a, c) in prim.index else None
                for a, c in zip(base['id_aluna'], base['id_aluna'].map(nesimo['categoria']))]
        base['dores_declaradas_todas'] = base['id_aluna'].map(
            forca.groupby('id_aluna')['categoria'].apply(lambda s: '; '.join(s)))

    # Listas separadas por enquadramento: a matriz de urgencia cruza as duas, e
    # o BI alterna entre os paineis sem reclassificar.
    for enq in ('induzida', 'espontanea'):
        por_aluna = (evid[evid.enquadramento == enq].groupby('id_aluna')['categoria']
                     .apply(list) if len(evid) else pd.Series(dtype=object))
        base[f'dores_{enq}s'] = [por_aluna.get(a, []) for a in base['id_aluna']]
    base.rename(columns={'dores_induzidas': 'dores_induzidas',
                         'dores_espontaneas': 'dores_espontaneas'}, inplace=True)
    return base, evid


def ranking_dores(base, evid):
    """Ranking por numero de ALUNAS que citaram (nao por numero de mencoes)."""
    paineis = []
    for rotulo, sel in [('A. consolidado (todas as fontes)', evid),
                        ('B. so perguntas espontaneas', evid[evid.enquadramento == 'espontanea']),
                        ('C. so perguntas induzidas (tema ja sugerido)', evid[evid.enquadramento == 'induzida']),
                        ('D. so base Club (pergunta de dor direta)', evid[evid.origem == 'CLUB'])]:
        n_base = sel['id_aluna'].nunique()
        if n_base == 0:
            continue
        g = (sel.groupby('categoria')['id_aluna'].nunique()
             .sort_values(ascending=False).reset_index(name='n_alunas'))
        g.insert(0, 'painel', rotulo)
        g.insert(0, 'posicao', range(1, len(g) + 1))
        g['base_do_painel'] = n_base
        # Celula pequena: percentual so acima de 10 alunas.
        g['pct_ou_absoluto'] = [
            f'{100*x/n_base:.1f}%' if x >= 10 else f'{x} alunas (N<10, absoluto)'
            for x in g['n_alunas']]
        g['definicao'] = g['categoria'].map(DEFINICOES)
        paineis.append(g)
    return pd.concat(paineis, ignore_index=True)


# --------------------------------------------------------------------------
# Etapa 1B - dor inferida
# --------------------------------------------------------------------------
def equipe_total(r):
    """Pessoas trabalhando no negocio, incluindo a dona."""
    n = r['equipe_n']
    if pd.isna(n):
        return np.nan
    return max(n, 1) if r['equipe_inclui_dona'] else n + 1


def inferir_dores(base):
    """Aplica regras de gargalo sobre os dados, independente do que a aluna disse.

    Devolve (base_enriquecida, tabela_de_cortes). Todos os cortes saem da propria
    distribuicao da base, nao de numeros redondos escolhidos a mao.
    """
    base = base.copy()
    base['equipe_total'] = base.apply(equipe_total, axis=1)
    base['fat_por_pessoa'] = base['fat_brl'] / base['equipe_total']

    solo = base.loc[base['equipe_n'] == 0, 'fat_brl'].dropna()
    cortes = {
        'fat_p25': base['fat_brl'].quantile(.25),
        'fat_p75': base['fat_brl'].quantile(.75),
        'fat_solo_p75': solo.quantile(.75) if len(solo) else np.nan,
        'fpp_p25': base['fat_por_pessoa'].quantile(.25),
        'anos_maduro': 5,
    }

    def regras(r):
        out = []
        d = str(r.get('dores_declaradas_todas') or '')
        eqt, fat = r['equipe_total'], r['fat_brl']
        if r['fat_confianca'] == 'pre_operacional':
            out.append(('pre_operacional', 'nao ha operacao para diagnosticar',
                        'faturamento (declara nao ter faturamento ainda)'))
            return out
        if r['equipe_n'] == 0 and pd.notna(fat) and fat >= cortes['fat_solo_p75']:
            out.append(('sobrecarga_delegacao',
                        f'sozinha faturando R$ {fat:,.0f}/mes (>= p75 das solo): ela e o teto do negocio',
                        'equipe_n + fat_brl'))
        if pd.notna(eqt) and eqt >= 4 and pd.notna(r['fat_por_pessoa']) \
                and r['fat_por_pessoa'] < cortes['fpp_p25']:
            out.append(('processos_padronizacao',
                        f'{eqt:.0f} pessoas gerando R$ {r["fat_por_pessoa"]:,.0f} por cabeca '
                        f'(< p25): produtividade ou mix de servico, nao captacao',
                        'equipe_total + fat_brl'))
        if pd.notna(fat) and fat >= cortes['fat_p75'] and pd.notna(eqt) and eqt >= 3 \
                and 'captacao_clientes' in d:
            out.append(('precificacao_margem',
                        'declara falta de cliente com faturamento e equipe no quartil superior: '
                        'o gargalo tende a ser margem/precificacao, nao captacao',
                        'fat_brl + equipe_total + dor declarada'))
        if pd.notna(r['anos_operacao']) and r['anos_operacao'] >= cortes['anos_maduro'] \
                and pd.notna(fat) and fat < cortes['fat_p25']:
            out.append(('processos_padronizacao',
                        f'{r["anos_operacao"]:.0f} anos de operacao abaixo do primeiro quartil '
                        f'de faturamento: o modelo nao escala',
                        'anos_operacao + fat_brl'))
        if pd.notna(fat) and fat >= 30000 and r['processos_mapeados'] == 'nao':
            out.append(('controle_financeiro',
                        f'R$ {fat:,.0f}/mes sem processos mapeados: opera no escuro em escala relevante',
                        'fat_brl + processos_mapeados'))
        if pd.notna(r['equipe_n']) and r['equipe_n'] >= 1 and 'sobrecarga_delegacao' in d:
            out.append(('sobrecarga_delegacao',
                        f'tem {r["equipe_n"]:.0f} pessoa(s) e ainda relata fazer tudo: '
                        f'o problema e delegacao, nao falta de gente',
                        'equipe_n + dor declarada'))
        if r['equipe_n'] == 0 and pd.notna(fat) and fat < cortes['fat_p25'] \
                and pd.notna(r['anos_operacao']) and r['anos_operacao'] >= 3:
            out.append(('captacao_clientes',
                        f'sozinha, {r["anos_operacao"]:.0f}+ anos e faturamento no quartil inferior: '
                        f'falta demanda, nao capacidade',
                        'equipe_n + fat_brl + anos_operacao'))
        return out

    aplicadas = base.apply(regras, axis=1)
    base['dor_inferida_1'] = [x[0][0] if x else None for x in aplicadas]
    base['justificativa_inferencia'] = [x[0][1] if x else None for x in aplicadas]
    base['campos_que_sustentam'] = [x[0][2] if x else None for x in aplicadas]
    base['dores_inferidas_todas'] = ['; '.join(dict.fromkeys(c for c, _, _ in x)) or None
                                     for x in aplicadas]
    base['n_regras_disparadas'] = [len(x) for x in aplicadas]
    return base, pd.Series(cortes).rename('valor').to_frame().reset_index(names='corte')


# --------------------------------------------------------------------------
# Etapa 1C - divergencia
# --------------------------------------------------------------------------
def divergencia(base):
    d = base[base['dor_inferida_1'].notna() & base['dor_declarada_1'].notna()].copy()
    d['concorda'] = [i in str(t).split('; ')
                     for i, t in zip(d['dor_inferida_1'], d['dores_declaradas_todas'])]
    tab = (d.groupby(['dor_inferida_1', 'dor_declarada_1'])
           .agg(n_alunas=('id_aluna', 'nunique'),
                aluna_declara_tambem_a_inferida=('concorda', 'sum'))
           .reset_index().sort_values('n_alunas', ascending=False))
    tab['leitura'] = np.where(
        tab['aluna_declara_tambem_a_inferida'] == 0,
        'DIVERGENCIA TOTAL: os dados apontam um gargalo que nenhuma dessas alunas nomeia',
        'convergencia parcial')
    tab['n_ou_absoluto'] = [f'{n} alunas' for n in tab['n_alunas']]
    resumo = pd.DataFrame([{
        'metrica': 'alunas com leitura declarada e inferida',
        'valor': len(d)}, {
        'metrica': 'a inferida esta entre as declaradas (convergencia)',
        'valor': int(d['concorda'].sum())}, {
        'metrica': 'a inferida NAO aparece nas declaradas (divergencia)',
        'valor': int((~d['concorda']).sum())}])
    return tab, resumo


# --------------------------------------------------------------------------
# Etapa 2 - equipe / Etapa 3 - faturamento
# --------------------------------------------------------------------------
PORTES = [(-0.5, 0.5, 'sozinha (0 funcionarios)'), (0.5, 2.5, '1-2'),
          (2.5, 5.5, '3-5'), (5.5, 15.5, '6-15'), (15.5, 1e9, '16+')]


def faixa_porte(n):
    if pd.isna(n):
        return 'nao classificavel'
    for a, b, rot in PORTES:
        if a < n <= b:
            return rot
    return 'nao classificavel'


def faixas_faturamento(base, cortes):
    rot = []
    for v, conf in zip(base['fat_brl'], base['fat_confianca']):
        if conf == 'pre_operacional':
            rot.append('pre-operacional (ainda nao fatura)')
        elif conf == 'sem_faturamento':
            rot.append('declara faturamento zero')
        elif pd.isna(v):
            rot.append('nao classificavel')
        else:
            nome = 'acima do ultimo corte'
            for lim, r in cortes:
                if v < lim:
                    nome = r
                    break
            rot.append(nome)
    return rot


def tabela_equipe(base):
    d = base.copy()
    d['porte'] = d['equipe_n'].map(faixa_porte)
    dist = d['porte'].value_counts().reindex(
        [p[2] for p in PORTES] + ['nao classificavel']).fillna(0).astype(int)
    tab = dist.rename_axis('porte').rename('n_alunas').reset_index()
    tab['pct_ou_absoluto'] = [f'{100*x/len(d):.1f}%' if x >= 10 else f'{x} alunas (N<10, absoluto)'
                              for x in tab['n_alunas']]
    cruz = pd.crosstab(d['porte'], d['faixa_faturamento'])
    return tab, cruz.reset_index()


def tabela_faturamento(base, cortes):
    d = base.copy()
    dist = d['faixa_faturamento'].value_counts()
    tab = dist.rename_axis('faixa').rename('n_alunas').reset_index()
    tab['pct_ou_absoluto'] = [f'{100*x/len(d):.1f}%' if x >= 10 else f'{x} alunas (N<10, absoluto)'
                              for x in tab['n_alunas']]
    validos = d['fat_brl'].dropna()
    stats = (validos.describe(percentiles=[.1, .25, .5, .75, .9, .95, .99])
             .rename('faturamento_mensal_brl').rename_axis('estatistica').reset_index())
    prod = (d.dropna(subset=['fat_por_pessoa'])
            .groupby(d['equipe_n'].map(faixa_porte))['fat_por_pessoa']
            .agg(n='size', mediana='median', media='mean')
            .rename_axis('porte').reset_index())
    prod['reportar'] = ['mediana' if n >= 10 else f'N={n}, valor individual' for n in prod['n']]
    return tab, stats, prod
