"""Normalizacao de texto e parsers dos campos de resposta livre."""
import re
import unicodedata


def norm(s) -> str:
    """Minusculas, sem acento, espacos aparados. Usado so para comparar/casar."""
    s = str(s).strip().lower()
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


# Respostas que existem no arquivo mas nao carregam informacao analisavel.
NAO_INFORMATIVOS = {
    '', 'nan', 'none', '-', '--', '---', '.', '..', '...', 'x', 'na', 'n/a',
    'nao', 'no', 'nada', 'nenhum', 'nenhuma', 'nao sei', 'nao sei dizer',
    'naosei', 'nao se', 'ns', 'ainda nao', 'ainda nao sei', 'sem', '?', '0',
    'todos', 'tudo', 'sim', 'si', 'ok', 'nao tenho', 'nao tem', 'todas',
}


def tem_conteudo(valor) -> bool:
    """True se a resposta carrega informacao analisavel (ver NAO_INFORMATIVOS)."""
    n = norm(valor)
    return n not in NAO_INFORMATIVOS and len(n) >= 4


# --------------------------------------------------------------------------
# Faturamento
# --------------------------------------------------------------------------
NUM = r'\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d+)?'

# Textos que declaram ausencia de faturamento (nao e dado faltante: e um estagio).
PRE_OPERACIONAL = (r'ainda nao (tenho|faturo|existe|inaugur|abri|comec)|nao tem faturamento|'
                   r'sem faturamento|vamos (abrir|inaugurar)|iremos inaugurar|estamos iniciando|'
                   r'comecando do zero|em fase inicial|nao abri|fase de estrutur|nao inaugur')


def _valor(tok: str):
    """Resolve separador decimal x milhar num token numerico."""
    t = tok.replace(' ', '')
    if ',' in t and '.' in t:
        t = t.replace('.', '').replace(',', '.') if t.rfind(',') > t.rfind('.') else t.replace(',', '')
    elif ',' in t:
        t = t.replace(',', '.') if re.search(r',\d{1,2}$', t) else t.replace(',', '')
    elif '.' in t and re.search(r'\.\d{3}(\.\d{3})*$', t):
        t = t.replace('.', '')
    try:
        return float(t)
    except ValueError:
        return None


def parse_faturamento(raw, teto_plausivel=1_000_000):
    """Faturamento mensal declarado -> (valor, moeda, regra, confianca).

    Confiancas: alta (valor unico e explicito), media (faixa/soma/anualizado),
    inferida_milhar (numero nu tratado como milhares), ambigua, sem_faturamento,
    pre_operacional, implausivel_revisar, nao classificavel.
    """
    if raw is None or str(raw).strip() == '':
        return None, None, 'vazio', None
    n = norm(raw)

    if re.search(PRE_OPERACIONAL, n) and not re.search(r'\d', n):
        return None, None, 'declara nao ter faturamento ainda', 'pre_operacional'
    if not re.search(r'\d', n):
        return None, None, 'texto sem numero', 'nao classificavel'

    moeda = 'BRL'
    if re.search(r'€|\beur\b|euros?\b', n):
        moeda = 'EUR'
    # '$' isolado indica dolar, mas nao quando faz parte de 'R$'.
    elif re.search(r'us\$|\busd\b|dolar|dolares|(?<!r)\$', n):
        moeda = 'USD'

    # 'ano' sozinho aparece em 'ano passado'/'esse ano' e nao indica periodo anual.
    anual = bool(re.search(r'\banual\b|\banuais\b|por ano|/ano|ao ano|no ano de|faturamento do ano', n))
    soma_unid = bool(re.search(r'matriz|filial|unidade|\bloja\b|paulista e|clinica \+', n))

    achados = []
    # so 'mil' e 'k' sao multiplicadores confiaveis; 'mi'/'m' casam dentro de
    # 'mil', 'mes' e 'media' e inflam o valor em 1000x.
    for m in re.finditer(r'(' + NUM + r')\s*(mil|k)?\b', n):
        v = _valor(m.group(1))
        if v is None:
            continue
        achados.append(v * 1000 if m.group(2) else v)
    achados = [v for v in achados if v != 0 or len(achados) == 1]
    achados = [v for v in achados if not (1990 <= v <= 2030 and len(achados) > 1)]
    if not achados:
        return None, moeda, 'sem numero utilizavel', 'nao classificavel'

    if soma_unid and len(achados) > 1:
        val, regra, conf = sum(achados), 'soma de unidades', 'media'
    elif len(achados) > 1:
        val, regra, conf = sum(achados) / len(achados), 'ponto medio da faixa', 'media'
    else:
        val, regra, conf = achados[0], 'valor unico', 'alta'

    if anual:
        val, regra, conf = val / 12, regra + ' + anual/12', 'media'

    # Numero nu abaixo de 500 num campo de faturamento MENSAL em reais: a leitura
    # literal (um negocio faturando R$60/mes) e implausivel diante da base, e a
    # intencao quase certa e 'mil'. Aplicamos o multiplicador e marcamos a inferencia.
    # Nao vale para EUR/USD, onde 300 e um valor plausivel.
    if moeda == 'BRL' and 1 <= val < 500 and not re.search(r'mil|\bk\b|[.,]\d{2}\b', n):
        val, regra, conf = val * 1000, regra + ' + milhar inferido', 'inferida_milhar'
    elif val < 1:
        conf = 'sem_faturamento'
    elif val < 500:
        conf = 'ambigua'

    # Acima do p99 da base por uma ordem de grandeza o valor quase sempre vem de
    # texto malformado ('3.200 mil euros'). Fica em quarentena com o texto original.
    if val > teto_plausivel:
        conf = 'implausivel_revisar'
    return val, moeda, regra, conf


# --------------------------------------------------------------------------
# Equipe
# --------------------------------------------------------------------------
# Sem \b no fim: 'sozinh' precisa casar dentro de 'sozinha'/'sozinho'.
SOLO = (r'\b(sozinh|so eu|so mesmo eu|somente eu|apenas eu|sou eu|unica responsavel|'
        r'nenhum|nao tenho|nao possu|sem funcionari|trabalho so|faco tudo)')
PAPEL = (r'(recepc|manicure|pedicur|cabele|esteticist|secretari|auxiliar|assistent|gerent|vendedor|'
         r'social media|marketing|financeir|limpeza|faxineir|servicos gerais|enfermeir|biomedic|'
         r'dentist|massagist|massoterap|lash|designer|design de|tecnic|estagiari|copeir|motoboy|'
         r'colaborador|funcionari|profissiona|fisioterapeut|nutricion|tosador|banhist|vendas|'
         r'comercial|\badm\b|atendiment|socia|parceir|tutora|suporte|barbeir|medic|terapeut|'
         r'sublocatari|alongadora|especialista|treinne|trainee|editor)')
TOTAL_PAL = r'(funcionari|colaborador|pessoas|profissiona|no total|no grupo|meninas|equipe)'
EXTENSO = {'uma': 1, 'um': 1, 'duas': 2, 'dois': 2, 'tres': 3, 'quatro': 4, 'cinco': 5,
           'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10, 'onze': 11, 'doze': 12}
MULTI_UNIDADE = r'matriz|filial|unidade|duas lojas|segunda loja|outra unidade|franquia'


def _numeros(n):
    out = []
    for m in re.finditer(r'\b(\d{1,3})\b', n):
        v = int(m.group(1))
        if 0 <= v <= 300 and not (1990 <= v <= 2030):
            out.append((v, m.start(), m.end()))
    for m in re.finditer(r'\b(' + '|'.join(EXTENSO) + r')\b', n):
        out.append((EXTENSO[m.group(1)], m.start(), m.end()))
    return sorted(out, key=lambda t: t[1])


def _eh_item(n, fim):
    """True se o numero e seguido de um cargo -> e item de lista, nao total."""
    return bool(re.match(r'\s*[-–:,]?\s*(?:na |no |de |da |do |que |em |pessoas? )?\s*' + PAPEL,
                         n[fim:fim + 40]))


def parse_equipe(raw):
    """Equipe declarada -> (n_funcionarios, inclui_dona, regra, confianca)."""
    if raw is None or str(raw).strip() == '':
        return None, None, 'vazio', None
    n = norm(raw)
    nums = _numeros(n)
    solo = bool(re.search(SOLO, n))

    if solo and not [v for v, _, _ in nums if v > 0]:
        return 0, True, 'declara trabalhar sozinha', 'alta'

    if not nums:
        papeis = len(set(re.findall(PAPEL, n)))
        if papeis:
            return papeis, False, f'{papeis} cargo(s) citado(s) sem numero', 'baixa'
        return None, None, 'texto sem numero nem cargo', 'nao classificavel'

    if re.fullmatch(r'\s*\d{1,3}\s*[.,]?\s*', n):
        return nums[0][0], False, 'numero isolado', 'alta'

    itens = [(v, ini, fim) for v, ini, fim in nums if _eh_item(n, fim)]

    totais = []
    for v, ini, fim in nums:
        antes, depois = n[max(0, ini - 14):ini], n[fim:fim + 24]
        if re.match(r'\s*' + TOTAL_PAL, depois):
            totais.append((v, False))
        elif re.search(r'somos\s*$|comigo\s*(mais\s*)?$|no total,?\s*$|total de\s*$', antes):
            totais.append((v, True))
    if totais:
        v, incl = max(totais, key=lambda t: t[0])
        return v, incl, 'total declarado no texto', 'alta'

    # "17. 15 manicures, 1 recepcao, 1 limpeza": o 17 abre o texto, nao e cargo,
    # e cobre a soma dos itens -> e o total, nao mais um item.
    if nums[0][1] <= 2 and not _eh_item(n, nums[0][2]):
        resto = sum(v for v, ini, _ in itens if ini > nums[0][1])
        if nums[0][0] >= resto:
            return nums[0][0], False, 'primeiro numero declarado como total', 'media'

    if itens:
        return sum(v for v, _, _ in itens), False, f'soma de {len(itens)} cargos enumerados', 'media'
    if solo:
        return 0, True, 'declara trabalhar sozinha', 'media'
    return max(v for v, _, _ in nums), False, 'maior numero citado, sem cargo associado', 'baixa'


def parse_ano_fundacao(raw, ano_ref):
    """Ano de fundacao -> (ano, anos_operacao, regra). Aceita 'ha 8 anos'."""
    if raw is None or str(raw).strip() == '':
        return None, None, 'vazio'
    n = norm(raw)
    anos = [int(a) for a in re.findall(r'\b(19[5-9]\d|20[0-3]\d)\b', n)]
    if anos:
        a = min(anos)
        return a, max(0, ano_ref - a), 'ano explicito'
    m = re.search(r'\b(?:ha|faz|tem)\s+(\d{1,2})\s*anos?', n)
    if m:
        d = int(m.group(1))
        return ano_ref - d, d, 'duracao relativa ("ha N anos")'
    m = re.search(r'\b(\d{1,2})\s*anos?\b', n)
    if m:
        d = int(m.group(1))
        return ano_ref - d, d, 'duracao relativa (N anos)'
    return None, None, 'nao classificavel'
