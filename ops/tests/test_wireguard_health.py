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

    def test_recovery_requires_confirmed_vpn_failure_and_respects_both_limits(self):
        self.assertFalse(health.recovery_due({'status': 'healthy', 'consecutiveFailures': 9}, {}, 10000))
        self.assertFalse(health.recovery_due({'status': 'onec-unreachable-vpn-recent', 'consecutiveFailures': 9}, {}, 10000))
        self.assertFalse(health.recovery_due({'status': 'vpn-unresponsive', 'consecutiveFailures': 1}, {}, 10000))
        failed = {'status': 'vpn-unresponsive', 'consecutiveFailures': 2}
        self.assertTrue(health.recovery_due(failed, {}, 10000))
        self.assertFalse(health.recovery_due(failed, {'lastRecovery': 9500}, 10000))
        self.assertFalse(health.recovery_due(failed, {'recoveries': [7000, 8000, 9000]}, 10000))

    def test_failed_removal_still_restores_private_config_without_logging_it(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = []
            def fake_command(args):
                commands.append(args)
                if args[1:3] == ['showconf', 'wg0']:
                    return '[Interface]\nPrivateKey=NEVER-COPY\n[Peer]\nPublicKey = public-test-only\nAllowedIPs = 10.0.0.3/32\nPresharedKey = private-test-only\n[Peer]\nPublicKey = unrelated-peer\nAllowedIPs = 10.0.0.4/32'
                if args[1] == 'set':
                    raise RuntimeError('simulated failure')
                if args[1] == 'addconf':
                    self.assertIn('private-test-only', Path(args[-1]).read_text())
                    self.assertNotIn('NEVER-COPY', Path(args[-1]).read_text())
                    self.assertNotIn('unrelated-peer', Path(args[-1]).read_text())
                    self.assertEqual(Path(args[-1]).stat().st_mode & 0o777, 0o600)
                return ''
            with patch.object(health, 'peer_key', return_value='public-test-only'), patch.object(health, 'command', side_effect=fake_command):
                with self.assertRaises(RuntimeError):
                    health.recover_peer('wg0', '10.0.0.3/32', root)
            self.assertEqual(commands[-1][1], 'addconf')
            self.assertFalse((root / 'peer-recovery.conf').exists())

    def test_incomplete_recovery_is_restored_before_another_attempt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'peer-recovery.conf').write_text('[Peer]\nPublicKey = public-test-only\nAllowedIPs = 10.0.0.3/32\nPresharedKey = private-test-only')
            with patch.object(health, 'command', return_value='') as command:
                health.restore_pending('wg0', root)
                command.assert_any_call(['wg', 'addconf', 'wg0', str(root / 'peer-recovery.conf')])
            self.assertFalse((root / 'peer-recovery.conf').exists())

    def test_reserves_cooldown_before_reset_and_does_not_reset_every_minute(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def reset(interface, address, state_root):
                import json
                self.assertEqual(json.loads((state_root / 'state.json').read_text())['lastRecovery'], 10060)
            with patch.object(health, 'peer_snapshot', return_value={'endpoint': '192.0.2.1:1000', 'handshake': 9000}), \
                    patch.object(health.socket, 'create_connection', side_effect=TimeoutError()), \
                    patch.object(health, 'capture', return_value=False), \
                    patch.object(health, 'recover_peer', side_effect=reset) as recovery:
                health.check(root, 10000, recover=True)
                health.check(root, 10060, recover=True)
                health.check(root, 10120, recover=True)
                self.assertEqual(recovery.call_count, 1)

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
