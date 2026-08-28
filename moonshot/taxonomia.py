"""Taxonomia de dores: 13 categorias validadas com o cliente na Etapa 0.

Cada categoria tem definicao de uma linha e um padrao de reconhecimento.
O padrao e deliberadamente legivel para poder ser contestado e reescrito
sem mexer no resto do pipeline.
"""
import re

from .texto import norm

# nome -> (definicao, padrao)
TAXONOMIA = {
    'captacao_clientes': (
        'Não entra gente nova suficiente no funil.',
        r'atrair (mais |novos |novas )?client|captacao de client|captar client|trazer (mais )?client|'
        r'conseguir (mais )?client|falta de client|mais client|novos client|novas client|'
        r'aumentar o fluxo de client|pouco movimento|agenda vazia|encher a agenda|agenda cheia|'
        r'aquisicao de client|alcancar mais pessoas|ampliar (a )?client'),
    'conversao_venda': (
        'O interessado chega e não fecha.',
        r'converter|conversao|fechar (a )?venda|fechamento|nao sei vender|dificuldade (em|de|com) vender|'
        r'aprender a vender|funil de venda|taxa de fechamento|objecoe|negociac|argumento de venda|'
        r'transformar (seguidores|lead|curioso)|orcamento(s)? que nao'),
    'precificacao_margem': (
        'Cobra errado e não conhece o próprio lucro.',
        r'precific|preco|ticket medio|cobrar (mais|menos|barato|caro)|acharem cara|acham cara|'
        r'valor do meu (trabalho|servico)|margem|lucratividade|rentabilidade|nao sobra|'
        r'aumentar o ticket|percepcao de valor|desconto'),
    'controle_financeiro': (
        'Sem fluxo de caixa, orçamento ou números organizados.',
        r'fluxo de caixa|controle financeir|organizacao financeir|gestao financeir|financas|'
        r'separar (o |as )?(pessoal|contas)|nao sei meus numero|planejamento financeir|'
        r'saude financeir|capital de giro|contas a (pagar|receber)|dre\b|custos? fixo'),
    'contratar': (
        'Não encontra ou não sabe contratar gente.',
        r'contratar|contratac|recrut|selecao de (pessoa|profissiona)|mao de obra|'
        r'encontrar (bons |boas |profissionai|pessoa)|achar (profissiona|pessoa|gente)|'
        r'falta de (profissiona|mao de obra)|montar (a |uma )?equipe|formar equipe'),
    'reter_liderar': (
        'Contrata e não segura, ou não sabe conduzir o time.',
        r'reter|retencao de (pessoa|colaborador|funcionari|talento)|rotativ|turnover|'
        r'liderar|lideranc|engajar|engajamento|vestir a camisa|gestao de pessoa|comprometimento|'
        r'motivar (a )?equipe|treinar (a )?equipe|desenvolver (pessoa|a equipe|o time)|'
        r'conflito|alinhar (a )?equipe'),
    'sobrecarga_delegacao': (
        'A dona é o gargalo: centraliza tudo e não delega.',
        r'delegar|delegac|sair do operacional|faco tudo|fazer tudo|tudo sozinh|sobrecarg|'
        r'centraliz|acumulo de func|gestao do tempo|falta de tempo|nao tenho tempo|'
        r'me dividir|dar conta de tudo|estou em tudo|depende de mim|sou o gargalo'),
    'processos_padronizacao': (
        'Nada mapeado: a operação mora na cabeça da dona.',
        # 'processo' no singular casa com "estou em processo de" e "processo
        # seletivo" (que e contratacao, nao padronizacao). O plural e as
        # construcoes abaixo isolam o sentido de operacao padronizada.
        r'processos\b|processo (interno|operacional|de trabalho|bem defini|claro|mapead|padroniz)|'
        r'padroniz|mapear (o|os|meus|as) process|mapead|estruturar a operacao|organizar a operacao|'
        r'\bsop\b|manual de|protocolo|rotina(s)? defini|fluxo de trabalho|checklist|'
        r'operacao mais organiz|estruturar (melhor )?(a|o) (empresa|negocio)'),
    'conteudo_instagram': (
        'Não sabe o que postar, não mantém ritmo, trava na câmera.',
        # 'constancia' sozinha vale para qualquer rotina ("constancia na gestao do
        # tempo") e inflava a categoria: so conta perto de conteudo/rede social.
        r'constanci\w*[^.]{0,45}(post|conteudo|rede|instagram|divulga|grava|video|reels)|'
        r'(post|conteudo|rede social|redes sociais|instagram|reels|stories)[^.]{0,45}constanci|'
        r'o que postar|criar conteudo|producao de conteudo|calendario editorial|'
        r'aparecer|gravar (video|reels|stories)|editar (reels|video)|postar|postagem|'
        r'redes sociais|instagram|vergonha de|travo|me expor|frequencia de post'),
    'trafego_pago': (
        'Não roda anúncio, ou roda sem retorno.',
        r'trafego|meta ads|face(book)? ads|google ads|anunci|impulsion|gerenciador de anuncio|'
        r'campanha(s)? paga|midia paga|investir em (ads|anuncio|trafego)|roi de|custo por lead|'
        r'gestor de trafego'),
    'atendimento_agenda': (
        'Agendamento e atendimento manuais: WhatsApp, direct, no-show.',
        r'agendament|agenda(r|mento)|no.?show|falta(m|ram)? no horario|remarcac|desmarc|'
        r'responder (o )?(whatsapp|direct|mensagen)|demora (para|pra) responder|atendimento no whatsapp|'
        r'confirmacao de|fila de espera|recepcao|primeiro contato|tempo de resposta'),
    'fidelizacao_recompra': (
        'O cliente vem uma vez e não volta.',
        r'fideliz|recompra|retencao de client|pos.?venda|pos.?atendimento|'
        r'client(e|es) (nao )?volt|jornada do cliente|programa de fidel|relacionamento com (o )?client|'
        r'experiencia do client|encantar|recorrenci|cliente recorrente'),
    'mentalidade': (
        'Medo, insegurança, procrastinação e crenças que travam a dona.',
        r'mentalidade|medo|inseguranc|autoconfianc|autoestima|sindrome de|procrastin|'
        r'autossabot|auto sabot|crenca(s)? limitante|coragem|acreditar em mim|'
        r'me posicionar como|merecimento|ansiedade|paralis|autoresponsabilidade|autorresponsabilidade'),
}

DEFINICOES = {k: v[0] for k, v in TAXONOMIA.items()}

# Rotulo de exibicao. A chave interna e sem acento para nao quebrar comparacao;
# a leitura humana merece o portugues escrito direito.
ROTULOS_DOR = {
    'captacao_clientes': 'Captação de clientes',
    'conversao_venda': 'Conversão em venda',
    'precificacao_margem': 'Precificação e margem',
    'controle_financeiro': 'Controle financeiro',
    'contratar': 'Contratar',
    'reter_liderar': 'Reter e liderar equipe',
    'sobrecarga_delegacao': 'Sobrecarga e delegação',
    'processos_padronizacao': 'Processos e padronização',
    'conteudo_instagram': 'Conteúdo e Instagram',
    'trafego_pago': 'Tráfego pago',
    'atendimento_agenda': 'Atendimento e agenda',
    'fidelizacao_recompra': 'Fidelização e recompra',
    'mentalidade': 'Mentalidade',
    'pre_operacional': 'Pré-operacional',
}
_COMPILADO = {k: re.compile(v[1]) for k, v in TAXONOMIA.items()}

# --------------------------------------------------------------------------
# Frentes do sistema com IA (objetivo 2) <- categorias de dor que alimentam cada uma.
# Sao as 7 frentes reais do produto, nao uma simplificacao.
# --------------------------------------------------------------------------
FRENTES_PRODUTO = {
    'financeiro': ['controle_financeiro', 'precificacao_margem'],
    'atendimento_automatizado': ['atendimento_agenda', 'fidelizacao_recompra'],
    'trafego': ['trafego_pago', 'conteudo_instagram', 'captacao_clientes'],
    'agente_comercial': ['conversao_venda'],
    'recrutamento': ['contratar'],
    'pessoas_processos': ['reter_liderar', 'processos_padronizacao', 'sobrecarga_delegacao'],
    # Sem categoria de dor alimentando: nenhuma das 13 mede duvida tecnica do
    # nicho. A demanda e estimada a parte, em TEMAS_LATENTES.
    'bot_duvidas': [],
}

FRENTES_ROTULO = {
    'financeiro': 'Controle financeiro',
    'atendimento_automatizado': 'Atendimento automatizado',
    'trafego': 'Tráfego orgânico e pago automatizado',
    'bot_duvidas': 'Bot de dúvidas do nicho',
    'agente_comercial': 'Agente comercial de IA',
    'recrutamento': 'Recrutamento e seleção',
    'pessoas_processos': 'Administração de pessoas e processos',
}

# Temas que aparecem no texto das alunas mas NAO pertencem a taxonomia de 13
# categorias validada. Servem para propor funcionalidades novas, nao para o
# ranking de dores — misturar os dois quebraria a comparabilidade.
ROTULOS_TEMA = {
    'metas_indicadores_decisao': 'Metas, indicadores e decisão',
    'duvida_tecnica_nicho': 'Dúvida técnica do nicho',
    'precificacao_de_procedimento': 'Precificação por procedimento',
}

TEMAS_LATENTES = {
    'metas_indicadores_decisao': (
        'Quer decidir com número na mão: metas, indicadores e visão de longo prazo.',
        r'tomar decis|decisoes? (?:mais )?(?:estrateg|assertiv|segur)|visao estrateg|visao de longo|'
        r'longo prazo|\bkpi|indicador|metas? clara|metas? realista|dados reais|baseada em dados|'
        r'clareza dos (?:meus )?numero|saber meus numero|analise de dados|projec(?:ao|oes)'),
    'duvida_tecnica_nicho': (
        'Dúvida sobre técnica, protocolo, produto ou regra do próprio nicho.',
        r'protocolo|tecnicas? (?:nova|de aplicac|correta)|vigilancia sanitaria|regulamenta|'
        r'legislacao|anvisa|biosseguranca|qual produto|escolher produto|fornecedor|'
        r'capacitacao tecnica|reciclagem tecnica|atualizacao tecnica|nao sei fazer|'
        r'duvidas? tecnica'),
    'precificacao_de_procedimento': (
        'Quer saber quanto cobrar por procedimento específico, com custo real.',
        r'custo do procediment|custo por (?:procediment|servico|sessao)|quanto cobrar|'
        r'tabela de preco|precificar (?:o|os|cada|meus) (?:procediment|servico)'),
}


def _fragmento(texto, ini, fim, janela=90):
    """Devolve o trecho literal em volta do match, cortado em fronteira de frase."""
    a = max(0, ini - janela // 2)
    b = min(len(texto), fim + janela)
    frag = texto[a:b].strip()
    for sep in ['\n', '. ', '; ']:
        if sep in frag:
            partes = [p for p in frag.split(sep) if p.strip()]
            alvo = texto[ini:fim]
            for p in partes:
                if alvo.lower() in p.lower() or norm(alvo) in norm(p):
                    frag = p.strip()
                    break
    return ('...' if a > 0 else '') + frag + ('...' if b < len(texto) else '')


def classificar(texto, max_cats=3):
    """Classifica um texto livre nas categorias da taxonomia.

    Devolve lista de (categoria, n_ocorrencias, evidencia_literal), ordenada por
    forca do sinal e limitada a max_cats. A evidencia e sempre trecho literal do
    que a aluna escreveu, nunca parafrase.
    """
    if texto is None or str(texto).strip() == '':
        return []
    original = str(texto)
    n = norm(original)
    achados = []
    for cat, rx in _COMPILADO.items():
        ms = list(rx.finditer(n))
        if ms:
            achados.append((cat, len(ms), _fragmento(original, ms[0].start(), ms[0].end())))
    achados.sort(key=lambda t: -t[1])
    return achados[:max_cats]
