#!/usr/bin/sh

cd ../ardupilot/Tools/autotest && ./sim_vehicle.py -v ArduCopter --console -I0 -l $1,$2,$3,$4 --out=127.0.0.1:14555 --out=udpin:127.0.0.1:14556
