# Locograph: a physical location clock

This repository contains the server and Raspberry Pi Pico firmware for a
locograph: a physical clock whose hands show where people are rather than the
time. Each hand represents a person and points to a named place or state, such
as `home`, `work`, `school`, `moving`, or `unknown`.

OwnTracks on each person's phone reports their location to the server. The
server matches those locations to areas you define on a map and calculates
hand angles. A Wi-Fi-connected Pico retrieves those angles and drives the
clock's stepper motors.

Building the complete locograph requires assembling the physical clock as well
as configuring the server and phones. You can run and test the server before
building the hardware.

- [What you'll need](#what-youll-need)
- [How the system works](#how-the-system-works)
- [Set up the server](#set-up-the-server)
- [Connect OwnTracks phones](#connect-owntracks-phones)
- [Define places and verify hand angles](#define-places-and-verify-hand-angles)
- [Build and commission the physical locograph](#build-and-commission-the-physical-locograph)
- [Maintenance](#maintenance)
- [Development and technical reference](#development-and-technical-reference)
- [License and copyright](#license-and-copyright)

## What you'll need

### Physical clock

Most of these parts can be substituted with a similar alternative. Amazon links
are only provided for convenience, not as strong recommendations.

1. One [Raspberry Pi Pico 2 W with headers](https://www.adafruit.com/product/6315) ($8).
2. One [USB port](https://www.amazon.com/dp/B07X86YFFN) for power ($6).
3. One [button](https://www.amazon.com/dp/B0BR41KCDP) for calibrating the hands ($6).
4. For each clock hand, a [stepper motor with driver board](https://www.amazon.com/dp/B01CP18J4A) ($15).
5. [Female-to-female breadboard jumper wires](https://www.amazon.com/dp/B0B2L66ZFM), roughly 6 per hand plus 4, so 35 should be enough ($5).
6. To mount the motors to the hub, two 6-32 × 1/2-inch machine screws and matching nuts for each hand (for five hands, 10 screws and 10 nuts; $2 at a local hardware store).
7. To mount the driver boards to the box, four #6 × 1/2-inch flat-head wood screws ($1 at a local hardware store).

The build also requires a bit of soldering, 3D-printed parts (I used PETG), and
laser-cut parts (5 mm plywood for the box and
[1.5 mm basswood](https://www.amazon.com/dp/B0CKKSLZ2C) for the hands), along with
the tools or fabrication services to make them.

The assembly instructions below assume you already have the fabricated hub,
gears, brace, driver-board rails, enclosure panels, and hands. This repository
does not currently include their fabrication design files.

The original parts estimate was about $40, assuming you already have the wood,
plastic, tools, solder, etc.; your total will depend on current prices and the
number of hands.

### Phones, server, and setup tools

- A phone running [OwnTracks](https://owntracks.org/) for each person you want
  represented on the clock.
- Node.js 22 or later, npm, and `jq` for the server.
- A Google Maps API key for the browser-based map editor.
- For AWS hosting: a configured AWS CLI, an S3 deployment bucket, `zip`, and a
  domain whose DNS you can manage. Local testing uses JSON files instead of AWS.
- Wi-Fi for the Pico, MicroPython firmware, and [Thonny](https://thonny.org/)
  for uploading and testing the Pico code.

Hosting the server on AWS has been costing about $0.05/month.

## How the system works

Each server username identifies a person. Saved rectangles on the map define
named places, and `CLOCK_CONFIG` connects those people and places to the clock:

- `handFriend` lists usernames in physical hand order.
- `labelAngle` maps each place or state name to an angle in degrees on the face.

The Pico's `steppers` list must use the same order as `handFriend`: returned
angles are applied by list position.

```text
+------------------+        HTTPS API         +----------------------+
| OwnTracks phones | -> POST /pub ----------> |                      |
+------------------+                          | API Gateway          |
                                              |        |             |
+------------------+ -> GET /hand-angles ---> |        v             |
| Raspberry Pi Pico|                          | AWS Lambda           |
| + stepper motors |                          | request + label logic|
+------------------+                          |        |             |
                                              +--------+-------------+
+------------------+ -> GET /get-rects        |        |
| Browser          | -> POST /update-rects -> |        | AWS SDK
| map/editor       |                          |        v
+------------------+                          |  +-------------+
                                              |  | DynamoDB    |
                                              |  | users       |
                                              |  | locations   |
                                              |  +-------------+
                                              |
                                              | Local development:
                                              | data/*.json
                                              +----------------------

Server derives:
  locations + saved rectangles + CLOCK_CONFIG
                    -> labels
                    -> hand angles
```

In AWS, API Gateway routes requests to Lambda and the server stores data in
DynamoDB. Locally, the Node.js server handles requests directly and stores data
in JSON files under `data/`. On the Pico, fetched hand angles are converted into
stepper positions.

## Set up the server

### Prepare the environment and clock configuration

Copy [example-env.sh](example-env.sh) to `env.sh`, then edit it for your map,
clock, and hosting environment:

```bash
cp example-env.sh env.sh
# Edit env.sh before continuing.
npm install
```

Set `CLOCK_CONFIG` to assign usernames to hands and labels to angles. For
example, this clock has three hands:

```bash
export CLOCK_CONFIG=$(jq -cn '
  {handFriend:["aa","bb","cc"],
   labelAngle:{home:0, work:90, school:180, church:225,
               unknown:270, moving:315, error:345}}
')
```

Use angles that match the labels on your physical clock face. Rectangle names
must exactly match keys in `labelAngle`: in this example, `church` is valid,
but `gym` requires adding a `gym` angle first. Include the fallback states
`unknown`, `moving`, and `error` as well as your named places.

### Get a Google Maps API key

`GOOGLE_API_KEY` is used only by the browser-based map editor.

1. Create or select a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable billing. Google Maps Platform requires it; see
   [current pricing and free usage allowances](https://developers.google.com/maps/billing-and-pricing/pricing).
3. In [APIs & Services → Library](https://console.cloud.google.com/apis/library),
   enable **Maps JavaScript API**.
4. In [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials),
   select **Create Credentials → API Key** and copy the key into `env.sh`.
5. Restrict the key:
   - Under **Application restrictions**, select **HTTP referrers** and add your
     domain (and `localhost:*` for local testing).
   - Under **API restrictions**, select **Restrict key** and choose
     **Maps JavaScript API**.

### Option A: run locally

Load your customized environment and create the data directory:

```bash
source ./env.sh
mkdir -p data
```

Before the first start, create `data/users.json` with a local test user
(preserve any existing users):

```json
{
  "testuser": { "friend_group": "friends", "hashed_password": "tbd" }
}
```

The first authenticated request sets that user's password. The examples below
use `testuser:hello`; use the same credentials in your browser. Include
`testuser` in `CLOCK_CONFIG.handFriend` in `env.sh`, then source it again, to see
that user's hand angle in local tests. Add other users in the same JSON shape
as needed. Users whose locations belong on the same clock should share a
`friend_group`.

The server creates the remaining data files as needed. Start it with:

```bash
PORT=8888 npm start
```

Open `http://localhost:8888` in your browser and sign in.

### Option B: deploy to AWS Lambda

With the AWS CLI configured and your S3 deployment bucket available, set
`S3BUCKET`, `GOOGLE_API_KEY`, `DOMAIN_WILDCARD`, `DOMAIN_NAME`, and `CLOCK_CONFIG`
in `env.sh`. Deployment also requires Node.js 22 or later, npm, `jq`, and `zip`.

```bash
source ./env.sh
./deploy.sh
```

On first deployment, CloudFormation waits for the ACM certificate to be
validated. Open AWS Certificate Manager in the deployment region, find the
pending certificate for `DOMAIN_WILDCARD`, and add its DNS validation CNAME
to your domain's DNS records. Deployment continues after validation succeeds.

Once deployment finishes, create a DNS CNAME for `DOMAIN_NAME` pointing to the
`CustomDomainTarget` stack output. `OwnTracksApiEndpoint` is the direct API
Gateway URL, including its `/prod/` stage prefix.

#### Create users

Create one server user per person, using the usernames listed in `handFriend`.
For example, this creates `ch` in friend group `friends`:

```bash
AWS_REGION=us-east-2 AWS_PROFILE=default PORT=8888 npm run dynamo-ops create-user ch friends
```

Use the region and profile for your deployment. Users whose locations belong
on the same clock should share a friend group. The first authenticated request
sets the user's password, so use the intended password when first signing in
or sending a location update.

## Connect OwnTracks phones

For each person:

1. Install OwnTracks and configure an **HTTP** connection.
2. Set the URL to your server's `/pub` endpoint, for example
   `https://your-domain.example/pub`. If using the direct API Gateway URL,
   retain its `/prod/` prefix before `pub`.
3. Enable authentication and enter that person's server username and password.
   The username must match an entry in `CLOCK_CONFIG.handFriend`. OwnTracks
   tracker IDs (`tid`) are limited to two characters; server usernames are not.
4. Grant the location permissions needed for your intended reporting behavior,
   then send a location update from OwnTracks.
5. Open the server's site in a browser and confirm that the location appears.

For local testing from a phone, use the server computer's LAN address, such as
`http://192.168.1.100:8888/pub`, rather than `localhost`. The phone and Pico must
be able to reach the server at the configured address.

The browser and Pico also use HTTP Basic Auth. Use credentials from the same
friend group as the people whose locations the clock should display.

## Define places and verify hand angles

### How locations become labels

Saved rectangles define named places such as `home`, `work`, or `school`. When
a location falls inside a rectangle, its name becomes that user's label, and
`CLOCK_CONFIG.labelAngle` turns the label into a hand angle.

For `/hand-angles`:

- If a user is moving faster than about `6 km/h`, the label becomes `moving`.
- If no rectangle matches, the label becomes `unknown`.
- If a configured hand's username has no location entry in the authenticated
  user's friend group, its angle falls back to the `error` label.
- If rectangles overlap, the smallest matching rectangle wins.

Before using the editor, make sure both `GOOGLE_API_KEY` and `CLOCK_CONFIG` are
configured. Every rectangle name must exactly match a key in `labelAngle`.

### Open the rectangle editor

1. Start the server, or use your deployed site.
2. Open the site in your browser and sign in.
3. Click `Edit rectangles`.

The editor loads Google Maps using `GOOGLE_API_KEY`, then loads saved
rectangles. The map fits the saved rectangles automatically. If loading fails,
an error appears beside the buttons and saving stays disabled; reload the
page to retry. Opening the editor is also the easiest way to inspect the
current saved set.

### Create a rectangle

1. Click `Draw Rectangle`.
2. Drag a box over the area you want to label.
3. When prompted, enter the rectangle name, such as `home`.
4. Click `Save Rectangles`.

Press Escape or click `Cancel Drawing` to cancel drawing. Cancelling the name
prompt for a new rectangle discards that rectangle.

### Update or delete a rectangle

- **Move or resize:** drag the rectangle or its resize handles.
- **Rename:** double-click the rectangle and enter a new name that exists in
  `CLOCK_CONFIG.labelAngle`.
- **Delete:** double-click the rectangle and submit an empty name.

Click `Save Rectangles` after making changes. Saving writes the full rectangle
list to the server.

### Save and verify

1. Reopen `Edit rectangles` and confirm the saved rectangles reload.
2. Send a location from OwnTracks, or post a test location for a configured user.
3. Check `/hand-angles` and confirm the expected angles are returned in
   `handFriend` order.

For the local test user, an example location post is:

```bash
curl -v -u testuser:hello \
  -H "Content-Type: application/json" \
  -d '{"_type":"location","lat":40.7128,"lon":-74.0060}' \
  http://localhost:8888/pub

curl --fail-with-body -u testuser:hello http://localhost:8888/hand-angles
```

If `home` is the smallest rectangle containing this location and `testuser` is
in `handFriend`, the result should contain the angle configured for `home` at
that user's position in the list. Substitute your deployed URL and credentials
when testing AWS.

## Build and commission the physical locograph

### Step 1: install Pico software and test Wi-Fi

**Install Thonny and MicroPython:**

- Download and install Thonny from https://thonny.org/.
- Connect your Raspberry Pi Pico to your computer via USB.
- Open Thonny and go to **Tools → Options → Interpreter**.
- Select **MicroPython (Raspberry Pi Pico)** and the correct port.
- Install MicroPython for your Pico model if it is not already installed.

**Configure and upload files:**

- Copy [pico-code/example-secrets.py](pico-code/example-secrets.py) to
  `pico-code/secrets.py`, preserving any existing customized file.
- Set `WIFI_SSID` and `WIFI_PASSWORD`.
- In `fetch_angles()`, set your server's `/hand-angles` URL and Basic Auth
  credentials. For a local server, use its LAN address rather than `localhost`.
- Set `steppers` to your motor names and GPIO pins, in the same order as the
  server's `handFriend` list. Set `button_pin` for the calibration button and
  `FALLBACK_ANGLE_DEG` for a missing or invalid returned angle.
- In Thonny, open [pico-code/main.py](pico-code/main.py) and your `secrets.py`.
- For each file, use **File → Save As → Raspberry Pi Pico** to save it in the
  Pico's root directory. Both files should appear in Thonny's device file panel.

**Test Wi-Fi:**

- Click **Run** or press F5 to execute `main.py`.
- Check the console for Wi-Fi connection confirmation. Motor calibration
  follows Wi-Fi setup; complete that after wiring the button and motors.

### Step 2: wire the electrical components

The Pico has plenty of ground pins, so use one for each stepper motor driver
board. Power comes from the separate micro-USB port; solder several wires
together to supply the Pico and all the drivers.

**Power connections:**

- Connect USB power ground to Pico ground.
- Solder together jumper wires to create a power bus.
- Connect USB 5 V power to the Pico's **VSYS** input and each driver board's
  power input, checking the board pinouts and voltage requirements.

**Up to five stepper motor driver boards:**

- Use ribbon cables of five breadboard jumper wires for each driver board
  (four GPIO + one ground), in addition to its power connection.
- Note the GPIO numbers and update `steppers` in `secrets.py`. The numbers in
  the Python files are GP numbers, not physical header pin numbers.

**Calibration button:**

- Connect one side to a Pico GPIO pin and the other side to ground.
- Update `button_pin` in `secrets.py` to match.

Upload the revised `secrets.py` to the Pico after changing pin assignments.

### Step 3: test stepper motor movement

- Connect stepper motors to driver boards using their built-in connectors.
- Run `main.py` again in Thonny and verify it enters calibration mode.
- Use the calibration button to step through each motor's calibration. Each
  motor turns until you press the button, which sets that position to zero;
  release the button to proceed.
- **Ensure all motors turn clockwise.** If one turns the wrong way, reverse
  the order of its GPIO pin numbers in `secrets.py` and upload the changed file.
- Once the motors are calibrated and turning correctly, you may want to unplug
  them from their driver boards to make the next assembly steps easier.

### Step 4: mount driver boards

- Fit driver boards over the pegs on the rails.
- Sandwich the other half of the rails on top.
- Use wood screws to mount the assembled rails to a side wall of the box.

### Step 5: mount motors to the hub

- Mount the small driver gears onto the stepper motors.
- Fit hex nuts into the retaining slots on the hub posts.
- Fit the five-armed brace over the screw holes.
- Add the stepper motors, positioned so the gears will mesh properly.
- Thread machine screws through the motor holes, brace holes, and hub post
  holes into the hex nuts, and tighten them down.

### Step 6: test hub movement

- Reconnect the stepper motors to their driver boards.
- Run the calibration sequence to test basic movement.
- Optionally set `demo_mode=True` in the `LocationFetcher` call in `main.py`
  and upload it. This chooses random positions or zero at roughly
  30-second intervals after successful fetches, allowing you to observe the
  mechanics.
- Look for gears binding or catching, and reposition driver gears if needed.
- Add silicone lubricant between gear layers or anywhere else rubbing or
  squeaking occurs.
- Restore `demo_mode=False` and upload `main.py` before normal operation.

### Step 7: complete final assembly

- Fit the sides, back, and hub support panels together.
- Set the hub into the support panel.
- Fit the front panel over the hub.
- Place this whole assembly into the floor panel.
- Add the roof on top.
- Mount the clock hands onto the hub.
- Run calibration again, aligning each hand with its zero-degree position.

### End-to-end check

1. Send an OwnTracks update from inside one of your named places.
2. Fetch `/hand-angles` with credentials from the clock's friend group and
   confirm the person's angle matches that place's `labelAngle` entry.
3. Allow the Pico's next fetch (roughly every 30 seconds) and confirm the
   corresponding hand moves to that place on the face.

If the wrong hand moves, check `handFriend` against the Pico's `steppers` order.
If the angle is correct but the hand points incorrectly, check calibration,
motor direction, and the physical label positions.

## Maintenance

### Back up and restore rectangles

The backup tool saves the authenticated rectangle list in the same JSON shape
accepted by `POST /update-rects`. Set the full URL for your deployment and
supply the site's HTTP Basic Auth credentials, not AWS credentials:

```bash
export RECTANGLES_URL='https://your-domain.example/get-rects'
RECTANGLES_USERNAME='your-user' \
RECTANGLES_PASSWORD='your-password' \
npm run backup:rectangles -- "rectangles-$(date +%F).json"
```

For a local server, use `http://localhost:8888/get-rects` instead.
Redirects retain authentication on the original hostname or its `www`
counterpart; protocol and port changes are rejected.

The output file is created only if it does not already exist. To restore a
backup later, post that file back to the endpoint:

```bash
curl --fail-with-body -u 'your-user:your-password' \
  -H 'Content-Type: application/json' \
  --data-binary @rectangles-YYYY-MM-DD.json \
  "${RECTANGLES_URL%/get-rects}/update-rects"
```

## Development and technical reference

### Unit tests

Run the TypeScript unit tests with:

```bash
npm test
```

Run the Pico code unit tests with Python's standard library test runner:

```bash
python3 -m unittest discover -s pico-code -p 'test_*.py'
```

### Local server with DynamoDB

Load your customized environment, then run the local server against AWS
DynamoDB rather than local JSON files:

```bash
source ./env.sh
AWS_REGION=us-east-2 AWS_PROFILE=default DYNAMO_MODE=true PORT=8888 npm start
```

### AWS temporary credentials

The following command obtains one-hour session credentials and replaces
`~/.aws/credentials` with a `[default]` profile. Preserve any existing profiles
you need before using it:

```bash
aws sts get-session-token --duration-seconds 3600 | jq -r '.Credentials | "[default]\naws_access_key_id=\(.AccessKeyId)\naws_secret_access_key=\(.SecretAccessKey)\naws_session_token=\(.SessionToken)"' > ~/.aws/credentials
```

### Endpoints and storage

All requests require HTTP Basic Auth using a server user's credentials.

| Endpoint | Purpose |
| --- | --- |
| `POST /pub` | Accept OwnTracks location updates for the authenticated user. |
| `GET /hand-angles` | Return angles in `CLOCK_CONFIG.handFriend` order, using locations from the authenticated user's friend group. |
| `GET /get-rects` | Read the saved rectangle list. |
| `POST /update-rects` | Replace the full saved rectangle list. |
| `GET /friend-labels` | Return legacy per-user labels for the authenticated user's friend group. |
| `GET /` | Open the browser map and rectangle editor. |

In DynamoDB, rectangles are stored as a system record in the locations table.
In local file mode, data is stored under `data/`.

The legacy `/friend-labels` endpoint uses the first matching rectangle in saved
order, whereas `/hand-angles` uses the smallest matching rectangle. Overlapping
rectangles can therefore produce different labels between those endpoints.

## License and copyright

See [LICENSE.md](LICENSE.md).

Copyright 2024 Chris Houser
