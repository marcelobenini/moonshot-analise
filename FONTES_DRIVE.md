# Fontes no Google Drive

Os IDs abaixo são estáveis; o título e a pasta não. Buscar por nome funciona
hoje e quebra quando alguém renomeia — sempre use o ID.

Conector: conta pessoal `marcelobbaquero@gmail.com`, que enxerga arquivos
corporativos (`@nataliabeauty.com.br`) compartilhados com ela.

| Fonte | ID | Dono | Situação |
|---|---|---|---|
| ALUNOS MATRICULADOS MOONSHOT CLUB | `1kgjKglqeD1EZTuBQyXeScuFUhhtBfi17Ga9uMRuOVcE` | cursos.softskill@nataliabeauty.com.br | domínio nataliabeautyacademy.com como leitor |
| Cancelamentos - Moonshot | `1TFCElkN_ej73a3XGAPSBBUcwfWALMoQcI8PertjoaCU` | adm@awcorp.tech | só o dono na lista visível |
| Controle Consultorias | `14a4imw_Nh57MQFOJjPjMdEa4qhx6d_KdVClJIQaIWH4` | brasil.sensualite@gmail.com | **`anyone` com papel `writer`** |
| franquia_nabeauty_sobrancelha_cilios.xlsx | `1kvQNia9u0stvSEHkw8ZhETKEjKVdxpvw` | daniele.silva@nataliabeauty.com.br | **`anyone` com papel `writer`** |

As duas últimas estão abertas para qualquer pessoa com o link **editar**, sem
login. Verificado em 15/09/2026.

## Como baixar sem estourar o contexto

`read_file_content` achata as abas numa tabela só e embaralha as colunas quando
cada aba tem layout diferente — foi o que aconteceu com o cadastro de
matrículas, onde `Status` passou a conter datas e `Status Financeiro`, nome de
consultor. **Para planilha multi-aba, exportar como xlsx.**

O resultado excede o limite de resposta e é salvo em arquivo pelo próprio
harness, o que é a parte boa: o base64 nunca entra no contexto. Depois:

```python
import json, base64
j = json.load(open('<arquivo salvo pelo harness>'))
open('dados/destino.xlsx', 'wb').write(base64.b64decode(j['content']))
```

E daí em diante é o parser normal (`matriculas.carregar`), que já entende as
abas e os layouts diferentes.

## Sensibilidade

Além de nome, telefone e faturamento, estas planilhas carregam:

- `DADOS VENDAS NOVEMBRO25 PC`: **CPF e endereço completo** de 127 pessoas
- `Cancelamentos - Moonshot`: e-mail, telefone e o motivo declarado da saída
- `Controle Consultorias`: relato livre com inadimplência, insatisfação,
  separações, problemas de saúde e ao menos uma ação judicial contra a empresa

Nada disso vai para o git. O `.db` fica em `dados/`, ignorado.
