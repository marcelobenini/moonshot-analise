"""Mascaramento LGPD para material que sai da empresa.

O time de implementacao do CRM precisa ver o FORMATO do dado, nao a pessoa.
Cada funcao aqui destroi identificacao e preserva estrutura — quem recebe
consegue dimensionar campo, validar mascara e entender distribuicao, sem
conseguir dizer de quem e a linha.

Mascarar e mais do que apagar nome: cidade pequena + ramo + faturamento exato
reidentifica sozinho. Por isso faturamento vira faixa e cidade com poucas
alunas vira UF.
"""
import hashlib
import re

import pandas as pd

SAL = 'moonshot-crm-2026'


def pseudonimo(nome, prefixo='ALU'):
    """Mesmo nome -> mesmo codigo, sempre. Permite cruzar abas sem revelar quem.

    O sal impede que alguem com a lista de nomes refaca o de-para por forca
    bruta: sem conhecer o sal, testar um nome nao reproduz o codigo.
    """
    if pd.isna(nome) or not str(nome).strip():
        return None
    h = hashlib.sha256((SAL + str(nome).strip().lower()).encode()).hexdigest()
    return f'{prefixo}-{int(h[:8], 16) % 100000:05d}'


def iniciais(nome):
    """'Maria Silva Souza' -> 'M.S.S.' — dá noção de tamanho do nome, sem o nome."""
    if pd.isna(nome):
        return None
    p = [x for x in re.split(r'\s+', str(nome).strip()) if len(x) > 2]
    return '.'.join(x[0].upper() for x in p[:4]) + '.' if p else None


def telefone(v):
    """Preserva DDD e o formato; esconde o assinante.

    O DDD fica porque e informacao de regiao, nao de pessoa, e o time precisa
    validar mascara de telefone brasileiro.
    """
    if pd.isna(v):
        return None
    d = re.sub(r'\D', '', str(v))
    if len(d) < 10:
        return '(**) *****-****'
    ddd = d[-11:-9] if len(d) >= 11 else d[-10:-8]
    return f'({ddd}) *****-****'


# Dominio proprio identifica a empresa — 'contato@villaprimeestetica.com.br'
# entrega a aluna inteira. So o TIPO do dominio sobrevive.
PROVEDORES = {'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br',
              'icloud.com', 'live.com', 'bol.com.br', 'uol.com.br', 'terra.com.br',
              'msn.com', 'me.com', 'globo.com'}


def email(v):
    """Guarda so se e provedor comum ou dominio proprio.

    O time precisa saber que existe e-mail e de que tipo — nao precisa do
    endereco. Dominio proprio identifica a empresa sozinho.
    """
    if pd.isna(v) or '@' not in str(v):
        return None
    dom = str(v).split('@')[-1].strip().lower()
    return '*****@provedor-comum' if dom in PROVEDORES else '*****@dominio-proprio'


FAIXAS = [(0, 5000, 'até 5k'), (5000, 15000, '5k–15k'), (15000, 30000, '15k–30k'),
          (30000, 50000, '30k–50k'), (50000, 80000, '50k–80k'),
          (80000, 150000, '80k–150k'), (150000, float('inf'), 'acima de 150k')]


def faixa_faturamento(v):
    """Faixa em vez de valor exato: valor exato reidentifica junto com cidade e ramo."""
    if pd.isna(v):
        return None
    for lo, hi, rot in FAIXAS:
        if lo <= v < hi:
            return rot
    return None


def cidade_segura(serie, minimo=5):
    """Cidade com poucas alunas vira UF.

    Numa cidade com duas alunas do nicho, dizer a cidade e quase dizer o nome.
    O corte de 5 e a mesma regra de celula pequena que usamos no resto.
    """
    cont = serie.value_counts()
    return serie.map(lambda c: c if pd.notna(c) and cont.get(c, 0) >= minimo else '(cidade agrupada)')


def _sem_acento(t):
    import unicodedata
    return unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()


def texto_livre(v, limite=90, nomes=None):
    """Relato do consultor: remove nome proprio, numero e valor, corta o resto.

    O relato e o campo mais util para o time entender o que vai no campo — e o
    mais perigoso: menciona terceiros, inadimplencia e processo judicial.

    `nomes` e a lista real de nomes da base. Heuristica de palavra capitalizada
    nao basta e foi medida falhando: nao pega nome em inicio de frase nem nome
    escrito em CAIXA ALTA, e 45 primeiros nomes vazaram na conferencia. Com a
    lista, o mascaramento e deterministico.
    """
    if pd.isna(v):
        return None
    t = re.sub(r'\s+', ' ', str(v))
    t = re.sub(r'R\$\s*[\d\s.,]+', 'R$ ***', t)
    t = re.sub(r'\d', '*', t)
    if nomes:
        # Ordena do maior para o menor: 'Ana Paula' antes de 'Ana'.
        for n in sorted(nomes, key=len, reverse=True):
            t = re.sub(rf'\b{re.escape(n)}\b', '***', t, flags=re.IGNORECASE)
            sa = _sem_acento(n)
            if sa != n:
                t = re.sub(rf'\b{re.escape(sa)}\b', '***', t, flags=re.IGNORECASE)
    # Rede de seguranca para nome que nao esta na lista.
    t = re.sub(r'(?<![.!?]\s)(?<!^)\b[A-ZÀ-Ú][a-zà-ú]{2,}\b', '***', t)
    t = re.sub(r'(\*\*\*[\s,]*)+', '*** ', t)
    return t[:limite] + ('…' if len(t) > limite else '')


def vocabulario_de_nomes(*series, minimo=4):
    """Todos os tokens de nome vistos na base, para alimentar `texto_livre`."""
    vocab = set()
    for s in series:
        for nome in s.dropna().astype(str):
            for tok in re.split(r'[\s/,()\-]+', nome):
                if len(tok) >= minimo and tok.isalpha():
                    vocab.add(tok)
    return vocab


def categoria(v, limite=40):
    """Campo que deveria ser categoria mas as vezes recebe texto livre.

    Uma aluna escreveu a tabela de precos dela no campo `ramo`. Campo de
    categoria sem lista fechada vira campo de texto na pratica, entao ele
    tambem precisa passar por limpeza antes de sair da empresa.
    """
    if pd.isna(v):
        return None
    t = re.sub(r'R\$\s*[\d\s.,]+', '', str(v))
    t = re.sub(r'[\d]+[.,]?[\d]*', '', t)
    t = re.sub(r'\s*[-–,;/]\s*$', '', re.sub(r'\s+', ' ', t)).strip(' -–,;')
    return (t[:limite] + '…') if len(t) > limite else (t or None)
