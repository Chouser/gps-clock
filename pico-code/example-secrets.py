import urequests

WIFI_SSID = "Comcast123"
WIFI_PASSWORD = "123456"

def fetch_angles():
    return urequests.get("https://myhosting.site/hand-angles",
                         auth=("username", "password"),
                         timeout=10)

LED_PIN = "LED"


