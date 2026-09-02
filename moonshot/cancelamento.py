"""Quem esta saindo, em que estagio, e com que evidencia.

`em processo de cancelamento` era rotulo grosso demais para decidir alguma
coisa: juntava quem pediu para sair, quem parou de pagar e quem so sumiu —
tres situacoes com acao diferente. Aqui elas ficam separadas, cada uma com o
trecho literal do relato que a classificou, para poder ser contestada uma a uma.
"""
import re

import pandas as pd

from .texto import norm, tem_conteudo

# Pedido explicito de saida. Exige o verbo junto do objeto: 'cancelar' solto
# aparece em 'cancelou do elite' e em 'sem risco de cancelamento'.
RX_PEDIU = (r'(pediu|pedindo|solicit\w*|quer|queria|tentou|ameac\w*|vai|pensando em)'
            r'\s+\w{0,12}\s*(cancel|sair|desistir|reembolso)'
            r'|cancelament\w+|quer sair|desistiu do programa|processo juridico|reembolso')

# O consultor conta a historia inteira numa frase so: 'pediu cancelamento, mas
# decidiu ficar'. Sem isso, quem ja foi retido conta como saindo.
RX_REVERTEU = (r"(resolveu|decidiu)\s+(ficar|continuar|permanecer|retornar)|nao cancelou"
               r"|conseguimos revert|revertemos|desistiu de cancelar|volt\w+ atras"
               # Mais-que-perfeito conta a historia como encerrada: 'tinha
               # pedido cancelamento' e evento passado, nao pedido aberto.
               r"|(tinha|havia) (pedido|solicitado)"
               r"|(mas|porem|apos|depois)[^.]{0,60}(esta|ficou|continua|segue)"
               r"\s+\w{0,12}(bem|engajad|animad|caminhando|na moonshot|conosco)")

# Cancelar o Elite nao e cancelar a Moonshot: cai o upsell, o contrato base
# continua. Sem separar, quem saiu do Elite entra na lista de quem esta saindo.
RX_SO_ELITE = r"cancel\w*\s+(d[oa]\s+)?elite|elite[^.]{0,25}cancel"
RX_CANCELA_BASE = r"cancel\w*\s+(d[oa]\s+)?(moonshot|monshot|programa|plano|contrato)"

RX_INADIMPLENTE = r'inadimplen|nao (conseguiu |consegue )?pag\w+|atras\w* (com |n)?(as )?parcela|sem pagar'

RX_SUMIU = (r'nao (me )?responde|nao (me )?retorn|sem retorno|sem contato|sumiu'
            r'|nao consigo contato|nao respondeu mais|nao da retorno|nao participa')

ESTAGIOS = {
    'pedido_de_saida': 'Pediu para sair',
    'inadimplente': 'Inadimplente',
    'sem_contato': 'Sumiu, sem pedido de saída',
    'risco_revertido': 'Pediu e voltou atrás',
    'saiu_do_elite': 'Cancelou só o Elite',
}

ORDEM_ESTAGIO = ['pedido_de_saida', 'inadimplente', 'sem_contato',
                 'risco_revertido', 'saiu_do_elite']


def _trecho(texto, padrao, volta=45, frente=75):
    """Pedaco do relato em volta do que casou, para servir de evidencia."""
    m = re.search(padrao, norm(texto))
    if not m:
        return None
    bruto = re.sub(r'\s+', ' ', str(texto))
    i = max(0, m.start() - volta)
    f = min(len(bruto), m.end() + frente)
    return ('…' if i else '') + bruto[i:f].strip() + ('…' if f < len(bruto) else '')


def estagiar(situacao, status_cadastro=None):
    """(estagio, evidencia_literal). None quando nao ha sinal de saida.

    A ordem importa: quem pediu e voltou atras nao e quem esta saindo, e
    inadimplencia declarada no cadastro vale mesmo sem relato nenhum.
    """
    tem_texto = tem_conteudo(situacao)
    n = norm(situacao) if tem_texto else ''
    pediu = bool(re.search(RX_PEDIU, n)) if tem_texto else False

    if pediu:
        # O relato conta a historia inteira em ordem, e o consultor escreve
        # como aconteceu: 'pediu, voltou atras, pediu de novo'. Vale o ultimo
        # sinal, nao o primeiro — quem voltou e pediu outra vez esta saindo.
        volta = [m.end() for m in re.finditer(RX_REVERTEU, n)]
        saida = [m.end() for m in re.finditer(RX_PEDIU, n)]
        if volta and max(volta) > max(saida):
            return 'risco_revertido', _trecho(situacao, RX_REVERTEU)
    if pediu and re.search(RX_SO_ELITE, n) and not re.search(RX_CANCELA_BASE, n):
        return 'saiu_do_elite', _trecho(situacao, RX_SO_ELITE)
    if pediu:
        return 'pedido_de_saida', _trecho(situacao, RX_PEDIU)
    if status_cadastro in ('pendente de pagamento', 'bloqueado'):
        return 'inadimplente', _trecho(situacao, RX_INADIMPLENTE) if tem_texto else None
    if tem_texto and re.search(RX_INADIMPLENTE, n):
        return 'inadimplente', _trecho(situacao, RX_INADIMPLENTE)
    if tem_texto and re.search(RX_SUMIU, n):
        return 'sem_contato', _trecho(situacao, RX_SUMIU)
    return None, None


def classificar(base):
    """Acrescenta `estagio_saida` e `evidencia_saida` a base do estudo."""
    d = base.copy()
    pares = [estagiar(r.get('situacao'), r.get('status_cadastro'))
             for _, r in d.iterrows()]
    d['estagio_saida'] = [p[0] for p in pares]
    d['evidencia_saida'] = [p[1] for p in pares]
    # Quem ja cancelou ou ja terminou nao esta 'em processo'; o estagio so
    # descreve contrato vivo.
    vivo = ~d['situacao_contrato'].isin(['cancelada', 'finalizada'])
    d.loc[~vivo, 'estagio_saida'] = None
    d.loc[~vivo, 'evidencia_saida'] = None
    return d


def lista_nominal(base, estagios=None):
    """Uma linha por aluna com sinal de saida, ordenada por valor comercial.

    Serve para trabalhar a lista, entao vem com o que decide prioridade —
    classe, score e faturamento — e com a evidencia ao lado do rotulo.
    """
    d = base[base['estagio_saida'].notna()].copy()
    if estagios:
        d = d[d['estagio_saida'].isin(estagios)]
    if not len(d):
        return pd.DataFrame()
    d['ordem'] = d['estagio_saida'].map({e: i for i, e in enumerate(ORDEM_ESTAGIO)})
    cols = [c for c in ['nome', 'empresa', 'consultor', 'estagio_saida', 'evidencia_saida',
                        'situacao_contrato', 'status_cadastro', 'turma_matricula',
                        'classe', 'score_oportunidade', 'fat_brl', 'uf', 'programa']
            if c in d.columns]
    d = d.sort_values(['ordem', 'score_oportunidade'], ascending=[True, False])
    d['estagio'] = d['estagio_saida'].map(ESTAGIOS)
    return d[cols].rename(columns={'estagio_saida': 'estagio'})


def resumo(base):
    """Quantas em cada estagio, e quanto vale cada bloco."""
    d = base[base['estagio_saida'].notna()]
    if not len(d):
        return pd.DataFrame()
    g = d.groupby('estagio_saida').agg(
        alunas=('id_aluna', 'size'),
        classe_A=('classe', lambda s: int((s == 'A').sum())),
        com_evidencia=('evidencia_saida', lambda s: int(s.notna().sum())),
        score_mediano=('score_oportunidade', 'median'),
        fat_mediano=('fat_brl', 'median')).reset_index()
    g['rotulo'] = g['estagio_saida'].map(ESTAGIOS)
    g['ordem'] = g['estagio_saida'].map({e: i for i, e in enumerate(ORDEM_ESTAGIO)})
    return g.sort_values('ordem').drop(columns='ordem')
