from pathlib import Path

import duckdb
import pandas as pd
from pydantic_ai import RunContext

from agent.context import AgentContext

DATA_DIR = Path("data")


def _load_csv_datasets(ctx: RunContext[AgentContext]) -> None:
    """Load CSV files from data/ into context datasets if not already loaded."""
    if ctx.deps.datasets:
        return

    if not DATA_DIR.exists():
        return

    for csv_file in sorted(DATA_DIR.glob("*.csv")):
        table_name = csv_file.stem
        ctx.deps.datasets[table_name] = pd.read_csv(csv_file)

    if ctx.deps.datasets:
        # Build dataset_info for the system prompt context
        info_parts = []
        for name, df in ctx.deps.datasets.items():
            cols = ", ".join(f"{c} ({df[c].dtype})" for c in df.columns)
            info_parts.append(f"- **{name}**: {df.shape[0]} rows, columns: {cols}")
        ctx.deps.dataset_info = "\n".join(info_parts)


async def query_data(
    ctx: RunContext[AgentContext],
    sql: str,
    description: str,
) -> str:
    """Execute a SQL query against the loaded datasets.

    Args:
        ctx: Injected context with loaded datasets.
        sql: SQL query to execute. Table names correspond to dataset names.
        description: Short description of what this query does.
    """
    _load_csv_datasets(ctx)

    if not ctx.deps.datasets:
        return "Error: No datasets loaded. Place CSV files in the data/ directory."

    try:
        with duckdb.connect(database=":memory:") as conn:
            for name, df in ctx.deps.datasets.items():
                conn.register(name, df)
            result_df = conn.execute(sql).fetchdf()

        ctx.deps.current_dataframe = result_df

        preview = result_df.head(5).to_string(index=False)
        summary = (
            f"Query executed successfully.\n"
            f"Result: {result_df.shape[0]} rows x {result_df.shape[1]} columns\n"
            f"Columns: {', '.join(result_df.columns.tolist())}\n"
            f"Preview:\n{preview}"
        )
        return summary

    except Exception as e:
        return f"Error executing SQL query: {e}"
