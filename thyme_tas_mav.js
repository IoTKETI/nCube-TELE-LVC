/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */

const moment = require('moment')
const dgram = require("dgram");
const mavlink = require('./mavlibrary/mavlink.js')

let mavPortNum = '/dev/ttyAMA0';
let mavBaudrate = '115200';
let mavPort = null

let HOST = '127.0.0.1';
let PORT1 = 14555; // output: SITL --> GCS
let PORT2 = 14556; // input : GCS --> SITL

global.sitlUDP = null;
global.sitlUDP2 = null;

if (my_simul === 'on') {
    sitlUDP2 = dgram.createSocket('udp4');
} else {
    let {SerialPort} = require('serialport')
}

exports.ready = function tas_ready() {
    mavPortOpening()
}

let control = {};

const RC_RATE = 0.64;

function SBUS2RC(x) {
    return Math.round((x * 8 + 1 - 1000) * RC_RATE + 1500);
}

function mavlinkGenerateMessage(src_sys_id, src_comp_id, type, params) {
    const mavlinkParser = new MAVLink(null/*logger*/, src_sys_id, src_comp_id);
    try {
        var mavMsg = null;
        var genMsg = null;

        switch (type) {
            case mavlink.MAVLINK_MSG_ID_RC_CHANNELS_OVERRIDE:
                mavMsg = new mavlink.messages.rc_channels_override(params.target_system,
                    params.target_component,
                    params.ch1_raw,
                    params.ch2_raw,
                    params.ch3_raw,
                    params.ch4_raw,
                    params.ch5_raw,
                    params.ch6_raw,
                    params.ch7_raw,
                    params.ch8_raw,
                    params.ch9_raw,
                    params.ch10_raw,
                    params.ch11_raw,
                    params.ch12_raw,
                    params.ch13_raw,
                    params.ch14_raw,
                    params.ch15_raw,
                    params.ch16_raw,
                    params.ch17_raw,
                    params.ch18_raw,
                );
                break;
        }
    } catch (e) {
        console.log('MAVLINK EX:' + e);
    }

    if (mavMsg) {
        genMsg = Buffer.from(mavMsg.pack(mavlinkParser));
        //console.log('>>>>> MAVLINK OUTGOING MSG: ' + genMsg.toString('hex'));
    }

    return genMsg;
}

function gcs_noti_handler(message) {
    // console.log('[GCS]', message)
    var ver = message.substring(0, 2)
    if (ver === 'ff') {
        // MAVLink로 변환된 조종 신호를 시뮬레이터 또는 FC에 전달
        let rc_data = message.toString('hex');
        let rc_value = {};
        rc_value.target_system = my_sysid;
        rc_value.target_component = 1;
        rc_value.ch1_raw = SBUS2RC(parseInt(rc_data.substring(2, 4), 16));
        rc_value.ch2_raw = SBUS2RC(parseInt(rc_data.substring(4, 6), 16));
        rc_value.ch3_raw = SBUS2RC(parseInt(rc_data.substring(6, 8), 16));
        rc_value.ch4_raw = SBUS2RC(parseInt(rc_data.substring(8, 10), 16));
        rc_value.ch5_raw = SBUS2RC(parseInt(rc_data.substring(10, 12), 16)) - 3;
        rc_value.ch6_raw = SBUS2RC(parseInt(rc_data.substring(12, 14), 16));
        rc_value.ch7_raw = SBUS2RC(parseInt(rc_data.substring(14, 16), 16));
        rc_value.ch8_raw = SBUS2RC(parseInt(rc_data.substring(16, 18), 16));
        rc_value.ch9_raw = SBUS2RC(parseInt(rc_data.substring(18, 20), 16));
        rc_value.ch10_raw = SBUS2RC(parseInt(rc_data.substring(20, 22), 16));
        rc_value.ch11_raw = SBUS2RC(parseInt(rc_data.substring(22, 24), 16));
        rc_value.ch12_raw = SBUS2RC(parseInt(rc_data.substring(24, 26), 16));
        rc_value.ch13_raw = SBUS2RC(parseInt(rc_data.substring(26, 28), 16));
        rc_value.ch14_raw = SBUS2RC(parseInt(rc_data.substring(28, 30), 16));
        rc_value.ch15_raw = SBUS2RC(parseInt(rc_data.substring(30, 32), 16));
        rc_value.ch16_raw = SBUS2RC(parseInt(rc_data.substring(32, 34), 16));
        rc_value.ch17_raw = SBUS2RC(parseInt(rc_data.substring(34, 36), 16));
        rc_value.ch18_raw = SBUS2RC(parseInt(rc_data.substring(36, 38), 16));
        try {
            let rc_signal = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_RC_CHANNELS_OVERRIDE, rc_value);
            if (rc_signal == null) {
                console.log("mavlink message is null");
            } else {
                if (my_simul === 'on') { // SITL에 전달
                    if (sitlUDP2 != null) {
                        sitlUDP2.send(rc_signal, 0, rc_signal.length, PORT2, HOST,
                            function (err) {
                                if (err) {
                                    console.log('UDP message send error', err);
                                    return;
                                }
                            }
                        );
                    } else {
                        console.log('send cmd via sitlUDP2')
                    }
                } else { // FC에 전달
                    if (mavPort != null) {
                        if (mavPort.isOpen) {
                            mavPort.write(rc_signal);
                        }
                    }
                }
            }
        } catch (ex) {
            console.log('[ERROR] ' + ex);
        }
    } else {
        if (ver === 'fd') {
            var msg_id = parseInt(message.substring(18, 20) + message.substring(16, 18) + message.substring(14, 16), 16)
            var base_offset = 20
        } else {
            msg_id = parseInt(message.substring(10, 12).toLowerCase(), 16)
            base_offset = 12
        }

        if (msg_id === mavlink.MAVLINK_MSG_ID_COMMAND_LONG) {
            console.log('[send_reserved_control_command]', message)

            var param1 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param2 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param3 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param4 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param5 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param6 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var param7 = message.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var command = message.substring(base_offset, base_offset + 4).toLowerCase();
            base_offset += 4;
            var target_system = message.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var target_component = message.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var confirmation = message.substring(base_offset, base_offset + 2).toLowerCase();

            control.param1 = Buffer.from(param1, 'hex').readFloatLE(0);
            control.param2 = Buffer.from(param2, 'hex').readFloatLE(0);
            control.param3 = Buffer.from(param3, 'hex').readFloatLE(0);
            control.param4 = Buffer.from(param4, 'hex').readFloatLE(0);
            control.param5 = Buffer.from(param5, 'hex').readFloatLE(0);
            control.param6 = Buffer.from(param6, 'hex').readFloatLE(0);
            control.param7 = Buffer.from(param7, 'hex').readFloatLE(0);
            control.command = Buffer.from(command, 'hex').readUInt16LE(0);
            control.target_system = Buffer.from(target_system, 'hex').readUInt8(0);
            control.target_component = Buffer.from(target_component, 'hex').readUInt8(0);
            control.confirmation = Buffer.from(confirmation, 'hex').readUInt8(0);

            if (control.command.toString() === '248') {
                let control_channels = {}
                control_channels.channel = control.param1
                control_channels.value = control.param2

                console.log('============================================================')
                console.log('target_system - ' + control.target_system)
                console.log('target_component - ' + control.target_component)
                console.log('command - ' + control.command)
                console.log('confirmation - ' + control.confirmation)
                console.log('param1 - ' + control.param1)
                console.log('param2 - ' + control.param2)
                console.log('param3 - ' + control.param3)
                console.log('param4 - ' + control.param4)
                console.log('param5 - ' + control.param5)
                console.log('param6 - ' + control.param6)
                console.log('param7 - ' + control.param7)
                console.log('============================================================')
            } else {
                if (sitlUDP2 != null) {
                    sitlUDP2.send(Buffer.from(message, 'hex'), 0, Buffer.from(message, 'hex').length, PORT2, HOST,
                        function (err) {
                            if (err) {
                                console.log('UDP message send error', err);
                                return;
                            }
                        }
                    );
                } else {
                    console.log('send cmd via sitlUDP2')
                }
            }
        } else {
            if (sitlUDP2 != null) {
                sitlUDP2.send(Buffer.from(message, 'hex'), 0, Buffer.from(message, 'hex').length, PORT2, HOST,
                    function (err) {
                        if (err) {
                            console.log('UDP message send error', err);
                            return;
                        }
                    }
                );
            } else {
            }
        }
    }
}

function mavPortOpening() {
    if (my_simul === 'on') {
        if (sitlUDP === null) {
            sitlUDP = dgram.createSocket('udp4');
            sitlUDP.bind(PORT1, HOST);

            sitlUDP.on('listening', mavPortOpen);
            sitlUDP.on('message', mavPortData);
            sitlUDP.on('close', mavPortClose);
            sitlUDP.on('error', mavPortError);
        }
    } else {
        mavPortNum = '/dev/ttyAMA0';
        mavBaudrate = '115200';

        if (mavPort === null) {
            mavPort = new SerialPort({
                path: mavPortNum,
                baudRate: parseInt(mavBaudrate, 10),
            })
            mavPort.on('open', mavPortOpen)
            mavPort.on('close', mavPortClose)
            mavPort.on('error', mavPortError)
            mavPort.on('data', mavPortData)
        } else {
            if (mavPort.isOpen) {
                mavPort.close();
                mavPort = null
                setTimeout(mavPortOpening, 2000);
            } else {
                mavPort.open()
            }
        }
    }
}

function mavPortOpen() {
    if (my_simul === 'on') {
        console.log('UDP socket connect to ' + sitlUDP.address().address + ':' + sitlUDP.address().port);
    } else {
        console.log('mavPort(' + mavPort.path + '), mavPort rate: ' + mavPort.baudRate + ' open.')
    }
}

function mavPortClose() {
    console.log('mavPort closed.')

    setTimeout(mavPortOpening, 2000)
}

function mavPortError(error) {
    console.log('[mavPort error]: ' + error.message)

    setTimeout(mavPortOpening, 2000)
}

var mavStrFromDrone = ''
var mavStrFromDroneLength = 0
var mavVersion = 'unknown'
var mavVersionCheckFlag = false

function mavPortData(data) {
    mavStrFromDrone += data.toString('hex').toLowerCase()

    while (mavStrFromDrone.length > 20) {
        if (!mavVersionCheckFlag) {
            var stx = mavStrFromDrone.substring(0, 2)
            if (stx === 'fe') {
                var len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                var mavLength = (6 * 2) + (len * 2) + (2 * 2)
                var sysid = parseInt(mavStrFromDrone.substring(6, 8), 16)
                var msgid = parseInt(mavStrFromDrone.substring(10, 12), 16)

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true
                    mavVersion = 'v1'
                }

                if ((mavStrFromDrone.length) >= mavLength) {
                    var mavPacket = mavStrFromDrone.substring(0, mavLength)

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (10 * 2) + (len * 2) + (2 * 2)

                sysid = parseInt(mavStrFromDrone.substring(10, 12), 16)
                msgid = parseInt(mavStrFromDrone.substring(18, 20) + mavStrFromDrone.substring(16, 18) + mavStrFromDrone.substring(14, 16), 16)

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true
                    mavVersion = 'v2'
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2)
            }
        } else {
            stx = mavStrFromDrone.substring(0, 2)
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (6 * 2) + (len * 2) + (2 * 2)

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)
                    // console.log('v1', mavPacket)

                    if (mqtt_client !== null) {
                        mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'))
                    }
                    send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000);
                    setTimeout(parseMavFromDrone, 0, mavPacket)

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16)
                mavLength = (10 * 2) + (len * 2) + (2 * 2)

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength)
                    // console.log('v2', mavPacket)

                    if (mqtt_client !== null) {
                        mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'))
                    }
                    send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000);
                    setTimeout(parseMavFromDrone, 0, mavPacket)

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength)
                    mavStrFromDroneLength = 0
                } else {
                    break
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2)
            }
        }
    }
}

var fc = {}
var flag_base_mode = 0

function parseMavFromDrone(mavPacket) {
    try {
        var ver = mavPacket.substring(0, 2)
        if (ver === 'fd') {
            var cur_seq = parseInt(mavPacket.substring(8, 10), 16)
            var sys_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16)
            var msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16)
            var base_offset = 20
        } else {
            cur_seq = parseInt(mavPacket.substring(4, 6), 16)
            sys_id = parseInt(mavPacket.substring(6, 8).toLowerCase(), 16)
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16)
            base_offset = 12
        }

        if (msg_id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            var custom_mode = mavPacket.substring(base_offset, base_offset + 8).toLowerCase()
            base_offset += 8
            var type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var autopilot = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var base_mode = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var system_status = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()
            base_offset += 2
            var mavlink_version = mavPacket.substring(base_offset, base_offset + 2).toLowerCase()

            fc.heartbeat = {}
            fc.heartbeat.type = Buffer.from(type, 'hex').readUInt8(0)
            fc.heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0)
            fc.heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0)
            fc.heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0)
            fc.heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0)
            fc.heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0)

            if (fc.heartbeat.base_mode & 0x80) {
                if (flag_base_mode === 3) {
                    flag_base_mode++
                    my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                    my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                    sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
                    });
                } else {
                    flag_base_mode++
                    if (flag_base_mode > 16) {
                        flag_base_mode = 16
                    }
                }
            } else {
                flag_base_mode = 0

                my_sortie_name = 'disarm'
                my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
            }
        }
    } catch (e) {
        console.log('[parseMavFromDrone Error]', e)
    }
}

var aggr_content = {};

function send_aggr_to_Mobius(topic, content_each, gap) {
    if (aggr_content.hasOwnProperty(topic)) {
        var timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;
    } else {
        aggr_content[topic] = {};
        timestamp = moment().format('YYYY-MM-DDTHH:mm:ssSSS');
        aggr_content[topic][timestamp] = content_each;

        setTimeout(function () {
            sh_adn.crtci(topic + '?rcn=0', 0, aggr_content[topic], null, function () {
            });

            delete aggr_content[topic];
        }, gap, topic);
    }
}
