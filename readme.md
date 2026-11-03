# OwnTracks Server

## Architecture

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

Lambda derives:
  locations + saved rectangles + CLOCK_CONFIG
                    -> labels
                    -> hand angles
```

The storage target depends on the deployment mode:

- AWS deployment: DynamoDB
- Local server: JSON files under `data/`

In DynamoDB, rectangles are stored as a system record in the locations table.
On the Pico, fetched hand angles are converted into stepper positions.

Rectangle reads and writes use `GET /get-rects` and `POST /update-rects`.

### Back up rectangles

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
Redirects retain authentication on the original hostname
or its `www` counterpart; protocol and port changes are rejected.

The output file is created only if it does not already exist. To restore a
backup later, post that file back to the endpoint:

```bash
curl --fail-with-body -u 'your-user:your-password' \
  -H 'Content-Type: application/json' \
  --data-binary @rectangles-YYYY-MM-DD.json \
  "${RECTANGLES_URL%/get-rects}/update-rects"
```

## Google Maps API key

1. Create Google Cloud Project
   - Go to Google Cloud Console (https://console.cloud.google.com/)
   - Create a new project or select existing one
2. Enable Billing
   - Google Maps Platform requires billing enabled
   - See [current pricing and free usage allowances](https://developers.google.com/maps/billing-and-pricing/pricing)
3. Enable Required APIs
   - Go to APIs & Services > Library (https://console.cloud.google.com/apis/library)
   - Search and enable:
     - Maps JavaScript API
4. Create API Key
   - Go to APIs & Services > Credentials (https://console.cloud.google.com/apis/credentials)
   - Click "Create Credentials" > "API Key"
   - Copy the generated key
5. Restrict API Key (Recommended)
   - Edit the API key
   - Under "Application restrictions", select "HTTP referrers"
   - Add your domain (e.g., localhost:* for local testing)
   - Under "API restrictions", select "Restrict key"
   - Choose "Maps JavaScript API"


## Local test

Use Node.js 22 or later, npm, and `jq`. Copy `example-env.sh` to `env.sh`,
then edit its API key and `CLOCK_CONFIG` for your map and clock:

```bash
cp example-env.sh env.sh
# Edit env.sh before continuing.
source ./env.sh
npm install
mkdir -p data
```

Before the first start, create `data/users.json` with a local test user
(preserve any existing users):

```json
{
  "testuser": { "friend_group": "friends", "hashed_password": "tbd" }
}
```

The first authenticated request sets that user's password. The curl examples
below use `testuser:hello`; use the same credentials in your browser. Include
`testuser` in `CLOCK_CONFIG.handFriend` to see its hand angle in local tests.
The server creates the remaining data files as needed.

```bash
PORT=8888 npm start
```

## Unit tests

Run the TypeScript unit tests with:

```bash
npm test
```

Run the Pico code unit tests with Python's standard library test runner:

```bash
python3 -m unittest discover -s pico-code -p 'test_*.py'
```

## Setting Up Labeled Rectangles

### What rectangles do

Saved rectangles define named places such as `home`, `work`, or `school`.

When a posted location falls inside one of those rectangles, the rectangle name becomes that user's label. The server then uses `CLOCK_CONFIG.labelAngle` to turn that label into a hand angle.

Current label behavior in the server:

- if a user is moving faster than about `6 km/h`, the label becomes `moving`
- if no rectangle matches, the label becomes `unknown`
- if a configured hand's username has no location entry, the angle falls back to the `error` label
- for `/hand-angles`, if multiple rectangles overlap, the smallest matching rectangle wins
- the legacy `/friend-labels` endpoint instead uses the first matching rectangle in saved order

### Prerequisites

You need both of these configured before the rectangle editor is useful:

1. `GOOGLE_API_KEY`
2. `CLOCK_CONFIG`

`GOOGLE_API_KEY` is used only by the browser-based map editor.

`CLOCK_CONFIG` must define:

- `handFriend`: which usernames map to the physical hands
- `labelAngle`: which angle each label name should point to

The rectangle names you create must exactly match keys in `CLOCK_CONFIG.labelAngle`.

At a minimum, `labelAngle` should usually include:

- `unknown`
- `moving`
- `error`

Example:

```bash
export CLOCK_CONFIG=$(jq -cn '
  {handFriend:["aa","bb","cc"],
   labelAngle:{home:0, work:90, school:180, church:225,
               unknown:270, moving:315, error:345}}
')
```

In that example, a rectangle named `church` is valid because `labelAngle.church` exists. A rectangle named `gym` would not work until `gym` is also added to `labelAngle`.

### Open the rectangle editor

1. Start the server.
2. Open the site in your browser.
3. Click `Edit rectangles`.

The editor page loads Google Maps using `GOOGLE_API_KEY`, then loads any previously saved rectangles from `GET /get-rects`.
The map fits the saved rectangles automatically. If loading fails, an error
appears beside the buttons and saving stays disabled; reload the page to retry.

### Create a rectangle

1. Click `Draw Rectangle`.
2. Drag a box over the area you want to label.
3. When prompted, enter the rectangle name, such as `home`.
4. Click `Save Rectangles`.

That writes the full rectangle list to `POST /update-rects`.
Press Escape or click `Cancel Drawing` to cancel drawing. Cancelling the name
prompt for a new rectangle discards that rectangle.

### Read existing rectangles

1. Open `Edit rectangles`.
2. Wait for the map to load.
3. Existing saved rectangles should appear automatically.

This is the easiest way to inspect the current saved set.

### Update a rectangle

To move or resize a rectangle:

1. Drag it to a new location, or drag its resize handles.
2. Click `Save Rectangles`.

To rename a rectangle:

1. Double-click the rectangle.
2. Enter the new name.
3. Click `Save Rectangles`.

Remember that the new name must still exist in `CLOCK_CONFIG.labelAngle`.

### Delete a rectangle

1. Double-click the rectangle.
2. Clear the name or submit an empty name.
3. Click `Save Rectangles`.

The rectangle is removed from the saved set.

### Save and verify

After creating or editing rectangles:

1. Reopen `Edit rectangles` and confirm the saved rectangles reload.
2. Post a test location to `/pub` for one of your configured users.
3. Check `/hand-angles` and confirm the expected angles are returned in hand order.
4. Optionally check `/friend-labels`; overlapping rectangles can produce a different label as described above.

Example test location post:

```bash
curl -v -u testuser:hello \
  -H "Content-Type: application/json" \
  -d '{"_type":"location","lat":40.7128,"lon":-74.0060}' \
  http://localhost:8888/pub
```

If `home` is the smallest rectangle containing this location and the user is
configured in `handFriend`, `/hand-angles` should return the angle configured
for `home` at that user's position in the list.

## Interacting with Dynamo

Freshen up the local temp credentials:
```bash
aws sts get-session-token --duration-seconds 3600 | jq -r '.Credentials | "[default]\naws_access_key_id=\(.AccessKeyId)\naws_secret_access_key=\(.SecretAccessKey)\naws_session_token=\(.SessionToken)"' > ~/.aws/credentials
```

### Create a new user

This will create a new user named `ch` in friend-group `friends`:

```bash
AWS_REGION=us-east-2 AWS_PROFILE=default PORT=8888 npm run dynamo-ops create-user ch friends
```

Whatever password is used in the next location update will be accepted and stored.

### Local test with DynamoDB

```bash
AWS_REGION=us-east-2 AWS_PROFILE=default DYNAMO_MODE=true PORT=8888 npm start
```

## AWS Lambda Deployment

### Prerequisites
- AWS CLI configured
- AWS S3 bucket for Lambda deployment
- Node.js 22 or later, npm, `jq`, and `zip`
- Export `S3BUCKET`, `GOOGLE_API_KEY`, `DOMAIN_WILDCARD`, `DOMAIN_NAME`, and
  `CLOCK_CONFIG` using your customized `env.sh`

### Deployment Steps

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

## Physical locograph

### Parts list

Most of these parts can be substituted with a similar alternative. Amazon links are only provided for convenience, not as strong recommendations.

1. one [raspberry pi pico 2 w -- with headers](https://www.adafruit.com/product/6315) ($8) 
2. one [usb port](https://www.amazon.com/dp/B07X86YFFN) for power ($6)
3. one [button](https://www.amazon.com/dp/B0BR41KCDP) for calibrating the hands ($6)
4. for each clock hand a [stepper motor with driver board](https://www.amazon.com/dp/B01CP18J4A) ($15)
5. [lots of female-to-female breadboard jumper wires](https://www.amazon.com//dp/B0B2L66ZFM), roughly 6 per hand plus 4, so 35 should be enough ($5)
6. to mount the motors to the hub, "6-32 x 1/2inch" machine screw and matching nut times 2 for each hand (for five hands, 10 screws and 10 nuts) ($2 at local hardware store)
7. to mount the driver boards to the box, "#6 x 1/2inch" flat head wood screws times 4 ($1 at local hardware store)

Also requires a bit of soldering, 3d printed parts (I used PETG), and laser-cut parts (5mm plywood for the box, [1.5mm basswood](https://www.amazon.com/dp/B0CKKSLZ2C) for the hands).

That comes to about $40 assuming you already have the wood, plastic, tools, solder, etc.

Hosting the server on AWS looks like it's costing about $0.05/month.

## Step 1: Software Setup and Initial Wi-Fi Test

**Install Thonny IDE:**
- Download and install Thonny from https://thonny.org/
- Connect your Raspberry Pi Pico to your computer via USB
- Open Thonny and go to Tools → Options → Interpreter
- Select "MicroPython (Raspberry Pi Pico)" as the interpreter
- Ensure the correct port is selected

**Upload files to the Pico:**
- In your local GitHub working copy, locate in the `pico-code` directory the files:
  - `main.py`
  - `secrets.py` (customize this based on the example provided)
- In Thonny, open each file from your local directory (File → Open)
- To upload to the Pico: File → Save As → select "Raspberry Pi Pico" as the destination
- Save both files to the root directory of the Pico
- The files should now appear in Thonny's file panel under the Pico device

**Test Wi-Fi connection:**
- In Thonny, click the "Run" button or press F5 to execute main.py
- Check the console output for Wi-Fi connection confirmation messages
- Verify successful startup indicators

## Step 2: Pico Wiring - Connect All Electrical Components

**General approach:**
The Pico has plenty of ground pins, so use one for each stepper motor driver board. But for VCC you'll have power coming only from the separate micro-USB port, so you'll need to solder several wires together to supply the Pico, and all the drivers.

**Power connections:**
- Connect USB power ground to Pico ground
- Solder together several jumper wires to create a VCC power bus
- Connect USB power pin to:
  - Raspberry Pi Pico VCC
  - Each driver board VCC (up to 5 boards)

**Up to 5 stepper motor driver boards:**
- Use ribbon cables of 5 breadboard jumper wires for each driver board (4 GPIO + 1 ground)
- Note the GPIO pin numbers and update `steppers` in secrets.py. The numbers used in the py files are the GP pin numbers.

**Calibration button:**
- Connect one side to a GPIO pin on the Pico
- Connect other side to ground
- Note the GPIO pin number and update `button_pin` in secrets.py.

## Step 3: Stepper Motor Movement Testing

- Connect stepper motors to driver boards using their built-in connectors
- Run main.py again in Thonny
- Verify the system enters calibration mode
- Use the calibration button to step through each stepper motor calibration
- **Important: Ensure all motors are turning clockwise**
  - If any motor turns the wrong way, reverse the order of the GPIO pin numbers in secrets.py for that stepper
- Once all motors are calibrated and turning correctly, you may want to unplug the steppers from their driver boards to make the next assembly steps easier

## Step 4: Driver Board Mounting

- Fit driver boards over the pegs on the rails
- Sandwich the other half of the rails on top
- Use wood screws to mount the assembled rails to a side wall of the box

## Step 5: Stepper Motor Mounting - Attaching Motors to the Hub

- Mount the small driver gears onto the stepper motors
- Fit hex nuts into the retaining slots on the hub posts
- Fit the five-armed brace over the screw holes
- Add the stepper motors (positioned so gears will mesh properly)
- Thread machine screws through the stepper motor holes, through the brace holes, through the hub post holes and into the hex nuts, and tighten them down

## Step 6: Hub Movement Testing

- Reconnect the stepper motors to their driver boards
- Run the calibration sequence to test basic movement
- Optional: Enable "Demo Mode" in main.py, which moves the hands to random positions a couple times per minute allowing you to observe the mechanics.
  - Look for gears binding or catching, and reposition driver gears if needed
  - Add silicone lubricant between gear layers or anywhere else that's rubbing or squeaking

## Step 7: Final Assembly

- Fit the sides, back, and hub support panels together
- Set the hub into the support panel
- Fit the front panel over the hub
- Place this whole assembly into the floor panel
- Add the roof on top
- Mount the clock hands onto the hub
- Admire your handiwork.

Copyright 2024 Chris Houser
