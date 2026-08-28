"""Exporta os agregados da analise em JSON, para alimentar o BI interativo.

Regra de privacidade: o JSON leva nome e empresa (necessarios para priorizar
abordagem) mas NUNCA e-mail, telefone ou endereco. Contato fica so no Excel.
"""
import json

import numpy as np
import pandas as pd

from .taxonomia import (DEFINICOES, FRENTES_PRODUTO, FRENTES_ROTULO, ROTULOS_DOR,
                        ROTULOS_TEMA, TEMAS_LATENTES)


def _limpo(v):
    """Converte tipos numpy/pandas em algo serializavel, NaN vira None."""
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        return None if pd.isna(v) else round(float(v), 2)
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return str(v)


def _registros(df):
    return [{k: _limpo(v) for k, v in r.items()} for r in df.to_dict('records')]


def exportar(base, rank, div_tab, div_resumo, eq_tab, fat_tab, fat_prod,
             cob_frentes, tab_lacunas, tab_portugal, tab_paises, rel_cluster,
             destino, com_nomes=True, extras=None):
    """Grava o JSON que alimenta o BI.

    Exporta a base linha a linha, nao so os agregados: os filtros do BI
    recalculam ranking, KPIs e cobertura de frentes no cliente, e com tabela
    pronta eles seriam decorativos. Os agregados vao junto so como referencia
    (o estado sem filtro), para conferir contra o Excel.
    """
    campos = ['id_aluna', 'origem', 'pais', 'uf', 'municipio', 'nicho_grupo', 'classe', 'score_oportunidade',
              'produto_ancora', 'fat_brl', 'equipe_n', 'equipe_total', 'porte_equipe',
              'faixa_faturamento', 'anos_operacao', 'dor_declarada_1', 'dor_inferida_1',
              'justificativa_inferencia', 'processos_mapeados', 'usa_sistema_gestao',
              'faz_trafego', 'usa_crm', 'usa_ia_automacao', 'fat_por_pessoa',
              'tem_acompanhamento', 'consultor', 'programa', 'engajamento', 'em_risco',
              'resultado_relatado', 'consultorias_feitas', 'fat_mes_consultor', 'fat_delta',
              'fat_razao', 'fat_confirmado_igual',
              'sinal_quer_aprender', 'sinal_expansao', 'sinal_produto', 'ja_vende_produto',
              'ja_da_curso', 'e_nabeauty', 'dor_de_conhecimento', 'dor_de_execucao',
              'eixo_capacidade_pagar', 'eixo_complexidade_operacional',
              'eixo_aderencia_dor', 'eixo_maturidade_digital']
    if com_nomes:
        # 'situacao' e o relato livre do consultor: cita nomes proprios com
        # frequencia ("Priscila comecou a...", "Thiago e Meire ainda nao..."),
        # entao acompanha a identificacao em vez de ser sempre exportado.
        campos = ['nome', 'empresa', 'situacao'] + campos
    d = base[[c for c in campos if c in base.columns]].copy()
    linhas = _registros(d)

    # Listas por aluna: permitem recontar dores e frentes sob qualquer filtro.
    from .consultoria import ROTULO_ENGAJAMENTO
    from .oportunidade import LINHAS, QUADRANTES
    marcas = {k: LINHAS[k][1](base).fillna(False).reset_index(drop=True) for k in LINHAS}
    dores_ind, dores_esp = _dores_por_enquadramento(base)
    for i, (_, r) in enumerate(base.iterrows()):
        linhas[i]['dores'] = [c for c in str(r['dores_declaradas_todas'] or '').split('; ') if c]
        linhas[i]['dores_espontaneas'] = dores_esp.get(r['id_aluna'], [])
        linhas[i]['dores_induzidas'] = dores_ind.get(r['id_aluna'], [])
        linhas[i]['frentes'] = [f for f in str(r['frentes_aderentes'] or '').split('; ') if f]
        linhas[i]['temas'] = [t.replace('tema_', '') for t in base.columns
                              if t.startswith('tema_') and bool(r[t])]
        # Linhas de negocio para as quais a aluna qualifica, para o BI recontar
        # os bolsoes sob filtro sem reimplementar as regras no cliente.
        linhas[i]['linhas_nb'] = [k for k, m in marcas.items() if bool(m.iloc[i])]

    dados = {
        'meta': {
            'n_total': len(base),
            'gerado_em': pd.Timestamp.now().strftime('%d/%m/%Y'),
            'fat_mediano': _limpo(base['fat_brl'].median()),
            'definicoes_dor': DEFINICOES,
            'rotulos_dor': ROTULOS_DOR,
            'rotulos_tema': ROTULOS_TEMA,
            'rotulos_frente': FRENTES_ROTULO,
            'frentes_categorias': {k: v for k, v in FRENTES_PRODUTO.items()},
            'temas_latentes': {k: v[0] for k, v in TEMAS_LATENTES.items()},
            'linhas_nb': {k: {'rotulo': v[0], 'regra': v[2]} for k, v in LINHAS.items()},
            'quadrantes': {k: {'rotulo': v[0], 'definicao': v[1]} for k, v in QUADRANTES.items()},
            'rotulos_engajamento': ROTULO_ENGAJAMENTO,
        },
        'alunas': linhas,
        'referencia': {
            'ranking_dores': _registros(rank),
            'divergencia': _registros(div_tab.head(30)),
            'divergencia_resumo': _registros(div_resumo),
            'equipe': _registros(eq_tab),
            'faturamento': _registros(fat_tab),
            'produtividade': _registros(fat_prod),
            'frentes': _registros(cob_frentes),
            'lacunas': _registros(tab_lacunas),
            'portugal': _registros(tab_portugal),
            'paises': _registros(tab_paises),
            'clustering': _registros(rel_cluster),
        },
    }
    for nome, tabela in (extras or {}).items():
        dados['referencia'][nome] = _registros(tabela)
    with open(destino, 'w', encoding='utf-8') as fh:
        json.dump(dados, fh, ensure_ascii=False, separators=(',', ':'))
    return destino


def _dores_por_enquadramento(base):
    """Reclassifica separando pergunta induzida de espontanea, para o BI poder
    alternar entre os paineis sem recarregar dado."""
    from .taxonomia import classificar
    ind, esp = {}, {}
    for _, r in base.iterrows():
        ind[r['id_aluna']] = [c for c, _, _ in classificar(r['texto_dor_induzida'])]
        esp[r['id_aluna']] = [c for c, _, _ in classificar(r['texto_dor_espontanea'])]
    return ind, esp
