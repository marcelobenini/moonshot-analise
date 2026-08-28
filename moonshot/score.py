"""Etapa 4 (diagnostico individual) e Etapa 5 (score de propensao)."""
import numpy as np
import pandas as pd

from .taxonomia import FRENTES_PRODUTO

# Pesos do enunciado. Mantidos: a base nao oferece variavel melhor para
# recalibra-los (nao ha historico de conversao de venda para treinar peso).
PESOS = {'capacidade_pagar': 30, 'complexidade_operacional': 25,
         'aderencia_dor': 30, 'maturidade_digital': 15}

# Faturamento mensal (BRL) -> fracao do eixo. Cortes alinhados aos quartis da base.
ESCADA_PAGAR = [(5_000, .10), (10_000, .30), (20_000, .50),
                (40_000, .70), (80_000, .90), (float('inf'), 1.00)]
# Pessoas no negocio (incl. dona) -> fracao do eixo.
ESCADA_COMPLEXIDADE = [(1, .10), (3, .35), (6, .65), (16, .90), (float('inf'), 1.00)]


def _escada(valor, escada):
    if pd.isna(valor):
        return None
    for lim, frac in escada:
        if valor < lim:
            return frac
    return 1.0


def calcular_score(base):
    """Score 0-100 de propensao a contratar o sistema com IA.

    Cada eixo e normalizado em 0-1 e multiplicado pelo peso. Quando um eixo nao
    tem dado, ele nao e imputado: o score e calculado sobre os eixos disponiveis
    e reescalado, e a cobertura fica registrada em `eixos_com_dado`.
    """
    d = base.copy()

    e_pagar = d['fat_brl'].map(lambda v: _escada(v, ESCADA_PAGAR))
    e_pagar = [0.0 if c in ('pre_operacional', 'sem_faturamento') else v
               for v, c in zip(e_pagar, d['fat_confianca'])]

    e_compl = d['equipe_total'].map(lambda v: _escada(v, ESCADA_COMPLEXIDADE))
    e_compl = [min(1.0, (v or 0) + .10) if m else v for v, m in zip(e_compl, d['multi_unidade'])]

    # Aderencia: quantas das 4 frentes do produto a aluna nomeia como dor.
    frentes_por_aluna, e_ader = [], []
    for txt in d['dores_declaradas_todas'].fillna(''):
        cats = set(str(txt).split('; '))
        hit = [f for f, cs in FRENTES_PRODUTO.items() if cats & set(cs)]
        frentes_por_aluna.append(hit)
        e_ader.append(len(hit) / 4 if txt else None)

    sinais = ['usa_sistema_gestao', 'usa_crm', 'faz_trafego', 'usa_ia_automacao']
    pesos_sinal = {'usa_sistema_gestao': .35, 'faz_trafego': .35, 'usa_crm': .15,
                   'usa_ia_automacao': .15}
    e_matur = d[sinais].apply(lambda r: sum(pesos_sinal[c] for c in sinais if r[c]), axis=1)
    # Ausencia de sinal so vale 0 se a aluna teve onde declara-lo. Sem nenhuma
    # coluna-fonte preenchida o eixo e desconhecido, nao zero — do contrario o
    # formulario Club, que nao tem a coluna de tecnologia, seria punido de saida.
    e_matur = e_matur.where(d['tem_fonte_maturidade'], other=np.nan)

    eixos = pd.DataFrame({'capacidade_pagar': e_pagar, 'complexidade_operacional': e_compl,
                          'aderencia_dor': e_ader, 'maturidade_digital': e_matur}, index=d.index)

    peso_disp = eixos.notna().mul(pd.Series(PESOS), axis=1).sum(axis=1)
    bruto = eixos.fillna(0).mul(pd.Series(PESOS), axis=1).sum(axis=1)
    # Reescala pelos eixos disponiveis, mas exige (a) aderencia da dor, que e o
    # unico eixo que mede fit com o produto, e (b) faturamento OU equipe, que
    # medem porte. Sem um dos dois o numero nao significa nada e fica em branco.
    tem_porte = eixos['capacidade_pagar'].notna() | eixos['complexidade_operacional'].notna()
    valido = eixos['aderencia_dor'].notna() & tem_porte & (peso_disp >= 60)
    score = np.where(valido, (bruto / peso_disp) * 100, np.nan)

    for c in eixos.columns:
        d[f'eixo_{c}'] = (eixos[c] * PESOS[c]).round(1)
    d['eixos_com_dado'] = eixos.notna().sum(axis=1)
    d['peso_disponivel'] = peso_disp
    d['score_oportunidade'] = np.round(score, 1)
    d['frentes_aderentes'] = ['; '.join(f) if f else None for f in frentes_por_aluna]

    d['classe'] = pd.cut(d['score_oportunidade'], [-.1, 40, 60, 100.1], labels=['C', 'B', 'A'])
    d['motivo_sem_score'] = [
        None if pd.notna(s) else
        'sem dor classificavel: nao da para medir aderencia ao produto' if pd.isna(a) else
        'sem faturamento e sem equipe classificaveis' if pd.isna(f) and pd.isna(e) else
        'cobertura de eixos insuficiente'
        for s, f, e, a in zip(d['score_oportunidade'], d['fat_brl'], d['equipe_total'],
                              eixos['aderencia_dor'])]

    # Produto-ancora: a frente com o sinal declarado mais forte (soma das ocorrencias
    # das categorias que a alimentam), nao uma ordem fixa de preferencia comercial.
    # Porte so desempata: equipe grande puxa recrutamento, faturamento alto puxa financeiro.
    def ancora(r):
        bruto = r['frentes_aderentes']
        hits = [h for h in str(bruto).split('; ') if h] if pd.notna(bruto) else []
        if not hits:
            return None
        cats = str(r['dores_declaradas_todas'] or '').split('; ')
        forca = {f: sum(1 for c in cats if c in FRENTES_PRODUTO[f]) for f in hits}
        if pd.notna(r['equipe_total']) and r['equipe_total'] >= 6 and 'recrutamento' in hits:
            forca['recrutamento'] += 1
        if pd.notna(r['fat_brl']) and r['fat_brl'] >= 40000 and 'financeiro' in hits:
            forca['financeiro'] += 1
        return max(forca, key=lambda f: (forca[f], -list(FRENTES_PRODUTO).index(f)))

    d['produto_ancora'] = d.apply(ancora, axis=1)
    return d


ROTULO_GARGALO = {
    'captacao_clientes': 'nao entra cliente novo',
    'conversao_venda': 'o lead chega e nao fecha',
    'precificacao_margem': 'cobra errado, nao sabe o lucro',
    'controle_financeiro': 'opera sem numero na mao',
    'contratar': 'nao consegue contratar',
    'reter_liderar': 'contrata e nao segura',
    'sobrecarga_delegacao': 'centraliza tudo, e o proprio teto',
    'processos_padronizacao': 'nada padronizado',
    'conteudo_instagram': 'sem constancia de conteudo',
    'trafego_pago': 'nao roda anuncio com retorno',
    'atendimento_agenda': 'agenda e atendimento no braco',
    'fidelizacao_recompra': 'cliente vem uma vez e some',
    'mentalidade': 'trava por inseguranca',
    'pre_operacional': 'ainda nao opera',
}
DESTRAVA = {
    'captacao_clientes': 'oferta clara + trafego pago com meta de leads',
    'conversao_venda': 'script de atendimento e follow-up medido',
    'precificacao_margem': 'recalcular preco por servico com custo real',
    'controle_financeiro': 'fluxo de caixa semanal e DRE simples',
    'contratar': 'processo seletivo padronizado e banco de talentos',
    'reter_liderar': 'rotina de gestao: meta, 1:1 e plano de carreira',
    'sobrecarga_delegacao': 'delegar agenda e atendimento antes de contratar mais',
    'processos_padronizacao': 'mapear os 5 processos criticos e escrever o passo a passo',
    'conteudo_instagram': 'calendario editorial fixo e producao em lote',
    'trafego_pago': 'campanha estruturada com verba e leitura de custo por lead',
    'atendimento_agenda': 'agendamento online e resposta automatica no WhatsApp',
    'fidelizacao_recompra': 'pos-atendimento programado e plano de recorrencia',
    'mentalidade': 'metas curtas e acompanhamento semanal',
    'pre_operacional': 'definir oferta, preco e ponto antes de escalar',
}


def diagnostico_individual(base, usar_nome=True):
    """Uma linha por aluna: [ID/Nome] - [gargalo] - [o que destrava]. Ate 25 palavras."""
    linhas = []
    for _, r in base.iterrows():
        # O gargalo principal e a dor inferida quando ela existe (os dados mandam);
        # na ausencia dela, cai para a dor declarada.
        gargalo = r['dor_inferida_1'] if pd.notna(r['dor_inferida_1']) else r['dor_declarada_1']
        if pd.isna(gargalo) or not gargalo:
            linhas.append({'id_aluna': r['id_aluna'],
                           'nome': r['nome'] if usar_nome else None,
                           'diagnostico': None,
                           'motivo_sem_diagnostico': 'sem dor classificavel nos textos nem nos dados',
                           'origem_do_gargalo': None})
            continue
        rotulo = f"{r['id_aluna']}" + (f" ({r['nome']})" if usar_nome and pd.notna(r['nome']) else '')
        frase = f"{rotulo} — {ROTULO_GARGALO.get(gargalo, gargalo)} — {DESTRAVA.get(gargalo, '')}"
        palavras = frase.split()
        if len(palavras) > 25:
            frase = ' '.join(palavras[:25])
        linhas.append({'id_aluna': r['id_aluna'], 'nome': r['nome'] if usar_nome else None,
                       'diagnostico': frase, 'motivo_sem_diagnostico': None,
                       'origem_do_gargalo': 'inferida (dados)' if pd.notna(r['dor_inferida_1'])
                                            else 'declarada (texto)',
                       'categoria_gargalo': gargalo})
    return pd.DataFrame(linhas)
