"""add crawl_config_id fk to crawls

Revision ID: 78b051455aef
Revises: 214d960c7ead
Create Date: 2026-07-17 14:12:51.739676

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '78b051455aef'
down_revision: Union[str, Sequence[str], None] = '214d960c7ead'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # batch mode: SQLite can't ALTER TABLE ADD CONSTRAINT directly, so Alembic
    # recreates the table under the hood; this is a transparent passthrough
    # on Postgres, so the same migration works on both.
    with op.batch_alter_table("crawls") as batch_op:
        batch_op.add_column(sa.Column("crawl_config_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_crawls_crawl_config_id", "crawl_configs", ["crawl_config_id"], ["id"]
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table("crawls") as batch_op:
        batch_op.drop_constraint("fk_crawls_crawl_config_id", type_="foreignkey")
        batch_op.drop_column("crawl_config_id")
