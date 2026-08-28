"""Etapa 6 - avaliacao de clustering.

Roda apenas se houver N suficiente e variaveis numericas bem preenchidas.
Se os clusters nao forem interpretaveis em linguagem de negocio, a recomendacao
e descartar e ficar com a segmentacao por regra.
"""
import numpy as np
import pandas as pd

VARS = ['esc_habitos', 'esc_mentalidade', 'esc_metas', 'esc_valores',
        'esc_nao_procrastino', 'esc_autorresponsavel', 'esc_diferenciais',
        'esc_experiencia', 'esc_satisfacao', 'esc_depoimentos', 'esc_indicacao',
        'esc_recompra', 'esc_inovacao', 'log_fat', 'equipe_total', 'anos_operacao']


def avaliar(base, n_minimo=150, k_range=range(2, 9), seed=42):
    """Devolve (relatorio, perfis, rotulos) — rotulos e None se o clustering for descartado."""
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler

    d = base.copy()
    d['log_fat'] = np.log10(d['fat_brl'].where(d['fat_brl'] > 0))
    disponiveis = [v for v in VARS if v in d.columns and d[v].notna().sum() >= n_minimo]
    completo = d.dropna(subset=disponiveis)

    rel = [{'item': 'variaveis com preenchimento suficiente', 'valor': len(disponiveis)},
           {'item': 'variaveis usadas', 'valor': ', '.join(disponiveis)},
           {'item': 'casos completos em todas as variaveis', 'valor': len(completo)},
           {'item': 'N minimo exigido', 'valor': n_minimo}]

    if len(completo) < n_minimo or len(disponiveis) < 5:
        rel.append({'item': 'decisao', 'valor': 'NAO rodar clustering: criterio de N/variaveis nao atendido'})
        return pd.DataFrame(rel), None, None

    X = StandardScaler().fit_transform(completo[disponiveis])
    resultados = []
    for k in k_range:
        km = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(X)
        resultados.append({'k': k, 'silhouette': round(silhouette_score(X, km.labels_), 4),
                           'inercia': round(km.inertia_, 1)})
    tab_k = pd.DataFrame(resultados)
    melhor = tab_k.loc[tab_k['silhouette'].idxmax()]
    rel.append({'item': 'melhor k por silhouette', 'valor': int(melhor['k'])})
    rel.append({'item': 'silhouette do melhor k', 'valor': float(melhor['silhouette'])})

    # Silhouette abaixo de 0,25 indica estrutura fraca: os grupos nao se separam
    # o bastante para sustentar uma decisao comercial.
    if melhor['silhouette'] < 0.25:
        rel.append({'item': 'decisao', 'valor':
                    f'DESCARTAR clustering: silhouette {melhor["silhouette"]:.3f} < 0,25. '
                    f'Sem separacao real entre grupos; usar segmentacao por regra explicita.'})
        return pd.concat([pd.DataFrame(rel), tab_k.assign(item='varredura de k')],
                         ignore_index=True), None, None

    k = int(melhor['k'])
    km = KMeans(n_clusters=k, n_init=10, random_state=seed).fit(X)
    completo = completo.assign(cluster=km.labels_)
    perfis = completo.groupby('cluster')[disponiveis].median()
    perfis['n_alunas'] = completo.groupby('cluster').size()
    rel.append({'item': 'decisao', 'valor': f'clustering mantido com k={k}'})
    return (pd.concat([pd.DataFrame(rel), tab_k.assign(item='varredura de k')], ignore_index=True),
            perfis.reset_index(), completo[['id_aluna', 'cluster']])
