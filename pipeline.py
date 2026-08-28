#!/usr/bin/env python3
"""
Pipeline de analise de oportunidades — formularios Moonshot.

Refaz a analise inteira do zero a partir de arquivos Excel no mesmo formato dos
originais. Nada aqui depende da conversa que gerou a primeira rodada.

Uso:
    python3 pipeline.py --pro dados/moonshot_pro.xlsx --club dados/moonshot_club.xlsx
    python3 pipeline.py --pro nova_base.xlsx --saida saida/ --usd-brl 5.60 --eur-brl 6.40

Se um dos formularios nao existir, o pipeline roda so com o outro.
Toda regra de conversao, corte e peso esta em CONFIG ou no topo dos modulos, e
e reportada nas abas do relatorio para poder ser contestada.
"""
import argparse
import os
import sys
from datetime import datetime

import numpy as np
import pandas as pd

from moonshot import analise, bi, cluster, produto, score
from moonshot.base import DORES, ESCALAS_PRO, unificar
from moonshot.taxonomia import DEFINICOES, TAXONOMIA
from moonshot.texto import tem_conteudo

CONFIG = {
    # Cambio para converter faturamento declarado em moeda estrangeira. E um
    # PARAMETRO, nao um dado da base: atualize antes de usar o valor em decisao.
    'fx': {'BRL': 1.0, 'USD': 5.40, 'EUR': 6.20},
    # Acima disso o valor quase sempre vem de texto malformado e vai para quarentena.
    'teto_plausivel_brl': 1_000_000,
    'ano_referencia': datetime.now().year,
    # Cortes de faixa de faturamento, ancorados nos quartis observados na base
    # (p25 ~ 7,5k / mediana ~ 17,5k / p75 ~ 40k / p90 ~ 80k) e arredondados.
    'cortes_faturamento': [(5_000, 'ate R$ 5 mil'), (10_000, 'R$ 5-10 mil'),
                           (20_000, 'R$ 10-20 mil'), (40_000, 'R$ 20-40 mil'),
                           (80_000, 'R$ 40-80 mil'), (150_000, 'R$ 80-150 mil'),
                           (float('inf'), 'acima de R$ 150 mil')],
    'n_minimo_clustering': 150,
    'max_categorias_por_resposta': 3,
}


def dicionario_dados(caminhos):
    """Dicionario de dados com taxa de preenchimento x taxa de conteudo analisavel."""
    PII = ('e-mail', 'email', 'nome completo', 'número de contato', 'endereço completo',
           'Instagram', 'nome da sua empresa')
    linhas = []
    for origem, caminho in caminhos.items():
        df = pd.read_excel(caminho, dtype=str)
        n = len(df)
        for i, c in enumerate(df.columns):
            escala = df[c].dropna().astype(str).str.strip().isin(list('12345')).mean() > .9 \
                if df[c].notna().any() else False
            conteudo = df[c].map(tem_conteudo).sum() if not escala else df[c].notna().sum()
            vals = df[c].dropna().astype(str).str.strip()
            ex = '[dado pessoal — omitido]' if any(p.lower() in c.lower() for p in PII) \
                else ' || '.join(v[:60] for v in vals.drop_duplicates().head(3))
            linhas.append({'formulario': origem, 'posicao': i, 'coluna': c,
                           'tipo': 'escala 1-5' if escala else
                                   ('aberta' if vals.str.len().mean() > 25 else 'curta/categorica'),
                           'n': n, 'preenchido_pct': round(100 * df[c].notna().sum() / n, 1),
                           'com_conteudo_n': int(conteudo),
                           'com_conteudo_pct': round(100 * conteudo / n, 1),
                           'valores_distintos': int(vals.nunique()), 'exemplos': ex})
    return pd.DataFrame(linhas)


def aba_taxonomia():
    return pd.DataFrame([{'categoria': k, 'definicao': v[0], 'padrao_de_reconhecimento': v[1]}
                         for k, v in TAXONOMIA.items()])


def aba_regras(cortes_inferencia):
    regras = [
        ('faturamento', 'valor unico', 'numero explicito no texto; "mil"/"k" multiplicam por 1000'),
        ('faturamento', 'ponto medio da faixa', '"45 mil a 55 mil" -> 50000; media dos numeros citados'),
        ('faturamento', 'soma de unidades', 'texto cita matriz/filial/unidade -> soma os valores'),
        ('faturamento', 'anual/12', 'texto marca "anual"/"por ano" -> divide por 12'),
        ('faturamento', 'milhar inferido', 'numero nu < 500 em BRL tratado como milhares; '
                                           'a leitura literal (R$60/mes) e implausivel'),
        ('faturamento', 'moeda', 'EUR/USD convertidos por taxa fixa de CONFIG["fx"]; "R$" nao e USD'),
        ('faturamento', 'quarentena', 'valor > teto_plausivel marcado implausivel_revisar e '
                                      'excluido das estatisticas, com texto original preservado'),
        ('faturamento', 'pre-operacional', '"ainda nao faturo" e estagio declarado, nao dado faltante'),
        ('equipe', 'declara trabalhar sozinha', 'texto casa "sozinha/so eu/nenhum" sem numero > 0 -> 0'),
        ('equipe', 'numero isolado', 'a resposta inteira e um numero'),
        ('equipe', 'total declarado', 'numero colado a "funcionarios/pessoas/colaboradores", ou "somos N"'),
        ('equipe', 'primeiro numero como total', '"17. 15 manicures, 1 recepcao, 1 limpeza" -> 17'),
        ('equipe', 'soma de cargos', 'soma numeros seguidos de cargo quando nao ha total declarado'),
        ('equipe', 'equipe_total', 'funcionarios + a dona (ou o total declarado, se ja a inclui)'),
        ('nicho', 'grupo', 'regex sobre o setor declarado: beleza / saude-clinica / outro / cargo'),
        ('maturidade', 'sinais', 'busca sistema de gestao, CRM, trafego pago e IA nas colunas de '
                                 'tecnologia, processo de vendas, canais e Instagram'),
    ]
    df = pd.DataFrame(regras, columns=['campo', 'regra', 'descricao'])
    return pd.concat([df, cortes_inferencia.assign(
        campo='inferencia', regra=lambda x: x['corte'],
        descricao=lambda x: 'corte calculado da propria distribuicao da base')
        [['campo', 'regra', 'descricao', 'valor']]], ignore_index=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--pro', default='dados/moonshot_pro.xlsx')
    ap.add_argument('--club', default='dados/moonshot_club.xlsx')
    ap.add_argument('--saida', default='.')
    ap.add_argument('--usd-brl', type=float, default=CONFIG['fx']['USD'])
    ap.add_argument('--eur-brl', type=float, default=CONFIG['fx']['EUR'])
    ap.add_argument('--sem-nomes', action='store_true',
                    help='omite nome/email/telefone das abas (versao para circular)')
    ap.add_argument('--nichos', default='beleza/estetica,saude/clinica',
                    help="grupos de nicho a manter, separados por virgula. "
                         "'todos' desliga o filtro. Padrao: beleza/estetica,saude/clinica")
    args = ap.parse_args()

    CONFIG['fx']['USD'], CONFIG['fx']['EUR'] = args.usd_brl, args.eur_brl
    caminhos = {o: c for o, c in [('PRO', args.pro), ('CLUB', args.club)] if c and os.path.exists(c)}
    if not caminhos:
        sys.exit('Nenhum arquivo de entrada encontrado.')
    os.makedirs(args.saida, exist_ok=True)
    print(f'Formularios: {", ".join(f"{o} ({c})" for o, c in caminhos.items())}')

    # ---- base ------------------------------------------------------------
    base, log_dedup = unificar(caminhos, CONFIG['ano_referencia'], CONFIG['fx'],
                               CONFIG['teto_plausivel_brl'])
    print(f'Base unificada: {len(base)} respondentes unicos '
          f'({len(log_dedup[log_dedup.acao.str.startswith("removida")])} duplicatas removidas)')

    # Filtro de nicho. Aplicado ANTES de qualquer analise para que todo percentual
    # tenha como denominador a base filtrada, e nao a base inteira.
    fora = base.loc[~base['nicho_grupo'].isin([n.strip() for n in args.nichos.split(',')]),
                    ['id_aluna', 'origem', 'setor', 'produtos', 'nicho_grupo']]
    if args.nichos.strip().lower() != 'todos':
        base = base[base['nicho_grupo'].isin([n.strip() for n in args.nichos.split(',')])] \
            .reset_index(drop=True)
        print(f'Filtro de nicho ({args.nichos}): {len(base)} mantidas, {len(fora)} excluidas')
        print('  ' + ' | '.join(f'{k}={v}' for k, v in
                                base['nicho_grupo'].value_counts().items()))
    else:
        fora = fora.iloc[:0]

    # ---- Etapa 1 ---------------------------------------------------------
    base, evid = analise.classificar_base(base, CONFIG['max_categorias_por_resposta'])
    rank = analise.ranking_dores(base, evid)
    base, cortes_inf = analise.inferir_dores(base)
    div_tab, div_resumo = analise.divergencia(base)

    # ---- Etapas 2 e 3 ----------------------------------------------------
    base['faixa_faturamento'] = analise.faixas_faturamento(base, CONFIG['cortes_faturamento'])
    base['porte_equipe'] = base['equipe_n'].map(analise.faixa_porte)
    eq_tab, eq_cruz = analise.tabela_equipe(base)
    fat_tab, fat_stats, fat_prod = analise.tabela_faturamento(base, CONFIG['cortes_faturamento'])

    # ---- Etapas 4 e 5 ----------------------------------------------------
    base = produto.marcar_temas_latentes(base)
    base = score.calcular_score(base)
    diag = score.diagnostico_individual(base, usar_nome=not args.sem_nomes)

    # ---- frentes do produto e recorte geografico -------------------------
    cob_frentes = produto.cobertura_frentes(base)
    tab_lacunas = produto.lacunas(base)
    tab_portugal = produto.recorte_pais(base, 'Portugal')
    tab_paises = produto.maturidade_por_pais(base)

    # ---- Etapa 6 ---------------------------------------------------------
    rel_cluster, perfis, rotulos = cluster.avaliar(base, CONFIG['n_minimo_clustering'])
    if rotulos is not None:
        base = base.merge(rotulos, on='id_aluna', how='left')

    # ---- montagem das abas ----------------------------------------------
    ident = [] if args.sem_nomes else ['nome', 'email', 'telefone']
    cols_base = (['id_aluna', 'origem'] + ident + [
        'empresa', 'setor', 'nicho_grupo', 'nicho_fonte', 'vende_para_o_setor',
        'localizacao', 'pais', 'atua_fora_br',
        'faturamento', 'fat_valor_moeda_orig', 'fat_moeda', 'fat_brl', 'fat_regra',
        'fat_confianca', 'faixa_faturamento',
        'equipe', 'equipe_n', 'equipe_total', 'porte_equipe', 'equipe_regra',
        'equipe_confianca', 'multi_unidade', 'fat_por_pessoa',
        'ano_fundacao', 'anos_operacao', 'processos_mapeados', 'tem_orcamento_anual',
        'usa_sistema_gestao', 'usa_crm', 'faz_trafego', 'usa_ia_automacao', 'so_planilha_papel',
        'n_campos_dor_com_conteudo',
        'dor_declarada_1', 'evidencia_1', 'dor_declarada_2', 'evidencia_2',
        'dor_declarada_3', 'evidencia_3', 'dores_declaradas_todas',
        'dor_inferida_1', 'justificativa_inferencia', 'campos_que_sustentam',
        'dores_inferidas_todas',
        'eixo_capacidade_pagar', 'eixo_complexidade_operacional', 'eixo_aderencia_dor',
        'eixo_maturidade_digital', 'eixos_com_dado', 'score_oportunidade', 'classe',
        'frentes_aderentes', 'produto_ancora', 'motivo_sem_score']
        + [f'tema_{t}' for t in ['metas_indicadores_decisao', 'duvida_tecnica_nicho',
                                 'precificacao_de_procedimento']]
        + list(ESCALAS_PRO) + (['cluster'] if rotulos is not None else []))
    cols_base = [c for c in cols_base if c in base.columns]

    ranking_final = base[[c for c in ['id_aluna'] + ident +
                          ['empresa', 'origem', 'nicho_grupo', 'pais', 'score_oportunidade', 'classe',
                           'produto_ancora', 'frentes_aderentes', 'fat_brl', 'equipe_total',
                           'eixo_capacidade_pagar', 'eixo_complexidade_operacional',
                           'eixo_aderencia_dor', 'eixo_maturidade_digital',
                           'dor_declarada_1', 'dor_inferida_1', 'justificativa_inferencia',
                           'eixos_com_dado', 'motivo_sem_score'] if c in base.columns]] \
        .sort_values('score_oportunidade', ascending=False, na_position='last')
    ranking_final.insert(0, 'posicao', range(1, len(ranking_final) + 1))
    ranking_final['motivo_em_uma_linha'] = [
        (f'{c}: fatura R$ {f:,.0f}/mes com {e:.0f} pessoa(s); porta de entrada = {p}'
         if pd.notna(s) and pd.notna(f) and pd.notna(e) else
         (m or 'dados insuficientes'))
        for c, f, e, p, s, m in zip(ranking_final['classe'], ranking_final['fat_brl'],
                                    ranking_final['equipe_total'], ranking_final['produto_ancora'],
                                    ranking_final['score_oportunidade'],
                                    ranking_final['motivo_sem_score'])]

    abas = {
        'Base_Tratada': base[cols_base],
        'Dicionario_Dados': dicionario_dados(caminhos),
        'Dores_Declaradas': rank,
        'Dores_Inferidas': base[['id_aluna', 'origem', 'dor_inferida_1',
                                 'justificativa_inferencia', 'campos_que_sustentam',
                                 'dores_inferidas_todas', 'n_regras_disparadas',
                                 'fat_brl', 'equipe_total', 'fat_por_pessoa', 'anos_operacao']]
                            .sort_values('dor_inferida_1'),
        'Divergencia': div_tab,
        'Equipe': eq_tab,
        'Faturamento': fat_tab,
        'Diagnostico_Individual': diag,
        'Scoring_Oportunidade': ranking_final,
        # abas de apoio: metodo e evidencia, para a analise poder ser contestada
        'Taxonomia': aba_taxonomia(),
        'Regras_Tratamento': aba_regras(cortes_inf),
        'Evidencias_Dores': evid,
        'Equipe_x_Faturamento': eq_cruz,
        'Faturamento_Estatisticas': fat_stats,
        'Produtividade_por_Porte': fat_prod,
        'Divergencia_Resumo': div_resumo,
        'Clustering': rel_cluster,
        'Frentes_Produto': cob_frentes,
        'Lacunas_Funcionalidade': tab_lacunas,
        'Portugal': tab_portugal,
        'Maturidade_por_Pais': tab_paises,
        'Log_Deduplicacao': log_dedup,
        'Excluidas_Por_Nicho': fora,
    }
    if perfis is not None:
        abas['Clustering_Perfis'] = perfis

    destino = os.path.join(args.saida, 'relatorio_oportunidades.xlsx')
    with pd.ExcelWriter(destino, engine='xlsxwriter') as xl:
        for nome, df in abas.items():
            df.to_excel(xl, sheet_name=nome[:31], index=False)
            ws = xl.sheets[nome[:31]]
            ws.freeze_panes(1, 0)
            for i, c in enumerate(df.columns):
                q = df[c].astype(str).str.len().quantile(.9)
                largura = min(52, max(12, int(q) + 2 if pd.notna(q) else 14))
                ws.set_column(i, i, largura)
    print(f'-> {destino} ({len(abas)} abas)')

    json_bi = bi.exportar(base, rank, div_tab, div_resumo, eq_tab, fat_tab, fat_prod,
                          cob_frentes, tab_lacunas, tab_portugal, tab_paises, rel_cluster,
                          os.path.join(args.saida, 'bi_dados.json'),
                          com_nomes=not args.sem_nomes)
    print(f'-> {json_bi} ({os.path.getsize(json_bi)//1024} KB)')

    modelo = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bi_template.html')
    if os.path.exists(modelo):
        with open(modelo, encoding='utf-8') as fh:
            html = fh.read()
        with open(json_bi, encoding='utf-8') as fh:
            html = html.replace('/*__DADOS__*/', fh.read())
        pagina = os.path.join(args.saida, 'bi_moonshot.html')
        with open(pagina, 'w', encoding='utf-8') as fh:
            fh.write(html)
        print(f'-> {pagina} ({os.path.getsize(pagina)//1024} KB)')
    return base, evid, rank, div_tab, div_resumo, eq_tab, fat_tab, fat_stats, \
        fat_prod, diag, ranking_final, rel_cluster, eq_cruz, cortes_inf, log_dedup, \
        cob_frentes, tab_lacunas, tab_portugal, tab_paises


if __name__ == '__main__':
    main()
