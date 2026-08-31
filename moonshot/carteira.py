"""Capacidade das carteiras: quem termina, quando abre vaga, quanto cabe.

Le a planilha de matriculas (que tem consultor estrategico e data de termino
declarada) e projeta a carteira de cada consultor mes a mes. Serve para decidir
transferencias, absorver turma nova e dimensionar equipe.
"""
import pandas as pd

from .matriculas import STATUS_FORA, classificar_abas


def base_carteiras(matriculas, excluir=(), so_turmas=True):
    """Carteira viva por consultor: fora canceladas, encerradas e abas de controle."""
    d = matriculas
    if so_turmas:
        c = classificar_abas(d)
        d = d[d['turma'].isin(set(c.loc[c['tipo'] == 'turma', 'aba']))]
    d = d[~d['status_norm'].isin(STATUS_FORA)].copy()
    d['consultor_norm'] = d['consultor'].fillna('(sem consultor)')
    fora = {str(x).strip().lower() for x in excluir}
    d['excluido'] = d['consultor_norm'].str.strip().str.lower().isin(fora)
    return d


def orfas(carteiras, inicio, meses=12):
    """Carteiras dos consultores fora do quadro.

    Tirar um consultor do planejamento NAO faz as alunas dele sumirem: elas
    continuam existindo e viram carga de outra pessoa. Esta tabela existe para
    que esse peso apareca em vez de evaporar da conta.
    """
    d = carteiras[carteiras['excluido']].copy()
    if not len(d):
        return pd.DataFrame(), pd.DataFrame()
    d['mes'] = d['termino_efetivo'].dt.to_period('M')
    ini = pd.Period(inicio, freq='M')
    janela = pd.period_range(ini, periods=meses, freq='M')
    resumo = (d.groupby('consultor_norm').size().rename('alunas_orfas')
              .reset_index().rename(columns={'consultor_norm': 'consultor_saindo'})
              .sort_values('alunas_orfas', ascending=False))
    porm = (d[d['mes'].isin(janela)].groupby('mes').size()
            .reindex(janela, fill_value=0).rename('orfas_terminando')
            .rename_axis('mes').reset_index())
    porm['mes'] = porm['mes'].astype(str)
    return resumo, porm


def evolucao(carteiras, inicio, meses=12, capacidade=None):
    """Carteira de cada consultor mes a mes e vagas abertas.

    `capacidade` e o tamanho de carteira que se considera cheio. Sem valor,
    usa a mediana das carteiras atuais — que descreve como a operacao roda
    hoje, nao o que ela suporta.
    """
    d = carteiras[~carteiras['excluido']].copy()
    if not len(d):
        return pd.DataFrame(), pd.DataFrame(), None
    d['mes'] = d['termino_efetivo'].dt.to_period('M')
    ini = pd.Period(inicio, freq='M')
    janela = pd.period_range(ini, periods=meses, freq='M')

    atual = d.groupby('consultor_norm').size().rename('carteira_hoje')
    if capacidade is None:
        capacidade = int(atual[atual.index != '(sem consultor)'].median())

    # Terminos por consultor e mes, so dentro da janela.
    term = (d[d['mes'].isin(janela)].groupby(['consultor_norm', 'mes']).size()
            .unstack(fill_value=0).reindex(columns=janela, fill_value=0)
            .reindex(atual.index, fill_value=0))

    linhas = []
    for cons in atual.index:
        restante = int(atual[cons])
        for m in janela:
            saem = int(term.loc[cons, m])
            restante -= saem
            linhas.append({'consultor': cons, 'mes': str(m), 'terminam_no_mes': saem,
                           'carteira_apos': restante,
                           'vagas': max(0, capacidade - restante)})
    detalhe = pd.DataFrame(linhas)

    resumo = atual.reset_index().rename(columns={'consultor_norm': 'consultor'})
    resumo['termina_na_janela'] = resumo['consultor'].map(term.sum(axis=1)).fillna(0).astype(int)
    resumo['carteira_ao_fim'] = resumo['carteira_hoje'] - resumo['termina_na_janela']
    resumo['vagas_ao_fim'] = (capacidade - resumo['carteira_ao_fim']).clip(lower=0)
    resumo = resumo.sort_values('carteira_hoje', ascending=False)
    return resumo, detalhe, capacidade


def vagas_por_mes(detalhe, capacidade, ignorar=('(sem consultor)',)):
    """Vagas abertas no time inteiro, mes a mes."""
    d = detalhe[~detalhe['consultor'].isin(ignorar)]
    if not len(d):
        return pd.DataFrame()
    g = d.groupby('mes').agg(
        consultores=('consultor', 'nunique'),
        terminam_no_mes=('terminam_no_mes', 'sum'),
        carteira_do_time=('carteira_apos', 'sum'),
        vagas_abertas=('vagas', 'sum')).reset_index()
    g['capacidade_do_time'] = g['consultores'] * capacidade
    return g


def simular(carteiras, detalhe, capacidade, transferencias=None, entradas=None,
            ignorar=('(sem consultor)',)):
    """Aplica transferencias e entradas novas sobre a evolucao das carteiras.

    transferencias: {'consultor destino': n} — carteiras absorvidas de fora.
    entradas: {'AAAA-MM': n} — alunas novas a distribuir naquele mes.
    Devolve o balanco mes a mes: quanto entra, quanto cabe, quanto sobra.
    """
    transferencias = transferencias or {}
    entradas = entradas or {}
    d = detalhe[~detalhe['consultor'].isin(ignorar)].copy()
    # A transferencia entra de uma vez e acompanha o consultor pelo resto da janela.
    d['carteira_apos'] = d['carteira_apos'] + d['consultor'].map(transferencias).fillna(0)
    d['vagas'] = (capacidade - d['carteira_apos']).clip(lower=0)

    linhas = []
    acumulado_sem_dono = 0
    for m in sorted(d['mes'].unique()):
        g = d[d['mes'] == m]
        vagas = int(g['vagas'].sum())
        novas = int(entradas.get(m, 0))
        acumulado_sem_dono += novas
        alocadas = min(acumulado_sem_dono, vagas)
        acumulado_sem_dono -= alocadas
        linhas.append({
            'mes': m,
            'carteira_do_time': int(g['carteira_apos'].sum()),
            'capacidade_do_time': int(len(g) * capacidade),
            'vagas_abertas': vagas,
            'alunas_novas_no_mes': novas,
            'alocadas': alocadas,
            'sem_consultor_acumulado': acumulado_sem_dono,
        })
    return pd.DataFrame(linhas)
