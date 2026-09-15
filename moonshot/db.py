"""Banco acumulativo: tudo que chega entra e nada sai.

Desenho em quatro decisoes, cada uma respondendo a um jeito de perder dado:

1. **A linha bruta e guardada sempre**, como JSON, antes de qualquer parser
   opinar sobre ela. Se amanha eu entender melhor uma coluna que hoje ignoro,
   o dado ainda esta la — nao preciso pedir a planilha de novo.
2. **Identidade e persistente.** Nome resolvido uma vez fica resolvido: a
   tabela `alias` guarda toda grafia ja vista apontando para a mesma pessoa.
   Sem isso, cada planilha nova recomeça o casamento do zero e a mesma aluna
   vira tres pessoas diferentes.
3. **Toda afirmacao carrega de onde veio.** Cada fato aponta para a `fonte`
   que o disse. Quando duas planilhas discordam — e discordam — da para ver
   quem disse o que e quando, em vez de escolher no escuro.
4. **Versao nova nao apaga versao velha.** Reingerir o mesmo arquivo e no-op
   (sha256 igual); um arquivo novo do mesmo tipo vira outra fonte, e a
   diferenca entre as duas e observavel. Foi assim que a queda de 604 para
   502 contratos apareceu.

O arquivo do banco fica em `dados/`, que nao vai para o git: ele carrega nome,
telefone, faturamento e relato do consultor sobre pessoas reais.
"""
import hashlib
import re
import json
import os
import sqlite3
from datetime import datetime, timezone

import pandas as pd

from .consultoria import _chave, _tokens
from .texto import norm

CAMINHO_PADRAO = 'dados/moonshot.db'

ESQUEMA = """
CREATE TABLE IF NOT EXISTS fonte (
    id           INTEGER PRIMARY KEY,
    arquivo      TEXT NOT NULL,
    sha256       TEXT NOT NULL UNIQUE,
    tipo         TEXT NOT NULL,
    ingerido_em  TEXT NOT NULL,
    linhas       INTEGER,
    observacao   TEXT
);

CREATE TABLE IF NOT EXISTS pessoa (
    id             INTEGER PRIMARY KEY,
    nome_canonico  TEXT NOT NULL,
    criado_em      TEXT NOT NULL,
    fonte_origem   INTEGER REFERENCES fonte(id)
);

-- A chave e o nome normalizado: e o que faz 'Elizabeth Lima' e 'Elisabete
-- LIma' pararem de ser duas pessoas depois da primeira resolucao manual.
CREATE TABLE IF NOT EXISTS alias (
    nome_norm    TEXT PRIMARY KEY,
    pessoa_id    INTEGER NOT NULL REFERENCES pessoa(id),
    nome_visto   TEXT NOT NULL,
    fonte_id     INTEGER REFERENCES fonte(id),
    metodo       TEXT,
    confianca    REAL,
    criado_em    TEXT NOT NULL
);

-- Linha crua, sem interpretacao. A rede de seguranca de todo o resto.
CREATE TABLE IF NOT EXISTS registro (
    id        INTEGER PRIMARY KEY,
    fonte_id  INTEGER NOT NULL REFERENCES fonte(id),
    aba       TEXT,
    linha     INTEGER,
    pessoa_id INTEGER REFERENCES pessoa(id),
    dados     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fato_matricula (
    id          INTEGER PRIMARY KEY,
    fonte_id    INTEGER NOT NULL REFERENCES fonte(id),
    pessoa_id   INTEGER REFERENCES pessoa(id),
    turma       TEXT,
    produto     TEXT,
    periodo     TEXT,
    consultor      TEXT,
    consultor_norm TEXT,
    status      TEXT,
    status_financeiro TEXT,
    status_contrato   TEXT,
    telefone    TEXT,
    email       TEXT,
    inicio      TEXT,
    termino     TEXT
);
-- CPF fica so na camada bruta (`registro`). Ele nao serve para contato e nao
-- precisa estar numa tabela que se exporta para trabalhar lista.

CREATE TABLE IF NOT EXISTS fato_consultoria (
    id            INTEGER PRIMARY KEY,
    fonte_id      INTEGER NOT NULL REFERENCES fonte(id),
    pessoa_id     INTEGER REFERENCES pessoa(id),
    consultor      TEXT,
    consultor_norm TEXT,
    aba           TEXT,
    programa      TEXT,
    entrada       TEXT,
    consultorias  INTEGER,
    situacao      TEXT,
    cidade        TEXT,
    ramo          TEXT,
    fat_mes       REAL,
    fat_ano       REAL
);

CREATE TABLE IF NOT EXISTS fato_cancelamento (
    id           INTEGER PRIMARY KEY,
    fonte_id     INTEGER NOT NULL REFERENCES fonte(id),
    pessoa_id    INTEGER REFERENCES pessoa(id),
    aba          TEXT,
    solicitante  TEXT,
    data_pedido  TEXT,
    prazo        TEXT,
    motivo       TEXT,
    observacoes  TEXT,
    desfecho     TEXT,
    email        TEXT,
    contato      TEXT
);

CREATE TABLE IF NOT EXISTS fato_formulario (
    id         INTEGER PRIMARY KEY,
    fonte_id   INTEGER NOT NULL REFERENCES fonte(id),
    pessoa_id  INTEGER REFERENCES pessoa(id),
    origem     TEXT,
    empresa    TEXT,
    respostas  TEXT
);

-- Casamentos que passaram perto do corte. Existem para serem conferidos por
-- gente, nao para ficarem escondidos dentro de uma media.
CREATE TABLE IF NOT EXISTS revisao_identidade (
    id          INTEGER PRIMARY KEY,
    fonte_id    INTEGER REFERENCES fonte(id),
    nome_novo   TEXT NOT NULL,
    pessoa_id   INTEGER REFERENCES pessoa(id),
    nome_atual  TEXT,
    confianca   REAL,
    decidido    INTEGER NOT NULL DEFAULT 0,
    criado_em   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_reg_fonte   ON registro(fonte_id);
CREATE INDEX IF NOT EXISTS ix_reg_pessoa  ON registro(pessoa_id);
CREATE INDEX IF NOT EXISTS ix_mat_pessoa  ON fato_matricula(pessoa_id);
CREATE INDEX IF NOT EXISTS ix_con_pessoa  ON fato_consultoria(pessoa_id);
CREATE INDEX IF NOT EXISTS ix_for_pessoa  ON fato_formulario(pessoa_id);
"""

# Visoes: o cruzamento que o banco existe para permitir, ja pronto.
VISOES = """
DROP VIEW IF EXISTS vw_pessoa_completa;
CREATE VIEW vw_pessoa_completa AS
SELECT p.id, p.nome_canonico,
       (SELECT COUNT(*) FROM alias a WHERE a.pessoa_id = p.id)            AS grafias,
       (SELECT COUNT(*) FROM fato_matricula m WHERE m.pessoa_id = p.id)   AS matriculas,
       (SELECT COUNT(*) FROM fato_consultoria c WHERE c.pessoa_id = p.id) AS consultorias,
       (SELECT COUNT(*) FROM fato_formulario f WHERE f.pessoa_id = p.id)  AS formularios,
       (SELECT m.status FROM fato_matricula m
         WHERE m.pessoa_id = p.id ORDER BY m.fonte_id DESC, m.id DESC LIMIT 1) AS status_recente,
       (SELECT m.consultor_norm FROM fato_matricula m
         WHERE m.pessoa_id = p.id AND m.consultor_norm IS NOT NULL
         ORDER BY m.fonte_id DESC, m.id DESC LIMIT 1)                     AS consultor_matricula,
       (SELECT c.consultor_norm FROM fato_consultoria c
         WHERE c.pessoa_id = p.id AND c.consultor_norm IS NOT NULL
         ORDER BY c.fonte_id DESC, c.id DESC LIMIT 1)                     AS consultor_aba,
       (SELECT m.termino FROM fato_matricula m
         WHERE m.pessoa_id = p.id ORDER BY m.fonte_id DESC, m.id DESC LIMIT 1) AS termino_recente
FROM pessoa p;

-- Onde as duas planilhas discordam sobre quem atende quem. Foi o erro que
-- inflou a carteira da Carol de 7 para 13.
DROP VIEW IF EXISTS vw_divergencia_consultor;
CREATE VIEW vw_divergencia_consultor AS
SELECT id, nome_canonico, consultor_matricula, consultor_aba
FROM vw_pessoa_completa
WHERE consultor_matricula IS NOT NULL AND consultor_aba IS NOT NULL
  AND consultor_matricula <> consultor_aba;

-- Quem aparece numa fonte e nao na outra: o ponto cego de cada planilha.
DROP VIEW IF EXISTS vw_cobertura;
CREATE VIEW vw_cobertura AS
SELECT CASE WHEN matriculas > 0 THEN 1 ELSE 0 END AS tem_matricula,
       CASE WHEN consultorias > 0 THEN 1 ELSE 0 END AS tem_consultoria,
       CASE WHEN formularios > 0 THEN 1 ELSE 0 END AS tem_formulario,
       COUNT(*) AS pessoas
FROM vw_pessoa_completa
GROUP BY 1, 2, 3 ORDER BY pessoas DESC;
"""


# Grafias de consultor que sao a mesma pessoa. Nome de gente nao se resolve
# por regra: tem que ser dito. Entradas novas entram aqui quando aparecerem.
CONSULTOR_ALIAS = {
    'carol': 'carol leao',
    'vinicius': 'vinicius',
    'anameli': 'anameli',
}


def consultor_canonico(nome):
    """Mesma pessoa escrita de tres jeitos: 'Anaméli', 'Anameli', 'Anaméli Geral'.

    Sem normalizar, a view de divergencia acusa conflito onde so ha acento —
    e o conflito de verdade, que e consultor diferente, some no meio do ruido.
    """
    if not nome or pd.isna(nome):
        return None
    n = norm(nome)
    n = re.sub(r'\s+(geral|gerais)$', '', n).strip()
    n = re.sub(r'\s+', ' ', n)
    return CONSULTOR_ALIAS.get(n, n) or None


def _agora():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def conectar(caminho=CAMINHO_PADRAO):
    os.makedirs(os.path.dirname(caminho) or '.', exist_ok=True)
    con = sqlite3.connect(caminho)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    con.executescript(ESQUEMA)
    con.executescript(VISOES)
    con.commit()
    return con


def _sha(caminho):
    h = hashlib.sha256()
    with open(caminho, 'rb') as fh:
        for bloco in iter(lambda: fh.read(1 << 20), b''):
            h.update(bloco)
    return h.hexdigest()


def registrar_fonte(con, caminho, tipo, observacao=None):
    """(fonte_id, ja_existia). Mesmo arquivo duas vezes nao duplica nada."""
    sha = _sha(caminho)
    r = con.execute('SELECT id FROM fonte WHERE sha256 = ?', (sha,)).fetchone()
    if r:
        return r['id'], True
    cur = con.execute(
        'INSERT INTO fonte (arquivo, sha256, tipo, ingerido_em, observacao) VALUES (?,?,?,?,?)',
        (os.path.basename(caminho), sha, tipo, _agora(), observacao))
    return cur.lastrowid, False


# --------------------------------------------------------------------------
# Identidade
# --------------------------------------------------------------------------
CORTE_AUTOMATICO = 0.80
CORTE_REVISAO = 0.55


def _similaridade(tokens_a, tokens_b):
    """Jaccard sobre tokens do nome. Simples de propósito: qualquer coisa mais
    esperta aqui fica dificil de auditar, e identidade errada contamina tudo."""
    if not tokens_a or not tokens_b:
        return 0.0
    return len(tokens_a & tokens_b) / len(tokens_a | tokens_b)


def resolver_pessoa(con, nome, fonte_id=None, cache=None):
    """Nome -> pessoa_id, criando ou reaproveitando identidade.

    Ordem: alias ja conhecido, depois nome normalizado igual, depois
    similaridade de tokens. Acima de 0.80 casa sozinho; entre 0.55 e 0.80
    casa mas registra em `revisao_identidade` para alguem conferir; abaixo
    disso vira pessoa nova.
    """
    if not nome or not str(nome).strip():
        return None
    ch = _chave(nome)
    if not ch:
        return None
    if cache is not None and ch in cache:
        return cache[ch]

    r = con.execute('SELECT pessoa_id FROM alias WHERE nome_norm = ?', (ch,)).fetchone()
    if r:
        if cache is not None:
            cache[ch] = r['pessoa_id']
        return r['pessoa_id']

    tk = _tokens(nome)
    melhor, escore = None, 0.0
    if len(tk) >= 2:
        for p in con.execute('SELECT id, nome_canonico FROM pessoa'):
            s = _similaridade(tk, _tokens(p['nome_canonico']))
            if s > escore:
                melhor, escore = p, s

    if melhor is not None and escore >= CORTE_REVISAO:
        pid, metodo = melhor['id'], 'tokens'
        if escore < CORTE_AUTOMATICO:
            con.execute(
                'INSERT INTO revisao_identidade (fonte_id, nome_novo, pessoa_id, nome_atual,'
                ' confianca, criado_em) VALUES (?,?,?,?,?,?)',
                (fonte_id, str(nome).strip(), pid, melhor['nome_canonico'], escore, _agora()))
        # A grafia mais completa vira a canonica: ela e a que a pessoa
        # reconhece e a que casa melhor com a proxima planilha.
        if len(str(nome).strip()) > len(melhor['nome_canonico']):
            con.execute('UPDATE pessoa SET nome_canonico = ? WHERE id = ?',
                        (str(nome).strip(), pid))
    else:
        cur = con.execute(
            'INSERT INTO pessoa (nome_canonico, criado_em, fonte_origem) VALUES (?,?,?)',
            (str(nome).strip(), _agora(), fonte_id))
        pid, metodo, escore = cur.lastrowid, 'nova', 1.0

    con.execute(
        'INSERT OR IGNORE INTO alias (nome_norm, pessoa_id, nome_visto, fonte_id, metodo,'
        ' confianca, criado_em) VALUES (?,?,?,?,?,?,?)',
        (ch, pid, str(nome).strip(), fonte_id, metodo, escore, _agora()))
    if cache is not None:
        cache[ch] = pid
    return pid


# --------------------------------------------------------------------------
# Ingestao
# --------------------------------------------------------------------------
def _json(v):
    """Serializa a linha inteira sem perder tipo nem quebrar em NaT/NaN."""
    def limpo(x):
        if x is None or (isinstance(x, float) and pd.isna(x)):
            return None
        if isinstance(x, (pd.Timestamp, datetime)):
            return x.isoformat()
        if pd.isna(x) if not isinstance(x, (list, dict, set)) else False:
            return None
        if hasattr(x, 'item'):
            return x.item()
        return x if isinstance(x, (str, int, float, bool)) else str(x)
    return json.dumps({str(k): limpo(v) for k, v in v.items()}, ensure_ascii=False)


def _data(v):
    if v is None or pd.isna(v):
        return None
    try:
        return pd.Timestamp(v).date().isoformat()
    except (ValueError, TypeError):
        return None


def guardar_bruto(con, fonte_id, df, aba=None, coluna_nome=None, cache=None):
    """Grava a linha crua e, quando da, ja liga a pessoa."""
    n = 0
    for i, (_, r) in enumerate(df.iterrows()):
        pid = None
        if coluna_nome and coluna_nome in df.columns:
            pid = resolver_pessoa(con, r.get(coluna_nome), fonte_id, cache)
        con.execute('INSERT INTO registro (fonte_id, aba, linha, pessoa_id, dados)'
                    ' VALUES (?,?,?,?,?)', (fonte_id, aba, i + 1, pid, _json(r)))
        n += 1
    return n


def ingerir_matriculas(con, caminho, observacao=None):
    """Planilha de matriculas: quem esta em que turma, com que contrato."""
    from . import matriculas as mod
    fonte_id, existia = registrar_fonte(con, caminho, 'matriculas', observacao)
    if existia:
        return fonte_id, 0, 'ja ingerido'
    d = mod.carregar(caminho)
    cache = {}
    n = guardar_bruto(con, fonte_id, d, coluna_nome='nome', cache=cache)
    for _, r in d.iterrows():
        pid = resolver_pessoa(con, r.get('nome'), fonte_id, cache)
        con.execute(
            'INSERT INTO fato_matricula (fonte_id, pessoa_id, turma, produto, periodo,'
            ' consultor, consultor_norm, status, status_financeiro, status_contrato,'
            ' telefone, email, inicio, termino)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (fonte_id, pid, r.get('turma'), r.get('produto'), r.get('periodo'),
             r.get('consultor'), consultor_canonico(r.get('consultor')), r.get('status'),
             _texto(r.get('status_financeiro')), _texto(r.get('status_contrato')),
             _texto(r.get('telefone')), _texto(r.get('email')),
             _data(r.get('inicio')), _data(r.get('termino_efetivo'))))
    con.execute('UPDATE fonte SET linhas = ? WHERE id = ?', (n, fonte_id))
    con.commit()
    return fonte_id, n, 'ok'


def ingerir_consultorias(con, caminho, observacao=None):
    """Planilha de acompanhamento dos consultores, uma aba por consultor."""
    from . import consultoria as mod
    fonte_id, existia = registrar_fonte(con, caminho, 'consultorias', observacao)
    if existia:
        return fonte_id, 0, 'ja ingerido'
    d = mod.carregar(caminho)
    cache = {}
    n = guardar_bruto(con, fonte_id, d, coluna_nome='nome_consultoria', cache=cache)
    for _, r in d.iterrows():
        pid = resolver_pessoa(con, r.get('nome_consultoria'), fonte_id, cache)
        con.execute(
            'INSERT INTO fato_consultoria (fonte_id, pessoa_id, consultor, consultor_norm,'
            ' aba, programa, entrada, consultorias, situacao, cidade, ramo, fat_mes, fat_ano)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (fonte_id, pid, r.get('consultor'), consultor_canonico(r.get('consultor')),
             r.get('aba'), r.get('programa'),
             _data(r.get('entrada')), r.get('consultorias_feitas'), r.get('situacao'),
             r.get('cidade'), r.get('ramo'),
             r.get('fat_mes_consultor'), r.get('fat_ano_consultor')))
    con.execute('UPDATE fonte SET linhas = ? WHERE id = ?', (n, fonte_id))
    con.commit()
    return fonte_id, n, 'ok'


def ingerir_cancelamentos(con, caminho, observacao=None):
    """Planilha de pedidos de cancelamento, seis abas."""
    from . import cancelamento_planilha as mod
    fonte_id, existia = registrar_fonte(con, caminho, 'cancelamentos', observacao)
    if existia:
        return fonte_id, 0, 'ja ingerido'
    d = mod.carregar(caminho)
    cache = {}
    n = guardar_bruto(con, fonte_id, d, coluna_nome='nome', cache=cache)
    for _, r in d.iterrows():
        pid = resolver_pessoa(con, r.get('nome'), fonte_id, cache)
        con.execute(
            'INSERT INTO fato_cancelamento (fonte_id, pessoa_id, aba, solicitante,'
            ' data_pedido, prazo, motivo, observacoes, desfecho, email, contato)'
            ' VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            (fonte_id, pid, r.get('aba'), _texto(r.get('solicitante')),
             _data(r.get('data_pedido')), _texto(r.get('prazo')), _texto(r.get('motivo')),
             _texto(r.get('observacoes')), r.get('desfecho'),
             _texto(r.get('email')), _texto(r.get('contato'))))
    con.execute('UPDATE fonte SET linhas = ? WHERE id = ?', (n, fonte_id))
    con.commit()
    return fonte_id, n, 'ok'


def _texto(v):
    """Celula de planilha vira texto ou None — nunca a string 'nan'."""
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    s = re.sub(r'\s+', ' ', str(v)).strip()
    return s or None


def ingerir_formulario(con, caminho, origem, observacao=None):
    """Respostas cruas do formulario. Guarda a resposta inteira, nao a
    classificacao: a taxonomia muda, a resposta nao."""
    from .base import COMUM
    fonte_id, existia = registrar_fonte(con, caminho, f'formulario_{origem}', observacao)
    if existia:
        return fonte_id, 0, 'ja ingerido'
    d = pd.read_excel(caminho)
    # COMUM usa a chave em maiuscula ('PRO', 'CLUB'); minuscula devolvia mapa
    # vazio e todas as respostas entravam sem pessoa ligada.
    mapa = COMUM.get(str(origem).upper(), {})
    col_nome = mapa.get('nome')
    col_emp = mapa.get('empresa')
    cache = {}
    n = guardar_bruto(con, fonte_id, d, coluna_nome=col_nome, cache=cache)
    for _, r in d.iterrows():
        pid = resolver_pessoa(con, r.get(col_nome) if col_nome else None, fonte_id, cache)
        con.execute(
            'INSERT INTO fato_formulario (fonte_id, pessoa_id, origem, empresa, respostas)'
            ' VALUES (?,?,?,?,?)',
            (fonte_id, pid, origem, r.get(col_emp) if col_emp else None, _json(r)))
    con.execute('UPDATE fonte SET linhas = ? WHERE id = ?', (n, fonte_id))
    con.commit()
    return fonte_id, n, 'ok'


def ingerir_generico(con, caminho, tipo='desconhecido', observacao=None):
    """Planilha que eu ainda nao sei ler.

    Guarda tudo mesmo assim, aba por aba, e tenta so descobrir qual coluna tem
    nome de gente para ligar a identidade. E melhor ter o dado bruto esperando
    um parser do que recusar o arquivo e perder a versao daquele dia.
    """
    fonte_id, existia = registrar_fonte(con, caminho, tipo, observacao)
    if existia:
        return fonte_id, 0, 'ja ingerido'
    x = pd.ExcelFile(caminho)
    cache, total, achados = {}, 0, []
    for aba in x.sheet_names:
        d = x.parse(aba)
        if not len(d):
            continue
        col = _coluna_de_nome(d)
        achados.append(f'{aba}:{col or "sem coluna de nome"}')
        total += guardar_bruto(con, fonte_id, d, aba=aba, coluna_nome=col, cache=cache)
    con.execute('UPDATE fonte SET linhas = ?, observacao = ? WHERE id = ?',
                (total, (observacao or '') + ' | ' + '; '.join(achados), fonte_id))
    con.commit()
    return fonte_id, total, 'ok (generico)'


_PISTAS_NOME = ('aluna', 'nome', 'aluno', 'cliente', 'participante', 'contato')


def _coluna_de_nome(df):
    """Qual coluna tem nome de gente. Cabecalho primeiro; se nao houver pista,
    a coluna de texto com mais valores distintos que parecem nome completo."""
    for c in df.columns:
        if any(p in str(c).strip().lower() for p in _PISTAS_NOME):
            return c
    melhor, escore = None, 0
    for c in df.columns:
        s = df[c].dropna().astype(str)
        if len(s) < 3:
            continue
        # Nome proprio: duas ou mais palavras, sem digito, tamanho de gente.
        parece = s.map(lambda v: len(v.split()) >= 2 and not any(ch.isdigit() for ch in v)
                       and 5 <= len(v) <= 70)
        taxa = parece.mean() * s.nunique() / max(1, len(s))
        if taxa > escore and parece.mean() > 0.6:
            melhor, escore = c, taxa
    return melhor


TIPOS = {
    'matriculas': ingerir_matriculas,
    'consultorias': ingerir_consultorias,
    'cancelamentos': ingerir_cancelamentos,
}


def detectar_tipo(caminho):
    """Adivinha o tipo pelo conteudo, nao pelo nome do arquivo.

    Nome de arquivo mente: 'ALUNOS_MATRICULADOS_MOONSHOT_CLUB_1.xlsx' e
    'atualizada.xlsx' sao a mesma coisa. As colunas, nao.
    """
    try:
        x = pd.ExcelFile(caminho)
    except Exception:
        return 'desconhecido'
    abas = [a.strip().lower() for a in x.sheet_names]
    cabecalhos = set()
    for aba in x.sheet_names[:4]:
        d = x.parse(aba, nrows=8, header=None)
        for _, linha in d.iterrows():
            for v in linha:
                if isinstance(v, str):
                    cabecalhos.add(v.strip().lower())
    if {'motivo do cancelamento', 'reponsavel por seguir', 'responsavel por seguir'} & cabecalhos:
        return 'cancelamentos'
    if {'consultorias', 'situação aluna', 'situacao aluna'} & cabecalhos or \
            any('consult' in a for a in abas):
        if 'ramo atividade' in cabecalhos or '1. consultoria' in cabecalhos:
            return 'consultorias'
    if {'plano', 'tipo de plano', 'status'} & cabecalhos and \
            {'data de início', 'data de inicio', 'início', 'inicio'} & cabecalhos:
        return 'matriculas'
    if any('cancelamento' in a for a in abas) or any('turma' in a for a in abas):
        return 'matriculas'
    return 'desconhecido'


def ingerir(con, caminho, tipo=None, observacao=None):
    """Porta unica de entrada. Tipo desconhecido nao e motivo para recusar."""
    tipo = tipo or detectar_tipo(caminho)
    if tipo in TIPOS:
        return TIPOS[tipo](con, caminho, observacao)
    if tipo.startswith('formulario_'):
        return ingerir_formulario(con, caminho, tipo.split('_', 1)[1], observacao)
    return ingerir_generico(con, caminho, tipo, observacao)


# --------------------------------------------------------------------------
# Leitura
# --------------------------------------------------------------------------
def consultar(con, sql, params=()):
    return pd.read_sql_query(sql, con, params=params)


def resumo(con):
    """O estado do banco em quatro tabelas curtas."""
    fontes = consultar(con, 'SELECT id, arquivo, tipo, ingerido_em, linhas FROM fonte'
                            ' ORDER BY id')
    contagem = consultar(con, """
        SELECT 'pessoas' AS o, COUNT(*) AS n FROM pessoa
        UNION ALL SELECT 'grafias', COUNT(*) FROM alias
        UNION ALL SELECT 'linhas brutas', COUNT(*) FROM registro
        UNION ALL SELECT 'matriculas', COUNT(*) FROM fato_matricula
        UNION ALL SELECT 'consultorias', COUNT(*) FROM fato_consultoria
        UNION ALL SELECT 'formularios', COUNT(*) FROM fato_formulario
        UNION ALL SELECT 'pedidos de cancelamento', COUNT(*) FROM fato_cancelamento
        UNION ALL SELECT 'identidades a revisar',
                  COUNT(*) FROM revisao_identidade WHERE decidido = 0""")
    cobertura = consultar(con, 'SELECT * FROM vw_cobertura')
    revisao = consultar(con, 'SELECT nome_novo, nome_atual, ROUND(confianca,2) AS confianca'
                             ' FROM revisao_identidade WHERE decidido = 0'
                             ' ORDER BY confianca DESC LIMIT 20')
    return fontes, contagem, cobertura, revisao


def unir(con, pessoa_id, absorvida_id):
    """Funde duas identidades que eram a mesma pessoa.

    Existe porque o casamento automatico erra e alguem precisa poder corrigir
    sem reconstruir o banco. Os aliases e os fatos migram; a identidade vazia
    e removida.
    """
    if pessoa_id == absorvida_id:
        return 0
    n = 0
    for t in ('alias', 'registro', 'fato_matricula', 'fato_consultoria', 'fato_formulario',
              'revisao_identidade'):
        cur = con.execute(f'UPDATE {t} SET pessoa_id = ? WHERE pessoa_id = ?',
                          (pessoa_id, absorvida_id))
        n += cur.rowcount
    con.execute('DELETE FROM pessoa WHERE id = ?', (absorvida_id,))
    con.commit()
    return n


def separar(con, nome_norm):
    """Desfaz um casamento errado: a grafia vira pessoa propria."""
    r = con.execute('SELECT nome_visto FROM alias WHERE nome_norm = ?', (nome_norm,)).fetchone()
    if not r:
        return None
    cur = con.execute('INSERT INTO pessoa (nome_canonico, criado_em) VALUES (?,?)',
                      (r['nome_visto'], _agora()))
    novo = cur.lastrowid
    con.execute('UPDATE alias SET pessoa_id = ?, metodo = ?, confianca = 1.0'
                ' WHERE nome_norm = ?', (novo, 'separado manualmente', nome_norm))
    con.commit()
    return novo
