#!/usr/bin/env python3
"""Porta de entrada do banco acumulativo.

    python banco.py ingerir dados/*.xlsx        # detecta o tipo pelo conteudo
    python banco.py ingerir nova.xlsx --tipo matriculas
    python banco.py resumo                      # o que ja entrou
    python banco.py revisar                     # casamentos de nome duvidosos
    python banco.py unir 12 87                  # 87 era a mesma pessoa que 12
    python banco.py separar "maria silva"       # desfaz casamento errado
    python banco.py sql "SELECT ..."            # consulta livre
    python banco.py exportar saida.xlsx         # tudo em Excel

Arquivo do banco: dados/moonshot.db (fora do git — carrega dado pessoal).
"""
import argparse
import os
import sys

import pandas as pd

from moonshot import db


def _mostrar(titulo, d):
    print(f'\n== {titulo}')
    print('(vazio)' if not len(d) else d.to_string(index=False))


def cmd_ingerir(con, args):
    for caminho in args.arquivos:
        if not os.path.exists(caminho):
            print(f'!! {caminho}: nao encontrado')
            continue
        tipo = args.tipo or db.detectar_tipo(caminho)
        fonte_id, n, estado = db.ingerir(con, caminho, args.tipo, args.observacao)
        marca = '=' if estado.startswith('ja') else '+'
        print(f'{marca} {os.path.basename(caminho)} [{tipo}] fonte {fonte_id}: {n} linhas — {estado}')
        if tipo == 'desconhecido' and not estado.startswith('ja'):
            print('  (tipo nao reconhecido: as linhas foram guardadas cruas e ligadas a pessoa '
                  'quando deu. Me diga o que a planilha significa e eu escrevo o parser.)')
    fontes, contagem, _, revisao = db.resumo(con)
    _mostrar('Banco agora', contagem)
    if len(revisao):
        print(f'\n{len(revisao)} casamento(s) de nome para conferir: python banco.py revisar')


def cmd_resumo(con, args):
    fontes, contagem, cobertura, revisao = db.resumo(con)
    _mostrar('Fontes ingeridas', fontes)
    _mostrar('Contagem', contagem)
    cob = cobertura.copy()
    if len(cob):
        cob['onde aparece'] = cob.apply(lambda r: ' + '.join(
            [n for n, v in (('matrícula', r.tem_matricula), ('consultoria', r.tem_consultoria),
                            ('formulário', r.tem_formulario)) if v]) or '(só bruto)', axis=1)
        _mostrar('Cobertura por pessoa', cob[['onde aparece', 'pessoas']])
    div = db.consultar(con, 'SELECT * FROM vw_divergencia_consultor LIMIT 15')
    _mostrar('Cadastro x aba discordam sobre o consultor', div)


def cmd_revisar(con, args):
    d = db.consultar(con, """
        SELECT r.id, r.nome_novo, r.pessoa_id, r.nome_atual, ROUND(r.confianca, 2) AS confianca
        FROM revisao_identidade r WHERE r.decidido = 0
        ORDER BY r.confianca DESC""")
    _mostrar('Casamentos de nome que passaram perto do corte', d)
    if len(d):
        print('\nConfirmar um: python banco.py decidir <id> --ok')
        print('Desfazer:     python banco.py decidir <id> --separar')


def cmd_decidir(con, args):
    r = con.execute('SELECT * FROM revisao_identidade WHERE id = ?', (args.id,)).fetchone()
    if not r:
        print('!! revisao nao encontrada')
        return
    if args.separar:
        from moonshot.consultoria import _chave
        novo = db.separar(con, _chave(r['nome_novo']))
        print(f'separado: "{r["nome_novo"]}" virou pessoa {novo}')
    else:
        print(f'confirmado: "{r["nome_novo"]}" = "{r["nome_atual"]}" (pessoa {r["pessoa_id"]})')
    con.execute('UPDATE revisao_identidade SET decidido = 1 WHERE id = ?', (args.id,))
    con.commit()


def cmd_unir(con, args):
    n = db.unir(con, args.fica, args.absorvida)
    print(f'{n} registro(s) migrados de {args.absorvida} para {args.fica}')


def cmd_separar(con, args):
    novo = db.separar(con, args.nome_norm)
    print(f'nova pessoa {novo}' if novo else '!! grafia nao encontrada')


def cmd_sql(con, args):
    d = db.consultar(con, args.consulta)
    print(d.to_string(index=False) if len(d) else '(sem linhas)')
    if args.saida:
        d.to_csv(args.saida, index=False)
        print(f'-> {args.saida}')


def cmd_exportar(con, args):
    tabelas = ['fonte', 'pessoa', 'alias', 'fato_matricula', 'fato_consultoria',
               'fato_formulario', 'revisao_identidade']
    with pd.ExcelWriter(args.saida, engine='xlsxwriter') as w:
        for t in tabelas:
            db.consultar(con, f'SELECT * FROM {t}').to_excel(w, sheet_name=t[:31], index=False)
        for v in ('vw_pessoa_completa', 'vw_divergencia_consultor', 'vw_cobertura'):
            db.consultar(con, f'SELECT * FROM {v}').to_excel(
                w, sheet_name=v.replace('vw_', '')[:31], index=False)
    print(f'-> {args.saida}')


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--banco', default=db.CAMINHO_PADRAO)
    sub = ap.add_subparsers(dest='cmd', required=True)

    p = sub.add_parser('ingerir', help='adiciona planilha(s) ao banco')
    p.add_argument('arquivos', nargs='+')
    p.add_argument('--tipo', default=None,
                   help='matriculas, consultorias, formulario_pro, formulario_club. '
                        'Sem isso, detecta pelo conteudo')
    p.add_argument('--observacao', default=None, help='nota sobre o que e esse arquivo')
    p.set_defaults(fn=cmd_ingerir)

    p = sub.add_parser('resumo', help='o que ja entrou no banco')
    p.set_defaults(fn=cmd_resumo)

    p = sub.add_parser('revisar', help='casamentos de nome duvidosos')
    p.set_defaults(fn=cmd_revisar)

    p = sub.add_parser('decidir', help='confirma ou desfaz um casamento')
    p.add_argument('id', type=int)
    p.add_argument('--ok', action='store_true')
    p.add_argument('--separar', action='store_true')
    p.set_defaults(fn=cmd_decidir)

    p = sub.add_parser('unir', help='funde duas identidades')
    p.add_argument('fica', type=int)
    p.add_argument('absorvida', type=int)
    p.set_defaults(fn=cmd_unir)

    p = sub.add_parser('separar', help='desfaz casamento de uma grafia')
    p.add_argument('nome_norm')
    p.set_defaults(fn=cmd_separar)

    p = sub.add_parser('sql', help='consulta livre')
    p.add_argument('consulta')
    p.add_argument('--saida', default=None)
    p.set_defaults(fn=cmd_sql)

    p = sub.add_parser('exportar', help='banco inteiro em Excel')
    p.add_argument('saida', nargs='?', default='banco_moonshot.xlsx')
    p.set_defaults(fn=cmd_exportar)

    args = ap.parse_args()
    con = db.conectar(args.banco)
    try:
        args.fn(con, args)
    finally:
        con.close()


if __name__ == '__main__':
    sys.exit(main())
