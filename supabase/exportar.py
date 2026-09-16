#!/usr/bin/env python3
"""Exporta o banco local para CSV pronto para importar no Supabase.

Duas coisas acontecem aqui alem da copia:

- **CPF sai.** Ele so existe dentro de `registro.dados`, no bruto. Como o
  Postgres guarda esse campo como jsonb, o CPF continua consultavel por quem
  tiver acesso a tabela bruta, mas nao aparece em nenhuma tabela que alguem
  abre para trabalhar lista. `--sem-cpf` remove tambem do bruto.
- **`id` sai.** As tabelas do Postgres usam `generated always as identity`, e
  mandar id junto brigaria com a sequencia. As chaves estrangeiras sao
  reescritas na carga, em `carregar.py`.
"""
import argparse
import json
import os
import re
import sys

import pandas as pd

# Roda de dentro de supabase/, entao a raiz do projeto precisa estar no path.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from moonshot import db  # noqa: E402

TABELAS = ['fonte', 'pessoa', 'alias', 'registro', 'fato_matricula',
           'fato_consultoria', 'fato_cancelamento', 'fato_formulario',
           'revisao_identidade']

RX_CPF = re.compile(r'\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b')


def _limpar_bruto(v, sem_cpf):
    """O JSON da linha crua, opcionalmente sem CPF."""
    if not sem_cpf or not v:
        return v
    try:
        d = json.loads(v)
    except (ValueError, TypeError):
        return RX_CPF.sub('[removido]', str(v))
    d.pop('cpf', None)
    return json.dumps({k: (RX_CPF.sub('[removido]', x) if isinstance(x, str) else x)
                       for k, x in d.items()}, ensure_ascii=False)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--banco', default=db.CAMINHO_PADRAO)
    ap.add_argument('--saida', default='supabase/csv')
    ap.add_argument('--sem-cpf', action='store_true',
                    help='remove CPF tambem da camada bruta')
    args = ap.parse_args()

    os.makedirs(args.saida, exist_ok=True)
    con = db.conectar(args.banco)
    try:
        for t in TABELAS:
            d = db.consultar(con, f'SELECT * FROM {t}')
            if t == 'registro' and 'dados' in d.columns:
                d['dados'] = d['dados'].map(lambda v: _limpar_bruto(v, args.sem_cpf))
            caminho = os.path.join(args.saida, f'{t}.csv')
            d.to_csv(caminho, index=False)
            print(f'{t:20s} {len(d):6d} linhas -> {caminho}')
    finally:
        con.close()
    print(f'\nCSV com a coluna `id` preservada: `carregar.py` usa ela para '
          f'remapear as chaves estrangeiras e depois descarta.')


if __name__ == '__main__':
    main()
