"""Capacidade das carteiras: quem termina, quando abre vaga, quanto cabe.

Le a planilha de matriculas (que tem consultor estrategico e data de termino
declarada) e projeta a carteira de cada consultor mes a mes. Serve para decidir
transferencias, absorver turma nova e dimensionar equipe.

Tirar um consultor do planejamento nao faz as alunas dele sumirem. Cada
carteira que sai do quadro tem um destino declarado, foi diluida no time ou
esta no pool esperando dono — nunca evapora da conta.
"""
import pandas as pd

from .matriculas import STATUS_FORA, classificar_abas

POOL = '(a redistribuir)'
DILUIDA = '(diluida no time)'


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


def aplicar_destinos(carteiras, destinos=None, diluidos=(), vigencia=None,
                     sem_dono=('(sem consultor)',)):
    """Reescreve o dono de cada aluna segundo o destino que voce declarou.

    destinos: {'consultor que sai': 'consultor que recebe'}. A aluna passa a
        contar na carteira do destino carregando a data de termino que ja tinha.
    vigencia: {'consultor que sai': 'AAAA-MM'} — o mes em que a carteira
        efetivamente muda de mao. Ate la ela ainda e de quem esta saindo, e
        quem termina antes da virada nunca chega ao destino. Sem vigencia
        declarada, a transferencia ja esta valendo.
    diluidos: consultores cuja carteira ja foi redistribuida entre o time sem
        que se saiba quem ficou com quem. Vira carga do time, nao de uma
        pessoa — atribuir um dono aqui seria inventar dado.
    sem_dono: rotulos que representam ausencia de consultor.

    Quem sai do quadro e nao tem destino declarado nem foi diluido cai no pool:
    alunas reais, com termino conhecido, ainda sem dono.

    Devolve a base com tres colunas novas: `dono` (quem responde por ela na
    projecao), `origem` (propria, transferida, diluida, pool) e `vigencia`
    (a partir de quando ela conta para o dono novo).
    """
    destinos = {str(k).strip().lower(): v for k, v in (destinos or {}).items()}
    vig = {str(k).strip().lower(): pd.Period(v, freq='M')
           for k, v in (vigencia or {}).items()}
    dil = {str(x).strip().lower() for x in diluidos}
    nulos = {str(x).strip().lower() for x in sem_dono}

    d = carteiras.copy()
    chave = d['consultor_norm'].str.strip().str.lower()
    d['dono'] = d['consultor_norm']
    d['origem'] = 'propria'
    d['vigencia'] = pd.Series(pd.NA, index=d.index, dtype=object)

    m_dest = chave.isin(destinos)
    d.loc[m_dest, 'dono'] = chave[m_dest].map(destinos)
    d.loc[m_dest, 'origem'] = 'transferida'
    d.loc[m_dest, 'vigencia'] = chave[m_dest].map(vig)

    m_dil = chave.isin(dil)
    d.loc[m_dil, 'dono'] = DILUIDA
    d.loc[m_dil, 'origem'] = 'diluida'

    m_pool = (d['excluido'] & ~m_dest & ~m_dil) | chave.isin(nulos)
    d.loc[m_pool, 'dono'] = POOL
    d.loc[m_pool, 'origem'] = 'pool'
    d.loc[m_pool, 'vigencia'] = pd.NA
    return d


def _mensal(d, janela):
    """Terminos por mes dentro da janela, alinhado ao indice completo."""
    mes = d['termino_efetivo'].dt.to_period('M')
    return (mes[mes.isin(janela)].value_counts()
            .reindex(janela, fill_value=0).astype(int))


def _restante(d, janela, com_vigencia=False):
    """Quantas alunas ainda estao na carteira ao fim de cada mes da janela.

    Termino anterior ao inicio da janela com status ainda ativo e dado
    contraditorio: ou a planilha esta velha, ou a aluna renovou. Conta como
    ativa, porque o status e o campo que diz se ela e cliente hoje — mas a
    quantidade aparece em `datas_vencidas` para nao passar despercebida.
    """
    ini = janela[0]
    term = d['termino_efetivo'].dt.to_period('M')
    viva_sempre = term.isna() | (term < ini)
    vig = d['vigencia'] if com_vigencia and 'vigencia' in d.columns else None
    saida = {}
    for m in janela:
        dentro = viva_sempre | (term > m)
        if vig is not None:
            chegou = vig.isna() | vig.apply(lambda v: pd.notna(v) and v <= m)
            dentro = dentro & chegou
        saida[m] = int(dentro.sum())
    return saida


def movimentacao(cart, inicio, meses=12):
    """De quem sai, para quem vai, quantas sao e quando cada uma termina.

    Uma linha por carteira que muda de mao. `chegam_ao_destino` desconta quem
    termina antes da transferencia entrar em vigor: essa aluna nunca vira
    carga do consultor novo, o antigo a leva ate o fim.
    """
    d = cart[cart['origem'] != 'propria']
    if not len(d):
        return pd.DataFrame(), pd.DataFrame()
    janela = pd.period_range(pd.Period(inicio, freq='M'), periods=meses, freq='M')
    ini = janela[0]

    linhas, detalhe = [], []
    for (cons, origem, destino), g in d.groupby(['consultor_norm', 'origem', 'dono']):
        v = g['vigencia'].dropna()
        v = v.iloc[0] if len(v) else None
        term = g['termino_efetivo'].dt.to_period('M')
        # Quem termina antes da virada fica com quem esta saindo.
        antes = int(((term >= ini) & (term < v)).sum()) if v is not None else 0
        vencidas = int((term.notna() & (term < ini)).sum())
        m = _mensal(g, janela)
        linhas.append({'consultor_saindo': cons, 'destino': destino,
                       'situacao': origem, 'alunas': len(g),
                       'vigencia': str(v) if v is not None else 'ja vale',
                       'terminam_antes_da_virada': antes,
                       'chegam_ao_destino': len(g) - antes,
                       'datas_vencidas': vencidas,
                       'terminam_na_janela': int(m.sum()),
                       'terminam_fora_da_janela': len(g) - int(m.sum())})
        for p, n in m.items():
            detalhe.append({'consultor_saindo': cons, 'destino': destino,
                            'mes': str(p), 'terminam_no_mes': int(n),
                            'ja_no_destino': bool(v is None or p >= v)})
    resumo = pd.DataFrame(linhas).sort_values('alunas', ascending=False)
    return resumo, pd.DataFrame(detalhe)


def evolucao(cart, inicio, meses=12, capacidade=None):
    """Carteira de cada consultor mes a mes, com as transferencias na data certa.

    A carteira transferida so entra na conta do destino a partir da vigencia
    declarada, e quem termina antes disso nunca chega la. Sem isso o pico
    aparece no mes errado e com o tamanho errado.

    `capacidade` e o tamanho de carteira que se considera cheio. Sem valor,
    usa a mediana das carteiras proprias de hoje — que descreve como a operacao
    roda hoje, nao o que ela suporta.
    """
    d = cart[~cart['dono'].isin({POOL, DILUIDA})].copy()
    if not len(d):
        return pd.DataFrame(), pd.DataFrame(), None
    janela = pd.period_range(pd.Period(inicio, freq='M'), periods=meses, freq='M')

    propria = d[d['origem'] == 'propria'].groupby('dono').size()
    if capacidade is None:
        capacidade = int(propria.median())

    linhas = []
    for cons, g in d.groupby('dono'):
        pr = _restante(g[g['origem'] == 'propria'], janela)
        tr = _restante(g[g['origem'] == 'transferida'], janela, com_vigencia=True)
        anterior = None
        for m in janela:
            total = pr.get(m, 0) + tr.get(m, 0)
            saem = 0 if anterior is None else max(0, anterior - total)
            entram = 0 if anterior is None else max(0, total - anterior)
            anterior = total
            linhas.append({'consultor': cons, 'mes': str(m),
                           'terminam_no_mes': saem, 'recebe_no_mes': entram,
                           'carteira_propria': pr.get(m, 0),
                           'carteira_recebida': tr.get(m, 0),
                           'carteira_apos': total,
                           'vagas': max(0, capacidade - total),
                           'acima_da_capacidade': max(0, total - capacidade)})
    detalhe = pd.DataFrame(linhas)

    ini = str(janela[0])
    prim = detalhe[detalhe['mes'] == ini].set_index('consultor')
    fim = detalhe[detalhe['mes'] == str(janela[-1])].set_index('consultor')
    pico = detalhe.loc[detalhe.groupby('consultor')['carteira_apos'].idxmax()].set_index('consultor')

    resumo = pd.DataFrame({'consultor': sorted(detalhe['consultor'].unique())})
    resumo['carteira_hoje'] = resumo['consultor'].map(prim['carteira_apos']).astype(int)
    resumo['carteira_propria_hoje'] = resumo['consultor'].map(prim['carteira_propria']).astype(int)
    resumo['recebe_por_transferencia'] = resumo['consultor'].map(
        d[d['origem'] == 'transferida'].groupby('dono').size()).fillna(0).astype(int)
    resumo['pico'] = resumo['consultor'].map(pico['carteira_apos']).astype(int)
    resumo['mes_do_pico'] = resumo['consultor'].map(pico['mes'])
    resumo['carteira_ao_fim'] = resumo['consultor'].map(fim['carteira_apos']).astype(int)
    resumo['termina_na_janela'] = resumo['carteira_hoje'] + resumo['recebe_por_transferencia'] \
        - resumo['carteira_ao_fim']
    resumo['vagas_ao_fim'] = (capacidade - resumo['carteira_ao_fim']).clip(lower=0)
    resumo['acima_da_capacidade_no_pico'] = (resumo['pico'] - capacidade).clip(lower=0)
    resumo = resumo.sort_values('pico', ascending=False)
    return resumo, detalhe, capacidade


def _serie(cart, rotulo, inicio, meses):
    """Quantas alunas de um bloco ainda existem ao fim de cada mes."""
    janela = pd.period_range(pd.Period(inicio, freq='M'), periods=meses, freq='M')
    d = cart[cart['dono'] == rotulo]
    m = _mensal(d, janela)
    rest = _restante(d, janela)
    return {str(p): {'terminam_no_mes': int(m[p]), 'restante': rest[p]} for p in janela}


def _em_transito(cart, janela):
    """Transferidas que ainda nao chegaram ao destino, mes a mes.

    Elas continuam com quem esta saindo. Nao pesam na carteira do consultor
    novo ainda, mas existem — e vao pesar. Some-las ao total evita a ilusao
    de folga nos meses anteriores a virada.
    """
    d = cart[(cart['origem'] == 'transferida') & cart['vigencia'].notna()]
    if not len(d):
        return {str(m): 0 for m in janela}
    term = d['termino_efetivo'].dt.to_period('M')
    viva_sempre = term.isna() | (term < janela[0])
    saida = {}
    for m in janela:
        ainda_viva = viva_sempre | (term > m)
        nao_chegou = d['vigencia'].apply(lambda v: pd.notna(v) and v > m)
        saida[str(m)] = int((ainda_viva & nao_chegou).sum())
    return saida


def carga_do_time(cart, detalhe, capacidade, inicio, meses=12):
    """Balanco do time mes a mes: o que cabe contra o que ja esta em cima.

    A carteira diluida entra na carga total sem dono individual: sabemos que
    o time absorveu, nao sabemos quem ficou com quem. O que esta em transito
    entra tambem — e carteira que ja tem destino e ainda nao virou. O pool
    fica de fora aqui e e contado em `simular`.
    """
    if not len(detalhe):
        return pd.DataFrame()
    janela = pd.period_range(pd.Period(inicio, freq='M'), periods=meses, freq='M')
    dil = _serie(cart, DILUIDA, inicio, meses)
    trans = _em_transito(cart, janela)
    g = detalhe.groupby('mes').agg(
        consultores=('consultor', 'nunique'),
        terminam_no_mes=('terminam_no_mes', 'sum'),
        carteira_atribuida=('carteira_apos', 'sum'),
        vagas_individuais=('vagas', 'sum'),
        excedente_individual=('acima_da_capacidade', 'sum')).reset_index()
    g['diluida_no_time'] = g['mes'].map(lambda m: dil.get(m, {}).get('restante', 0))
    g['em_transito'] = g['mes'].map(lambda m: trans.get(m, 0))
    g['carteira_do_time'] = g['carteira_atribuida'] + g['diluida_no_time'] + g['em_transito']
    g['capacidade_do_time'] = g['consultores'] * capacidade
    g['folga_do_time'] = g['capacidade_do_time'] - g['carteira_do_time']
    return g


def simular(cart, carga, inicio, meses=12, entradas=None, meses_contrato=12):
    """Tudo que precisa de consultor contra tudo que o time comporta.

    entradas: {'AAAA-MM': n} — alunas novas previstas naquele mes (o evento de
    dezembro, por exemplo). Cada uma pesa na carteira pelos `meses_contrato`
    seguintes, que e a duracao padrao do contrato.

    Nao simula quem fica com quem: nao ha dado que diga isso. Conta estoque —
    a aluna do pool ja e aluna ativa hoje, com ou sem consultor ao lado dela,
    e continua pesando ate a data de termino que a matricula dela declara.

    `deficit` e quanta gente sobra alem do que o time comporta no mes. Enquanto
    for positivo, a conta so fecha contratando ou aumentando a carteira media.
    """
    if not len(carga):
        return pd.DataFrame()
    entradas = {str(k): int(v) for k, v in (entradas or {}).items()}
    pool = _serie(cart, POOL, inicio, meses)
    janela = [str(p) for p in pd.period_range(pd.Period(inicio, freq='M'),
                                              periods=meses, freq='M')]
    # Cada entrada nova ocupa lugar do mes em que chega ate o fim do contrato.
    novas = {m: 0 for m in janela}
    for m, n in entradas.items():
        if m in janela:
            i = janela.index(m)
            for j in range(i, min(i + meses_contrato, len(janela))):
                novas[janela[j]] += n

    linhas = []
    for _, r in carga.iterrows():
        m = r['mes']
        p = pool.get(m, {'terminam_no_mes': 0, 'restante': 0})
        total = int(r['carteira_do_time']) + int(p['restante']) + novas.get(m, 0)
        cap = int(r['capacidade_do_time'])
        linhas.append({
            'mes': m,
            'capacidade_do_time': cap,
            'carteira_com_dono': int(r['carteira_do_time']),
            'pool_sem_dono': int(p['restante']),
            'pool_termina_no_mes': int(p['terminam_no_mes']),
            'alunas_novas_ativas': novas.get(m, 0),
            'alunas_novas_entrando': entradas.get(m, 0),
            'total_a_atender': total,
            'vagas_no_time': max(0, cap - total),
            'deficit': max(0, total - cap),
            'carteira_media_necessaria': round(total / int(r['consultores']), 1),
            'consultores_necessarios': -(-total // (cap // int(r['consultores']))),
        })
    return pd.DataFrame(linhas)


NAO_CONFIRMADA = '(nao confirmada)'


def _casa(nome, lista):
    """Nome bate com algum da lista: igual, ou dois tokens em comum."""
    from .consultoria import _chave, _tokens
    ch, tk = _chave(nome), _tokens(nome)
    for c2, t2 in lista:
        if ch == c2:
            return True
        if len(tk) >= 2 and len(t2) >= 2 and len(tk & t2) >= 2:
            return True
    return False


def reconciliar(carteiras, carteiras_reais, entradas=None):
    """A aba do proprio consultor manda sobre o campo `consultor` da matricula.

    carteiras_reais: {'consultor': [nomes que ele mesmo lista]}. Onde existe
    essa lista, ela e a autoridade: o consultor sabe quem atende, a planilha
    de matricula registra quem foi atribuido a ele um dia.

    entradas: {'consultor': {nome: data de entrada}}. Grafia de nome varia
    ('Elisabete' na aba, 'Elizabeth' na matricula) e sozinha faz o casamento
    falhar. A data de entrada declarada, quando bate com o inicio do contrato,
    resolve o caso com um sobrenome so em comum.

    Quem esta na matricula sob o nome dele e nao aparece na aba dele nao
    evapora: vira `nao_confirmada` e vai para o pool. E aluna real, em turma
    real, so nao se sabe de quem e. Quem esta na aba e nao tem linha datada na
    matricula aparece em `sem_linha_datada`: existe, mas o termino nao da
    para projetar.
    """
    from .consultoria import _chave, _tokens
    d = carteiras.copy()
    d['confirmada'] = pd.NA
    relatorio = []
    for cons, nomes in (carteiras_reais or {}).items():
        alvo = str(cons).strip().lower()
        m = d['consultor_norm'].str.strip().str.lower() == alvo
        if not m.any():
            continue
        datas = {_chave(k): pd.Timestamp(v).normalize()
                 for k, v in ((entradas or {}).get(cons, {}) or {}).items()
                 if pd.notna(v)}
        lista = [(_chave(n), _tokens(n), datas.get(_chave(n))) for n in nomes]
        casados = set()

        def bate(i):
            ch, tk = _chave(d.at[i, 'nome'] or ''), _tokens(d.at[i, 'nome'] or '')
            ini = d.at[i, 'inicio'] if 'inicio' in d.columns else pd.NaT
            for c2, t2, dt in lista:
                if ch == c2 or (len(tk) >= 2 and len(t2) >= 2 and len(tk & t2) >= 2):
                    casados.add(c2)
                    return True
                # Um sobrenome em comum so vale com a data de entrada batendo.
                if tk & t2 and dt is not None and pd.notna(ini) \
                        and abs((pd.Timestamp(ini).normalize() - dt).days) <= 3:
                    casados.add(c2)
                    return True
            return False

        ok = pd.Series({i: bate(i) for i in d.index[m]})
        d.loc[ok.index, 'confirmada'] = ok
        relatorio.append({
            'consultor': cons,
            'na_matricula': int(m.sum()),
            'na_aba_do_consultor': len(nomes),
            'confirmadas_nos_dois': int(ok.sum()),
            'so_na_matricula': int((~ok).sum()),
            'sem_linha_datada': len(lista) - len(casados),
        })
    nao = d['confirmada'].eq(False)
    d.loc[nao, 'origem'] = 'nao_confirmada'
    d.loc[nao, 'dono'] = POOL
    d.loc[nao, 'vigencia'] = pd.NA
    return d, pd.DataFrame(relatorio)


def redirecionar(carteiras, destinos_por_nome, no_quadro=None):
    """Aplica o destino declarado aluna a aluna, nao carteira inteira.

    A aba do Daniel registra, em coluna propria, para quem cada aluna dele
    foi. Isso e melhor que tratar a carteira como diluida: onde o destino
    esta escrito, ele vale. Quem nao aparece na aba fica diluida mesmo.

    `no_quadro` limita os destinos aceitos. Um destino que tambem saiu do
    quadro (a aba do Daniel manda alunas para o Marcelo e a Ana Elisa) nao
    resolve nada: essa aluna vai para o pool, que e onde ela esta de fato.
    """
    from .consultoria import _chave, _tokens
    if not destinos_por_nome:
        return carteiras
    pares = [(_chave(n), _tokens(n), dest) for n, dest in destinos_por_nome.items()]
    d = carteiras.copy()
    alvo = d['dono'] == DILUIDA
    for i in d.index[alvo]:
        ch, tk = _chave(d.at[i, 'nome'] or ''), _tokens(d.at[i, 'nome'] or '')
        for c2, t2, dest in pares:
            if ch == c2 or (len(tk) >= 2 and len(t2) >= 2 and len(tk & t2) >= 2):
                if no_quadro is not None and dest not in no_quadro:
                    d.at[i, 'dono'] = POOL
                    d.at[i, 'origem'] = 'pool'
                else:
                    d.at[i, 'dono'] = dest
                    d.at[i, 'origem'] = 'transferida'
                break
    return d


def saidas(cart, inicio, meses=12):
    """Quem termina em cada mes, por consultor e por bloco sem dono.

    E a oferta de espaco: cada termino e um lugar que abre — desde que a aluna
    nao renove, o que a planilha nao registra em lugar nenhum.
    """
    janela = pd.period_range(pd.Period(inicio, freq='M'), periods=meses, freq='M')
    d = cart.copy()
    d['bloco'] = d['dono'].where(~d['dono'].isin({POOL, DILUIDA}), d['dono'])
    linhas = []
    for bloco, g in d.groupby('bloco'):
        m = _mensal(g, janela)
        rest = _restante(g, janela, com_vigencia=True)
        for p in janela:
            linhas.append({'bloco': bloco, 'mes': str(p), 'saem': int(m[p]),
                           'restante': rest[p]})
    t = pd.DataFrame(linhas)
    piv = t.pivot(index='bloco', columns='mes', values='saem').fillna(0).astype(int)
    piv['total_na_janela'] = piv.sum(axis=1)
    return t, piv.sort_values('total_na_janela', ascending=False).reset_index()


def remanejar(cart, capacidade, inicio, meses=12, entradas=None, meses_contrato=12):
    """Distribui quem esta sem dono entre os consultores, aluna a aluna.

    Nao e rateio por cabeca: cada aluna tem data de termino propria, entao
    ocupa um lugar por um tempo diferente. O criterio e achatar o pico —
    para cada aluna, escolhe o consultor cuja maior carteira, ao longo dos
    meses em que ela fica, ficaria menor. Quem fica muito tempo entra primeiro,
    porque e a mais dificil de encaixar depois.

    entradas: {'AAAA-MM': n} — a turma nova entra como vaga a preencher, com
    `meses_contrato` de duracao, para que o plano ja reserve lugar para ela.

    Devolve o destino sugerido de cada aluna e a carteira resultante mes a mes.
    O plano e uma proposta de balanceamento, nao uma decisao: afinidade,
    idioma, porte da aluna e relacao ja construida nao estao no dado.
    """
    janela = pd.period_range(pd.Period(inicio, freq='M'), periods=meses, freq='M')
    idx = {p: i for i, p in enumerate(janela)}
    fixos = cart[~cart['dono'].isin({POOL, DILUIDA})]
    consultores = sorted(fixos['dono'].unique())
    if not consultores:
        return pd.DataFrame(), pd.DataFrame()

    # Ocupacao de partida: o que cada um ja carrega, mes a mes.
    carga = {c: [0] * len(janela) for c in consultores}
    for c in consultores:
        r = _restante(fixos[fixos['dono'] == c], janela, com_vigencia=True)
        carga[c] = [r[p] for p in janela]
    # A carteira diluida nao tem dono declarado; espalha igual para nao sumir.
    n_dil = len(cart[cart['dono'] == DILUIDA])
    if n_dil:
        rd = _restante(cart[cart['dono'] == DILUIDA], janela)
        for c in consultores:
            for i, p in enumerate(janela):
                carga[c][i] += rd[p] / len(consultores)

    def vida(termino, desde=0):
        """Indices dos meses em que a aluna ainda ocupa lugar."""
        t = pd.Period(termino, freq='M') if pd.notna(termino) else None
        fim = idx.get(t, len(janela)) if t is not None and t >= janela[0] else len(janela)
        return list(range(desde, max(desde, fim + 1) if t is not None and t in idx else len(janela)))

    fila = []
    for _, r in cart[cart['dono'] == POOL].iterrows():
        # Carteira com vigencia so entra na conta do destino a partir da virada.
        v = r.get('vigencia')
        desde = idx.get(v, 0) if pd.notna(v) else 0
        fila.append({'nome': r.get('nome'), 'origem': r['consultor_norm'],
                     'turma': r.get('turma'), 'termino': r['termino_efetivo'],
                     'meses': vida(r['termino_efetivo'], desde)})
    for m, n in (entradas or {}).items():
        p = pd.Period(m, freq='M')
        if p not in idx:
            continue
        i0 = idx[p]
        for k in range(int(n)):
            fila.append({'nome': f'evento {m} #{k + 1}', 'origem': f'turma nova {m}',
                         'turma': None, 'termino': None,
                         'meses': list(range(i0, min(i0 + meses_contrato, len(janela))))})

    # Quem ocupa lugar por mais tempo entra primeiro: sobra menos escolha depois.
    fila.sort(key=lambda a: -len(a['meses']))
    plano = []
    for a in fila:
        if not a['meses']:
            continue
        melhor = min(consultores, key=lambda c: (
            max(carga[c][i] + 1 for i in a['meses']),
            sum(carga[c][i] for i in a['meses'])))
        for i in a['meses']:
            carga[melhor][i] += 1
        plano.append({'nome': a['nome'], 'origem': a['origem'], 'turma': a['turma'],
                      'termino': a['termino'], 'destino_sugerido': melhor,
                      'entra_em': str(janela[a['meses'][0]]),
                      'ocupa_meses': len(a['meses'])})
    plano = pd.DataFrame(plano)

    linhas = []
    for c in consultores:
        antes = _restante(fixos[fixos['dono'] == c], janela, com_vigencia=True)
        for i, p in enumerate(janela):
            linhas.append({'consultor': c, 'mes': str(p),
                           'carteira_antes': antes[p],
                           'carteira_depois': int(round(carga[c][i])),
                           'recebe_acumulado': int(round(carga[c][i])) - antes[p],
                           'acima_da_capacidade': max(0, int(round(carga[c][i])) - capacidade)})
    depois = pd.DataFrame(linhas)
    return plano, depois
