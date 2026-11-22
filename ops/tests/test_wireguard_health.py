import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('health', Path(__file__).parents[1] / 'wireguard-health.py')
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)


class WireGuardDiagnosticsTests(unittest.TestCase):
    def test_distinguishes_vpn_outage_from_recent_handshake_and_1c_service_failure(self):
        self.assertEqual(health.classify(9000, False, 10000), 'vpn-unresponsive')
        self.assertEqual(health.classify(9900, False, 10000), 'onec-unreachable-vpn-recent')
        self.assertEqual(health.classify(9000, True, 10000), 'healthy')
        self.assertEqual(health.classify(11000, False, 10000), 'clock-skew')

    def test_rejects_missing_or_ambiguous_target_peer(self):
        with patch.object(health, 'command', return_value='peerA 10.0.0.3/32\npeerB 10.0.0.3/32'):
            with self.assertRaises(RuntimeError):
                health.peer_snapshot('wg0', '10.0.0.3/32')

    def test_records_endpoint_changes_without_capturing_healthy_traffic(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(health, 'peer_snapshot', side_effect=[
                    {'endpoint': '192.0.2.1:1000', 'handshake': 9900},
                    {'endpoint': '192.0.2.2:2000', 'handshake': 9960}]), \
                    patch.object(health.socket, 'create_connection'), patch.object(health, 'capture') as capture:
                health.check(root, 10000)
                health.check(root, 10060)
                self.assertEqual(len((root / 'health.jsonl').read_text().splitlines()), 2)
                capture.assert_not_called()
                self.assertEqual((root / 'health.jsonl').stat().st_mode & 0o777, 0o600)

    def test_captures_an_outage_once_and_never_restarts_a_service(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(health, 'peer_snapshot', return_value={'endpoint': '192.0.2.1:1000', 'handshake': 9000}), \
                    patch.object(health.socket, 'create_connection', side_effect=TimeoutError()), \
                    patch.object(health, 'capture', return_value=True) as capture:
                health.check(Path(directory), 10000)
                health.check(Path(directory), 10060)
                self.assertEqual(capture.call_count, 1)


if __name__ == '__main__':
    unittest.main()
