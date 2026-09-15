"""Planilha de pedidos de cancelamento: quem pediu para sair e o que aconteceu.

E a unica fonte que registra o desfecho de um pedido de saida. Sem ela, so da
para contar quem ja cancelou — com ela, da para separar quem pediu e ficou de
quem pediu e foi, que e a diferenca entre churn e retencao.

Seis abas, cada uma com um layout um pouco diferente e nenhuma com cabecalho
no mesmo lugar. O leitor procura o cabecalho em vez de assumir onde ele esta,
e cai para a ordem canonica de colunas quando nao acha nenhum.
"""
import re

import pandas as pd

from .texto import norm, tem_conteudo

# Ordem observada nas abas que nao trazem cabecalho.
COLUNAS_CANONICAS = ['nome', 'email', 'contato', 'solicitante', 'data', 'prazo',
                     'motivo', 'observacoes', 'responsavel', 'resumo', 'status']

SINONIMOS = {
    'nome': ('nome', 'nome completo', 'aluna', 'cliente', 'p'),
    'email': ('e-mail', 'email'),
    'contato': ('contato', 'telefone'),
    'solicitante': ('solicitante',),
    'data': ('data', 'data do pedido'),
    'prazo': ('prazo',),
    'motivo': ('motivo do cancelamento', 'motivo do canc', 'motivo'),
    'observacoes': ('observacoes', 'observacao', 'obs'),
    'responsavel': ('reponsavel por seguir', 'responsavel por seguir', 'responsavel'),
    'resumo': ('resumo final', 'resumo'),
    'status': ('status', 'cancelamento', 'status joao'),
    'produto': ('produto',),
    'pagamento': ('forma de pagamento',),
}


def _cab(v):
    return re.sub(r'\s+', ' ', norm(v)).strip()


def _mapear(linha):
    """Cabecalho da aba -> {posicao: nome canonico}."""
    mapa = {}
    for i, v in enumerate(linha):
        if pd.isna(v):
            continue
        c = _cab(v)
        for destino, pistas in SINONIMOS.items():
            if c in pistas and destino not in mapa.values():
                mapa[i] = destino
                break
    return mapa


def _achar_cabecalho(t, limite=8):
    """Linha que parece cabecalho. 'e-mail' e 'contato' juntos sao a assinatura:
    'nome' sozinho aparece em celula de titulo e daria falso positivo."""
    for i in range(min(limite, len(t))):
        mapa = _mapear(t.iloc[i])
        if {'email', 'contato'} <= set(mapa.values()):
            return i, mapa
    return None, {}


# Desfecho declarado. 'nao' e 'revertido' sao a mesma coisa vista de dois
# angulos: o pedido existiu e a aluna ficou.
_FICOU = r'^(nao|revertido|nao sera cancelad|reverteu|downsell|migrou)'
_SAIU = r'(cancelad|cancelamento efetiv|reembolso|distrato|removido acess|^sim$)'
_ABERTO = r'(em contato|verificando|processo|aguardando|em tratativa|analise)'

ROTULO_DESFECHO = {
    'ficou': 'Pediu e ficou',
    'saiu': 'Pediu e saiu',
    'em_aberto': 'Pedido em aberto',
    'sem_registro': 'Sem desfecho registrado',
}


def classificar_desfecho(*campos):
    """O desfecho pode estar em qualquer uma das colunas de status.

    A ordem importa: 'em aberto' perde para um desfecho definido, porque a
    planilha costuma manter o texto antigo na coluna ao lado depois de
    resolver. E 'ficou' ganha de 'saiu' quando os dois aparecem, porque o
    padrao de escrita e 'cancelado ... mas reverteu'.
    """
    textos = [norm(c) for c in campos if tem_conteudo(c)]
    if not textos:
        return 'sem_registro'
    junto = ' | '.join(textos)
    if any(re.search(_FICOU, t) for t in textos) or re.search(r'\brevertido\b', junto):
        return 'ficou'
    if re.search(_SAIU, junto):
        return 'saiu'
    if re.search(_ABERTO, junto):
        return 'em_aberto'
    return 'sem_registro'


def carregar(caminho):
    """Todas as abas numa tabela so, com a aba de origem preservada."""
    x = pd.ExcelFile(caminho)
    linhas = []
    for aba in x.sheet_names:
        t = x.parse(aba, header=None)
        if not len(t):
            continue
        i, mapa = _achar_cabecalho(t)
        if mapa:
            corpo = t.iloc[i + 1:]
        else:
            # Aba sem cabecalho: assume a ordem canonica ate onde as colunas
            # existirem. 'Tratar com Rodolfo' tem so nome e observacao.
            corpo = t
            mapa = {j: c for j, c in enumerate(COLUNAS_CANONICAS[:t.shape[1]])}
            if t.shape[1] <= 3:
                mapa = {0: 'nome', 1: 'observacoes'}
        for _, r in corpo.iterrows():
            reg = {'aba': aba.strip()}
            for pos, campo in mapa.items():
                if pos < len(r):
                    reg[campo] = r.iloc[pos]
            nome = reg.get('nome')
            if not tem_conteudo(nome):
                continue
            n = _cab(nome)
            if n in ('nome', 'nome completo', 'aluna', 'cliente', 'p') or len(n) < 3:
                continue
            if n.startswith('cancelamentos '):     # celula de titulo
                continue
            linhas.append(reg)
    d = pd.DataFrame(linhas)
    if not len(d):
        return d
    for c in COLUNAS_CANONICAS + ['produto', 'pagamento']:
        if c not in d.columns:
            d[c] = None
    d['desfecho'] = [classificar_desfecho(r.get('status'), r.get('resumo'),
                                          r.get('observacoes'))
                     for _, r in d.iterrows()]
    d['data_pedido'] = pd.to_datetime(d['data'], dayfirst=True, errors='coerce')
    # Data fora de faixa plausivel e erro de digitacao, nao informacao.
    fora = d['data_pedido'].notna() & (
        (d['data_pedido'] < '2024-01-01') | (d['data_pedido'] > pd.Timestamp.today()))
    d.loc[fora, 'data_pedido'] = pd.NaT
    d['data_suspeita'] = fora
    return d


def resumo(d):
    """Retencao por desfecho. So conta taxa onde ha desfecho definido."""
    if not len(d):
        return pd.DataFrame(), None
    g = d.groupby('desfecho').agg(pedidos=('nome', 'size'),
                                  com_motivo=('motivo', lambda s: int(s.map(tem_conteudo).sum())),
                                  com_data=('data_pedido', lambda s: int(s.notna().sum()))
                                  ).reset_index()
    g['rotulo'] = g['desfecho'].map(ROTULO_DESFECHO)
    g = g.sort_values('pedidos', ascending=False)
    decididos = d[d['desfecho'].isin(['ficou', 'saiu'])]
    taxa = (d['desfecho'].eq('ficou').sum() / len(decididos) * 100) if len(decididos) else None
    return g, taxa


def por_aba(d):
    return (d.pivot_table(index='aba', columns='desfecho', values='nome',
                          aggfunc='count', fill_value=0)
            .reset_index() if len(d) else pd.DataFrame())
