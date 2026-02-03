# Flow détaillé de l'agent PydanticAI (`agent/`)
dataset_info est une description textuelle des datasets CSV disponibles. C'est une string
  formatée en markdown qui liste pour chaque fichier CSV : le nom de la table, le nombre de
  lignes, et les colonnes avec leurs types.

  Exemple concret : si tu as 2 fichiers dans data/ :
  - data/sales.csv (1000 lignes, colonnes: id, month, amount, region)
  - data/products.csv (50 lignes, colonnes: id, name, price, category)

  Alors dataset_info contiendrait :

  - **sales**: 1000 rows, columns: id (int64), month (object), amount (float64), region
  (object)
  - **products**: 50 rows, columns: id (int64), name (object), price (float64), category
  (object)

  Cette string est injectée dans le system prompt via get_system_prompt(dataset_info)
  (agent/prompt.py:1), qui la place dans la section ## Available Datasets :

  You are a data analyst assistant...

  ## Available Datasets

  - **sales**: 1000 rows, columns: id (int64), month (object), amount (float64), region
  (object)
  - **products**: 50 rows, columns: id (int64), name (object), price (float64), category
  (object)

  ## Tools
  ...

  Le LLM a besoin de cette info pour savoir quelles tables existent et quelles colonnes 
  utiliser dans ses requêtes SQL. Sans ça, il ne pourrait pas écrire SELECT month, SUM(amount) 
  FROM sales GROUP BY month — il ne connaîtrait ni le nom sales, ni les colonnes month et
  amount.

  C'est généré automatiquement par _load_csv_datasets() dans query_data.py:24-30 en lisant les
  DataFrames chargés. Dans le refactoring prévu, ce sera dataset_loader.get_dataset_info() qui
  s'en chargera.
  
## 1. Point d'entrée : `create_agent()` (`agent/agent.py:11`)

```
Appelant (script, endpoint API, worker...)
    │
    ▼
create_agent(dataset_info="- **sales**: 1000 rows, columns: id (int64), amount (float64)...")
```

Cette fonction :
1. Lit la variable d'env `MODEL` (défaut : `claude-haiku-4-5`) — le LLM qui "réfléchit"
2. Crée un `Agent[AgentContext]` PydanticAI avec :
   - **`model`** : le LLM à utiliser
   - **`deps_type=AgentContext`** : type du contexte partagé entre les tools
   - **`system_prompt`** : généré par `get_system_prompt(dataset_info)` — contient les instructions, datasets dispo, règles
   - **`retries=3`** : si un tool call échoue, PydanticAI renvoie l'erreur au LLM (3 tentatives)
3. Enregistre 2 tools via `agent.tool()` : `query_data` et `visualize`
4. Retourne l'objet `Agent`

## 2. Contexte partagé : `AgentContext` (`agent/context.py:8`)

```python
@dataclass
class AgentContext:
    datasets: dict[str, pd.DataFrame]          # {"sales": DataFrame, "products": DataFrame}
    dataset_info: str                            # Description textuelle des datasets
    current_dataframe: Optional[pd.DataFrame]    # Résultat de la dernière query SQL
    email: str                                   # Identifiant de l'utilisateur
```

Objet **mutable partagé** entre tous les tool calls d'une même conversation.
Quand `query_data` écrit dans `ctx.deps.current_dataframe`, `visualize` peut le lire juste après.
PydanticAI l'injecte automatiquement dans chaque tool via `ctx.deps`.

## 3. Quand l'utilisateur envoie un message

```python
agent = create_agent(dataset_info)
context = AgentContext(datasets={...}, email="user@example.com")
result = await agent.run("Montre moi les ventes par mois", deps=context)
```

Flow interne PydanticAI :

```
┌─────────────────────────────────────────────────────────────┐
│  agent.run("Montre moi les ventes par mois", deps=context) │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────┐
│  PydanticAI envoie au LLM :                │
│                                             │
│  SYSTEM: get_system_prompt(dataset_info)    │
│    → "You are a data analyst assistant..."  │
│    → Liste des datasets disponibles         │
│    → Règles (SQL first, query before viz)   │
│    → Description des 2 tools disponibles    │
│                                             │
│  USER: "Montre moi les ventes par mois"    │
│                                             │
│  TOOLS (schema auto-généré par PydanticAI): │
│    → query_data(sql: str, description: str) │
│    → visualize(code: str, title: str, ...)  │
└──────────────────────────┬──────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────┐
│  Le LLM répond (typiquement) :             │
│                                             │
│  <thinking>                                 │
│  Je dois faire un GROUP BY mois...          │
│  </thinking>                                │
│                                             │
│  TOOL CALL: query_data(                     │
│    sql="SELECT ... GROUP BY month",         │
│    description="Ventes agrégées par mois"   │
│  )                                          │
└──────────────────────────┬──────────────────┘
                           │
                           ▼
```

## 4. Exécution de `query_data` (`agent/tools/query_data.py:33`)

```
PydanticAI intercepte le tool call du LLM
    │
    ▼
query_data(ctx=RunContext[AgentContext], sql="SELECT...", description="...")
    │
    ├── 1. _load_csv_datasets(ctx)       ← Charge les CSV de data/ dans ctx.deps.datasets
    │       (lazy: ne charge que si ctx.deps.datasets est vide)
    │
    ├── 2. Crée une connexion DuckDB en mémoire
    │       conn = duckdb.connect(":memory:")
    │
    ├── 3. Enregistre chaque DataFrame comme table SQL
    │       conn.register("sales", df_sales)
    │       conn.register("products", df_products)
    │
    ├── 4. Exécute la requête SQL
    │       result_df = conn.execute(sql).fetchdf()
    │
    ├── 5. Stocke le résultat dans le contexte partagé
    │       ctx.deps.current_dataframe = result_df   ← C'est ça que visualize lira
    │
    └── 6. Retourne un résumé texte au LLM :
            "Query executed successfully.
             Result: 12 rows x 2 columns
             Columns: month, total_sales
             Preview:
               month  total_sales
                 Jan       15000
                 Feb       18000 ..."
```

Le retour (string) est renvoyé au LLM comme résultat du tool call.

## 5. Le LLM décide de visualiser

```
┌──────────────────────────────────────────────┐
│  Le LLM reçoit le résultat du tool call :   │
│  "Query executed successfully. 12 rows..."   │
│                                              │
│  Il répond :                                 │
│  <thinking>                                  │
│  J'ai 12 mois, un bar chart serait bien...  │
│  </thinking>                                 │
│                                              │
│  TOOL CALL: visualize(                       │
│    code="fig = px.bar(df, x='month',        │
│           y='total_sales', title='...')",    │
│    title="Ventes mensuelles",                │
│    result_type="figure",                     │
│    description="Bar chart des ventes/mois"   │
│  )                                           │
└──────────────────────────┬───────────────────┘
                           │
                           ▼
```

## 6. Exécution de `visualize` (`agent/tools/visualize.py:13`)

```
visualize(ctx, code="fig = px.bar(...)", title="Ventes mensuelles", result_type="figure")
    │
    ├── 1. Vérifie ctx.deps.current_dataframe != None
    │       (sinon erreur : "Call query_data first")
    │
    ├── 2. Prépare un namespace isolé pour exec() :
    │       namespace = {
    │           "df": current_dataframe.copy(),   ← Données de la dernière query
    │           "pd": pandas,
    │           "px": plotly.express,
    │           "go": plotly.graph_objects,
    │       }
    │
    ├── 3. Exécute le code Python du LLM :
    │       exec("fig = px.bar(df, x='month', y='total_sales')", namespace)
    │       → Crée `fig` dans le namespace
    │
    ├── 4. Récupère fig depuis le namespace
    │
    ├── 5. Sauvegarde HTML : output/ventes_mensuelles.html
    │
    ├── 6. Sérialise en JSON : fig.to_json()
    │
    └── 7. Retourne au LLM :
            "Figure created: Ventes mensuelles
             Saved to: output/ventes_mensuelles.html
             Type: Figure
             Traces: 1
             PLOTLY_JSON:{...JSON plotly complet...}"
```

Le marqueur `PLOTLY_JSON:` est destiné au futur StreamingCoordinator (SSE → frontend).

## 7. Le LLM conclut

```
LLM génère sa réponse finale :
"Les ventes montrent une tendance haussière avec un pic en décembre (25 000).
 Le mois le plus faible est février (12 000)."
```

PydanticAI retourne le résultat complet via `result.data`.

## Résumé du cycle complet

```
User Message
    │
    ▼
LLM (system prompt + tools schema)
    │
    ├── <thinking> ... </thinking>
    ├── TOOL CALL: query_data(sql)
    │       │
    │       ▼
    │   DuckDB exécute SQL sur les DataFrames
    │   → Stocke résultat dans ctx.deps.current_dataframe
    │   → Retourne preview texte au LLM
    │       │
    │       ▼
    ├── <thinking> ... </thinking>
    ├── TOOL CALL: visualize(code, title, result_type)
    │       │
    │       ▼
    │   exec(code) crée un fig Plotly
    │   → Sauvegarde HTML + sérialise JSON
    │   → Retourne résultat + PLOTLY_JSON au LLM
    │       │
    │       ▼
    └── Réponse texte finale (insight)
            │
            ▼
        result.data → retourné à l'appelant
```

**Point clef** : `AgentContext` est l'objet partagé mutable qui fait le lien entre les tools.
`query_data` y écrit (`current_dataframe`), `visualize` y lit. PydanticAI gère la boucle
LLM ↔ tools automatiquement (y compris les retries si `retries=3`).
