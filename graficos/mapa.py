import sys; sys.path.insert(0,'/tmp/claude-0/-home-user-moonshot-analise/aa4a53bc-6d8a-5522-8729-cf6ad6d2e048/scratchpad')
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch
import textwrap

TINTA='#2a1a22'; TINTA_2='#6b5560'; FUNDO='#fffafb'
COR={'CS':'#c2185b','Consultor':'#1565c0','Comercial':'#0b8a5a',
     'Retencao':'#d98324','Renovacao':'#7b3fa0'}

fig, ax = plt.subplots(figsize=(15, 8.2))
fig.patch.set_facecolor(FUNDO); ax.set_facecolor(FUNDO)
ax.set_xlim(0,1); ax.set_ylim(0,1); ax.axis('off')

ax.text(0.012,0.975,'Mapa dos funis — Uno CRM',fontsize=17,fontweight='bold',color=TINTA,va='top')
ax.text(0.012,0.925,'Grupo NB / Moonshot   ·   Uma aluna = um contato único. Cada funil é um card sobre o mesmo registro de pessoa.',
        fontsize=9,color=TINTA_2,va='top')

def bloco(x,y,w,h,cor,n,t,quem,fonte,novo=False):
    ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0.009,rounding_size=0.018',
                 linewidth=1.8,edgecolor=cor,facecolor='#ffffff',zorder=2))
    ax.add_patch(FancyBboxPatch((x,y+h-0.052),w,0.052,boxstyle='round,pad=0.002,rounding_size=0.014',
                 linewidth=0,facecolor=cor,zorder=3))
    ax.text(x+w/2,y+h-0.026,f'{n}. {t}',ha='center',va='center',fontsize=9.4,
            color='#fff',fontweight='bold',zorder=4)
    ax.text(x+w/2,y+h-0.088,quem,ha='center',va='center',fontsize=8,color=cor,
            fontweight='bold',zorder=4)
    ax.text(x+w/2,y+0.035,'\n'.join(textwrap.wrap(fonte,30)),ha='center',va='center',
            fontsize=7.2,color=TINTA_2,zorder=4)
    if novo: ax.text(x+w-0.01,y+0.008,'NOVO',ha='right',va='bottom',fontsize=6.4,
                     color=cor,fontweight='bold',zorder=4)

def rota(pontos,rot='',cor='#9c8790',onde=(None,None)):
    """Caminho ortogonal por pontos de passagem, com seta no fim.

    Existe porque um conector de dois segmentos nao contorna bloco: para ir do
    funil 5 ao 6 e preciso sair pela direita, descer por fora e entrar pela
    lateral — tres segmentos.
    """
    for a, b in zip(pontos, pontos[1:-1]):
        ax.add_patch(FancyArrowPatch(a, b, arrowstyle='-', linewidth=1.5,
                                     color=cor, zorder=1))
    ax.add_patch(FancyArrowPatch(pontos[-2], pontos[-1], arrowstyle='-|>',
                                 mutation_scale=13, linewidth=1.5, color=cor, zorder=1))
    if rot and onde[0] is not None:
        ax.text(onde[0], onde[1], rot, ha='center', va='center', fontsize=7.4,
                color=cor, fontweight='bold', zorder=5,
                bbox=dict(boxstyle='round,pad=0.3', fc=FUNDO, ec='none'))


def fluxo(p1,p2,rot='',cor='#9c8790',estilo=None,onde=(None,None)):
    """Seta entre dois pontos.

    Cotovelo em vez de arco: arco de raio grande passa por dentro dos blocos,
    e num mapa de processo o caminho precisa ser lido sem ambiguidade.
    `onde` fixa o rotulo, porque o meio do cotovelo raramente e um bom lugar.
    """
    cs = estilo or 'arc3,rad=0'
    ax.add_patch(FancyArrowPatch(p1,p2,arrowstyle='-|>',mutation_scale=13,linewidth=1.5,
                 color=cor,zorder=1,connectionstyle=cs))
    if rot:
        x = onde[0] if onde[0] is not None else (p1[0]+p2[0])/2
        y = onde[1] if onde[1] is not None else (p1[1]+p2[1])/2
        ax.text(x,y,rot,ha='center',va='center',fontsize=7.4,color=cor,
                fontweight='bold',zorder=5,
                bbox=dict(boxstyle='round,pad=0.3',fc=FUNDO,ec='none'))

W,H=0.205,0.20
# Linha de cima: o caminho feliz. Meio: a venda. Canto: a saida.
bloco(0.03,0.64,W,H,COR['CS'],1,'CS · Onboarding','CS','Alunos Matriculados + Kit e Eventos')
bloco(0.285,0.64,W,H,COR['Consultor'],2,'Ciclo de Consultoria','Consultor','Controle Consultorias')
bloco(0.54,0.64,W,H,COR['Renovacao'],5,'Renovação','CS + Consultor','Data de término do plano',novo=True)
bloco(0.285,0.34,W,H,COR['Consultor'],3,'Oportunidades','Consultor','Coluna POTENCIAIS',novo=True)
bloco(0.54,0.34,W,H,COR['Comercial'],4,'Comercial · Expansão','Comercial','Não existe planilha hoje',novo=True)
bloco(0.03,0.04,W,H,COR['Retencao'],6,'Cancelamento · Retenção','Cancelamento','Cancelamento Atual')

fluxo((0.235,0.74),(0.285,0.74),'aluna ativada',onde=(0.26,0.775))
fluxo((0.49,0.74),(0.54,0.74),'ciclo concluído',onde=(0.515,0.775))
fluxo((0.3875,0.64),(0.3875,0.545),'sinaliza oportunidade',onde=(0.3875,0.595))
fluxo((0.49,0.46),(0.54,0.46),'handoff',onde=(0.515,0.495))
fluxo((0.54,0.395),(0.49,0.395),'devolvida',cor='#c9b2bb',onde=(0.515,0.36))
# Saidas para retencao. Cotovelo: sai pela lateral e desce por fora dos blocos.
fluxo((0.285,0.70),(0.16,0.24),'risco de saída',cor=COR['Retencao'],
      estilo='angle,angleA=180,angleB=90,rad=8',onde=(0.222,0.45))
# Bloco 4 fica exatamente embaixo do 5, entao descer em linha reta atravessaria
# ele. Sai pela direita, contorna por fora e entra no 6 pela lateral.
rota([(0.745,0.72),(0.775,0.72),(0.775,0.115),(0.243,0.115)],
     'não renovou',cor=COR['Retencao'],onde=(0.50,0.152))
# E o retorno: quem e retida volta ao ciclo.
fluxo((0.235,0.175),(0.30,0.64),'retida volta ao ciclo',cor='#0b8a5a',
      estilo='angle,angleA=0,angleB=-90,rad=8',onde=(0.268,0.30))

# Nota de canto
ax.text(0.805,0.60,'O que muda\ncom o CRM',fontsize=10.5,fontweight='bold',color=TINTA,va='top')
notas=[('Renovação deixa de ser\nconsulta manual','R$ 2,45 mi/mês vencendo\nem set e out de 2026'),
       ('Saúde da aluna vira campo,\nnão texto livre','hoje carteira de quem\nescreve pouco parece boa'),
       ('Downsell vira etapa','20 de 26 ficaram — 77%\ncontra 64% da média'),
       ('Oportunidade vira handoff\nrastreável','hoje só existe na coluna\nPOTENCIAIS de algumas abas')]
yy=0.535
for t,s in notas:
    ax.text(0.805,yy,'▸ '+t,fontsize=8.2,color=TINTA,va='top',fontweight='bold')
    ax.text(0.822,yy-0.048,s,fontsize=7.3,color=TINTA_2,va='top')
    yy-=0.125

fig.savefig('entregaveis/funis/0_mapa_geral.png',dpi=170,bbox_inches='tight',facecolor=FUNDO)
print('-> 0_mapa_geral.png')
