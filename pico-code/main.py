# For Raspberry Pico 2 W

import network
import urequests
import ujson
import time
from machine import Pin, Timer
from utime import sleep
import random

import secrets

def connect_wifi(ssid, password):
    """Connects the Pico W to the specified WiFi network."""
    print("Connecting to WiFi...", end="")
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect(ssid, password)

    max_attempts = 15 # Give it some time to connect
    attempts = 0
    while not wlan.isconnected() and attempts < max_attempts:
        print(".", end="")
        time.sleep(1)
        attempts += 1
    print("\n")

    if wlan.isconnected():
        status = wlan.ifconfig()
        print(f"Connected! IP: {status[0]}")
        return True
    else:
        print("Failed to connect to WiFi. Check SSID/Password or signal.")
        return False

def shortest_direction(m, current, goal):
    pos_dist = (goal - current) % m
    neg_dist = (current - goal) % m
    return 1 if pos_dist <= neg_dist else -1

pin_ptn = [[1, 0, 0, 0],
           [1, 1, 0, 0],
           [0, 1, 0, 0],
           [0, 1, 1, 0],
           [0, 0, 1, 0],
           [0, 0, 1, 1],
           [0, 0, 0, 1],
           [1, 0, 0, 1]
           ]

class Stepper:
    def __init__(self, name, pins, calibrate_button):
        self.steps_per_revolution=14336  # 2048 * 2 half steps * 28 big gear teeth / 8 small gear teeth = 13312
        self.min_delay_ms = 1 # schedule steps no sooner than this
        self.accel = 4 # how much speed to add each second

        self.name = name
        self.pins = [Pin(pin, Pin.OUT) for pin in pins]
        self.calibrate_button = calibrate_button
        self.timer = Timer()
        self.step = 0
        self.speed_sps = 0 # steps per second, positive is clockwise
        self.target_step = 0

    def _set_pins(self, values):
        for pin, value in zip(self.pins, values):
            pin.value(value)

    def _set_step(self, step):
        self.step = step % self.steps_per_revolution
        self._set_pins(pin_ptn[self.step % len(pin_ptn)])

    def _update(self, timer=None):
        if self.step == self.target_step:
            print(f"{self.name} done {self.step}")
            self.stop()
        else:
            self._set_step( self.step + (1 if self.speed_sps > 0 else -1) )
            delay_ms = max(self.min_delay_ms, int(1000 / abs(self.speed_sps)))
            self.timer.init(mode=Timer.ONE_SHOT, period=delay_ms, callback=self._update)

    def set_target_angle(self, angle, delay=0.0):
        self.target_step = int(angle * self.steps_per_revolution / 360) % self.steps_per_revolution
        print(f"{self.name} set target angle {angle}, step {self.target_step}")
        self.speed_sps = 1000 * shortest_direction(self.steps_per_revolution, self.step, self.target_step)
        #self._update()
        self.timer.init(mode=Timer.ONE_SHOT, period=int(delay*1000), callback=self._update)

    # TODO rewrite to use timer, to avoid hogging the main thread which can prevent repl connection, etc.
    def calibrate(self, button):
        print(f"{self.name} calibrating")
        while button.value() == 1: # drive motor while waiting for press
            self._set_step( self.step + 1 )
            time.sleep(0.001)
        self.step = 0
        self.stop()
        while button.value() == 0: # wait for release
            time.sleep(0.004)
        print("Calibrated")

    def stop(self):
        self.timer.deinit()
        self.target_step = self.step
        self._set_pins([0, 0, 0, 0])

class LocationFetcher:
    def __init__(self, led, steppers, demo_mode):
        self.led = led
        self.steppers = steppers
        self.demo_mode = demo_mode
        self.timer = Timer()
        self._update()

    def _update(self, _timer=None):
        self.led.value(1)
        try:
            angles = ujson.loads(secrets.fetch_angles().text)
            if self.demo_mode:
                if random.random() < 0.5:
                    angles = [int(random.random() * 360) for _ in steppers]
                else:
                    angles = [0, 0, 0, 0, 0]
            print("Fetched:", angles)
        finally:
            self.led.value(0)
            self.timer.init(mode=Timer.ONE_SHOT, period=30 * 1000, callback=self._update)
        for angle, stepper, order in zip(angles, self.steppers, range(5)):
            stepper.set_target_angle(angle, order * 3.0)

LED = Pin(secrets.LED_PIN, Pin.OUT)
LAST = 0
def blink(_):
    global LAST
    LAST = LAST ^ 1
    LED.value(LAST)

TIMER = Timer()

try:
    button = Pin(14, Pin.IN, Pin.PULL_UP)
    steppers = [Stepper(name, pins, button) for (name, pins) in secrets.steppers]

    TIMER.init(mode=Timer.PERIODIC, period=100, callback=blink)
    connect_wifi(secrets.WIFI_SSID, secrets.WIFI_PASSWORD)
    TIMER.deinit()

    for s in steppers:
        s.calibrate(button)
        time.sleep(0.5)

    fetcher = LocationFetcher(LED, steppers, demo_mode=False)

    # it is important to keep all the Steppers and fetcher in scope to prevent GC
    while True:
        time.sleep(60)
finally:
    [s.stop for s in steppers]
    TIMER.deinit()
    LED.value(0)