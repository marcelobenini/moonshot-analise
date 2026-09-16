# Moonshot no Supabase

Migração testada de ponta a ponta contra um Postgres 16 real antes de chegar
aqui: esquema criado, 7.614 linhas carregadas, zero chave estrangeira órfã,
visões respondendo. O que está escrito abaixo foi executado, não imaginado.

## Antes de começar

O conector do Supabase **não está instalado** na sua conta Claude. Isso não
impede a migração — os passos abaixo rodam pelo painel do Supabase e por linha
de comando. O conector serve para eu consultar o banco depois, direto daqui.

Para instalar: claude.ai → Configurações → Conectores → Supabase.

## Passo 1 — criar o projeto

No [supabase.com](https://supabase.com), crie um projeto. O plano gratuito
comporta esta base com folga (nossa carga total é de poucos MB contra o limite
do free tier, que é de centenas). **Escolha a região South America (São Paulo)**
— não por causa da latência, que é irrelevante aqui, mas porque dado pessoal de
brasileiras fica melhor hospedado no Brasil sob a LGPD.

Guarde a senha do banco. Ela aparece uma vez.

## Passo 2 — criar o esquema

Copie o conteúdo de `schema.sql` no **SQL Editor** do painel e execute. Ou, por
linha de comando:

```bash
export DATABASE_URL='postgresql://postgres.<ref>:<senha>@<host>:5432/postgres'
python supabase/carregar.py --schema
```

A URI está em Project Settings → Database → Connection string → URI.

Isso cria 9 tabelas, 4 visões e liga RLS em tudo.

## Passo 3 — carregar os dados

```bash
python supabase/exportar.py              # gera supabase/csv/ do banco local
python supabase/carregar.py              # carrega no Postgres
python supabase/carregar.py --recarregar # limpa antes (para repetir)
```

Para deixar o CPF fora até da camada bruta:

```bash
python supabase/exportar.py --sem-cpf
```

## O que vai para lá

| Tabela | Linhas | O que é |
|---|---|---|
| `pessoa` | 1.108 | Identidade consolidada |
| `alias` | 1.338 | Toda grafia já vista de cada nome |
| `registro` | 2.482 | Linha crua de cada planilha, em `jsonb` |
| `fato_matricula` | 810 | Contrato, turma, consultor, contato |
| `fato_consultoria` | 550 | Faturamento atual e relato do consultor |
| `fato_cancelamento` | 378 | Pedidos de saída e desfecho |
| `fato_formulario` | 744 | Respostas dos formulários |
| `revisao_identidade` | 199 | Casamentos de nome a conferir |
| `fonte` | 5 | Procedência de tudo acima |

Quatro visões prontas: `vw_pessoa_completa`, `vw_divergencia_consultor`,
`vw_retencao` e o cruzamento por consultor.

## Três decisões que valem entender

**Os ids não são reaproveitados.** O Postgres gera os dele e `carregar.py`
traduz as chaves estrangeiras no caminho. Reaproveitar id do SQLite quebraria a
sequência e faria a próxima inserção colidir.

**O CPF sai das tabelas de trabalho.** Ele só existe dentro de
`registro.dados`. Não serve para contato e não precisa estar numa tabela que
alguém abre para trabalhar lista. `--sem-cpf` tira também de lá.

**RLS fica ligada, e isso vai te surpreender.** O Supabase liga por padrão e a
tabela fica **invisível até existir política** — inclusive para você, pela API.
O `schema.sql` cria política de leitura para usuário autenticado. Pelo SQL
Editor do painel você vê tudo de qualquer jeito, porque ele passa por cima da
RLS. Aperte essas políticas antes de dar acesso ao time: esta base tem
telefone, faturamento e relato sobre inadimplência e processo judicial.

## Manter atualizado

O banco é derivado. As planilhas no Drive são a verdade, e o ciclo é:

```
Drive (planilhas)  →  banco.py ingerir  →  SQLite local  →  supabase/carregar.py
```

Uma rotina agendada pode rodar isso sozinha. O que ela precisa: o conector do
Drive (já tem) e a `DATABASE_URL` guardada como variável de ambiente do
ambiente remoto — **não commitada**.

## Limitação conhecida

`carregar.py` insere linha a linha para conseguir remapear as chaves. São 7.614
linhas e leva segundos; se a base crescer uma ordem de grandeza, vale trocar
por `COPY` com os ids já resolvidos antes.
