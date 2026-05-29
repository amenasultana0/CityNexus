"""create busroute properly

Revision ID: d7febfbe7128
Revises: b5bd7b60b397
Create Date: 2026-05-27 22:19:01.598157
"""

from alembic import op
import sqlalchemy as sa


revision = 'd7febfbe7128'
down_revision = 'b5bd7b60b397'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'busroute',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('route', sa.String(length=50), nullable=False),
        sa.Column('direction', sa.String(length=20), nullable=False),
        sa.Column('source', sa.String(length=255), nullable=False),
        sa.Column('destination', sa.String(length=255), nullable=False),
        sa.Column('first_bus', sa.String(length=20), nullable=False),
        sa.Column('last_bus', sa.String(length=20), nullable=False),
        sa.Column('trips_per_day', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('timetable_json', sa.String(), nullable=False, server_default='[]'),
        sa.Column('stops_json', sa.String(), nullable=False, server_default='[]'),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index(
        'ix_busroute_route',
        'busroute',
        ['route'],
        unique=False
    )


def downgrade():
    op.drop_index('ix_busroute_route', table_name='busroute')
    op.drop_table('busroute')
