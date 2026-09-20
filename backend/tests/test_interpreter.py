"""AI-boundary invariants, using a fake Ollama client (no network, no model).

The model may only propose bounded tasks; everything is re-validated and only
the deterministic engine creates evidence.

Run from backend/:  python -m unittest discover -s tests -v
"""

import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import game  # noqa: E402
import interpreter  # noqa: E402
import main  # noqa: E402


class FakeOllamaClient:
    """Stands in for ollama.Client; returns a canned message content string."""

    def __init__(self, content: str):
        self.content = content
        self.calls = 0

    def chat(self, **kwargs):
        self.calls += 1
        return SimpleNamespace(message=SimpleNamespace(content=self.content))


def task(role: str, action: str) -> dict:
    return {"role": role, "action": action, "reason": "test"}


def model_output(tasks: list[dict], message: str | None = None, **extra) -> str:
    return json.dumps({"tasks": tasks, "message": message, **extra})


ENGINEERING_REACTOR = task("engineering", "inspect_reactor")
SCIENCE_LOGS = task("science", "analyze_environmental_logs")
SECURITY_REACTOR = task("security", "inspect_reactor")  # role/action mismatch


class InterpreterTestCase(unittest.TestCase):
    def setUp(self):
        game.reset_state()
        self.addCleanup(game.reset_state)

    def fake(self, content: str) -> FakeOllamaClient:
        return FakeOllamaClient(content)


class InterpretTest(InterpreterTestCase):
    """The interpret() boundary: schema validation of model output."""

    def test_valid_multi_agent_command(self):
        client = self.fake(model_output([ENGINEERING_REACTOR, SCIENCE_LOGS]))

        result = interpreter.interpret("check reactor and logs", client=client)

        self.assertEqual(
            [(t.role, t.action) for t in result.tasks],
            [
                ("engineering", "inspect_reactor"),
                ("science", "analyze_environmental_logs"),
            ],
        )
        interpreter.validate_tasks(result.tasks)  # does not raise
        self.assertEqual(client.calls, 1)
        # Interpreting alone never touches the mission.
        self.assertEqual(game.state.discovered_evidence, [])

    def test_role_action_mismatch_is_rejected_by_validate_tasks(self):
        client = self.fake(model_output([SECURITY_REACTOR]))
        result = interpreter.interpret("security, inspect reactor", client=client)

        with self.assertRaises(interpreter.InterpreterError) as ctx:
            interpreter.validate_tasks(result.tasks)

        self.assertEqual(ctx.exception.status_code, 502)

    def test_more_than_max_tasks_is_rejected(self):
        tasks = [
            ENGINEERING_REACTOR,
            task("engineering", "inspect_thermal_system"),
            SCIENCE_LOGS,
            task("security", "inspect_lifeboats"),
        ]
        self.assertGreater(len(tasks), interpreter.MAX_TASKS)

        with self.assertRaises(interpreter.InterpreterError) as ctx:
            interpreter.interpret("do everything", client=self.fake(model_output(tasks)))

        self.assertEqual(ctx.exception.status_code, 502)

    def test_malformed_output_fails_cleanly(self):
        for content in ("not json at all", "", '{"tasks": "reactor"}', "[]", "{}"):
            with self.subTest(content=content):
                with self.assertRaises(interpreter.InterpreterError) as ctx:
                    interpreter.interpret("x", client=self.fake(content))
                self.assertEqual(ctx.exception.status_code, 502)

    def test_invented_action_or_role_is_rejected(self):
        for bad in (
            task("engineering", "self_destruct"),
            task("captain", "inspect_reactor"),
        ):
            with self.subTest(task=bad):
                with self.assertRaises(interpreter.InterpreterError):
                    interpreter.interpret("x", client=self.fake(model_output([bad])))

    def test_model_cannot_supply_evidence(self):
        client = self.fake(
            model_output([ENGINEERING_REACTOR], evidence=["E-99"], discovered_evidence=["E-06"])
        )

        result = interpreter.interpret("reactor", client=client)

        self.assertFalse(hasattr(result, "evidence"))
        self.assertEqual(game.state.discovered_evidence, [])


class CommandEndpointTest(InterpreterTestCase):
    """POST /command end to end, with the Ollama client swapped for a fake."""

    def post_command(self, content: str):
        client = FakeOllamaClient(content)
        with mock.patch.object(interpreter.ollama, "Client", return_value=client):
            response = TestClient(main.app).post("/command", json={"command": "go"})
        self.assertEqual(client.calls, 1, "fake client was not used")
        return response

    def assert_rejected_without_mutation(self, content: str):
        before = game.state.model_dump()

        response = self.post_command(content)

        self.assertEqual(response.status_code, 502, response.text)
        self.assertEqual(game.state.model_dump(), before)
        self.assertEqual(game.state.discovered_evidence, [])
        self.assertEqual(game.state.completed_tasks, [])

    def test_valid_multi_agent_command_runs_deterministic_actions(self):
        # Extra fields the model "claims" must not create evidence.
        content = model_output(
            [ENGINEERING_REACTOR, SCIENCE_LOGS], evidence=["E-99", "E-06"]
        )

        response = self.post_command(content)

        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(
            [(t["role"], t["action"]) for t in body["tasks"]],
            [
                ("engineering", "inspect_reactor"),
                ("science", "analyze_environmental_logs"),
            ],
        )
        self.assertEqual([e["id"] for e in body["evidence"]], ["E-01", "E-03"])
        self.assertEqual(game.state.discovered_evidence, ["E-01", "E-03"])
        self.assertEqual(
            game.state.completed_tasks,
            ["inspect_reactor", "analyze_environmental_logs"],
        )

    def test_role_action_mismatch_is_rejected(self):
        self.assert_rejected_without_mutation(model_output([SECURITY_REACTOR]))

    def test_valid_first_task_then_invalid_second_task_mutates_nothing(self):
        self.assert_rejected_without_mutation(
            model_output([ENGINEERING_REACTOR, SECURITY_REACTOR])
        )
        self.assertNotIn("E-01", game.state.discovered_evidence)
        self.assertEqual(game.state.event_log, [])

    def test_more_than_three_tasks_is_rejected(self):
        self.assert_rejected_without_mutation(
            model_output(
                [
                    ENGINEERING_REACTOR,
                    task("engineering", "inspect_thermal_system"),
                    SCIENCE_LOGS,
                    task("security", "inspect_lifeboats"),
                ]
            )
        )

    def test_malformed_model_output_mutates_nothing(self):
        self.assert_rejected_without_mutation("this is not structured output")

    def test_invented_action_mutates_nothing(self):
        self.assert_rejected_without_mutation(
            model_output([ENGINEERING_REACTOR, task("engineering", "self_destruct")])
        )

    def test_rejection_preserves_existing_progress(self):
        game.investigate("inspect_thermal_system")
        before = game.state.model_dump()

        response = self.post_command(model_output([SCIENCE_LOGS, SECURITY_REACTOR]))

        self.assertEqual(response.status_code, 502)
        self.assertEqual(game.state.model_dump(), before)
        self.assertEqual(game.state.discovered_evidence, ["E-02"])


if __name__ == "__main__":
    unittest.main()
