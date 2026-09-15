"""Base mestra: uma linha por aluna, com tudo que as quatro fontes sabem dela.

Cada planilha sabe uma coisa e ignora as outras. A matricula sabe contrato e
data; a aba do consultor sabe faturamento atual e o que esta acontecendo; o
formulario sabe a dor e o porte na entrada; a planilha de cancelamento sabe
quem pediu para sair e se ficou. Ninguem sabe as quatro coisas.

Esta tabela junta as quatro pela identidade ja resolvida no banco, mantendo
visivel de qual fonte veio cada campo — porque quando elas discordam, e a
discordancia que interessa.

`prioridade` nao e previsao de nada. E uma regra de fila, escrita para ser
contestada: ordena por quanto a aluna fatura, quanto o programa ja entregou
para ela e quao proxima esta o fim do contrato.
"""
import pandas as pd

from .db import consultar

SQL_BASE = """
SELECT p.id AS pessoa_id, p.nome_canonico AS nome,

  -- Matricula: a mais recente vence, porque reentrada e comum.
  (SELECT m.consultor_norm FROM fato_matricula m WHERE m.pessoa_id = p.id
     AND m.consultor_norm IS NOT NULL ORDER BY m.id DESC LIMIT 1)   AS consultor_matricula,
  (SELECT m.status FROM fato_matricula m WHERE m.pessoa_id = p.id
     ORDER BY m.id DESC LIMIT 1)                                    AS status_matricula,
  (SELECT m.turma FROM fato_matricula m WHERE m.pessoa_id = p.id
     ORDER BY m.id DESC LIMIT 1)                                    AS turma,
  (SELECT m.produto FROM fato_matricula m WHERE m.pessoa_id = p.id
     AND m.produto IS NOT NULL ORDER BY m.id DESC LIMIT 1)          AS produto,
  (SELECT m.inicio FROM fato_matricula m WHERE m.pessoa_id = p.id
     AND m.inicio IS NOT NULL ORDER BY m.id DESC LIMIT 1)           AS inicio,
  (SELECT MAX(m.termino) FROM fato_matricula m WHERE m.pessoa_id = p.id) AS termino,
  (SELECT m.telefone FROM fato_matricula m WHERE m.pessoa_id = p.id
     AND m.telefone IS NOT NULL ORDER BY m.id DESC LIMIT 1)         AS telefone_matricula,
  (SELECT m.email FROM fato_matricula m WHERE m.pessoa_id = p.id
     AND m.email IS NOT NULL ORDER BY m.id DESC LIMIT 1)            AS email_matricula,
  (SELECT m.status_financeiro FROM fato_matricula m WHERE m.pessoa_id = p.id
     AND m.status_financeiro IS NOT NULL ORDER BY m.id DESC LIMIT 1) AS status_financeiro,

  -- Aba do consultor: faturamento atualizado e o relato livre.
  (SELECT c.consultor_norm FROM fato_consultoria c WHERE c.pessoa_id = p.id
     AND c.consultor_norm IS NOT NULL ORDER BY c.id DESC LIMIT 1)   AS consultor_aba,
  (SELECT c.fat_mes FROM fato_consultoria c WHERE c.pessoa_id = p.id
     AND c.fat_mes IS NOT NULL AND c.fat_mes > 0 ORDER BY c.id DESC LIMIT 1) AS fat_mes_consultor,
  (SELECT c.cidade FROM fato_consultoria c WHERE c.pessoa_id = p.id
     AND c.cidade IS NOT NULL ORDER BY c.id DESC LIMIT 1)           AS cidade,
  (SELECT c.ramo FROM fato_consultoria c WHERE c.pessoa_id = p.id
     AND c.ramo IS NOT NULL ORDER BY c.id DESC LIMIT 1)             AS ramo,
  (SELECT c.situacao FROM fato_consultoria c WHERE c.pessoa_id = p.id
     AND c.situacao IS NOT NULL ORDER BY c.id DESC LIMIT 1)         AS relato_consultor,
  (SELECT MAX(c.consultorias) FROM fato_consultoria c WHERE c.pessoa_id = p.id) AS consultorias_feitas,

  -- Pedido de cancelamento: existe e como terminou.
  (SELECT k.desfecho FROM fato_cancelamento k WHERE k.pessoa_id = p.id
     ORDER BY k.id DESC LIMIT 1)                                    AS desfecho_pedido,
  (SELECT k.motivo FROM fato_cancelamento k WHERE k.pessoa_id = p.id
     AND k.motivo IS NOT NULL ORDER BY k.id DESC LIMIT 1)           AS motivo_pedido,
  (SELECT k.data_pedido FROM fato_cancelamento k WHERE k.pessoa_id = p.id
     AND k.data_pedido IS NOT NULL ORDER BY k.id DESC LIMIT 1)      AS data_pedido,
  (SELECT COUNT(*) FROM fato_cancelamento k WHERE k.pessoa_id = p.id) AS pedidos_de_saida,

  -- Contato: a planilha de cancelamento e a que mais tem telefone e e-mail.
  (SELECT k.contato FROM fato_cancelamento k WHERE k.pessoa_id = p.id
     AND k.contato IS NOT NULL ORDER BY k.id DESC LIMIT 1)          AS contato_cancelamento,
  (SELECT k.email FROM fato_cancelamento k WHERE k.pessoa_id = p.id
     AND k.email IS NOT NULL ORDER BY k.id DESC LIMIT 1)            AS email_cancelamento,

  (SELECT COUNT(*) FROM fato_formulario f WHERE f.pessoa_id = p.id)  AS respondeu_formulario,
  (SELECT f.empresa FROM fato_formulario f WHERE f.pessoa_id = p.id
     AND f.empresa IS NOT NULL ORDER BY f.id DESC LIMIT 1)          AS empresa,
  (SELECT COUNT(*) FROM fato_matricula m WHERE m.pessoa_id = p.id)   AS n_matriculas,
  (SELECT COUNT(*) FROM fato_consultoria c WHERE c.pessoa_id = p.id) AS n_consultorias
FROM pessoa p
"""

VIVO = ('ativo', 'pendente de pagamento', 'bloqueado')


def _norm_status(s):
    return str(s).strip().lower() if pd.notna(s) else None


def montar(con, estudo=None):
    """A base mestra. `estudo` traz score e classe do BI, casados por nome."""
    d = consultar(con, SQL_BASE)
    d['status_norm'] = d['status_matricula'].map(_norm_status)
    d['contrato_vivo'] = d['status_norm'].isin(VIVO)
    d['divergencia_consultor'] = (
        d['consultor_matricula'].notna() & d['consultor_aba'].notna()
        & (d['consultor_matricula'] != d['consultor_aba']))
    d['fontes'] = (d['n_matriculas'].gt(0).astype(int) + d['n_consultorias'].gt(0).astype(int)
                   + d['respondeu_formulario'].gt(0).astype(int)
                   + d['pedidos_de_saida'].gt(0).astype(int))
    if estudo is not None and len(estudo):
        d = d.merge(estudo, on='nome', how='left')
    for c in ('score_oportunidade', 'classe', 'fat_brl'):
        if c not in d.columns:
            d[c] = None
    # O faturamento do consultor e mais novo que o do formulario, entao vence.
    # Guardo os dois para que a diferenca continue visivel.
    # Contato: a matricula cobre quase todo mundo; a planilha de cancelamento
    # cobre justamente quem saiu do radar da matricula.
    d['telefone'] = d['telefone_matricula'].fillna(d['contato_cancelamento'])
    d['email'] = d['email_matricula'].fillna(d['email_cancelamento'])
    d['tem_contato'] = d['telefone'].notna() | d['email'].notna()
    d['fat_referencia'] = d['fat_mes_consultor'].fillna(d['fat_brl'])
    d['fat_origem'] = d['fat_mes_consultor'].notna().map(
        {True: 'relato do consultor', False: 'formulário de entrada'})
    d.loc[d['fat_referencia'].isna(), 'fat_origem'] = None
    d['termino_dt'] = pd.to_datetime(d['termino'], errors='coerce')
    hoje = pd.Timestamp.today().normalize()
    d['meses_ate_termino'] = ((d['termino_dt'] - hoje).dt.days / 30.44).round(1)
    return d


ROTULO_POOL = {
    'renovacao': 'Renovação a vencer',
    'retida_uma_vez': 'Já pediu para sair e ficou',
    'sem_consultor': 'Sem consultor definido',
    'reconquista': 'Cancelada, negócio ativo',
    'upsell': 'Ativa com porte alto',
    'sem_acao': 'Sem gancho claro',
}


def classificar_pool(d, corte_porte=None):
    """Onde há conversa a ter, e qual conversa.

    Os grupos são excludentes e avaliados nesta ordem, porque uma aluna pode
    caber em vários e a fila precisa de um dono só. A ordem é por urgência de
    calendário, não por tamanho do cheque: renovação tem data, upsell não.
    """
    if corte_porte is None:
        vivos = d.loc[d['contrato_vivo'], 'fat_referencia'].dropna()
        corte_porte = float(vivos.median()) if len(vivos) else 0.0

    def grupo(r):
        if r['contrato_vivo'] and pd.notna(r['meses_ate_termino']) \
                and 0 <= r['meses_ate_termino'] <= 4:
            return 'renovacao'
        if r['desfecho_pedido'] == 'ficou':
            return 'retida_uma_vez'
        if r['contrato_vivo'] and pd.isna(r['consultor_matricula']) and pd.isna(r['consultor_aba']):
            return 'sem_consultor'
        if not r['contrato_vivo'] and r['status_norm'] == 'cancelado' \
                and pd.notna(r['fat_referencia']) and r['fat_referencia'] >= corte_porte:
            return 'reconquista'
        if r['contrato_vivo'] and pd.notna(r['fat_referencia']) \
                and r['fat_referencia'] >= corte_porte:
            return 'upsell'
        return 'sem_acao'

    d = d.copy()
    d['pool'] = d.apply(grupo, axis=1)
    d['pool_rotulo'] = d['pool'].map(ROTULO_POOL)
    return d, corte_porte


def resumo_pool(d):
    g = d.groupby(['pool', 'pool_rotulo']).agg(
        alunas=('pessoa_id', 'size'),
        com_contato=('tem_contato', 'sum'),
        fat_mediano=('fat_referencia', 'median'),
        fat_total=('fat_referencia', 'sum'),
        score_mediano=('score_oportunidade', 'median')).reset_index()
    ordem = list(ROTULO_POOL)
    g['ord'] = g['pool'].map({p: i for i, p in enumerate(ordem)})
    return g.sort_values('ord').drop(columns='ord')
