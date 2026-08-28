"""Leitura dos formularios e construcao da base unificada."""
import re

import pandas as pd

from .texto import (norm, tem_conteudo, parse_faturamento, parse_equipe,
                    parse_ano_fundacao, MULTI_UNIDADE)

# --------------------------------------------------------------------------
# Mapa de colunas por formulario. Os dois questionarios sao diferentes: so as
# colunas listadas em COMUM tem equivalencia semantica entre eles.
# --------------------------------------------------------------------------
COMUM = {
    'PRO': {
        'nome': 'Qual o seu nome completo?',
        'email': 'Endereço de e-mail',
        'telefone': 'Qual o seu número de contato?',
        'data': 'Carimbo de data/hora',
        'empresa': 'Qual o nome da sua empresa?',
        'setor': 'Qual o seu setor de atuação?',
        'localizacao': 'Qual a sua localização e local de atuação?',
        'equipe': 'Quantos funcionários você tem hoje? Em quais áreas eles atuam?',
        'faturamento': 'Qual os seu faturamento médio mensal?',
        'custo': 'Qual é o custo/despesa mensal da empresa?',
        'ano_fundacao': 'Em que ano a sua empresa foi fundada?',
        'produtos': 'Quais produtos/serviços vocês oferecem?',
        'processos': 'Os processos da sua empresa estão bem definidos e mapeados?',
        'publico': 'Quem é o seu público alvo?',
        'instagram': 'Qual é o seu Instagram? Você já tem resultados com essa rede social?',
        'canais': 'Quais outros canais de marketing você utiliza atualmente (online e offline) e quais têm gerado mais resultados?',
        'proc_vendas': 'Qual é o processo de vendas atual, desde a prospecção até o fechamento, e quais ferramentas são utilizadas?',
        'tecnologia': 'Quais tecnologias e sistemas são utilizados na operação diária?',
        'orcamento': 'Existe um orçamento anual definido ou planejado?',
    },
    'CLUB': {
        'nome': 'Qual o seu nome completo?',
        'email': 'Endereço de e-mail',
        'telefone': 'Qual o seu número de contato?',
        'data': 'Carimbo de data/hora',
        'empresa': 'Qual o nome da sua empresa?',
        'setor': 'Qual o nicho da sua empresa?',
        'localizacao': 'Qual a sua localização e local de atuação?',
        'equipe': 'Quantos funcionários você tem hoje? Em quais áreas eles atuam?',
        'faturamento': 'Qual é o seu faturamento médio mensal?',
        'custo': 'Qual é o custo/despesa mensal da empresa?',
        'ano_fundacao': None,
        'produtos': 'Quais produtos/serviços vocês oferecem?',
        'processos': 'Os processos da sua empresa estão bem definidos e mapeados?',
        'publico': 'Quem é o seu público alvo?',
        'instagram': 'Qual é o seu Instagram? Você já tem resultados com essa rede social?',
        'canais': 'Quais outros canais de marketing você utiliza atualmente (online e offline) e quais têm gerado mais resultados?',
        'proc_vendas': 'Qual é o processo de vendas atual, desde a prospecção até o fechamento, e quais ferramentas são utilizadas?',
        'tecnologia': None,
        'orcamento': None,
    },
}

# Colunas de dor, separadas por enquadramento da pergunta.
# 'induzida'  = a pergunta ja nomeia o tema (pilares Flow do formulario Pro);
# 'espontanea'= a pergunta pede o desafio sem sugerir qual.
DORES = {
    'PRO': {
        'induzida': [
            'O que você gostaria de melhorar no pilar Flow Mind, isto é, na sua mentalidade empreendedora?',
            'O que você gostaria de melhorar no pilar Flow Business, isto é, na estratégia e gestão do seu negócio?',
            'O que você gostaria de melhorar no pilar Flow Growth, isto é, na suas ações de marketing e atração de novos clientes?',
            'O que você gostaria de melhorar no pilar Flow Sales, isto é, na suas ações de vendas?',
            'O que você gostaria de melhorar no pilar Flow Experience, isto é, na forma como você encanta e fideliza os seus clientes?',
        ],
        'espontanea': [
            'Quais são os meus maiores desafios operacionais?',
            'Quais são os meus maiores desafios de gestão e liderança?',
            'Quais são as principais dificuldades enfrentadas para atrair, reter, gerir e desenvolver pessoas?',
        ],
    },
    'CLUB': {
        'induzida': [
            'Quais são os maiores problemas e dificuldades na gestão do seu negocio? (considere financeiro e funcionários.)',
            'Quais são os maiores problemas e dificuldades para atrair clientes? ',
            'Quais os maiores problemas e dificuldades você tem no seu Instagram?',
            'Quais os maiores problemas e dificuldades você tem com vendas?',
        ],
        'espontanea': [
            'Quais são os meus maiores desafios operacionais?',
            'Quais são os meus maiores desafios de gestão e liderança?',
            'Quais são as principais dificuldades enfrentadas para contratar e manter funcionários? ',
            'Na sua visão, quais são as 3 maiores dores dentro da sua empresa? ',
        ],
    },
}

ESCALAS_PRO = {
    'esc_habitos': 'Eu já tenho os hábitos necessários para ser uma empreendedora de sucesso.',
    'esc_mentalidade': 'Eu já tenho a mentalidade necessária para ser uma empreendedora de sucesso.',
    'esc_metas': 'Eu tenho clareza das minhas metas e objetivos.',
    'esc_valores': 'Eu tenho clareza dos meus valores.',
    'esc_nao_procrastino': 'Eu não procrastino.',
    'esc_autorresponsavel': 'Eu sou autorresponsável.',
    'esc_diferenciais': 'Eu tenho clareza dos meus diferenciais.',
    'esc_experiencia': 'Eu entrego uma experiência única e diferenciada para o meu cliente.',
    'esc_satisfacao': 'Meu cliente está satisfeito com o meu produto / serviço.',
    'esc_depoimentos': 'Eu recebo bons depoimentos.',
    'esc_indicacao': 'Eu recebo clientes por indicação.',
    'esc_recompra': 'Meus clientes costumam comprar mais de mim.',
    'esc_inovacao': 'Eu inovo constantemente nos meus produtos e serviços.',
}

# --------------------------------------------------------------------------
# Classificacoes auxiliares
# --------------------------------------------------------------------------
RX_BELEZA = (r'belez|belleza|beauty|estetic|estetic|salao|cabele|cabelo|barbe|sobrance|cilio|pestana|'
             r'lash|brow|nail|unha|manicure|pedicur|esmalt|micropigment|maquiag|makeup|make up|'
             r'depila|\bspa\b|podolog|cosmet|tricolog|capilar|bronze|penteado|mega hair|mechas|'
             r'harmonizacao|\bhof\b|botox|preenchimento|bioestimulador|rejuvenesc|limpeza de pele|'
             r'drenagem|massage|massoterap|criomodelagem|criolipo|piercing|autocuidado|'
             r'remocao de tatuagem|despigmenta|lipo ?enzimatica|peeling|laser')
RX_SAUDE = (r'medicin|\bmedic|odonto|dentist|nutri|fisiotera|psicolog|enferm|clinic|dermato|saude|'
            r'farmac|veterin|biomedic|terapeut|quiroprax|gastroenterolog|endocrinolog|'
            r'ginecolog|obstetr|pediatr|fonoaudiolog|acupuntur|implante|protese')
# Quem vende PARA o setor (macas, tesouras, cosmeticos no atacado) tem operacao
# diferente de quem atende cliente final. Vira FLAG, nao grupo: salao que tambem
# revende produto continua sendo salao, e uma regra de grupo o classificaria errado.
RX_FORNECEDOR = (r'importo|importac|distribuidora|distribuicao|atacado|revenda|fabrica|'
                 r'fornecedor|tesouras e navalhas|macas ergonomicas|venda e distribuicao')

RX_FORA_BR = (r'portugal|lisboa|porto\b|espanh|espana|madrid|barcelona|\beua\b|\busa\b|estados unidos|'
              r'florida|orlando|boston|miami|new york|italia|japao|angola|suica|irlanda|dublin|'
              r'londres|\buk\b|inglaterra|canada|australia|franca|paris|mexico|argentina|paraguai|'
              r'dubai|alemanha|holanda|belgica|luxemburgo|chile|colombia|peru|bolivia')

RX_MATURIDADE = {
    'usa_sistema_gestao': r'trinks|belle\b|avec\b|salaovip|simples ?dental|iclinic|clinicorp|ninsaude|'
                          r'booksy|appbarber|vega|sistema de gestao|erp\b|bling|omie|conta azul|'
                          r'software de gestao|agenda online|agendamento online',
    'usa_crm': r'\bcrm\b|rd station|kommo|pipedrive|hubspot|active ?campaign|funil de vendas no',
    'faz_trafego': r'trafego pago|meta ads|facebook ads|google ads|gerenciador de anuncio|'
                   r'gestor de trafego|anuncio pago|campanha paga|impulsion',
    'usa_ia_automacao': r'chat ?gpt|inteligencia artificial|\bia\b|manychat|automacao|\bbot\b|n8n|zapier',
    'so_planilha_papel': r'planilha|excel|caderno|papel|agenda de papel|anotacao manual|bloco de nota',
}


def _grupo_nicho(setor, produtos, empresa):
    """Classifica o nicho olhando setor, produtos/servicos e nome da empresa.

    Olhar so o campo de setor descarta quem respondeu o cargo ("proprietaria",
    "faco tudo") ou escreveu algo atipico ("Cabelos", "Beauty") mesmo quando os
    produtos declarados sao inequivocamente de beleza. Devolve (grupo, fonte).
    """
    campos = [('setor', setor), ('produtos', produtos), ('empresa', empresa)]
    disponiveis = [(f, norm(v)) for f, v in campos if tem_conteudo(v)]
    if not disponiveis:
        return 'nao informado', None
    junto = ' | '.join(t for _, t in disponiveis)

    for rx, grupo in ((RX_BELEZA, 'beleza/estetica'), (RX_SAUDE, 'saude/clinica')):
        fontes = [f for f, t in disponiveis if re.search(rx, t)]
        if fontes:
            return grupo, '+'.join(fontes)
    return 'fora do escopo', None


def _sim_nao(valor):
    """Le respostas do tipo 'Os processos estao mapeados?' -> sim / parcial / nao."""
    if valor is None or str(valor).strip() == '':
        return None
    n = norm(valor)
    if re.search(r'^(nao|nada|nenhum|ainda nao|nao estao|nao existe|nao temos|nao tenho|no\b)', n):
        return 'nao'
    if re.search(r'mais ou menos|parcial|em parte|alguns|nem todos|estao sendo|em construcao|'
                 r'comecando|em processo|nao totalmente|nao completamente', n):
        return 'parcial'
    if re.search(r'^(sim|si\b|acredito que sim|estao|temos|tenho|yes)', n):
        return 'sim'
    return 'parcial' if len(n) > 40 else 'nao'


def carregar(caminho, origem, ano_ref, fx, teto_plausivel):
    """Le um formulario e devolve o DataFrame no schema unificado."""
    bruto = pd.read_excel(caminho, dtype=str)
    mapa = COMUM[origem]
    out = pd.DataFrame(index=bruto.index)
    out['origem'] = origem

    for destino, coluna in mapa.items():
        out[destino] = bruto[coluna] if coluna and coluna in bruto.columns else None

    # --- faturamento -------------------------------------------------------
    fat = out['faturamento'].map(lambda v: parse_faturamento(v, teto_plausivel))
    out['fat_valor_moeda_orig'] = [t[0] for t in fat]
    out['fat_moeda'] = [t[1] for t in fat]
    out['fat_regra'] = [t[2] for t in fat]
    out['fat_confianca'] = [t[3] for t in fat]
    out['fat_brl'] = [
        (v * fx.get(m, 1.0)) if v is not None and c in ('alta', 'media', 'inferida_milhar') else None
        for v, m, c in zip(out['fat_valor_moeda_orig'], out['fat_moeda'], out['fat_confianca'])
    ]

    # --- equipe ------------------------------------------------------------
    eq = out['equipe'].map(parse_equipe)
    out['equipe_n'] = [t[0] for t in eq]
    out['equipe_inclui_dona'] = [t[1] for t in eq]
    out['equipe_regra'] = [t[2] for t in eq]
    out['equipe_confianca'] = [t[3] for t in eq]
    out['multi_unidade'] = out['equipe'].fillna('').map(
        lambda v: bool(re.search(MULTI_UNIDADE, norm(v))))

    # --- tempo de operacao -------------------------------------------------
    ano = out['ano_fundacao'].map(lambda v: parse_ano_fundacao(v, ano_ref))
    out['ano_fundacao_num'] = [t[0] for t in ano]
    out['anos_operacao'] = [t[1] for t in ano]

    # --- classificacoes ----------------------------------------------------
    nicho = [_grupo_nicho(s, p, e) for s, p, e in
             zip(out['setor'], out['produtos'], out['empresa'])]
    out['nicho_grupo'] = [t[0] for t in nicho]
    out['nicho_fonte'] = [t[1] for t in nicho]
    out['vende_para_o_setor'] = out[['setor', 'produtos', 'empresa']].fillna('') \
        .agg(' '.join, axis=1).map(norm).str.contains(RX_FORNECEDOR, regex=True)
    out['atua_fora_br'] = out['localizacao'].fillna('').map(
        lambda v: bool(re.search(RX_FORA_BR, norm(v))))
    out['processos_mapeados'] = out['processos'].map(_sim_nao)
    out['tem_orcamento_anual'] = out['orcamento'].map(_sim_nao)

    # --- maturidade digital ------------------------------------------------
    # Procura os sinais em todas as colunas onde a aluna poderia te-los citado.
    fontes = ['tecnologia', 'proc_vendas', 'canais', 'instagram']
    blob = out[fontes].fillna('').agg(' '.join, axis=1).map(norm)
    for flag, rx in RX_MATURIDADE.items():
        out[flag] = blob.str.contains(rx, regex=True)
    # Registra se a aluna teve alguma coluna-fonte com conteudo: 'nao declarou'
    # e diferente de 'declarou que nao usa nada'.
    out['tem_fonte_maturidade'] = out[fontes].map(tem_conteudo).any(axis=1)

    # --- escalas 1-5 (so existem no Pro) -----------------------------------
    for destino, coluna in ESCALAS_PRO.items():
        out[destino] = pd.to_numeric(bruto[coluna], errors='coerce') if coluna in bruto.columns else None

    # --- textos de dor, preservados literalmente ---------------------------
    for enq in ('induzida', 'espontanea'):
        cols = [c for c in DORES[origem][enq] if c in bruto.columns]
        out[f'texto_dor_{enq}'] = bruto[cols].fillna('').agg('\n'.join, axis=1).str.strip()

    out['n_campos_dor_com_conteudo'] = sum(
        bruto[c].map(tem_conteudo).astype(int)
        for enq in ('induzida', 'espontanea') for c in DORES[origem][enq] if c in bruto.columns)
    return out


def unificar(caminhos, ano_ref, fx, teto_plausivel):
    """Le todos os formularios, concatena, deduplica e devolve (base, log_dedup)."""
    partes = [carregar(c, o, ano_ref, fx, teto_plausivel) for o, c in caminhos.items()]
    base = pd.concat(partes, ignore_index=True)

    base['_chave'] = base['email'].map(norm)
    sem_email = base['_chave'].isin(['', 'nan'])
    base.loc[sem_email, '_chave'] = base.loc[sem_email, 'nome'].map(norm)

    base['data_dt'] = pd.to_datetime(base['data'], errors='coerce')
    # Ordena por completude e depois por recencia: fica a resposta mais informativa.
    base['_completude'] = base[['fat_brl', 'equipe_n']].notna().sum(axis=1) + \
        base['n_campos_dor_com_conteudo'] / 100
    base = base.sort_values(['_chave', '_completude', 'data_dt'], ascending=[True, False, False])

    dup = base['_chave'].duplicated(keep='first')
    repetidas = base['_chave'].duplicated(keep=False)
    log = base.loc[repetidas, ['_chave', 'origem', 'data', 'nome',
                               'n_campos_dor_com_conteudo']].copy()
    log['acao'] = dup[repetidas].map({True: 'removida (duplicata)', False: 'mantida'})

    base = base[~dup].copy()
    base = base.sort_values(['origem', 'data_dt']).reset_index(drop=True)
    base.insert(0, 'id_aluna', [f'A{i:04d}' for i in range(1, len(base) + 1)])
    return base.drop(columns=['_chave', '_completude']), log.reset_index(drop=True)
