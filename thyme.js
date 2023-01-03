/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */

const {nanoid} = require("nanoid");
const fs = require("fs");
const mqtt = require("mqtt");
const {exec} = require("child_process")

global.conf = require('./conf.js');

global.sh_state = 'rtvct';

global.mqtt_client = null

let ready_mqtt_client = null
let sub_sim_info_for_start = '/LVC/start'
let pub_start_res = '/LVC/started'

global.started = false
global.my_drone_name = ''
global.my_simul = 'on'

function ready_mqtt_connect(serverip) {
    if (ready_mqtt_client === null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtt",
                keepalive: 10,
                clientId: 'ready_for_start_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                rejectUnauthorized: false
            }
        } else {
            connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtts",
                keepalive: 10,
                clientId: 'ready_for_start_' + nanoid(15),
                protocolId: "MQTT",
                protocolVersion: 4,
                clean: true,
                reconnectPeriod: 2000,
                connectTimeout: 2000,
                key: fs.readFileSync("./server-key.pem"),
                cert: fs.readFileSync("./server-crt.pem"),
                rejectUnauthorized: false
            }
        }

        ready_mqtt_client = mqtt.connect(connectOptions)

        ready_mqtt_client.on('connect', () => {
            console.log('mqtt is connected to ( ' + serverip + ' )')

            if (sub_sim_info_for_start !== '') {
                ready_mqtt_client.subscribe(sub_sim_info_for_start, () => {
                    console.log('[mqtt] sub_sim_info_for_start is subscribed: ' + sub_sim_info_for_start)
                })
            }
        })

        ready_mqtt_client.on('message', (topic, message) => {
            if (topic === sub_sim_info_for_start) {
                // TODO: 버퍼에 감싸서 보내는지, JSON 그대로 보내는지
                try {
                    let init_info = JSON.parse(message.toString())
                    if (init_info.hasOwnProperty('dronename')) {
                        my_drone_name = init_info.dronename
                    } else {
                        my_drone_name = "KETI_LVC_Drone"
                    }
                    // TODO: simul인지 아닌지
                    if (init_info.hasOwnProperty('simul')) {
                        my_simul = init_info.simul.toString().toLowerCase()
                    } else {
                        my_simul = "on"
                    }
                    /*  "dronename": "LVC_Drone",
                        "dronelocation": "37.40313329147436, 127.16083110569653, 0.0, 0",
                        "Lat": 37.40313329147436,
                        "Lon": 127.16083110569653,
                        "Alt": 0,
                        "Hdg": 0  // TODO: heading(Hdg) 값 필요함, dronelocation 무슨 값인지??
                    */
                    // TODO: host 주소 필요?

                    if (!started) {
                        console.log('sh start_sitl.sh ' + init_info.Lat + ' ' + init_info.Lon + ' ' + init_info.Alt + ' ' + init_info.Hdg)
                        exec('sh start_sitl.sh ' + init_info.Lat + ' ' + init_info.Lon + ' ' + init_info.Alt + ' ' + init_info.Hdg, {cwd: process.cwd()}, (error, stdout, stderr) => {
                            if (error) {
                                console.log('error - ' + error)
                            }
                            if (stdout) {
                                console.log('stdout - ' + stdout)
                            }
                            if (stderr) {
                                console.log('stderr - ' + stderr)
                            }
                        });
                        require('./tele_rf')
                        started = true
                        ready_mqtt_client.publish(pub_start_res, "SUCCESS-SITL has started.")
                    } else {
                        ready_mqtt_client.publish(pub_start_res, "FAIL-SITL is already running.")
                    }
                } catch (e) {
                    console.log("Invalid initial information of drone\n" + e)
                }
            } else {
                console.log('Received Message ' + message.toString('hex') + ' From ' + topic)
            }
        })

        ready_mqtt_client.on('error', function (err) {
            console.log('[mqtt] (error) ' + err.message)
            ready_mqtt_client = null
            ready_mqtt_connect(serverip)
        })
    }
}

ready_mqtt_connect('127.0.0.1')
