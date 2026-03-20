from typing import Literal

from posthog.test.base import BaseTest

from parameterized import parameterized

from posthog.hogql.context import HogQLContext
from posthog.hogql.database.database import Database
from posthog.hogql.database.models import DateTimeDatabaseField, IntegerDatabaseField, StringDatabaseField, TableNode
from posthog.hogql.database.postgres_table import PostgresTable
from posthog.hogql.parser import parse_expr, parse_select
from posthog.hogql.printer import prepare_and_print_ast
from posthog.hogql.query import create_default_modifiers_for_team


class TestPostgresTable(BaseTest):
    def _init_database(self, *, predicates=None, extra_fields=None):
        self.database = Database.create_for(team=self.team)

        fields = {
            "id": IntegerDatabaseField(name="id"),
            "team_id": IntegerDatabaseField(name="team_id"),
            "name": StringDatabaseField(name="name"),
        }
        if extra_fields:
            fields.update(extra_fields)

        self.database.tables.add_child(
            TableNode(
                name="postgres_table",
                table=PostgresTable(
                    name="postgres_table",
                    postgres_table_name="some_table_on_postgres",
                    **({"predicates": predicates} if predicates else {}),
                    fields=fields,
                ),
            )
        )

        self.context = HogQLContext(
            team_id=self.team.pk,
            enable_select_queries=True,
            database=self.database,
            modifiers=create_default_modifiers_for_team(self.team),
        )

    def _select(self, query: str, dialect: Literal["hogql", "clickhouse"] = "clickhouse") -> str:
        return prepare_and_print_ast(parse_select(query), self.context, dialect=dialect)[0]

    def test_postgres_table_select(self):
        self._init_database()

        hogql = self._select(query="SELECT * FROM postgres_table LIMIT 10", dialect="hogql")
        self.assertEqual(
            hogql,
            "SELECT id, team_id, name FROM postgres_table LIMIT 10",
        )

        clickhouse = self._select(query="SELECT * FROM postgres_table LIMIT 10", dialect="clickhouse")

        self.assertEqual(
            clickhouse,
            f"SELECT postgres_table.id AS id, postgres_table.team_id AS team_id, postgres_table.name AS name FROM postgresql(%(hogql_val_1_sensitive)s, %(hogql_val_2_sensitive)s, %(hogql_val_0_sensitive)s, %(hogql_val_3_sensitive)s, %(hogql_val_4_sensitive)s) AS postgres_table WHERE equals(postgres_table.team_id, {self.team.id}) LIMIT 10",
        )

    @parameterized.expand(
        [
            (
                "single_predicate_clickhouse",
                [parse_expr("created_at >= today() - interval 30 day")],
                "SELECT id FROM postgres_table LIMIT 10",
                "clickhouse",
                "SELECT postgres_table.id AS id FROM postgresql(%(hogql_val_1_sensitive)s, %(hogql_val_2_sensitive)s, %(hogql_val_0_sensitive)s, %(hogql_val_3_sensitive)s, %(hogql_val_4_sensitive)s) AS postgres_table WHERE and(equals(postgres_table.team_id, {team_id}), greaterOrEquals(postgres_table.created_at, minus(today(), toIntervalDay(30)))) LIMIT 10",
            ),
            (
                "multiple_predicates_clickhouse",
                [
                    parse_expr("created_at >= today() - interval 30 day"),
                    parse_expr("status != 'deleted'"),
                ],
                "SELECT id FROM postgres_table LIMIT 10",
                "clickhouse",
                "SELECT postgres_table.id AS id FROM postgresql(%(hogql_val_1_sensitive)s, %(hogql_val_2_sensitive)s, %(hogql_val_0_sensitive)s, %(hogql_val_3_sensitive)s, %(hogql_val_4_sensitive)s) AS postgres_table WHERE and(and(equals(postgres_table.team_id, {team_id}), greaterOrEquals(postgres_table.created_at, minus(today(), toIntervalDay(30)))), notEquals(postgres_table.status, %(hogql_val_5)s)) LIMIT 10",
            ),
            (
                "predicates_transparent_in_hogql",
                [parse_expr("created_at >= today() - interval 30 day")],
                "SELECT id FROM postgres_table LIMIT 10",
                "hogql",
                "SELECT id FROM postgres_table LIMIT 10",
            ),
        ]
    )
    def test_postgres_table_predicates(self, _name, predicates, query, dialect, expected_sql):
        self._init_database(
            predicates=predicates,
            extra_fields={
                "created_at": DateTimeDatabaseField(name="created_at"),
                "status": StringDatabaseField(name="status"),
            },
        )
        result = self._select(query=query, dialect=dialect)
        self.assertEqual(result, expected_sql.format(team_id=self.team.id))
