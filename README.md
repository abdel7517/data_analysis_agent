# Data Analysis Agent

Agent d'analyse de données intelligent avec streaming temps réel, utilisant **PydanticAI**, **DuckDB** et **Plotly** pour explorer et visualiser des datasets CSV via une interface web interactive.

## Fonctionnalités

- **Agent PydanticAI** avec Mistral LLM pour analyse en langage naturel
- **Requêtes SQL** sur datasets CSV via DuckDB (in-memory)
- **Visualisations interactives** Plotly.js intégrées
- **Streaming temps réel** via Server-Sent Events (SSE)
- **Architecture event-driven** avec Redis Pub/Sub pour découplage backend/agent
- **Interface React TypeScript** moderne avec shadcn/ui
- **Système de blocs dynamiques** : thinking, text, tool calls, charts, tables
- **Animations fluides** pour collapsibles avec transitions CSS

## Architecture

```
┌──────────────┐     POST /chat      ┌──────────────┐
│   Frontend   │ ──────────────────▶ │   FastAPI    │
│ (React + TS) │                     │   Backend    │
└──────────────┘                     └──────────────┘
       ▲                                    │
       │                                    │ PUBLISH
       │ SSE                                ▼
       │ (streaming)              ┌──────────────────┐
       │                          │      Redis       │
       │                          │     Pub/Sub      │
       │                          └──────────────────┘
       │                                    │
       │                                    │ SUBSCRIBE
       │         PUBLISH                    ▼
       └─────────────────────────  ┌──────────────────┐
                                   │ Agent Worker     │
                                   │ (PydanticAI)     │
                                   │                  │
                                   │ ┌──────────────┐ │
                                   │ │   DuckDB     │ │
                                   │ │  (CSV data)  │ │
                                   │ └──────────────┘ │
                                   └──────────────────┘
```

### Flow détaillé

```
Frontend              Backend (FastAPI)           Redis           Agent Worker (PydanticAI)
   │                         │                      │                     │
   ├── POST /api/chat ──────►│                      │                     │
   │   {email, message}      ├── publish() ───────►│                     │
   │                         │   inbox:{email}      │                     │
   │   ◄── {status:"queued"} │                      │                     │
   │                         │                      ├── subscribe ───────►│
   │                         │                      │   inbox:*           │
   │                         │                      │                     │
   ├── GET /stream/{email} ──►│                      │                     │
   │   (SSE connection)      ├── subscribe() ──────►│                     │
   │                         │   outbox:{email}     │                     │
   │                         │                      │                     │ DuckDB query
   │                         │                      │                     │ Plotly chart
   │                         │                      │  ◄── thinking ──────┤
   │   ◄── thinking event ───┤ ◄────────────────────┤                     │
   │   ◄── tool_call_start ──┤ ◄────────────────────┤  ◄── tool events ──┤
   │   ◄── plotly chart ─────┤ ◄────────────────────┤  ◄── plotly ───────┤
   │   ◄── done ─────────────┤ ◄────────────────────┤  ◄── done ─────────┤
```

> Le backend est un **passe-plat** : il publie les requêtes dans Redis et retransmet les événements de l'agent vers le frontend via SSE. Aucune logique métier n'est dans le backend.

## Stack Technique

| Composant | Technologies |
|-----------|--------------|
| **Agent** | PydanticAI 1.51+, Mistral LLM (magistral-small-latest) |
| **Data Processing** | DuckDB, Pandas |
| **Visualisation** | Plotly.js |
| **Backend** | FastAPI, sse-starlette, broadcaster[redis] |
| **Frontend** | React 18, TypeScript 5.9, Vite 5 |
| **UI Library** | shadcn/ui, Radix UI, Tailwind CSS |
| **Messaging** | Redis Pub/Sub |
| **Icons** | Lucide React |
| **Markdown** | React Markdown + remark-gfm |
| **Dependency Injection** | dependency-injector |
| **Infra** | Docker Compose (Redis) |

## Structure du Projet

```
agent_orbital/
├── agent/                               # Agent PydanticAI
│   ├── agent.py                         # Création de l'agent avec tools
│   ├── context.py                       # AgentContext (datasets, email)
│   ├── prompt.py                        # System prompt avec info datasets
│   └── tools/
│       ├── query_data.py                # Outil : requêtes SQL via DuckDB
│       └── visualize.py                 # Outil : génération Plotly charts
│
├── backend/                             # API FastAPI
│   ├── main.py                          # Application FastAPI + Container DI
│   ├── domain/
│   │   ├── models/
│   │   │   └── chat.py                  # ChatRequest, ChatResponse
│   │   └── ports/
│   │       └── event_broker_port.py     # Interface EventBroker (pub/sub)
│   ├── infrastructure/
│   │   ├── container.py                 # Container DI (event_broker)
│   │   └── adapters/
│   │       └── broadcast_adapter.py     # Redis Pub/Sub via broadcaster
│   └── routes/
│       ├── chat.py                      # POST /api/chat
│       └── stream.py                    # GET /api/stream/{email} (SSE)
│
├── src/                                 # Infrastructure agent worker
│   ├── domain/
│   │   ├── ports/
│   │   │   └── message_channel_port.py  # Interface MessageChannel
│   │   └── enums/
│   │       └── __init__.py              # SSEEventType, ToolResultMarker
│   ├── application/
│   │   ├── data_analysis_agent.py       # Orchestrateur léger (coordination)
│   │   └── services/
│   │       ├── messaging_service.py     # Service messaging (pub/sub)
│   │       ├── cancellation_manager.py  # Gestion annulation via Pub/Sub
│   │       ├── dataset_loader.py        # Chargement datasets CSV
│   │       ├── event_parser.py          # Parsing events PydanticAI
│   │       └── stream_processor.py      # Traitement stream + publication SSE
│   ├── infrastructure/
│   │   ├── container.py                 # Container DI (channel selector)
│   │   └── adapters/
│   │       ├── redis_channel_adapter.py # Implémentation Redis
│   │       └── memory_channel_adapter.py # Implémentation in-memory (dev)
│   └── config/
│       └── settings.py                  # Config (CHANNEL_TYPE, REDIS_URL)
│
├── frontend/                            # Interface React TypeScript
│   ├── src/
│   │   ├── App.tsx                      # Composant racine
│   │   ├── main.tsx                     # Entry point React
│   │   ├── index.css                    # Tailwind CSS + theme variables
│   │   ├── types/
│   │   │   └── chat.ts                  # Types : SSEEvent, Block, Message (discriminated unions)
│   │   ├── hooks/
│   │   │   ├── useChat.ts               # State management + SSE event handling
│   │   │   └── useSSE.ts                # Connexion SSE avec EventSource
│   │   ├── components/
│   │   │   ├── ChatPage.tsx             # Page principale (email + chat)
│   │   │   ├── MessageList.tsx          # Liste messages avec auto-scroll
│   │   │   ├── ChatInput.tsx            # Input avec auto-resize
│   │   │   ├── messages/                # Composants de blocs
│   │   │   │   ├── AssistantMessage.tsx # Container assistant avec BlockRenderer
│   │   │   │   ├── UserMessage.tsx      # Message utilisateur
│   │   │   │   ├── ThinkingBlock.tsx    # Bloc réflexion (markdown, collapsible)
│   │   │   │   ├── ToolCallBlock.tsx    # Bloc outil (args + result collapsibles)
│   │   │   │   ├── StreamingText.tsx    # Texte streaming (markdown)
│   │   │   │   ├── PlotlyChart.tsx      # Chart Plotly interactif
│   │   │   │   ├── DataTable.tsx        # Table données
│   │   │   │   └── ArgsDisplay.tsx      # Affichage arguments outil
│   │   │   └── ui/                      # shadcn/ui components (15 composants)
│   │   │       ├── alert.tsx, avatar.tsx, badge.tsx, button.tsx
│   │   │       ├── card.tsx, collapsible.tsx, empty.tsx
│   │   │       ├── input.tsx, scroll-area.tsx, separator.tsx
│   │   │       ├── skeleton.tsx, spinner.tsx, table.tsx, textarea.tsx
│   │   │       └── tooltip.tsx
│   │   └── lib/
│   │       └── utils.ts                 # Utilitaires (cn pour classes)
│   ├── package.json                     # React 18 + TypeScript
│   ├── tsconfig.json                    # Config TypeScript strict
│   ├── tailwind.config.js               # Tailwind + animations collapsible
│   ├── components.json                  # Config shadcn/ui
│   ├── postcss.config.js
│   └── vite.config.js                   # Vite dev server + proxy
│
├── data/                                # Datasets CSV
│   ├── CCGENERAL.csv                    # Cartes de crédit (903 KB, 8950 lignes)
│   ├── CarPricePrediction.csv           # Prix voitures (64 KB, 4340 lignes)
│   ├── sales.csv                        # Ventes (9 KB, 113 lignes)
│   └── telcoClient.csv                  # Clients télécom (972 KB, 7043 lignes)
│
├── output/                              # Visualisations générées (.png)
├── docker-compose.yml                   # Redis service
├── main.py                              # CLI : python main.py serve
├── requirements.txt                     # Dépendances Python
└── .env.example                         # Template configuration
```

### Principes architecturaux

- **Ports & Adapters (Hexagonal)** : Les ports (`domain/ports/`) définissent les interfaces, les adapters (`infrastructure/adapters/`) les implémentent
- **Service Layer** : Les services (`application/services/`) encapsulent la logique métier (streaming, parsing, cancellation)
- **Dependency Injection** : Container DI gère le wiring, les services dépendent des abstractions
- **Event-driven** : Redis Pub/Sub découple le backend du worker agent
- **Type-safe** : TypeScript strict mode + discriminated unions (SSEEvent, Block)

## Quick Start

### 1. Lancer Redis

```bash
docker-compose up -d
```

### 2. Installer les dépendances Python

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Configurer l'environnement

Créer un fichier `.env` :

```bash
# LLM (Mistral via PydanticAI)
MODEL=mistral:magistral-small-latest
MISTRAL_API_KEY=votre_cle_api_mistral

# Redis
REDIS_URL=redis://localhost:6379
```

### 4. Lancer l'application

```bash
# Terminal 1: Backend FastAPI
uvicorn backend.main:app --reload --port 8000

# Terminal 2: Agent Worker
python main.py serve

# Terminal 3: Frontend React
cd frontend
npm install
npm run dev
```

Ouvrir http://localhost:3000

## Utilisation

### Interface Web

1. Entrer votre email sur l'écran de connexion
2. Poser une question sur les données disponibles :
   - "Quel est le chiffre d'affaires par région ?"
   - "Montre-moi l'évolution des ventes par mois"
   - "Quel est le prix moyen par marque ?"
3. L'agent affiche sa réflexion, exécute des requêtes SQL, et génère des visualisations
4. Les réponses apparaissent en temps réel avec animations

### CLI

```bash
# Lancer l'agent en mode serveur (Redis)
python main.py serve

# Lancer en mode développement (in-memory, sans Redis)
python main.py serve --channel-type memory
```

## Datasets Disponibles

4 datasets CSV pré-chargés dans `data/` :

### Sales (ventes)
- 113 lignes, 9 KB
- Colonnes : `date`, `product`, `region`, `quantity`, `unit_price`, `revenue`
- Exemples de questions :
  - "Quel est le chiffre d'affaires total par région ?"
  - "Montre-moi l'évolution des ventes par mois"
  - "Quel produit génère le plus de revenus ?"
  - "Compare les quantités vendues par produit et par région"
  - "Quel est le prix unitaire moyen par produit ?"
  - "Top 5 des meilleures journées de vente"
  - "Quelle est la répartition du chiffre d'affaires par produit ?"

### CarPricePrediction (voitures)
- 4340 lignes, 64 KB
- Colonnes : `Make`, `Model`, `Year`, `Engine Size`, `Mileage`, `Fuel Type`, `Transmission`, `Price`
- Exemples de questions :
  - "Quel est le prix moyen par marque ?"
  - "Montre la relation entre le kilométrage et le prix"
  - "Quelle est la distribution des types de carburant ?"
  - "Quelles sont les 10 voitures les plus chères ?"
  - "Comment le prix évolue-t-il en fonction de l'année ?"
  - "Compare le prix moyen entre transmission manuelle et automatique"
  - "Quelle est la taille moteur moyenne par marque ?"
  - "Y a-t-il une corrélation entre la taille du moteur et le prix ?"

### telcoClient (clients télécom)
- 7043 lignes, 972 KB
- Colonnes : `customerID`, `gender`, `SeniorCitizen`, `Partner`, `Dependents`, `tenure`, `PhoneService`, `MultipleLines`, `InternetService`, `OnlineSecurity`, `OnlineBackup`, `DeviceProtection`, `TechSupport`, `StreamingTV`, `StreamingMovies`, `Contract`, `PaperlessBilling`, `PaymentMethod`, `MonthlyCharges`, `TotalCharges`, `Churn`
- Exemples de questions :
  - "Quel est le taux de churn par type de contrat ?"
  - "Montre la distribution des charges mensuelles"
  - "Quels facteurs sont corrélés au churn ?"
  - "Quel est le profil type des clients qui partent (churn = Yes) ?"
  - "Compare les charges mensuelles entre clients fidèles et ceux qui churn"
  - "Quel est le taux de churn chez les seniors vs non-seniors ?"
  - "Quelle méthode de paiement a le plus haut taux de churn ?"
  - "Comment le tenure (ancienneté) influence-t-il le churn ?"
  - "Combien de clients ont un service de streaming TV ?"

### CCGENERAL (cartes de crédit)
- 8950 lignes, 903 KB
- Colonnes : `CUST_ID`, `BALANCE`, `BALANCE_FREQUENCY`, `PURCHASES`, `ONEOFF_PURCHASES`, `INSTALLMENTS_PURCHASES`, `CASH_ADVANCE`, `PURCHASES_FREQUENCY`, `ONEOFF_PURCHASES_FREQUENCY`, `PURCHASES_INSTALLMENTS_FREQUENCY`, `CASH_ADVANCE_FREQUENCY`, `CASH_ADVANCE_TRX`, `PURCHASES_TRX`, `CREDIT_LIMIT`, `PAYMENTS`, `MINIMUM_PAYMENTS`, `PRC_FULL_PAYMENT`, `TENURE`
- Exemples de questions :
  - "Montre la distribution des soldes des clients"
  - "Quelle est la relation entre la limite de crédit et les achats ?"
  - "Top 10 clients avec le plus d'achats"
  - "Quel pourcentage de clients utilisent les avances de cash ?"
  - "Compare les achats en une fois vs en plusieurs fois"
  - "Quels clients paient le montant minimum vs le montant total ?"
  - "Quelle est la corrélation entre le solde et la limite de crédit ?"
  - "Montre la distribution de la fréquence d'achats"

## API Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/chat` | POST | Envoyer un message à l'agent |
| `/api/chat/cancel/{email}` | POST | Annuler le streaming en cours |
| `/api/stream/{email}` | GET | Streaming SSE des réponses |
| `/health` | GET | Health check |

### Exemple POST /api/chat

```bash
curl -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "message": "Quel est le chiffre d'\''affaires par région ?"
  }'
```

**Réponse** :
```json
{
  "status": "queued",
  "email": "user@example.com"
}
```

### Exemple POST /api/chat/cancel/{email}

```bash
curl -X POST http://localhost:8000/api/chat/cancel/user@example.com
```

**Réponse** :
```json
{
  "status": "cancelled",
  "email": "user@example.com"
}
```

### Exemple GET /stream/{email}

```bash
curl http://localhost:8000/api/stream/user@example.com
```

**Réponse SSE** (stream) :
```
data: {"type":"thinking","data":{"content":"Je vais analyser..."}}

data: {"type":"tool_call_start","data":{"name":"query_data","args":{"query":"SELECT..."}}}

data: {"type":"tool_call_result","data":{"result":"[...]"}}

data: {"type":"plotly","data":{"json":"{\"data\":[...],\"layout\":{...}}"}}

data: {"type":"done","data":{}}
```

## Frontend - Système de Blocs

Le frontend affiche les réponses de l'agent sous forme de **blocs typés** avec animations fluides :

### Types de Blocs

| Type | Composant | Description | Animations |
|------|-----------|-------------|-----------|
| **Thinking** | `ThinkingBlock.tsx` | Réflexion de l'agent (markdown, collapsible) | Collapsible avec fade-out (1.6s) |
| **Text** | `StreamingText.tsx` | Réponse texte (markdown avec GFM) | Curseur de typing |
| **Tool Call** | `ToolCallBlock.tsx` | Appel d'outil (nom + args + result collapsibles) | Collapsible avec fade-out (1.6s) |
| **Plotly** | `PlotlyChart.tsx` | Visualisation interactive Plotly.js | Responsive |
| **Data Table** | `DataTable.tsx` | Table de données avec scroll | Stripe rows |
| **Error** | `Alert` (Radix UI) | Messages d'erreur | Variant destructive |

### Animations Collapsibles

Les `ThinkingBlock` et `ToolCallBlock` utilisent des animations CSS personnalisées :

- **Ouverture** : `collapsible-down` (500ms ease-out)
- **Fermeture** : Fade-out (1000ms opacity → 30%) + délai 1600ms + `collapsible-up` (500ms)
- **Cascade** : Les blocs se ferment quand le bloc suivant est **terminé** (pas quand il commence)

**Configuration** : `frontend/tailwind.config.js`
```js
keyframes: {
  'collapsible-down': {
    from: { height: '0' },
    to: { height: 'var(--radix-collapsible-content-height)' },
  },
  'collapsible-up': {
    from: { height: 'var(--radix-collapsible-content-height)' },
    to: { height: '0' },
  },
}
```

### Types TypeScript

Le frontend utilise des **discriminated unions** pour la type-safety :

**SSEEvent** (`frontend/src/types/chat.ts`) :
```typescript
export type SSEEvent =
  | { type: 'thinking'; data: { content: string } }
  | { type: 'text'; data: { content: string } }
  | { type: 'tool_call_start'; data: { name: string; args: Record<string, unknown> } }
  | { type: 'tool_call_result'; data: { result: string } }
  | { type: 'plotly'; data: { json: string } }
  | { type: 'data_table'; data: { json: string } }
  | { type: 'done'; data: Record<string, never> }
  | { type: 'error'; data: { message: string } }
```

**Block types** (tous les blocs ont un champ `done: boolean`) :
```typescript
export type Block =
  | ThinkingBlock    // { id, type: 'thinking', content, done }
  | TextBlock        // { id, type: 'text', content, done }
  | ToolCallBlock    // { id, type: 'tool_call', name, args, result, done }
  | PlotlyBlock      // { id, type: 'plotly', json, done }
  | DataTableBlock   // { id, type: 'data_table', json, done }
  | ErrorBlock       // { id, type: 'error', message, done }
```

### State Management

Le hook `useChat` gère le state via **functional updates** directes sur `streamingBlocks` :

```
streamingBlocks (useState)  ← Functional updates (setStreamingBlocks(prev => ...))
       ↓
MessageList                 ← Affiche les blocs
```

**Helpers factorisés** :
- `appendContentChunk(type, content)` — concatène ou crée un bloc THINKING/TEXT
- `appendJsonBlock(type, json)` — ajoute un bloc PLOTLY/DATA_TABLE instantané
- `commitMessage(extraBlocks?)` — finalise les blocs et copie dans messages[]
- `resetStreamingState()` — reset des refs et du loading
- `ensureBlockConsistency(blocks)` — garantit qu'un seul bloc a `done:false` (celui identifié par `streamingBlockIdRef`)

**Rendu unifié avec key stable** : Le message streaming et le message finalisé partagent le même React `key` → l'instance du composant est préservée → les animations fonctionnent correctement.

## Configuration

Variables d'environnement (`.env`) :

```bash
# === LLM (Mistral via PydanticAI) ===
MODEL=mistral:magistral-small-latest
MISTRAL_API_KEY=votre_cle_api_mistral

# === MESSAGING (Redis) ===
REDIS_URL=redis://localhost:6379
```

**Note** : Seul Mistral est supporté actuellement. Pour d'autres LLMs, modifier `agent/agent.py`.

## Architecture Event-Driven

### Redis Pub/Sub Channels

| Channel | Direction | Contenu |
|---------|-----------|---------|
| `inbox:{email}` | Backend → Agent | Requêtes utilisateur |
| `outbox:{email}` | Agent → Backend | Événements SSE (thinking, tool_call, plotly, etc.) |
| `cancel:{email}` | Backend → Agent | Signal d'annulation du streaming |

### Événements SSE

L'agent streame 8 types d'événements :

1. **thinking** : Réflexion de l'agent (chunks de texte)
2. **text** : Réponse texte finale (chunks)
3. **tool_call_start** : Début d'exécution d'un outil (nom + args)
4. **tool_call_result** : Résultat d'exécution (result string)
5. **plotly** : Visualisation Plotly (JSON)
6. **data_table** : Table de données (JSON avec columns + data)
7. **done** : Fin du streaming
8. **error** : Erreur survenue

### PydanticAI Tools

L'agent dispose de 2 outils :

**query_data** (`agent/tools/query_data.py`) :
- Exécute des requêtes SQL sur les datasets CSV via DuckDB
- Paramètres : `query` (SQL), `dataset_name` (optionnel)
- Retourne : Résultats JSON + marqueurs spéciaux (`PLOTLY_JSON:`, `TABLE_JSON:`)

**visualize** (`agent/tools/visualize.py`) :
- Génère des visualisations Plotly à partir de données
- Paramètres : `data` (JSON), `chart_type`, `x_column`, `y_column`, `title`
- Retourne : Figure Plotly JSON avec marqueur `PLOTLY_JSON:`

### Marqueurs de Résultats

Les outils injectent des marqueurs dans leurs résultats pour que l'agent parse et streame les visualisations :

```python
# Dans tool result
f"PLOTLY_JSON:{json.dumps(fig.to_dict())}"
f"TABLE_JSON:{df.to_json()}"
```

L'agent (`data_analysis_agent.py`) détecte ces marqueurs et émet des événements SSE `plotly` ou `data_table` séparément.

## Technologies Frontend Détaillées

### React + TypeScript

- **React 18.2.0** avec StrictMode
- **TypeScript 5.9.3** strict mode (tous flags activés)
- **Vite 5.0.12** pour dev server et build ultra-rapide
- Path alias `@/*` → `./src/*`

### UI Stack

- **shadcn/ui** : Composants headless accessibles (basés sur Radix UI)
- **Radix UI** : Primitives non-stylées (Collapsible, ScrollArea, Avatar, Alert, etc.)
- **Tailwind CSS 3.4.19** avec plugin animate
- **Lucide React** : 560+ icônes SVG
- **class-variance-authority** : Gestion des variants de composants

### Markdown & Visualisation

- **React Markdown 10.1.0** avec remark-gfm (GitHub Flavored Markdown)
- **Plotly.js** : Charts interactifs (zoom, pan, hover)
- **react-plotly.js** : Wrapper React pour Plotly

### Routing

- **React Router 7.13.0** : Routing (actuellement single-page, mais prêt pour expansion)

### Styling

- **Tailwind CSS** avec système de tokens HSL
- **Dark mode** support (class-based)
- **CSS variables** pour theming (`--background`, `--foreground`, etc.)
- **Custom animations** : `collapsible-down` / `collapsible-up` (500ms ease-out)

## Concepts Clés

### Agent PydanticAI

L'agent est créé avec le framework **PydanticAI** (pas LangChain) :

```python
# agent/agent.py
from pydantic_ai import Agent

agent = Agent(
    model="mistral:magistral-small-latest",
    system_prompt=SYSTEM_PROMPT,
    tools=[query_data, visualize],
)
```

**Avantages PydanticAI** :
- Type-safe avec Pydantic models
- Intégration native avec Mistral
- Streaming built-in
- Tools avec validation automatique des paramètres

### DuckDB In-Memory SQL

L'agent utilise **DuckDB** pour exécuter des requêtes SQL sur les CSV :

```python
import duckdb

conn = duckdb.connect()
conn.execute(f"CREATE TABLE sales AS SELECT * FROM 'data/sales.csv'")
result = conn.execute(query).fetchdf()  # → Pandas DataFrame
```

**Avantages** :
- Pas de setup base de données
- Requêtes SQL ultra-rapides sur CSV
- Support complet SQL ANSI
- Jointures, agrégations, window functions

### Plotly Visualisations

Les visualisations sont générées via **Plotly** et rendues dans le frontend :

```python
import plotly.express as px

fig = px.bar(df, x='region', y='revenue', title='CA par région')
return f"PLOTLY_JSON:{json.dumps(fig.to_dict())}"
```

Le frontend parse le JSON et affiche le chart interactif avec zoom/pan/hover.

### Streaming SSE Architecture

**Backend** : Passe-plat qui retransmet les événements Redis vers SSE
```python
async for message in broker.subscribe(f"outbox:{email}"):
    yield f"data: {message}\n\n"
```

**Agent** : Streame chaque morceau de réponse
```python
async for chunk in agent.run_stream(message):
    await channel.publish(f"outbox:{email}", {
        "type": "text",
        "data": {"content": chunk}
    })
```

**Frontend** : Reçoit et affiche en temps réel
```typescript
const eventSource = new EventSource(`/api/stream/${email}`)
eventSource.onmessage = (event) => {
  const data: SSEEvent = JSON.parse(event.data)
  handleSSEMessage(data)  // Ajoute/met à jour les blocs
}
```

### Optimisations Frontend

1. **React.memo** sur `BlockRenderer`, `ToolCallBlock`, `ThinkingBlock` → évite les re-renders inutiles
2. **useMemo** pour `allMessages` → fusion optimisée messages finalisés + streaming
3. **Functional updates** pour `setStreamingBlocks` → lecture de la dernière valeur même en cas d'événements SSE rapides
4. **Stable keys** : `streamingMessageId` partagé entre streaming et finalisé → préserve l'instance React
5. **Animations CSS** au lieu de JS → performance GPU

## Configuration Avancée

### Variables d'Environnement

```bash
# === LLM ===
MODEL=mistral:magistral-small-latest      # Modèle Mistral
MISTRAL_API_KEY=sk-...                     # Clé API Mistral

# === REDIS ===
REDIS_URL=redis://localhost:6379           # URL Redis

# === AGENT (optionnel) ===
CHANNEL_TYPE=redis                         # "redis" ou "memory" (défaut: redis)
```

### Mode Développement (Sans Redis)

Pour développer sans Redis :

```bash
# Lancer l'agent en mode in-memory
python main.py serve --channel-type memory
```

**Note** : En mode `memory`, le backend et l'agent doivent partager le même process. Utiliser uniquement pour les tests.

## Architecture Détaillée

### Backend (FastAPI)

**Responsabilités** :
- Recevoir les requêtes HTTP (`POST /chat`)
- Publier dans Redis (`inbox:{email}`)
- Souscrire aux réponses (`outbox:{email}`)
- Streamer via SSE vers le frontend

**Pas de logique métier** : Le backend ne fait aucun traitement IA, il est un simple relay.

### Agent Worker

**Responsabilités** :
- Écouter Redis (`inbox:*`)
- Exécuter l'agent PydanticAI
- Streamer les événements (thinking, tool_call, text, plotly, etc.)
- Publier dans Redis (`outbox:{email}`)

**Outils disponibles** :
1. `query_data` : SQL queries via DuckDB
2. `visualize` : Génération de charts Plotly

### Frontend React

**Architecture** :
```
App.tsx
  └── ChatPage.tsx (useChat hook)
      ├── Header (email, disconnect button)
      ├── MessageList (useSSE hook)
      │   └── Messages (User + Assistant)
      │       └── Blocks (Thinking, ToolCall, Text, Plotly, DataTable)
      └── ChatInput
```

**State Flow** :
```
useChat hook
  ├── messages[] (finalisés)
  ├── streamingBlocks[] (en cours)
  ├── isLoading
  └── streamingMessageId (key stable pour React)

useSSE hook
  ├── connect() / disconnect()
  └── EventSource → handleSSEMessage → updateBlocks
```

**Rendu unifié** :
```typescript
const allMessages = useMemo(() => {
  if (isLoading && streamingBlocks.length > 0 && streamingMessageId) {
    return [
      ...messages,
      { id: streamingMessageId, role: 'assistant', blocks: streamingBlocks }
    ]
  }
  return messages
}, [messages, streamingBlocks, isLoading, streamingMessageId])
```

Le même `streamingMessageId` est utilisé pendant le streaming ET après finalisation → React préserve l'instance du composant → les animations de fermeture fonctionnent.

## Troubleshooting

### Redis Connection Error

```bash
# Vérifier que Redis tourne
docker ps | grep redis

# Relancer Redis
docker-compose up -d redis
```

### Agent ne reçoit pas les messages

```bash
# Vérifier les logs du worker
python main.py serve

# Devrait afficher :
# "Agent worker started, listening on inbox:*"
# "Received message for user@example.com"
```

### Frontend ne reçoit pas les événements SSE

1. Vérifier que le backend tourne sur port 8000
2. Vérifier la connexion SSE dans DevTools Network
3. Vérifier que le proxy Vite est configuré (`/api` → `http://localhost:8000`)

### Mistral API Error

```bash
# Vérifier la clé API
echo $MISTRAL_API_KEY

# Tester manuellement
curl https://api.mistral.ai/v1/models \
  -H "Authorization: Bearer $MISTRAL_API_KEY"
```

## Développement

### Ajouter un nouveau dataset

1. Placer le fichier CSV dans `data/`
2. Mettre à jour `agent/prompt.py` avec la description du dataset
3. Relancer l'agent worker

### Ajouter un nouveau type de bloc

1. Définir l'interface dans `frontend/src/types/chat.ts`
2. Ajouter le composant dans `frontend/src/components/messages/`
3. Ajouter le case dans `BlockRenderer` (`AssistantMessage.tsx`)
4. Définir l'événement SSE correspondant dans `chat.ts`

### Modifier les animations

Éditer `frontend/tailwind.config.js` (keyframes) et les composants (durées des `setTimeout` et classes `duration-*`).

## Licence

MIT
