#!/usr/bin/env python3
"""Carrega o banco local no Postgres do Supabase.

    export DATABASE_URL='postgresql://postgres.<ref>:<senha>@<host>:5432/postgres'
    python supabase/carregar.py --schema      # cria tabelas, visoes e RLS
    python supabase/carregar.py               # carrega os dados

A ordem das tabelas importa: `fonte` e `pessoa` primeiro, porque todo o resto
aponta para elas. Os ids do SQLite nao sao reaproveitados — o Postgres gera os
dele e este script traduz as chaves estrangeiras no caminho, guardando o
de-para em memoria. Reaproveitar id quebraria a sequencia e faria a proxima
insercao colidir.

Idempotente por tabela: `--recarregar` limpa antes de inserir. Sem isso, rodar
duas vezes duplica.
"""
import argparse
import csv
import json
import os
import sys

import psycopg

RAIZ = os.path.dirname(os.path.abspath(__file__))

# Ordem de dependencia. Nao reordene sem olhar as chaves estrangeiras.
ORDEM = [
    ('fonte', None),
    ('pessoa', {'fonte_origem': 'fonte'}),
    ('alias', {'pessoa_id': 'pessoa', 'fonte_id': 'fonte'}),
    ('registro', {'fonte_id': 'fonte', 'pessoa_id': 'pessoa'}),
    ('fato_matricula', {'fonte_id': 'fonte', 'pessoa_id': 'pessoa'}),
    ('fato_consultoria', {'fonte_id': 'fonte', 'pessoa_id': 'pessoa'}),
    ('fato_cancelamento', {'fonte_id': 'fonte', 'pessoa_id': 'pessoa'}),
    ('fato_formulario', {'fonte_id': 'fonte', 'pessoa_id': 'pessoa'}),
    ('revisao_identidade', {'fonte_id': 'fonte', 'pessoa_id': 'pessoa'}),
]

JSONB = {('registro', 'dados'), ('fato_formulario', 'respostas')}
BOOL = {('revisao_identidade', 'decidido')}


def _valor(tabela, coluna, v):
    """Celula de CSV -> valor que o Postgres aceita."""
    if v is None or v == '':
        return None
    if (tabela, coluna) in JSONB:
        try:
            json.loads(v)
            return v
        except ValueError:
            return json.dumps({'texto_nao_json': v}, ensure_ascii=False)
    if (tabela, coluna) in BOOL:
        return str(v).strip().lower() in ('1', 'true', 't', 'sim')
    return v


def carregar(con, pasta, recarregar=False):
    mapa = {}     # tabela -> {id_sqlite: id_postgres}
    for tabela, fks in ORDEM:
        caminho = os.path.join(pasta, f'{tabela}.csv')
        if not os.path.exists(caminho):
            print(f'{tabela:20s} (sem CSV, pulado)')
            continue
        with open(caminho, encoding='utf-8') as fh:
            linhas = list(csv.DictReader(fh))
        if not linhas:
            print(f'{tabela:20s} vazio')
            continue
        # `alias` tem `nome_norm` como chave e nao tem `id`. Sem este teste o
        # RETURNING id derruba a carga na terceira tabela.
        tem_id = 'id' in linhas[0]
        colunas = [c for c in linhas[0] if c != 'id']
        with con.cursor() as cur:
            if recarregar:
                cur.execute(f'TRUNCATE {tabela} RESTART IDENTITY CASCADE')
            mapa[tabela] = {}
            sql = (f'INSERT INTO {tabela} ({", ".join(colunas)}) '
                   f'VALUES ({", ".join(["%s"] * len(colunas))})'
                   + (' RETURNING id' if tem_id else ''))
            for r in linhas:
                vals = []
                for c in colunas:
                    v = _valor(tabela, c, r.get(c))
                    if fks and c in fks and v is not None:
                        # Traduz o id do SQLite para o que o Postgres gerou.
                        v = mapa.get(fks[c], {}).get(str(int(float(v))))
                    vals.append(v)
                cur.execute(sql, vals)
                if tem_id:
                    mapa[tabela][str(r['id'])] = cur.fetchone()[0]
        con.commit()
        print(f'{tabela:20s} {len(linhas):6d} linhas')
    return mapa


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default=os.environ.get('DATABASE_URL'))
    ap.add_argument('--csv', default=os.path.join(RAIZ, 'csv'))
    ap.add_argument('--schema', action='store_true', help='só cria o esquema e sai')
    ap.add_argument('--recarregar', action='store_true',
                    help='limpa as tabelas antes de inserir')
    args = ap.parse_args()

    if not args.url:
        print('Falta DATABASE_URL. No painel do Supabase: Project Settings -> '
              'Database -> Connection string -> URI.', file=sys.stderr)
        return 1

    with psycopg.connect(args.url) as con:
        if args.schema:
            with open(os.path.join(RAIZ, 'schema.sql'), encoding='utf-8') as fh:
                con.execute(fh.read())
            con.commit()
            print('esquema criado (tabelas, visões e RLS)')
            return 0
        carregar(con, args.csv, args.recarregar)
        with con.cursor() as cur:
            cur.execute('SELECT COUNT(*) FROM vw_pessoa_completa')
            print(f'\nvw_pessoa_completa: {cur.fetchone()[0]} pessoas')
            cur.execute('SELECT desfecho, pedidos FROM vw_retencao ORDER BY pedidos DESC')
            print('retenção:', dict(cur.fetchall()))
    return 0


if __name__ == '__main__':
    sys.exit(main())
