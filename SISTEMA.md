# Moonshot System

O que substitui as planilhas no dia a dia: cadastro único de alunas, funis em
Kanban, registro de consultoria, demandas internas entre as áreas e
notificações. Roda no navegador (computador e celular) sobre o mesmo Supabase
que já guarda a base histórica.

| Parte | Onde está |
|---|---|
| Banco, permissões e automações | `supabase/sistema.sql` |
| Os seis funis (etapas, alertas, gatilhos, campos) | `supabase/sistema_funis.sql` |
| Importação inicial da base histórica | `supabase/sistema_importar.sql` |
| Teste do banco, papel por papel | `supabase/teste_sistema.sql` · `supabase/testar_sistema.sh` |
| Aplicativo (React) | `app/` |

---

## O que muda em relação ao REGRAS.md

Até aqui **a planilha era a verdade e o banco era derivado**. Com o sistema no
ar, isso se inverte: o time registra direto no sistema, e as tabelas dele
(`aluna`, `card`, `registro_consultoria`, `demanda`…) passam a ser a verdade.
As tabelas de ingestão (`pessoa`, `fato_*`) continuam como histórico e como
origem da importação.

Na prática, para cada planilha:

1. Importa (`select importar_base_historica();`).
2. Define a **data de corte** e avisa o time.
3. A partir dela, a planilha vira **só leitura**. Nada novo entra nela.

Nada no sistema tem chave estrangeira para `pessoa`. Por isso um
`carregar.py --recarregar` na base histórica não apaga o trabalho do time.

---

## Perfis e o que cada um vê

| Perfil | Edita | Só lê |
|---|---|---|
| **Coordenação** | tudo, mais a tela Equipe | — |
| **CS** | Onboarding, Renovação, cadastro de alunas, redistribuição de carteira | Ciclo de consultoria, Retenção |
| **Consultor** | Ciclo, Oportunidades e Renovação, **só da própria carteira**, mais registro de consultoria | Onboarding e Retenção das próprias alunas |
| **Comercial** | Comercial (Expansão) | Oportunidades |
| **Retenção** | Cancelamento/Retenção | Onboarding, Ciclo |

O **relato do consultor** (a situação da aluna) é dado sensível: aparece só
para o consultor e a CS da aluna e para a coordenação. O contato básico da aluna
(nome, telefone, e-mail) é visível a todo o time, porque a busca e o controle
de duplicata dependem disso.

Tudo isso está no banco (RLS), não só na tela. Quem abrir o console do
navegador vê exatamente o mesmo que a tela mostra.

Para mudar quem edita ou lê um funil, altere `papeis_editam` e `papeis_leem`
em `sistema_funis.sql` e reaplique o arquivo.

---

## Automações (todas da especificação dos funis)

| Quando | O que acontece |
|---|---|
| Card do Onboarding chega em **Ativada** | Nasce o card no Ciclo do consultor e ele é avisado |
| Consultor registra consultoria | Card do ciclo anda sozinho até a etapa daquela consultoria; a ficha atualiza saúde, faturamento e data |
| Saúde = **Risco de saída** ou **Sem contato** | Abre card em Retenção (etapa "Risco sinalizado"); avisa Retenção e CS |
| Saúde engajada e faturamento ≥ R$ 80 mil | Sugere ao consultor sinalizar oportunidade (no máximo uma vez por mês) |
| Oportunidade vai para **Enviada ao comercial** | Nasce o card no Comercial com produto e justificativa; o comercial é avisado |
| Comercial **Ganha** | Atualiza o produto da aluna, avisa o consultor e fecha a oportunidade como "Virou venda" |
| Comercial **Perdida** | Exige motivo e devolve a oportunidade ao consultor com o motivo |
| Pedido de saída (Retenção → **Pedido recebido**) | Avisa na hora o consultor e a CS da aluna |
| Renovação → **Encaminhada à Retenção** | Abre card em Retenção |
| Etapas de perda | Não deixam mover sem motivo |
| Card mudou de responsável, comentário, demanda nova, resposta, conclusão | Notifica quem precisa saber |

**Rotina diária** (7h de Brasília, via `pg_cron`):

- **Renovação**: o card nasce 120 dias antes do término, para a CS da aluna,
  sem entrada manual. Não renasce depois de fechado para o mesmo contrato.
- **Card parado** além do `alerta_dias` da etapa: avisa o responsável e, nas
  etapas marcadas, a coordenação.
- **90 dias sem consultoria**: avisa o consultor e a coordenação. Aluna sem
  nenhum registro conta a partir da entrada no sistema. Como a planilha não
  traz a data da última consultoria, a importação não dispara alerta para a
  base inteira no primeiro dia.
- **Demanda com prazo vencido**: avisa o responsável.

Os números (120 dias, 90 dias, R$ 80 mil) ficam na tabela `parametro` e mudam
sem mexer em código.

---

## Implantação, passo a passo

### 1. Banco (Supabase)

No projeto do Supabase (região São Paulo, ver `supabase/README.md`):

> Já aplicado no projeto `moonshot-base` em 20/10/2026. Os passos abaixo
> servem para um projeto novo ou para reaplicar depois de mudar os arquivos.

1. **Database → Extensions**: ative `pg_cron`. É ele que roda a rotina diária.
2. **SQL Editor**: execute, nesta ordem:
   1. `supabase/schema.sql` (se a base histórica ainda não estiver lá)
   2. `supabase/sistema.sql`
   3. `supabase/sistema_funis.sql`
   4. `supabase/sistema_importar.sql`
   5. `supabase/sistema_planilhas.sql`

   Os cinco podem ser reaplicados sem perder dado.
3. Se a base histórica estiver carregada, rode:
   ```sql
   select importar_base_historica();  -- alunas, ciclos e pedidos em aberto
   select rotina_diaria();            -- gera os cards de renovação já
   ```

### 2. Login

Em **Authentication**:

- **Sign In / Providers → Email**: desligue *Allow new users to sign up*. Só
  entra quem for convidado.
- **URL Configuration**: em *Site URL*, coloque o endereço do app (passo 3).
  Em *Redirect URLs*, coloque o mesmo endereço seguido de `/senha`.

### 3. Aplicativo

Qualquer hospedagem de site estático serve. Com a Vercel:

1. Importe o repositório e escolha `app` como *Root Directory*.
2. Build: `npm run build` · Output: `dist`. A Vercel detecta sozinha.
3. Variáveis de ambiente (Project Settings → API no Supabase):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (a chave **pública**; nunca a `service_role`)

O `vercel.json` já cuida das rotas e agenda o **Cron que impede o Supabase de
pausar**: todo dia às 8h17 de Brasília, a Vercel chama `/api/manter-ativo`, que
faz uma chamada leve ao banco (`manter_ativo()`). O plano gratuito do Supabase
pausa o projeto depois de dias sem acesso pela API, e o `pg_cron` interno não
conta como acesso. Opcional: defina `CRON_SECRET` nas variáveis da Vercel para
que só ela consiga disparar essa rota.

Para conferir se o Cron está funcionando, veja em **Vercel → Settings → Cron
Jobs**, ou abra `https://<seu-app>/api/manter-ativo` no navegador. A resposta
deve trazer `"ok": true`.

### 4. Equipe

1. **Authentication → Users → Invite user**: convide cada pessoa pelo e-mail.
   Ela recebe o link, cria a senha e cai em "aguardando liberação".
2. A primeira coordenação é liberada pelo SQL Editor, uma vez só:
   ```sql
   update perfil set papel = 'coordenador', ativo = true where email = 'seu@email.com';
   ```
3. Daí em diante, tudo pela tela **Equipe**: papel, liberar e bloquear. Para os
   consultores, preencha também o **nome na planilha** (como aparecia no
   Controle Consultorias, ex.: "carol") e clique em **Vincular carteiras da
   planilha**. As alunas importadas vão para a carteira certa.
4. Distribua a CS das alunas importadas (a planilha de matrículas não tem esse
   campo): pela ficha da aluna, ou em lote no SQL Editor.

### 5. Trazer as planilhas

Tela **Importar planilha** (só coordenação). Baixe cada planilha do Drive como
`.xlsx` (Arquivo → Fazer download → Microsoft Excel) e solte na tela. O sistema
reconhece o tipo pelo conteúdo; dá para trocar se errar. Importar de novo a
mesma planilha atualiza, não duplica.

Ordem recomendada (as primeiras criam as alunas; as outras completam):

| # | Planilha | Vira no sistema |
|---|----------|-----------------|
| 1 | Matrículas (abas PB-, PC-, Elite, Privaty, In Company) | alunas, contratos, cards de onboarding |
| 2 | Controle Consultorias | carteira do consultor, agenda das 6 consultorias, anotações |
| 3 | Máquina de Vendas (alunas_maio) | contratos do produto Máquina |
| 4 | Cancelamentos | status, motivo e cards no funil de retenção |
| 5 | Kit / Pijamas | jaqueta e kit entregue |
| 6 | Cadastro | telefone, e-mail e dados de cadastro |
| 7 | Inadimplentes | status financeiro e a lista no Início |
| 8 | Eventos | tela Eventos, com confirmados, presença e potencial |

Cada nome é procurado na base por e-mail, telefone e nome (com tolerância a
erro de digitação e nome incompleto). Quando o sistema não tem certeza, cria
uma **pendência** em vez de juntar: confira no fim da importação e use
**"É a mesma pessoa"** para unir duas fichas.

Depois de importar, vá em **Equipe**, preencha o *nome na planilha* de cada
consultor e CS (aceita apelidos: "Thiago, Tiago") e clique em **Vincular
carteiras**. A tabela "Nomes que vieram das planilhas" mostra o que ainda não
está ligado a ninguém.

Fica para depois: **Orçamentos** (viagens e reembolsos).

---

## Desenvolvimento

```bash
cd app
cp .env.example .env    # preencha URL e chave pública
npm install
npm run dev             # http://localhost:5173
npm run build           # checa tipos e gera dist/
```

Teste do banco, contra qualquer Postgres 16 vazio:

```bash
PGHOST=... PGUSER=postgres supabase/testar_sistema.sh
```

Mais de 110 verificações: o que cada papel vê e não vê, cada automação, a
importação das planilhas e a rotina diária. Rode sempre que mexer em `sistema*.sql`.

---

## O que ainda não faz

- **Notificação por e-mail ou WhatsApp.** Hoje são no sino do app e no aviso do
  navegador, que funciona com a aba aberta em segundo plano.
- **Campos obrigatórios por etapa**, além do motivo. Por exemplo, os campos do
  handoff para o comercial ainda não são exigidos.
- **Anexos** em card e demanda.
- **Integração com o Uno CRM.** O desenho já facilita: uma aluna = um registro,
  funis e etapas iguais aos da especificação. Quando o Uno vier, a migração é
  de dado, não de processo.
- **Pendências de negócio** da especificação: crédito do consultor que origina
  oportunidade, dono do funil de renovação (hoje vai para a CS) e política de
  retenção por faixa.
