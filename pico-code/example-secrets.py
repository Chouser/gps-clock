import urequests

WIFI_SSID = "Comcast123"
WIFI_PASSWORD = "123456"

def fetch_angles():
    return urequests.get("https://myhosting.site/hand-angles",
                         auth=("username", "password"),
                         timeout=10)

LED_PIN = "LED"
button_pin = 14
steppers = [['aa', [10, 11, 12, 13]],
            ['bb', [6, 7, 8, 9]],
            ['cc', [18, 19, 20, 21]],
            ['dd', [28, 27, 26, 22]],
            ['ee', [2, 3, 4, 5]]]


