"""DRF views for ci_monitoring."""

from __future__ import annotations

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from posthog.api.routing import TeamAndOrgViewSetMixin

from ..facade import api, contracts
from .serializers import (
    CIHealthSerializer,
    CIRunSerializer,
    CreateQuarantineInputSerializer,
    CreateRepoInputSerializer,
    QuarantineSerializer,
    RepoSerializer,
    TestCaseSerializer,
    TestExecutionSerializer,
)


class RepoViewSet(TeamAndOrgViewSetMixin, viewsets.GenericViewSet):
    scope_object = "INTERNAL"

    def list(self, request: Request, *args, **kwargs) -> Response:
        repos = api.list_repos(team_id=self.team_id)
        return Response(RepoSerializer(repos, many=True).data)

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        repo = api.get_repo(repo_id=kwargs["pk"], team_id=self.team_id)
        return Response(RepoSerializer(repo).data)

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = CreateRepoInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        repo = api.create_repo(
            contracts.CreateRepoInput(
                team_id=self.team_id,
                repo_external_id=data["repo_external_id"],
                repo_full_name=data["repo_full_name"],
                default_branch=data.get("default_branch", "main"),
            )
        )
        return Response(RepoSerializer(repo).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def health(self, request: Request, *args, **kwargs) -> Response:
        health = api.get_ci_health(repo_id=kwargs["pk"], team_id=self.team_id)
        return Response(CIHealthSerializer(health).data)


class CIRunViewSet(TeamAndOrgViewSetMixin, viewsets.GenericViewSet):
    scope_object = "INTERNAL"

    def list(self, request: Request, *args, **kwargs) -> Response:
        runs = api.list_ci_runs(
            team_id=self.team_id,
            repo_id=request.query_params.get("repo_id"),
            branch=request.query_params.get("branch"),
            workflow_name=request.query_params.get("workflow_name"),
        )
        return Response(CIRunSerializer(runs, many=True).data)

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        run = api.get_ci_run(run_id=kwargs["pk"], team_id=self.team_id)
        return Response(CIRunSerializer(run).data)


class TestCaseViewSet(TeamAndOrgViewSetMixin, viewsets.GenericViewSet):
    scope_object = "INTERNAL"

    def list(self, request: Request, *args, **kwargs) -> Response:
        tests = api.list_tests_needing_attention(
            team_id=self.team_id,
            repo_id=request.query_params.get("repo_id"),
            suite=request.query_params.get("suite"),
            min_flake_score=_safe_float(request.query_params.get("min_flake_score"), 0.0),
        )
        return Response(TestCaseSerializer(tests, many=True).data)

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        test = api.get_test_case(test_case_id=kwargs["pk"], team_id=self.team_id)
        return Response(TestCaseSerializer(test).data)

    @action(detail=True, methods=["get"])
    def executions(self, request: Request, *args, **kwargs) -> Response:
        executions = api.get_test_executions(
            test_case_id=kwargs["pk"],
            team_id=self.team_id,
        )
        return Response(TestExecutionSerializer(executions, many=True).data)


class QuarantineViewSet(TeamAndOrgViewSetMixin, viewsets.GenericViewSet):
    scope_object = "INTERNAL"

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = CreateQuarantineInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        quarantine = api.create_quarantine(
            contracts.CreateQuarantineInput(
                team_id=self.team_id,
                test_case_id=data["test_case_id"],
                reason=data["reason"],
                created_by_id=request.user.id,
                create_github_issue=data.get("create_github_issue", True),
            )
        )
        return Response(QuarantineSerializer(quarantine).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def resolve(self, request: Request, *args, **kwargs) -> Response:
        quarantine = api.resolve_quarantine(
            contracts.ResolveQuarantineInput(
                quarantine_id=kwargs["pk"],
                team_id=self.team_id,
                resolved_by_id=request.user.id,
            )
        )
        return Response(QuarantineSerializer(quarantine).data)


def _safe_float(value: str | None, default: float) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default
