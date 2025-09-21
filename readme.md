# OwnTracks Server

You'll need to set GOOGLE_API_KEY (could put it in env.sh)

## Local test

```bash
npm install
PORT=8888 npm start
```

### Using curl with basic auth

```bash
curl -v -u testuser:hello \
  -H "Content-Type: application/json" \
  -d '{"_type":"location","lat":40.7128,"lon":-74.0060}' \
  http://localhost:8888/pub
```

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

### Deployment Steps

```bash
S3BUCKET=your-bucket-name ./deploy.sh
```

## Physical locograph

### Parts list

Most of these parts can be substituded with a similar alternative. Amazon links are only provided for convenience, not as strong recommendations.

1. one raspberry pi pico 2 w ($6)
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
