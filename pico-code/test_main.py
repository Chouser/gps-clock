import importlib.util
import json
import sys
import types
import unittest
from unittest.mock import Mock


class FakePin:
    OUT = 1
    IN = 2
    PULL_UP = 3

    def __init__(self, pin, mode, pull=None):
        self.pin = pin
        self.mode = mode
        self.pull = pull
        self.values = []
        self._value = 0

    def value(self, value=None):
        if value is not None:
            self._value = value
            self.values.append(value)
        return self._value


class FakeTimer:
    ONE_SHOT = 1
    PERIODIC = 2

    def __init__(self):
        self.inits = []
        self.deinitialized = False

    def init(self, **kwargs):
        self.inits.append(kwargs)

    def deinit(self):
        self.deinitialized = True


class FakeResponse:
    def __init__(self, status_code=200, text="[]"):
        self.status_code = status_code
        self.text = text
        self.closed = False

    def close(self):
        self.closed = True


class FakeWlan:
    def __init__(self, connected, ip="192.0.2.1"):
        self.connected = connected
        self.ip = ip
        self.active_calls = []
        self.connect_args = None

    def active(self, value):
        self.active_calls.append(value)

    def connect(self, ssid, password):
        self.connect_args = (ssid, password)

    def isconnected(self):
        return self.connected

    def ifconfig(self):
        return (self.ip, "255.255.255.0", "192.0.2.254", "192.0.2.254")


machine = types.ModuleType("machine")
machine.Pin = FakePin
machine.Timer = FakeTimer
network = types.ModuleType("network")
network.STA_IF = 0
urequests = types.ModuleType("urequests")
ujson = types.ModuleType("ujson")
ujson.loads = json.loads
utime = types.ModuleType("utime")
utime.sleep = lambda _seconds: None
secrets = types.ModuleType("secrets")
secrets.FALLBACK_ANGLE_DEG = 90.0
secrets.LED_PIN = "LED"
secrets.button_pin = 7
secrets.steppers = []
secrets.WIFI_SSID = "ssid"
secrets.WIFI_PASSWORD = "password"

sys.modules.update({
    "machine": machine,
    "network": network,
    "urequests": urequests,
    "ujson": ujson,
    "utime": utime,
    "secrets": secrets,
})

spec = importlib.util.spec_from_file_location(
    "pico_main", "pico-code/main.py"
)
pico_main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pico_main)


class PicoMainTests(unittest.TestCase):
    def setUp(self):
        pico_main.time = types.SimpleNamespace(
            sleep=lambda _seconds: None,
            time=lambda: 0,
        )

    def test_shortest_direction_prefers_clockwise_on_tie(self):
        self.assertEqual(pico_main.shortest_direction(360, 0, 90), 1)
        self.assertEqual(pico_main.shortest_direction(360, 90, 0), -1)
        self.assertEqual(pico_main.shortest_direction(360, 0, 180), 1)

    def test_connect_wifi_reports_success(self):
        wlan = FakeWlan(True)
        network.WLAN = Mock(return_value=wlan)

        self.assertTrue(pico_main.connect_wifi("ssid", "password"))
        self.assertEqual(("ssid", "password"), wlan.connect_args)

    def test_connect_wifi_reports_failure(self):
        network.WLAN = Mock(return_value=FakeWlan(False))

        self.assertFalse(pico_main.connect_wifi("ssid", "password"))

    def test_stepper_normalizes_angle_and_stops(self):
        stepper = pico_main.Stepper("hand", [1, 2, 3, 4], None)

        stepper.set_target_angle(360 + 90)
        self.assertEqual(stepper.target_step, stepper.steps_per_revolution // 4)
        self.assertEqual(stepper.speed_sps, 1000)
        self.assertEqual(stepper.timer.inits[0]["mode"], FakeTimer.ONE_SHOT)

        stepper.stop()
        self.assertEqual(stepper.target_step, stepper.step)
        self.assertEqual([0], stepper.pins[0].values[-1:])
        self.assertTrue(stepper.timer.deinitialized)

    def test_stepper_rejects_invalid_angles(self):
        stepper = pico_main.Stepper("hand", [1, 2, 3, 4], None)

        stepper.set_target_angle(None)
        stepper.set_target_angle("not an angle")
        self.assertEqual(stepper.timer.inits, [])

    def test_location_fetcher_normalizes_and_fills_angles(self):
        response = FakeResponse(text=json.dumps([360, None]))
        secrets.fetch_angles = Mock(return_value=response)
        led = FakePin("LED", FakePin.OUT)
        first = Mock(name="first")
        first.name = "first"
        second = Mock(name="second")
        second.name = "second"

        pico_main.LocationFetcher(led, [first, second], demo_mode=False)

        self.assertTrue(response.closed)
        self.assertEqual([0.0], [first.set_target_angle.call_args.args[0]])
        self.assertEqual([90.0], [second.set_target_angle.call_args.args[0]])
        self.assertEqual([1, 0], led.values)

    def test_location_fetcher_uses_fallback_for_invalid_payload_values(self):
        response = FakeResponse(text=json.dumps(["bad", 12, 24]))
        secrets.fetch_angles = Mock(return_value=response)
        steppers = [Mock(name="first"), Mock(name="second")]
        steppers[0].name = "first"
        steppers[1].name = "second"

        pico_main.LocationFetcher(FakePin("LED", FakePin.OUT), steppers, False)

        self.assertEqual(90.0, steppers[0].set_target_angle.call_args.args[0])
        self.assertEqual(12.0, steppers[1].set_target_angle.call_args.args[0])

    def test_location_fetcher_handles_fetch_failure_and_turns_led_off(self):
        secrets.fetch_angles = Mock(side_effect=RuntimeError("offline"))
        led = FakePin("LED", FakePin.OUT)

        fetcher = pico_main.LocationFetcher(led, [], demo_mode=False)

        self.assertEqual([1, 0], led.values)
        self.assertEqual(FakeTimer.ONE_SHOT, fetcher.timer.inits[0]["mode"])


if __name__ == "__main__":
    unittest.main()
