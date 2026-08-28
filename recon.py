"""
Etapa 0 - Reconhecimento das bases de formulario Moonshot.
Gera dicionario_dados.md a partir dos arquivos Excel brutos.

Uso:
    python3 recon.py dados/moonshot_club.xlsx dados/moonshot_pro.xlsx
"""
import sys
import re
import unicodedata
import pandas as pd

# Valores que o respondente escreveu mas que nao carregam informacao analisavel.
# Sao "respondido" no Google Forms (campo obrigatorio) e "vazio" para a analise.
NAO_INFORMATIVOS = {
    "", "nan", "none", "-", "--", "---", ".", "..", "...", "x", "na", "n/a",
    "nao", "no", "nada", "nenhum", "nenhuma", "nao sei", "nao sei dizer",
    "naosei", "nao se", "ns", "ainda nao", "ainda nao sei", "sem", "?", "0",
    "todos", "tudo", "sim", "si", "ok", "nao tenho", "nao tem",
}

# Colunas de escala Likert 1-5: resposta curta e legitima, nao entram na regra acima.
PADRAO_ESCALA = re.compile(r"^[1-5]$")


def normalizar(texto) -> str:
    """Minusculas, sem acento, sem espaco nas pontas. Usado so para comparacao."""
    t = str(texto).strip().lower()
    return "".join(
        c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn"
    )


def eh_escala(serie: pd.Series) -> bool:
    vals = serie.dropna().astype(str).str.strip()
    return len(vals) > 0 and vals.map(lambda v: bool(PADRAO_ESCALA.match(v))).mean() > 0.9


def tem_conteudo(valor, escala: bool) -> bool:
    """True se a resposta carrega informacao analisavel."""
    n = normalizar(valor)
    if escala:
        return bool(PADRAO_ESCALA.match(n))
    if n in NAO_INFORMATIVOS:
        return False
    return len(n) >= 4


def tipo_pergunta(serie: pd.Series, escala: bool) -> str:
    if escala:
        return "escala 1-5"
    vals = serie.dropna().astype(str).str.strip()
    vals = vals[vals != ""]
    if len(vals) == 0:
        return "vazia"
    distintos = vals.nunique()
    comp_medio = vals.str.len().mean()
    if distintos <= 8:
        return "categorica"
    if comp_medio < 25 and distintos / len(vals) < 0.6:
        return "curta / semi-estruturada"
    return "aberta"


# Colunas com dado pessoal identificavel: nunca exibir exemplos reais em relatorio.
PII = re.compile(r"e-?mail|nome completo|numero de contato|endere[cç]o completo|instagram|nome da sua empresa", re.I)


def perfil(caminho: str) -> pd.DataFrame:
    df = pd.read_excel(caminho, dtype=str)
    n = len(df)
    linhas = []
    for col in df.columns:
        escala = eh_escala(df[col])
        preenchido = df[col].notna().sum()
        com_conteudo = df[col].map(lambda v: tem_conteudo(v, escala)).sum()
        vals = df[col].dropna().astype(str).str.strip()
        if PII.search(col):
            exemplos = "[dado pessoal — exemplos omitidos]"
        else:
            exemplos = " || ".join(v[:70] for v in vals.drop_duplicates().head(3))
        linhas.append(
            {
                "coluna": col,
                "tipo": tipo_pergunta(df[col], escala),
                "n": n,
                "preenchido": preenchido,
                "pct_preenchido": round(100 * preenchido / n, 1),
                "com_conteudo": int(com_conteudo),
                "pct_com_conteudo": round(100 * com_conteudo / n, 1),
                "distintos": int(vals.nunique()),
                "exemplos": exemplos,
            }
        )
    return pd.DataFrame(linhas)


def duplicidades(caminho: str) -> dict:
    df = pd.read_excel(caminho, dtype=str)
    out = {}
    for chave in ["Endereço de e-mail", "Qual o seu nome completo?", "Qual o seu número de contato?"]:
        if chave not in df.columns:
            continue
        s = df[chave].map(normalizar)
        dup = s[s.duplicated(keep=False) & (s != "nan")]
        out[chave] = dup.value_counts().to_dict()
    return out


def main(caminhos):
    partes = ["# Dicionário de Dados — Formulários Moonshot\n"]
    partes.append("`pct_preenchido` = campo não nulo. `pct_com_conteudo` = resposta com informação analisável ")
    partes.append("(exclui `não`, `não sei`, `-`, `0`, `tudo` e respostas com menos de 4 caracteres; ")
    partes.append("escalas 1-5 são avaliadas pela própria escala).\n")
    for caminho in caminhos:
        d = perfil(caminho)
        partes.append(f"\n## `{caminho}` — {d['n'].iloc[0]} linhas, {len(d)} colunas\n")
        partes.append("| # | Coluna | Tipo | Preench. | Com conteúdo | Distintos | Exemplos |")
        partes.append("|---|---|---|---|---|---|---|")
        for i, r in d.iterrows():
            ex = r["exemplos"].replace("|", "/").replace("\n", " ")
            partes.append(
                f"| {i} | {r['coluna']} | {r['tipo']} | {r['pct_preenchido']}% | "
                f"{r['pct_com_conteudo']}% ({r['com_conteudo']}/{r['n']}) | {r['distintos']} | {ex} |"
            )
        dups = duplicidades(caminho)
        partes.append("\n**Duplicidades**\n")
        for k, v in dups.items():
            partes.append(f"- `{k}`: {len(v)} valor(es) repetido(s), somando {sum(v.values())} linhas")
    texto = "\n".join(partes) + "\n"
    with open("dicionario_dados.md", "w", encoding="utf-8") as fh:
        fh.write(texto)
    print("dicionario_dados.md gerado.")


if __name__ == "__main__":
    main(sys.argv[1:] or ["dados/moonshot_club.xlsx", "dados/moonshot_pro.xlsx"])
