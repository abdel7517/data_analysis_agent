# Plan de Migration : Agent LangChain → PydanticAI (Analyse de Données)

## Vue d'ensemble

**Objectif** : Intégrer l'agent PydanticAI existant (`agent/`) dans l'architecture streaming actuelle :
- Requêtes SQL via DuckDB sur fichiers CSV
- Visualisations Plotly interactives
- Streaming en temps réel de : thinking, tool calls, visualisations, réponses
- **Mono-tenant** : Pas de company_id, un seul environnement pour tous

**Principe** : Adapter l'agent existant pour l'intégrer dans l'architecture (Clean Architecture, DI, Redis Pub/Sub, SSE)

**Agent Existant** :
- ✅ Agent PydanticAI déjà créé dans `agent/`
- ✅ Tools `query_data` et `visualize` fonctionnels
- ✅ Context avec DataFrames pandas
- ⚠️ À adapter : streaming, intégration Redis/SSE

---

## Architecture

### Composants Principaux

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                          │
│         (Aucun changement - streaming SSE inchangé)         │
└─────────────────────────────────────────────────────────────┘
                    │ Redis Pub/Sub │
┌─────────────────────────────────────────────────────────────┐
│               Agent Worker (NOUVEAU)                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  DataAnalysisAgent (PydanticAI)                        │ │
│  │    - Tools: query_data(sql) → DataFrame               │ │
│  │    - Tools: visualize(data, chart_type) → Plotly JSON │ │
│  │    - Context: CompanyDataContext (company_id, DuckDB) │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  StreamingCoordinator (NOUVEAU)                        │ │
│  │    - Intercepte les événements PydanticAI             │ │
│  │    - Publie des messages typés vers Redis             │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              Data Layer (Multi-Tenant)                       │
│  DuckDBManager                                              │
│    - Connexions DuckDB par company                         │
│    - Chargement automatique CSV depuis data/{company_id}/  │
└─────────────────────────────────────────────────────────────┘
```

### Agent PydanticAI Existant

```
agent_orbital/agent/                # Agent PydanticAI déjà créé
├── __init__.py
├── agent.py                        # create_agent(dataset_info) → Agent
├── context.py                      # AgentContext (datasets, current_dataframe)
├── prompt.py                       # System prompt avec <thinking> tags
└── tools/
    ├── __init__.py
    ├── query_data.py               # SQL via DuckDB in-memory
    └── visualize.py                # Plotly charts (sauvegarde HTML)
```

**Ce qui est déjà fait** :
- ✅ Agent PydanticAI fonctionnel
- ✅ Tools query_data et visualize
- ✅ Context avec DataFrames pandas
- ✅ System prompt avec <thinking> obligatoire

**Ce qu'il faut adapter** :
- ⚠️ Context : ajouter email pour identifier l'utilisateur
- ⚠️ query_data : charger CSV depuis data/ si datasets vide
- ⚠️ visualize : retourner JSON Plotly au lieu de sauvegarder
- ⚠️ Intégration : wrapper pour Redis/SSE streaming

### Structure des Données

```
agent_orbital/
├── agent/                          # Agent PydanticAI existant
├── data/                           # NOUVEAU - Fichiers CSV
│   ├── sales.csv
│   ├── customers.csv
│   └── products.csv
└── src/application/
    └── data_analysis_agent.py      # NOUVEAU - Wrapper d'intégration
```

---

## Format des Messages (Streaming)

### Enveloppe Uniforme

```json
{
  "type": "thinking" | "tool_call_start" | "tool_call_result" | "plotly" | "data_table" | "text" | "done" | "error",
  "messageId": "msg_abc123",
  "timestamp": "2026-02-02T10:00:00Z",
  "data": { ... }
}
```

### Exemples de Messages

**1. Thinking** (raisonnement de l'agent)
```json
{
  "type": "thinking",
  "messageId": "msg_001",
  "timestamp": "2026-02-02T10:00:00Z",
  "data": {
    "content": "Je dois analyser les ventes par catégorie. Je vais d'abord interroger la table sales.",
    "isComplete": true
  }
}
```

**2. Tool Call Start** (début d'exécution outil)
```json
{
  "type": "tool_call_start",
  "messageId": "msg_002",
  "timestamp": "2026-02-02T10:00:01Z",
  "data": {
    "toolName": "query_data",
    "toolCallId": "tool_001",
    "arguments": {
      "sql": "SELECT category, SUM(amount) as total FROM sales GROUP BY category",
      "description": "Calculate total sales by category"
    }
  }
}
```

**3. Tool Call Result** (résultat outil)
```json
{
  "type": "tool_call_result",
  "messageId": "msg_003",
  "timestamp": "...",
  "data": {
    "toolCallId": "tool_001",
    "toolName": "query_data",
    "status": "success",
    "result": {
      "type": "table",
      "data": {
        "columns": ["category", "total"],
        "rows": [["Electronics", 45000], ["Clothing", 32000]],
        "rowCount": 2
      }
    },
    "executionTimeMs": 45
  }
}
```

**4. Plotly Visualization**
```json
{
  "type": "plotly",
  "messageId": "msg_004",
  "timestamp": "...",
  "data": {
    "title": "Ventes par Catégorie",
    "figure": {
      "data": [{"x": ["Electronics", "Clothing"], "y": [45000, 32000], "type": "bar"}],
      "layout": {"title": "Performance Q4"}
    }
  }
}
```

**5. Data Table**
```json
{
  "type": "data_table",
  "messageId": "msg_005",
  "timestamp": "...",
  "data": {
    "title": "Résultats de la requête",
    "columns": ["category", "total"],
    "rows": [["Electronics", 45000], ["Clothing", 32000]],
    "rowCount": 2,
    "query": "SELECT category, SUM(amount)..."
  }
}
```

**6. Text** (streaming texte)
```json
{
  "type": "text",
  "messageId": "msg_006",
  "timestamp": "...",
  "data": {
    "chunk": "D'après les données, ",
    "isComplete": false
  }
}
```

**7. Done** (fin du streaming)
```json
{
  "type": "done",
  "messageId": "msg_007",
  "timestamp": "...",
  "data": {
    "totalMessages": 7,
    "conversationId": "conv_user@example.com"
  }
}
```

---

## Étapes d'Implémentation

### Phase 1 : Adapter l'Agent Existant pour le Streaming (1 jour)

**Objectif** : Modifier l'agent PydanticAI existant pour le préparer au streaming

#### 1.1 Modifier le Context
**Fichier** : `agent/context.py` (MODIFIER)

**Ajouter email pour identifier l'utilisateur** :
```python
from dataclasses import dataclass, field
from typing import Optional
import pandas as pd

@dataclass
class AgentContext:
    """Context injected into all agent tools via PydanticAI dependency injection."""

    # Existing
    datasets: dict[str, pd.DataFrame] = field(default_factory=dict)
    dataset_info: str = ""
    current_dataframe: Optional[pd.DataFrame] = None

    # NOUVEAU - Identifier l'utilisateur
    email: str = ""
```

#### 1.2 Modifier query_data Tool
**Fichier** : `agent/tools/query_data.py` (MODIFIER)

**Changements** :
- Charger les CSV depuis `data/` si `datasets` est vide
- Auto-découverte des fichiers CSV

```python
async def query_data(
    ctx: RunContext[AgentContext],
    sql: str,
    description: str,
) -> str:
    """Execute a SQL query against the loaded datasets."""

    # Si datasets est vide, charger depuis CSV
    if not ctx.deps.datasets:
        from pathlib import Path
        import pandas as pd

        csv_dir = Path("data")
        if csv_dir.exists():
            for csv_file in csv_dir.glob("*.csv"):
                table_name = csv_file.stem
                ctx.deps.datasets[table_name] = pd.read_csv(csv_file)

    if not ctx.deps.datasets:
        return "Error: No datasets loaded."

    try:
        with duckdb.connect(database=":memory:") as conn:
            for name, df in ctx.deps.datasets.items():
                conn.register(name, df)
            result_df = conn.execute(sql).fetchdf()

        ctx.deps.current_dataframe = result_df
        # ... rest unchanged
```

#### 1.3 Modifier visualize Tool (Retourner JSON au lieu de fichier)
**Fichier** : `agent/tools/visualize.py` (MODIFIER)

**Changements** :
- Pour `result_type="figure"` : retourner le JSON Plotly au lieu de sauvegarder HTML
- Inclure le JSON dans le résultat

```python
if result_type == "figure":
    fig = namespace.get("fig")
    if fig is None:
        return "Error: Code must create a 'fig' variable (plotly Figure)."

    # Retourner le JSON Plotly pour streaming
    fig_json = fig.to_json()

    return (
        f"Figure created: {title}\n"
        f"Type: {type(fig).__name__}\n"
        f"Traces: {len(fig.data)}\n"
        f"JSON: {fig_json}"  # NOUVEAU - pour parsing par le coordinator
    )
```

#### 1.4 Créer la Structure de Données
```bash
mkdir -p data/.gitignore
echo "*.csv" >> data/.gitignore
```

---

### Phase 2 : Créer le Wrapper d'Intégration (1-2 jours)

**Objectif** : Créer un wrapper qui intègre l'agent PydanticAI existant dans l'architecture streaming

#### 2.1 Créer le Wrapper Agent
**Fichier** : `src/application/data_analysis_agent.py` (NOUVEAU)

**Classe** : `DataAnalysisAgent` - Wrapper autour de `agent/agent.py`

```python
import asyncio
import logging
from pydantic import BaseModel, Field, ValidationError
from dependency_injector.wiring import inject, Provide

from agent.agent import create_agent
from agent.context import AgentContext
from src.application.services.messaging_service import MessagingService
from src.domain.ports.message_channel_port import Message
from src.config import settings
from src.infrastructure.container import Container

logger = logging.getLogger(__name__)

class _ParsedMessage(BaseModel):
    """Message validé avec Pydantic."""
    email: str
    user_message: str = Field(..., alias="message")

class DataAnalysisAgent:
    """
    Wrapper qui intègre l'agent PydanticAI existant dans l'architecture.

    Responsabilités:
    - Écouter Redis via MessagingService
    - Créer AgentContext avec email
    - Exécuter l'agent PydanticAI avec streaming
    - Publier les événements vers Redis
    """

    def __init__(self):
        self._initialized = False
        self.agent = None
        self.streaming_coordinator = None

    async def initialize(self):
        """Initialiser l'agent."""
        if self._initialized:
            return

        # Créer l'agent PydanticAI
        self.agent = create_agent(dataset_info="Datasets will be loaded from CSV files in data/")

        logger.info(f"DataAnalysisAgent initialisé avec modèle: {settings.MODEL}")
        self._initialized = True

    @inject
    async def serve(
        self,
        messaging: MessagingService = Provide[Container.messaging_service],
        coordinator = Provide[Container.streaming_coordinator]
    ):
        """
        Mode serveur : écouter les messages Redis et répondre.
        Pattern identique à SimpleAgent.serve()
        """
        if not self._initialized:
            logger.info("Auto-initialisation de DataAnalysisAgent...")
            await self.initialize()

        self.streaming_coordinator = coordinator

        async with messaging:
            logger.info("DataAnalysisAgent en écoute sur inbox:*")
            async for msg in messaging.listen():
                asyncio.create_task(
                    self._handle_message(messaging, msg)
                )

    async def _handle_message(self, messaging: MessagingService, msg: Message):
        """Traiter un message entrant."""
        try:
            parsed = _ParsedMessage(**msg.data)
        except ValidationError as e:
            logger.warning(f"Message invalide: {e}")
            return

        logger.info(f"Requête de {parsed.email}: {parsed.user_message[:50]}...")

        try:
            # Créer le context avec email
            context = AgentContext(email=parsed.email)

            # Exécuter l'agent avec streaming via le coordinator
            await self.streaming_coordinator.stream_agent_run(
                agent=self.agent,
                prompt=parsed.user_message,
                context=context,
                email=parsed.email
            )

        except Exception as e:
            logger.error(f"Erreur pour {parsed.email}: {e}", exc_info=True)
            await messaging.publish_error(parsed.email, str(e))
```

#### 2.2 Ajouter au Container DI
**Fichier** : `src/infrastructure/container.py` (MODIFIER)

```python
# Wiring
wiring_config = containers.WiringConfiguration(
    modules=[
        "src.application.simple_agent",
        "src.application.data_analysis_agent",  # NOUVEAU
    ]
)

# Provider
data_analysis_agent = providers.Singleton(DataAnalysisAgent)
```

#### 2.3 Ajouter MODEL à Settings
**Fichier** : `src/config/settings.py` (MODIFIER)

```python
class Settings(BaseSettings):
    # ... existing ...

    # Agent PydanticAI
    MODEL: str = "anthropic:claude-haiku-4-5-20251001"
    DATA_ROOT: str = "data"
    AGENT_TYPE: str = "data_analysis"  # ou "rag"
```

---

### Phase 3 : Streaming Coordinator (2-3 jours)

**Objectif** : Intercepter les événements PydanticAI et publier vers Redis

#### 3.1 Créer le Coordinator
**Fichier** : `src/application/services/streaming_coordinator.py` (NOUVEAU)

**Responsabilités** :
- Exécuter l'agent PydanticAI avec `agent.run()`
- Extraire les `<thinking>` tags du stream
- Intercepter les tool calls via PydanticAI events
- Publier tous les événements vers Redis via MessagingService

**Implémentation** :
```python
import re
import json
import logging
from datetime import datetime, timezone
from pydantic_ai import Agent
from agent.context import AgentContext
from src.application.services.messaging_service import MessagingService

logger = logging.getLogger(__name__)

class StreamingCoordinator:
    """
    Coordonne le streaming depuis PydanticAI vers Redis.

    PydanticAI ne supporte pas directement le streaming d'événements
    comme LangChain, donc on utilise une approche différente:
    - Utiliser agent.run() avec streaming de texte
    - Parser les <thinking> tags du texte
    - Détecter les tool calls dans le résultat
    """

    def __init__(self, messaging: MessagingService):
        self.messaging = messaging
        self._message_count = 0

    async def stream_agent_run(
        self,
        agent: Agent,
        prompt: str,
        context: AgentContext,
        email: str
    ):
        """Exécute l'agent et publie tous les événements."""
        self._message_count = 0

        try:
            # PydanticAI: Exécuter l'agent
            result = await agent.run(prompt, deps=context)

            # Parser le résultat pour extraire thinking et tool calls
            await self._parse_and_publish_result(
                result=result,
                email=email,
                context=context
            )

            # Done
            await self.messaging.publish_done(
                email=email,
                total_messages=self._message_count,
                conversation_id=email
            )

        except Exception as e:
            logger.error(f"Erreur streaming pour {email}: {e}", exc_info=True)
            await self.messaging.publish_error(
                email=email,
                error_message=str(e)
            )

    async def _parse_and_publish_result(
        self,
        result,
        email: str,
        context: AgentContext
    ):
        """Parse le résultat de l'agent et publie les événements."""

        # 1. Extraire thinking tags
        thinking_pattern = r'<thinking>(.*?)</thinking>'
        thinking_matches = re.findall(thinking_pattern, str(result.data), re.DOTALL)

        for thinking_text in thinking_matches:
            await self.messaging.publish_thinking(
                email=email,
                content=thinking_text.strip(),
                is_complete=True
            )
            self._message_count += 1

        # 2. Extraire les tool calls depuis result.all_messages()
        # PydanticAI stocke l'historique dans result.all_messages()
        for msg in result.all_messages():
            if msg.get('role') == 'tool':
                tool_name = msg.get('tool_name', 'unknown')
                tool_args = msg.get('tool_args', {})
                tool_result = msg.get('content', '')

                # Publier tool call start
                tool_call_id = f"tool_{self._message_count}"
                await self.messaging.publish_tool_call_start(
                    email=email,
                    tool_name=tool_name,
                    tool_call_id=tool_call_id,
                    arguments=tool_args
                )
                self._message_count += 1

                # Détecter visualisations dans le résultat
                if tool_name == 'visualize' and 'JSON:' in tool_result:
                    # Extraire le JSON Plotly
                    json_match = re.search(r'JSON: ({.*})', tool_result, re.DOTALL)
                    if json_match:
                        try:
                            fig_json = json.loads(json_match.group(1))
                            await self.messaging.publish_plotly(
                                email=email,
                                figure=fig_json,
                                title=tool_args.get('title', 'Visualization')
                            )
                            self._message_count += 1
                        except json.JSONDecodeError:
                            logger.warning("Failed to parse Plotly JSON")

                # Détecter tables dans query_data
                if tool_name == 'query_data' and 'columns' in tool_result.lower():
                    # Parser le résultat pour extraire colonnes et lignes
                    # (simplifié - à adapter selon format exact)
                    pass

                # Publier tool result
                await self.messaging.publish_tool_call_result(
                    email=email,
                    tool_call_id=tool_call_id,
                    tool_name=tool_name,
                    status='success',
                    result={'type': 'text', 'data': tool_result}
                )
                self._message_count += 1

        # 3. Publier la réponse finale (sans les thinking tags)
        final_text = re.sub(thinking_pattern, '', str(result.data), flags=re.DOTALL).strip()

        if final_text:
            # Stream le texte chunk par chunk (simulé)
            for chunk in self._split_into_chunks(final_text):
                await self.messaging.publish_text_chunk(
                    email=email,
                    chunk=chunk,
                    is_complete=False
                )
                self._message_count += 1

            # Final chunk
            await self.messaging.publish_text_chunk(
                email=email,
                chunk="",
                is_complete=True
            )
            self._message_count += 1

    def _split_into_chunks(self, text: str, chunk_size: int = 50):
        """Split texte en chunks pour simuler le streaming."""
        words = text.split()
        for i in range(0, len(words), chunk_size):
            yield ' '.join(words[i:i+chunk_size]) + ' '
```

#### 3.2 Étendre MessagingService
**Fichier** : `src/application/services/messaging_service.py` (MODIFIER)

**Nouvelles méthodes à ajouter** :
- `publish_thinking(email, content, is_complete)`
- `publish_tool_call_start(email, tool_name, tool_call_id, arguments)`
- `publish_tool_call_result(email, tool_call_id, tool_name, status, result)`
- `publish_plotly(email, figure, title)`
- `publish_data_table(email, columns, rows, row_count, title, query)`
- `publish_text_chunk(email, chunk, is_complete)`
- `publish_done(email, total_messages, conversation_id)`

**Pattern** : Toutes publient vers `outbox:{email}` avec format JSON structuré

#### 3.3 Ajouter au Container DI
```python
streaming_coordinator = providers.Singleton(
    StreamingCoordinator,
    messaging=messaging_service
)
```

---

### Phase 4 : Frontend - Nouveaux Composants (3-4 jours)

**Objectif** : Afficher les différents types de contenu streamés

#### 4.1 Composants à Créer

**Dossier** : `frontend/src/components/chat/` (NOUVEAU)

**Fichiers à créer** :

1. **`ThinkingBlock.jsx`**
   - Affiche le raisonnement de l'agent
   - Collapsible par défaut
   - Icône : Brain (lucide-react)
   - Couleur : purple

2. **`ToolCallDisplay.jsx`**
   - Affiche nom de l'outil, arguments, résultat
   - Badge avec temps d'exécution
   - Code formaté avec syntax highlighting
   - États : en cours (blue), succès (green), erreur (red)

3. **`PlotlyChart.jsx`**
   - Charge dynamiquement `plotly.js-dist-min`
   - Rendu interactif avec `Plotly.newPlot()`
   - Responsive et avec contrôles de zoom

4. **`DataTable.jsx`**
   - Tableau scrollable (max 300px hauteur)
   - Header sticky
   - Affiche la requête SQL (optionnel)
   - Badge avec nombre de lignes

5. **`MessageContent.jsx`** (dispatcher)
   - Switch sur `message.type`
   - Renvoie le bon composant selon le type

#### 4.2 Installation Dépendances
```bash
cd frontend
npm install plotly.js-dist-min
```

#### 4.3 Modifier ChatWidget
**Fichier** : `frontend/src/components/ChatWidget.jsx` (MODIFIER)

**Changements principaux** :

1. **Structure des messages** :
```javascript
// User message
{ role: 'user', content: string }

// Assistant message
{
  role: 'assistant',
  contents: [StreamMessage],  // Tous les types (thinking, tools, viz)
  content: string              // Texte final
}
```

2. **Nouveau state** :
```javascript
const [currentAssistantMessage, setCurrentAssistantMessage] = useState(null)
const [currentTextBuffer, setCurrentTextBuffer] = useState('')
```

3. **handleSSEMessage** (callback) :
```javascript
const handleSSEMessage = useCallback((message) => {
  const { type, data } = message

  switch (type) {
    case 'thinking':
    case 'tool_call_start':
    case 'plotly':
    case 'data_table':
      // Ajouter à currentAssistantMessage.contents
      setCurrentAssistantMessage(prev => ({
        ...prev,
        contents: [...prev.contents, message]
      }))
      break

    case 'text':
      // Buffer le texte
      if (data.isComplete) {
        setCurrentAssistantMessage(prev => ({...prev, content: currentTextBuffer}))
      } else {
        setCurrentTextBuffer(prev => prev + data.chunk)
      }
      break

    case 'done':
      // Finaliser et ajouter aux messages
      setMessages(prev => [...prev, currentAssistantMessage])
      setIsLoading(false)
      break
  }
}, [currentTextBuffer])
```

4. **Rendu** :
```jsx
{messages.map((msg, i) => (
  msg.role === 'user' ? (
    <UserMessage content={msg.content} />
  ) : (
    <AssistantMessage>
      {msg.contents.map(content => (
        <MessageContent message={content} />
      ))}
      {msg.content && <TextMessage content={msg.content} />}
    </AssistantMessage>
  )
))}
```

#### 4.4 Hook useSSE
**Fichier** : `frontend/src/hooks/useSSE.js` (AUCUN CHANGEMENT NÉCESSAIRE)

Le hook actuel fonctionne déjà - il parse le JSON et appelle le callback.

---

### Phase 5 : Configuration & CLI (1-2 jours)

**Objectif** : Ajouter les commandes pour gérer les données et démarrer l'agent

#### 5.1 Ajouter à Settings
**Fichier** : `src/config/settings.py` (MODIFIER)

```python
class Settings(BaseSettings):
    # ... existing ...

    # Data Analysis
    DATA_ROOT: str = "data"
    DUCKDB_MAX_CONNECTIONS: int = 50
    AGENT_TYPE: str = "data_analysis"  # ou "rag"
```

#### 5.2 Commandes CLI
**Fichier** : `main.py` (MODIFIER)

**Nouvelles commandes** :

```python
@cli.command()
def serve_data_analysis():
    """Démarrer l'agent d'analyse de données en mode serveur."""
    agent = container.data_analysis_agent()
    asyncio.run(agent.serve())

@cli.command()
@click.option('--csv-dir', required=True)
def import_csv(csv_dir: str):
    """Importer des fichiers CSV dans data/."""
    import shutil
    from pathlib import Path

    source = Path(csv_dir)
    dest = Path("data")
    dest.mkdir(exist_ok=True)

    for csv_file in source.glob("*.csv"):
        shutil.copy(csv_file, dest / csv_file.name)
        print(f"✓ Importé: {csv_file.name}")

@cli.command()
def list_datasets():
    """Lister les datasets disponibles."""
    from pathlib import Path
    import pandas as pd

    data_dir = Path("data")
    if not data_dir.exists():
        print("Aucun dataset trouvé")
        return

    for csv_file in data_dir.glob("*.csv"):
        df = pd.read_csv(csv_file)
        print(f"📊 {csv_file.stem}: {df.shape[0]} rows, {df.shape[1]} columns")
```

---

### Phase 6 : Backend API - Upload CSV (Optionnel, 2-3 jours)

**Objectif** : Permettre l'upload de CSV depuis le frontend

#### 6.1 Endpoint Upload
**Fichier** : `backend/routes/csv.py` (NOUVEAU)

```python
from fastapi import APIRouter, UploadFile, HTTPException
from pathlib import Path
import shutil

router = APIRouter(prefix="/api/csv", tags=["csv"])

@router.post("/upload")
async def upload_csv(file: UploadFile):
    """Upload un fichier CSV."""
    # Validation
    if not file.filename.endswith('.csv'):
        raise HTTPException(400, "Seuls les fichiers CSV sont acceptés")

    # Sauvegarde
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    file_path = data_dir / file.filename

    with file_path.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return {"status": "success", "filename": file.filename}

@router.get("/list")
async def list_csv_files():
    """Lister les fichiers CSV disponibles."""
    import pandas as pd

    data_dir = Path("data")
    if not data_dir.exists():
        return {"files": []}

    files = []
    for csv_file in data_dir.glob("*.csv"):
        df = pd.read_csv(csv_file)
        files.append({
            "name": csv_file.name,
            "table_name": csv_file.stem,
            "rows": len(df),
            "columns": len(df.columns)
        })

    return {"files": files}

@router.delete("/{filename}")
async def delete_csv(filename: str):
    """Supprimer un fichier CSV."""
    file_path = Path("data") / filename

    if not file_path.exists():
        raise HTTPException(404, "Fichier non trouvé")

    file_path.unlink()
    return {"status": "deleted", "filename": filename}
```

#### 6.2 Frontend - Page Upload
**Composant** : Modifier `DocumentsPage.jsx` pour supporter CSV

---

## Fichiers Critiques

### AGENT EXISTANT (À modifier)

1. **`agent/context.py`** (MODIFIER)
   - Ajouter company_id, email, csv_base_path

2. **`agent/tools/query_data.py`** (MODIFIER)
   - Charger CSV depuis data/{company_id}/ si datasets vide

3. **`agent/tools/visualize.py`** (MODIFIER)
   - Retourner JSON Plotly dans le résultat au lieu de sauvegarder HTML

4. **`agent/agent.py`** (INCHANGÉ)
   - Agent PydanticAI déjà fonctionnel

5. **`agent/prompt.py`** (INCHANGÉ)
   - System prompt avec <thinking> tags

### À CRÉER (Nouveaux fichiers d'intégration)

1. **`src/application/data_analysis_agent.py`** (NOUVEAU)
   - Wrapper qui intègre l'agent PydanticAI existant
   - Méthode serve() pour mode worker
   - Pattern identique à SimpleAgent

2. **`src/application/services/streaming_coordinator.py`** (NOUVEAU)
   - Parse les résultats PydanticAI (thinking, tools, réponse)
   - Publication messages typés vers Redis

5. **`frontend/src/components/chat/ThinkingBlock.jsx`**
   - Composant affichage thinking

6. **`frontend/src/components/chat/ToolCallDisplay.jsx`**
   - Composant affichage tool calls

7. **`frontend/src/components/chat/PlotlyChart.jsx`**
   - Composant affichage Plotly

8. **`frontend/src/components/chat/DataTable.jsx`**
   - Composant affichage tables

9. **`frontend/src/components/chat/MessageContent.jsx`**
   - Dispatcher de contenu selon type

### À MODIFIER (Fichiers existants)

1. **`src/infrastructure/container.py`**
   - Ajouter : duckdb_manager, streaming_coordinator, data_analysis_agent
   - Wiring : ajouter "src.application.data_analysis_agent"

2. **`src/application/services/messaging_service.py`**
   - Ajouter 7 nouvelles méthodes publish_* pour les types de messages

3. **`frontend/src/components/ChatWidget.jsx`**
   - **Retirer** la prop `companyId` (plus nécessaire)
   - Retirer `company_id` du body du POST `/api/chat`
   - Modifier structure des messages (contents array)
   - Ajouter state currentAssistantMessage, currentTextBuffer
   - Modifier handleSSEMessage pour router selon type
   - Modifier rendu pour supporter MessageContent

4. **`src/config/settings.py`**
   - Ajouter MODEL, DATA_ROOT, AGENT_TYPE

5. **`main.py`**
   - Ajouter commandes : serve_data_analysis, import_csv, validate_data

6. **`requirements.txt`**
   - Ajouter : pydantic-ai, duckdb, plotly

7. **`frontend/package.json`**
   - Ajouter : plotly.js-dist-min

### INCHANGÉS (Pas de modification)

1. **`backend/routes/stream.py`**
   - Le SSE endpoint fonctionne déjà avec les nouveaux messages

2. **`frontend/src/hooks/useSSE.js`**
   - Hook déjà compatible avec messages structurés JSON

### LÉGÈRE MODIFICATION (Retirer company_id)

1. **`backend/routes/chat.py`** (MODIFIER)
   - Retirer la validation de `company_id` (plus nécessaire)
   - Simplifier le modèle ChatRequest

```python
class ChatRequest(BaseModel):
    email: str
    message: str
```

---

## Stratégie de Migration

### Option 1 : Coexistence (Recommandé)

Les deux agents (RAG et Data Analysis) coexistent :

```python
# main.py
agent_type = settings.AGENT_TYPE

if agent_type == "rag":
    agent = container.simple_agent()
elif agent_type == "data_analysis":
    agent = container.data_analysis_agent()

await agent.serve()
```

**Avantages** :
- Migration progressive par entreprise
- Rollback facile
- Tests A/B possibles

### Option 2 : Routage par Entreprise (Avancé)

Chaque entreprise peut avoir son propre agent :

```python
class CompanyAgentRouter:
    async def _handle_message(self, msg: Message):
        company = await company_repo.get_by_id(msg.company_id)

        if company.agent_type == "rag":
            await self.rag_agent.handle(msg)
        else:
            await self.data_analysis_agent.handle(msg)
```

---

## Tests Essentiels

### Tests Unitaires

1. **DuckDB Adapter**
   - `test_get_connection()` - Création connexion
   - `test_load_csv_files()` - Chargement CSV
   - `test_connection_pooling()` - LRU eviction

2. **Tools PydanticAI**
   - `test_query_data_success()` - Requête SQL valide
   - `test_query_data_error()` - Requête SQL invalide
   - `test_visualize()` - Génération Plotly

3. **Streaming Coordinator**
   - `test_stream_thinking()` - Publication thinking
   - `test_stream_tool_calls()` - Publication tool calls
   - `test_stream_complete_flow()` - Flow complet

### Tests d'Intégration

1. **End-to-End Streaming**
   - Message user → Redis → Agent → Redis → SSE
   - Vérifier ordre et types de messages

2. **Multi-Tenant**
   - Deux entreprises avec données différentes
   - Vérifier isolation

---

## Dépendances à Installer

### Backend
```bash
pip install pydantic-ai duckdb plotly pandas
```

### Frontend
```bash
cd frontend
npm install plotly.js-dist-min
```

---

## Commandes de Démarrage

```bash
# Terminal 1 : API FastAPI (inchangé)
uvicorn backend.main:app --reload --port 8000

# Terminal 2 : Agent d'analyse de données (NOUVEAU)
python main.py serve-data-analysis

# Terminal 3 : Frontend (inchangé)
cd frontend && npm run dev
```

---

## Points d'Attention

### Sécurité SQL
- ⚠️ **Valider les requêtes SQL** : bloquer DROP, DELETE, INSERT, UPDATE, ALTER
- Mode read-only pour DuckDB
- Limite de timeout pour les requêtes longues
- Les requêtes SQL sont générées par le LLM - valider côté serveur

### Performance
- DuckDB in-memory : rapide mais limité par RAM
- Lazy loading de Plotly dans le frontend (import dynamique)
- Limiter la taille des datasets (max 100 MB par CSV recommandé)

### Données
- Tous les utilisateurs partagent les mêmes CSV dans `data/`
- Pas d'isolation entre utilisateurs
- Sauvegarder les CSV importants (pas de .gitignore sur des données critiques)

---

## Temps Estimé Total (SIMPLIFIÉ)

- **Phase 1** : Adapter l'agent existant - 1 jour ✅ Agent déjà créé
- **Phase 2** : Wrapper d'intégration - 1-2 jours
- **Phase 3** : Streaming Coordinator - 2-3 jours
- **Phase 4** : Frontend Composants - 3-4 jours
- **Phase 5** : Configuration & CLI - 1 jour
- **Phase 6** : Upload CSV (optionnel) - 1-2 jours

**Total** : 9-13 jours (2 - 2.5 semaines)

**Gains de temps** :
- ✅ Agent PydanticAI déjà créé : -2 jours
- ✅ Pas de multi-tenant : -2 jours
- **Total économisé** : ~4 jours !

---

## Prochaines Étapes Immédiates

### Étape 1 : Adapter l'Agent Existant (1 jour)
1. ✅ Agent PydanticAI déjà créé dans `agent/`
2. ⏭️ Modifier `agent/context.py` (ajouter `email`)
3. ⏭️ Modifier `agent/tools/query_data.py` (charger CSV depuis `data/`)
4. ⏭️ Modifier `agent/tools/visualize.py` (retourner JSON Plotly)
5. ⏭️ Créer structure `data/` et ajouter quelques CSV de test

### Étape 2 : Intégration dans l'Architecture (1-2 jours)
1. ⏭️ Créer `src/application/data_analysis_agent.py` (wrapper)
2. ⏭️ Créer `src/application/services/streaming_coordinator.py`
3. ⏭️ Étendre `src/application/services/messaging_service.py` (7 nouvelles méthodes)
4. ⏭️ Ajouter au Container DI (`src/infrastructure/container.py`)
5. ⏭️ Ajouter MODEL à Settings (`src/config/settings.py`)
6. ⏭️ Tester avec un CSV de démo

### Étape 3 : Frontend (3-4 jours)
1. ⏭️ Créer composants chat/ (ThinkingBlock, ToolCallDisplay, PlotlyChart, DataTable, MessageContent)
2. ⏭️ Modifier ChatWidget.jsx (nouveau state et handleSSEMessage)
3. ⏭️ Installer `plotly.js-dist-min` : `npm install plotly.js-dist-min`
4. ⏭️ Tester end-to-end avec streaming

### Étape 4 : Configuration & Déploiement (1 jour)
1. ⏭️ Ajouter commandes CLI dans `main.py`
2. ⏭️ Mettre à jour `requirements.txt` (pydantic-ai, duckdb, plotly, pandas)
3. ⏭️ Documenter dans README
4. ⏭️ Tester en production
