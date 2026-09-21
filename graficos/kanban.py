"""Desenha os kanbans dos funis do Uno CRM.

Mesma paleta do Radar Moonshot, para o material parecer da mesma casa. Cada
funil vira uma imagem: colunas sao etapas, e o cartao abaixo do titulo diz o
criterio de avanco — o time de implementacao precisa do criterio, nao so do
nome da etapa.
"""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import textwrap, os

TINTA   = '#2a1a22'
TINTA_2 = '#6b5560'
FUNDO   = '#fffafb'
LINHA   = '#f0dfe5'

# Uma cor por setor. Os tres tons sao separaveis por quem tem daltonismo.
COR = {'CS': '#c2185b', 'Consultor': '#1565c0', 'Comercial': '#0b8a5a',
       'Retencao': '#d98324', 'Renovacao': '#7b3fa0', 'Geral': '#6b5560'}

SAIDA = 'entregaveis/funis'


def cartao(ax, x, y, w, h, cor, titulo, corpo, num=None, novo=False, destaque=False):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle='round,pad=0.008,rounding_size=0.02',
                                linewidth=1.6, edgecolor=cor,
                                facecolor='#ffffff' if not destaque else '#fdf2f6', zorder=2))
    rot = f'{num}. {titulo}' if num else titulo
    linhas_t = textwrap.wrap(rot, 22)
    # A faixa cresce com o titulo. Altura fixa cortava rotulo de duas linhas.
    faixa = 0.048 + 0.030 * (len(linhas_t) - 1)
    ax.add_patch(FancyBboxPatch((x, y + h - faixa), w, faixa,
                                boxstyle='round,pad=0.002,rounding_size=0.015',
                                linewidth=0, facecolor=cor, zorder=3))
    ax.text(x + w / 2, y + h - faixa / 2, '\n'.join(linhas_t),
            ha='center', va='center', fontsize=8.2, color='#ffffff',
            fontweight='bold', zorder=4, linespacing=1.25)
    ax.text(x + w / 2, y + (h - faixa) / 2 - 0.005,
            '\n'.join(textwrap.wrap(corpo, 26)), ha='center', va='center',
            fontsize=7.1, color=TINTA_2, zorder=4)
    if novo:
        ax.text(x + w - 0.012, y + 0.012, 'NOVO', ha='right', va='bottom',
                fontsize=6.2, color=cor, fontweight='bold', zorder=4)


def seta(ax, x1, y, x2, cor='#c9b2bb'):
    ax.add_patch(FancyArrowPatch((x1, y), (x2, y), arrowstyle='-|>', mutation_scale=11,
                                 linewidth=1.2, color=cor, zorder=1))


def tela(larg=15, alt=4.4):
    fig, ax = plt.subplots(figsize=(larg, alt))
    fig.patch.set_facecolor(FUNDO); ax.set_facecolor(FUNDO)
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis('off')
    return fig, ax


def titulo(ax, t, sub, cor):
    ax.text(0.012, 0.955, t, fontsize=15, fontweight='bold', color=cor, va='top')
    ax.text(0.012, 0.855, sub, fontsize=8.6, color=TINTA_2, va='top')


def kanban(nome_arq, t, sub, cor, etapas, nota=None):
    n = len(etapas)
    fig, ax = tela(alt=4.4 if not nota else 4.9)
    titulo(ax, t, sub, cor)
    m, vao = 0.012, 0.012
    w = (1 - 2 * m - vao * (n - 1)) / n
    y, h = (0.30 if nota else 0.22), 0.44
    for i, e in enumerate(etapas):
        x = m + i * (w + vao)
        cartao(ax, x, y, w, h, cor, e['t'], e['c'], num=i + 1,
               novo=e.get('novo'), destaque=e.get('fim'))
        if i < n - 1:
            seta(ax, x + w + 0.001, y + h / 2, x + w + vao - 0.001)
    if nota:
        ax.text(0.012, 0.16, nota, fontsize=7.8, color=TINTA_2, va='top', wrap=True)
    fig.savefig(os.path.join(SAIDA, nome_arq), dpi=170, bbox_inches='tight',
                facecolor=FUNDO)
    plt.close(fig)
    print('->', nome_arq)


kanban('1_cs_onboarding.png',
       'Funil 1 — CS · Onboarding e Ativação',
       'Nasce de: Alunos Matriculados + Kit e Eventos   ·   Entra: matrícula confirmada   ·   Sai: aluna ativada → Funil 2',
       COR['CS'], [
  {'t':'Matrícula confirmada','c':'Contrato assinado e pagamento ok'},
  {'t':'Primeiro contato','c':'CS falou com a aluna','novo':True},
  {'t':'Onboarding agendado','c':'Data marcada'},
  {'t':'Onboarding realizado','c':'Reunião aconteceu'},
  {'t':'Acesso liberado','c':'Plataforma liberada'},
  {'t':'Grupo de avisos','c':'Adicionada ao grupo'},
  {'t':'Kit enviado','c':'Pijama ou jaqueta despachado'},
  {'t':'Ativada','c':'Etapas 4, 5 e 6 concluídas','fim':True}],
  'Automações:  etapa 1 parada 3 dias → alerta ao CS   ·   etapa 3 ou 4 parada 7 dias → alerta ao CS e à coordenadoria   ·   '
  'ao entrar em Ativada → cria card no Funil 2 automaticamente')

kanban('2_consultor_ciclo.png',
       'Funil 2 — Consultor · Ciclo de Consultoria',
       'Nasce de: Controle Consultorias (colunas ENTRADA e 1ª a 5ª CONSULT.)   ·   Sai: ciclo concluído → Funil 5',
       COR['Consultor'], [
  {'t':'Carteira atribuída','c':'Aluna alocada ao consultor'},
  {'t':'Entrada / diagnóstico','c':'Primeira conversa'},
  {'t':'1ª consultoria','c':'Realizada'},
  {'t':'Plano de ação entregue','c':'PA enviado à aluna','novo':True},
  {'t':'2ª consultoria','c':'Realizada'},
  {'t':'3ª consultoria','c':'Realizada'},
  {'t':'4ª consultoria','c':'Realizada'},
  {'t':'5ª / fechamento','c':'Realizada'},
  {'t':'Ciclo concluído','c':'5 consultorias feitas','fim':True}],
  'Campo obrigatório em toda etapa — Saúde da aluna:  Engajada · Oscilante · Sem contato · Risco de saída · Renovou ou upsell\n'
  'Automações:  90 dias sem consultoria → alerta   ·   Risco de saída ou Sem contato → cria card no Funil 6   ·   '
  'Engajada e faturamento ≥ R$ 80 mil → sugere Funil 3')

kanban('3_consultor_oportunidades.png',
       'Funil 3 — Consultor · Oportunidades',
       'NOVO. Nasce da coluna POTENCIAIS, que hoje existe só em algumas abas   ·   Sai: Funil 4 (Comercial)',
       COR['Consultor'], [
  {'t':'Sinalizada','c':'Consultor marcou como oportunidade','novo':True},
  {'t':'Qualificada pelo consultor','c':'Porte, momento e interesse conferidos','novo':True},
  {'t':'Enviada ao comercial','c':'Handoff formal','novo':True,'fim':True},
  {'t':'Devolvida','c':'Sem fit ou fora de momento','novo':True}],
  'Por que é um segundo funil e não uma etapa do Funil 2:  o Funil 2 acompanha ENTREGA, este acompanha VENDA. Uma aluna pode estar na 3ª\n'
  'consultoria e em negociação de upsell ao mesmo tempo — num funil só, o consultor teria que escolher qual verdade registrar.\n'
  'Campos no handoff:  produto de interesse · faturamento atual · justificativa do consultor · melhor canal e horário')

kanban('4_comercial_expansao.png',
       'Funil 4 — Comercial · Expansão',
       'NOVO. Não existe planilha hoje   ·   Entra: Funil 3, ou lista de elegíveis da coordenadoria',
       COR['Comercial'], [
  {'t':'Oportunidade recebida','c':'Veio do consultor ou de lista','novo':True},
  {'t':'Qualificada','c':'Porte e momento confirmados','novo':True},
  {'t':'Contato realizado','c':'Comercial falou com a aluna','novo':True},
  {'t':'Apresentação feita','c':'Produto apresentado','novo':True},
  {'t':'Proposta enviada','c':'Valor e condições formalizados','novo':True},
  {'t':'Em negociação','c':'Contraproposta em andamento','novo':True},
  {'t':'Ganha','c':'Contrato assinado','novo':True,'fim':True},
  {'t':'Perdida','c':'Motivo obrigatório','novo':True}],
  'Automações:  etapa 3 parada 2 dias → alerta   ·   etapa 5 parada 7 dias → alerta ao gestor   ·   '
  'Ganha → notifica o consultor que originou   ·   Perdida → devolve ao Funil 3 com o motivo\n'
  'Pendência que trava este funil:  definir a comissão ou o crédito do consultor que originou.')

kanban('5_renovacao.png',
       'Funil 5 — Renovação',
       'NOVO e prioritário. Nasce da Data de término do plano   ·   Dono a definir: CS ou consultor',
       COR['Renovacao'], [
  {'t':'Vencimento em 120 dias','c':'Card criado automaticamente','novo':True},
  {'t':'Abordagem iniciada','c':'Consultor ou CS falou','novo':True},
  {'t':'Interesse confirmado','c':'Aluna sinalizou que fica','novo':True},
  {'t':'Proposta de renovação','c':'Condições enviadas','novo':True},
  {'t':'Renovada','c':'Novo contrato assinado','novo':True,'fim':True},
  {'t':'Não renovada','c':'Motivo obrigatório','novo':True},
  {'t':'Encaminhada à Retenção','c':'Sinalizou saída → Funil 6','novo':True}],
  'Por que é prioritário:  49 contratos vivos vencem em setembro e outubro de 2026, somando R$ 2,45 milhões por mês de faturamento — '
  'e 44 deles no mesmo dia, 29/09.\nHoje isso só aparece por consulta manual. As turmas entram em lote e vencem em lote: '
  'maio de 2027 concentra 180 términos. O funil precisa de visão por mês de vencimento, não só por etapa.')

kanban('6_cancelamento_retencao.png',
       'Funil 6 — Cancelamento · Retenção',
       'Nasce de: Cancelamento Atual   ·   Entra: pedido da aluna, ou sinal de risco vindo do Funil 2',
       COR['Retencao'], [
  {'t':'Pedido recebido','c':'Aluna solicitou cancelamento'},
  {'t':'Triagem de prazo','c':'Dentro ou fora dos 7 dias'},
  {'t':'Em contato','c':'Retenção tentando'},
  {'t':'Proposta de retenção','c':'Downsell, pausa ou renegociação','novo':True},
  {'t':'Retida','c':'Aluna permaneceu','fim':True},
  {'t':'Cancelada','c':'Distrato emitido'},
  {'t':'Jurídico / multa','c':'Cobrança ou ação'}],
  'Duas regras que vêm de dado medido:\n'
  '1. A etapa 2 precisa separar "dentro de 7 dias" — é direito de arrependimento do CDC, não é trabalho de retenção. '
  'Misturar derruba a taxa de 64% para 52% e esconde o desempenho do time.\n'
  '2. Downsell é etapa própria, não observação: dos 26 casos de migração para plano menor, 20 ficaram e nenhum saiu — '
  '77% contra 64% da média.\nMotivo como lista fechada:  Financeiro (94) · Insatisfação com a entrega (65) · Saúde ou pessoal (14) · '
  'Falta de tempo (9) · Fechou o negócio (4) · Outro')
