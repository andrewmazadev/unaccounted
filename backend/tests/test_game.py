"""Deterministic engine invariants: investigation, final report, reset.

Run from backend/:  python -m unittest discover -s tests -v
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

import game  # noqa: E402
import main  # noqa: E402
from models import MissionState  # noqa: E402

CANONICAL = next(fid for fid, f in game.FINDINGS.items() if f["canonical"])
WRONG = [fid for fid, f in game.FINDINGS.items() if not f["canonical"]]
REQUIRED = game.FINDINGS[CANONICAL]["required_evidence"]

# Actions that recover the evidence needed to unlock / support the finding.
ACTION_FOR = {a["evidence_id"]: aid for aid, a in game.ACTIONS.items()}


def recover(*evidence_ids: str) -> None:
    for eid in evidence_ids:
        game.investigate(ACTION_FOR[eid])


def snapshot() -> dict:
    return game.state.model_dump()


class GameTestCase(unittest.TestCase):
    def setUp(self):
        game.reset_state()
        self.addCleanup(game.reset_state)


class CaseDataTest(GameTestCase):
    def test_canonical_finding_requires_e02_and_e03(self):
        self.assertEqual(sorted(REQUIRED), ["E-02", "E-03"])
        self.assertGreaterEqual(len(WRONG), 1)


class ResetTest(GameTestCase):
    def test_reset_restores_pristine_state(self):
        recover("E-02", "E-03")
        game.investigate(ACTION_FOR["E-01"])
        self.assertTrue(game.state.report_available)

        game.reset_state()

        self.assertEqual(game.state.discovered_evidence, [])
        self.assertEqual(game.state.completed_tasks, [])
        self.assertEqual(game.state.event_log, [])
        self.assertFalse(game.state.report_available)
        self.assertIsNone(game.state.final_report)
        self.assertFalse(game.state.mission_complete)
        self.assertEqual(game.discovered_evidence(), [])
        self.assertEqual(snapshot(), MissionState().model_dump())

    def test_reset_after_completed_mission_allows_replay(self):
        recover(*REQUIRED)
        result = game.submit_report(CANONICAL, REQUIRED)
        self.assertTrue(result.supported)
        self.assertTrue(game.state.mission_complete)
        self.assertIsNotNone(game.state.final_report)

        game.reset_state()

        self.assertEqual(snapshot(), MissionState().model_dump())

        # The whole mission can be played again from scratch.
        with self.assertRaises(game.ReportError):
            game.submit_report(CANONICAL, REQUIRED)  # nothing recovered yet
        recover(*REQUIRED)
        again = game.submit_report(CANONICAL, REQUIRED)
        self.assertTrue(again.supported)
        self.assertTrue(game.state.mission_complete)


class InvestigateTest(GameTestCase):
    def test_repeated_investigation_is_idempotent(self):
        action = ACTION_FOR["E-02"]
        first = game.investigate(action)
        second = game.investigate(action)

        self.assertEqual(first, second)
        self.assertEqual(game.state.discovered_evidence, ["E-02"])
        self.assertEqual(game.state.completed_tasks, [action])
        self.assertEqual([e.id for e in game.discovered_evidence()], ["E-02"])
        self.assertFalse(game.state.mission_complete)
        # The re-examination is logged, but not as a fresh recovery.
        self.assertEqual(len(game.state.event_log), 2)
        self.assertIn("already in evidence", game.state.event_log[1].message)

    def test_unknown_action_is_rejected_without_mutation(self):
        recover("E-01")
        before = snapshot()

        with self.assertRaises(KeyError):
            game.investigate("open_airlock")

        self.assertEqual(snapshot(), before)

    def test_unknown_action_via_api_is_rejected_without_mutation(self):
        before = snapshot()
        client = TestClient(main.app)

        response = client.post("/investigate", json={"action": "open_airlock"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(snapshot(), before)
        self.assertEqual(game.state.discovered_evidence, [])


class ReportTest(GameTestCase):
    def assert_rejected(self, finding_id, evidence_ids, status_code=400):
        before = snapshot()
        with self.assertRaises(game.ReportError) as ctx:
            game.submit_report(finding_id, evidence_ids)
        self.assertEqual(ctx.exception.status_code, status_code)
        self.assertEqual(snapshot(), before)

    def assert_rejected_and_incomplete(self, finding_id, evidence_ids, status_code=400):
        self.assert_rejected(finding_id, evidence_ids, status_code)
        self.assertFalse(game.state.mission_complete)
        self.assertIsNone(game.state.final_report)

    def test_unrecovered_evidence_cannot_be_cited(self):
        recover(*REQUIRED)
        self.assertNotIn("E-06", game.state.discovered_evidence)
        self.assertIn("E-06", game.EVIDENCE)  # real evidence, just not found

        self.assert_rejected_and_incomplete(CANONICAL, [*REQUIRED, "E-06"])

    def test_unknown_evidence_cannot_be_cited(self):
        recover(*REQUIRED)

        self.assert_rejected_and_incomplete(CANONICAL, [*REQUIRED, "E-99"])

    def test_unknown_finding_is_rejected(self):
        recover(*REQUIRED)

        self.assert_rejected_and_incomplete("not_a_finding", REQUIRED)

    def test_report_unavailable_until_unlock_evidence_recovered(self):
        recover("E-01")

        self.assert_rejected_and_incomplete(CANONICAL, ["E-01"], status_code=409)

    def test_correct_conclusion_requires_sufficient_evidence(self):
        recover(*REQUIRED, "E-01")  # report unlocked, extra evidence in hand

        for insufficient in (["E-02"], ["E-03"], ["E-01"], []):
            result = game.submit_report(CANONICAL, insufficient)
            self.assertFalse(result.supported, insufficient)
            self.assertEqual(result.outcome, [])
            self.assertFalse(game.state.mission_complete, insufficient)
            self.assertIsNone(game.state.final_report, insufficient)
            self.assertEqual(
                set(result.missing_evidence), set(REQUIRED) - set(insufficient)
            )

        result = game.submit_report(CANONICAL, REQUIRED)

        self.assertTrue(result.supported)
        self.assertEqual(result.missing_evidence, [])
        self.assertTrue(result.outcome)
        self.assertTrue(game.state.mission_complete)
        self.assertEqual(game.state.final_report, result)

    def test_wrong_conclusion_is_unsupported(self):
        recover(*REQUIRED, "E-01", "E-06")  # everything recoverable

        for finding_id in WRONG:
            result = game.submit_report(finding_id, ["E-01", "E-02", "E-03", "E-06"])
            self.assertFalse(result.supported, finding_id)
            self.assertEqual(result.outcome, [], finding_id)
            self.assertFalse(game.state.mission_complete, finding_id)
            self.assertIsNone(game.state.final_report, finding_id)

    def test_completed_mission_rejects_further_reports(self):
        recover(*REQUIRED)
        game.submit_report(CANONICAL, REQUIRED)

        self.assert_rejected(WRONG[0], REQUIRED, status_code=409)
        self.assertTrue(game.state.mission_complete)


if __name__ == "__main__":
    unittest.main()
