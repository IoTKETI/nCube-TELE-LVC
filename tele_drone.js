/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */

const moment = require('moment');
const dgram = require("dgram");
const {SerialPort} = require('serialport');
const mavlink = require('./mavlibrary/mavlink.js');

// FC TELE 연동용
let mavPort = null;
let mavPortNum = '/dev/ttyAMA0';
let mavBaudrate = '115200';

// TELE 데이터 수신용 (암복호모듈 연동)
let rfPort = null;
let rfPortNum = '/dev/ttyAMA1';
let rfBaudrate = '115200';

// RC 데이터 수신용 (암복호모듈 연동)
let rcPort = null;
let rcPortNum = '/dev/ttyAMA2';
let rcBaudrate = '115200';

// SBUS 모듈 연동용 (내부 Serial)
let sbusPort = null;
let sbusPortNum = '/dev/ttyAMA3';
let sbusBaudrate = '115200';

let mission_topic = '/Mobius/' + my_gcs_name + '/Mission_Data/' + my_drone_name;

let HOST = '127.0.0.1';
let PORT1 = 14555; // output: SITL --> GCS
let PORT2 = 14556; // input : GCS --> SITL

global.sitlUDP = null;
global.sitlUDP2 = null;

exports.ready = function tas_ready() {
    mavPortOpening();

    if (my_simul.toLowerCase() === 'on') {
        sitlUDP2 = dgram.createSocket('udp4');
    } else if (my_simul.toLowerCase() === 'off') {
        sbusPortOpening();
        rcPortOpening();
        rfPortOpening();
    }
}

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
                    // params.ch17_raw,
                    // params.ch18_raw,
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

exports.gcs_noti_handler = function (message) {
    // console.log('[GCS]', message);
    var ver = message.substring(0, 2);
    if (ver === 'ff') {
        // MAVLink로 변환된 조종 신호를 시뮬레이터 또는 FC에 전달
        let rc_data = message.toString('hex');
        // console.log('(MQTT) receive rc data - ' + rc_data);
        let rc_value = {};
        rc_value.target_system = my_sysid;
        rc_value.target_component = 1;
        rc_value.ch1_raw = SBUS2RC(parseInt(rc_data.substring(2, 4), 16));
        rc_value.ch2_raw = SBUS2RC(parseInt(rc_data.substring(4, 6), 16));
        rc_value.ch3_raw = SBUS2RC(parseInt(rc_data.substring(6, 8), 16));
        rc_value.ch4_raw = SBUS2RC(parseInt(rc_data.substring(8, 10), 16));
        rc_value.ch5_raw = SBUS2RC(parseInt(rc_data.substring(10, 12), 16));
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

        try {
            let rc_signal = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_RC_CHANNELS_OVERRIDE, rc_value);
            if (rc_signal == null) {
                console.log("mavlink message is null");
            } else {
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
                    sitlUDP2 = dgram.createSocket('udp4');

                    console.log('send cmd via sitlUDP2');
                }
            }
        } catch (ex) {
            console.log('[ERROR] ' + ex);
        }

        let mission_value = {};
        mission_value.target_system = my_sysid;
        mission_value.target_component = 1;
        mission_value.ch1_raw = SBUS2RC(parseInt(rc_data.substring(36, 38), 16));   // CH 18 - Tilt
        mission_value.ch2_raw = SBUS2RC(parseInt(rc_data.substring(34, 36), 16));   // CH 17 - Pan
        mission_value.ch3_raw = SBUS2RC(parseInt(rc_data.substring(38, 40), 16));   // CH 19 - Zoom
        mission_value.ch4_raw = SBUS2RC(parseInt(rc_data.substring(54, 56), 16));   // CH 27 - Gun
        // mission_value.ch4_raw = SBUS2RC(parseInt(rc_data.substring(40, 42), 16));   // CH 20
        mission_value.ch5_raw = SBUS2RC(parseInt(rc_data.substring(12, 14), 16));   // CH 6 - Drop
        mission_value.ch6_raw = SBUS2RC(parseInt(rc_data.substring(42, 44), 16));   // CH 21 - Camera direction
        mission_value.ch7_raw = SBUS2RC(parseInt(rc_data.substring(44, 46), 16));   // CH 22 - camera mode
        mission_value.ch8_raw = SBUS2RC(parseInt(rc_data.substring(46, 48), 16));   // CH 23 - sub
        mission_value.ch9_raw = SBUS2RC(parseInt(rc_data.substring(48, 50), 16));   // CH 24
        mission_value.ch10_raw = SBUS2RC(parseInt(rc_data.substring(50, 52), 16));   // CH 25
        mission_value.ch11_raw = SBUS2RC(parseInt(rc_data.substring(52, 54), 16));   // CH 26
        mission_value.ch12_raw = SBUS2RC(parseInt(rc_data.substring(56, 58), 16));   // CH 28
        mission_value.ch13_raw = SBUS2RC(parseInt(rc_data.substring(58, 60), 16));   // CH 29
        mission_value.ch14_raw = SBUS2RC(parseInt(rc_data.substring(60, 62), 16));   // CH 30
        mission_value.ch15_raw = SBUS2RC(parseInt(rc_data.substring(62, 64), 16));   // CH 31
        mission_value.ch16_raw = SBUS2RC(parseInt(rc_data.substring(64, 66), 16));   // CH 32
        console.log(mission_value);

        try {
            let mission_signal = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_RC_CHANNELS_OVERRIDE, mission_value);
            if (mission_signal == null) {
                console.log("mavlink message is null");
            } else {
                if (mqtt_client !== null) {
                    mqtt_client.publish(mission_topic, mission_signal, () => {
                        // console.log('publish ' + mission_signal.toString('hex') + ' to ' + mission_topic);
                    });
                }
            }
        } catch (ex) {
            console.log('[ERROR] ' + ex);
        }
    } else {
        if (ver === 'fd') {
            var msg_id = parseInt(message.substring(18, 20) + message.substring(16, 18) + message.substring(14, 16), 16);
            var base_offset = 20;
        } else {
            msg_id = parseInt(message.substring(10, 12).toLowerCase(), 16);
            base_offset = 12;
        }

        if (sitlUDP2 != null) {
            sitlUDP2.send(Buffer.from(message, 'hex'), 0, Buffer.from(message, 'hex').length, PORT2, HOST, (err) => {
                if (err) {
                    console.log('UDP message send error', err);
                    return;
                }
            });
        } else {
            sitlUDP2 = dgram.createSocket('udp4');

            console.log('send cmd via sitlUDP2');
        }
    }
}

function mavPortOpening() {
    if (my_simul.toLowerCase() === 'on') {
        if (sitlUDP === null) {
            sitlUDP = dgram.createSocket('udp4');
            sitlUDP.bind(PORT1, HOST);

            sitlUDP.on('listening', mavPortOpen);
            sitlUDP.on('message', mavPortData);
            sitlUDP.on('close', mavPortClose);
            sitlUDP.on('error', mavPortError);
        }
    } else {
        if (mavPort === null) {
            mavPort = new SerialPort({
                path: mavPortNum,
                baudRate: parseInt(mavBaudrate, 10),
            });
            mavPort.on('open', mavPortOpen);
            mavPort.on('close', mavPortClose);
            mavPort.on('error', mavPortError);
            mavPort.on('data', mavPortData);
        } else {
            if (mavPort.isOpen) {
                mavPort.close();
                mavPort = null;
                setTimeout(mavPortOpening, 2000);
            } else {
                mavPort.open();
            }
        }
    }
}

function mavPortOpen() {
    if (my_simul.toLowerCase() === 'on') {
        console.log('UDP socket connect to ' + sitlUDP.address().address + ':' + sitlUDP.address().port);
    } else {
        console.log('mavPort(' + mavPort.path + '), mavPort rate: ' + mavPort.baudRate + ' open.');
    }
}

function mavPortClose() {
    console.log('mavPort closed.');

    setTimeout(mavPortOpening, 2000);
}

function mavPortError(error) {
    console.log('[mavPort error]: ' + error.message);

    setTimeout(mavPortOpening, 2000);
}

var mavStrFromDrone = '';
var mavStrFromDroneLength = 0;
var mavVersion = 'unknown';
var mavVersionCheckFlag = false;

function mavPortData(data) {
    console.log('mavPortData ', data.toString('hex'));

    mavStrFromDrone += data.toString('hex').toLowerCase();

    while (mavStrFromDrone.length > 20) {
        if (!mavVersionCheckFlag) {
            var stx = mavStrFromDrone.substring(0, 2);
            if (stx === 'fe') {
                var len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                var mavLength = (6 * 2) + (len * 2) + (2 * 2);
                var sysid = parseInt(mavStrFromDrone.substring(6, 8), 16);
                var msgid = parseInt(mavStrFromDrone.substring(10, 12), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v1';
                }

                if ((mavStrFromDrone.length) >= mavLength) {
                    var mavPacket = mavStrFromDrone.substring(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else if (stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                sysid = parseInt(mavStrFromDrone.substring(10, 12), 16);
                msgid = parseInt(mavStrFromDrone.substring(18, 20) + mavStrFromDrone.substring(16, 18) + mavStrFromDrone.substring(14, 16), 16);

                if (msgid === 0 && len === 9) { // HEARTBEAT
                    mavVersionCheckFlag = true;
                    mavVersion = 'v2';
                }
                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2);
            }
        } else {
            stx = mavStrFromDrone.substring(0, 2);
            if (mavVersion === 'v1' && stx === 'fe') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (6 * 2) + (len * 2) + (2 * 2);

                if ((mavStrFromDrone.length) >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);
                    // console.log('v1', mavPacket);

                    if (my_simul.toLowerCase() === 'on') {
                        if (mqtt_client !== null) {
                            mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'));
                        }
                        send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000);
                    } else if (my_simul.toLowerCase() === 'off') {
                        if (rfPort !== null) {
                            rfPort.write(Buffer.from(mavPacket, 'hex'), () => {
                                console.log(mavPacket);
                            });
                        }
                    }
                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else if (mavVersion === 'v2' && stx === 'fd') {
                len = parseInt(mavStrFromDrone.substring(2, 4), 16);
                mavLength = (10 * 2) + (len * 2) + (2 * 2);

                if (mavStrFromDrone.length >= mavLength) {
                    mavPacket = mavStrFromDrone.substring(0, mavLength);
                    // console.log('v2', mavPacket);

                    if (my_simul.toLowerCase() === 'on') {
                        if (mqtt_client !== null) {
                            mqtt_client.publish(my_cnt_name, Buffer.from(mavPacket, 'hex'));
                        }
                        send_aggr_to_Mobius(my_cnt_name, mavPacket, 2000);
                    } else if (my_simul.toLowerCase() === 'off') {
                        if (rfPort !== null) {
                            rfPort.write(Buffer.from(mavPacket, 'hex'), () => {
                                console.log(mavPacket);
                            });
                        }
                    }
                    setTimeout(parseMavFromDrone, 0, mavPacket);

                    mavStrFromDrone = mavStrFromDrone.substring(mavLength);
                    mavStrFromDroneLength = 0;
                } else {
                    break;
                }
            } else {
                mavStrFromDrone = mavStrFromDrone.substring(2);
            }
        }
    }
}

var fc = {}
var flag_base_mode = 0

function parseMavFromDrone(mavPacket) {
    try {
        var ver = mavPacket.substring(0, 2);
        if (ver === 'fd') {
            var cur_seq = parseInt(mavPacket.substring(8, 10), 16);
            var sys_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            var msg_id = parseInt(mavPacket.substring(18, 20) + mavPacket.substring(16, 18) + mavPacket.substring(14, 16), 16);
            var base_offset = 20;
        } else {
            cur_seq = parseInt(mavPacket.substring(4, 6), 16);
            sys_id = parseInt(mavPacket.substring(6, 8).toLowerCase(), 16);
            msg_id = parseInt(mavPacket.substring(10, 12).toLowerCase(), 16);
            base_offset = 12;
        }

        if (msg_id === mavlink.MAVLINK_MSG_ID_HEARTBEAT) { // #00 : HEARTBEAT
            var custom_mode = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var type = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var autopilot = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var base_mode = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var system_status = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();
            base_offset += 2;
            var mavlink_version = mavPacket.substring(base_offset, base_offset + 2).toLowerCase();

            fc.heartbeat = {};
            fc.heartbeat.type = Buffer.from(type, 'hex').readUInt8(0);
            fc.heartbeat.autopilot = Buffer.from(autopilot, 'hex').readUInt8(0);
            fc.heartbeat.base_mode = Buffer.from(base_mode, 'hex').readUInt8(0);
            fc.heartbeat.custom_mode = Buffer.from(custom_mode, 'hex').readUInt32LE(0);
            fc.heartbeat.system_status = Buffer.from(system_status, 'hex').readUInt8(0);
            fc.heartbeat.mavlink_version = Buffer.from(mavlink_version, 'hex').readUInt8(0);

            if (fc.heartbeat.base_mode & 0x80) {
                if (flag_base_mode === 3) {
                    flag_base_mode++;
                    my_sortie_name = moment().format('YYYY_MM_DD_T_HH_mm');
                    my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
                    sh_adn.crtct(my_parent_cnt_name + '?rcn=0', my_sortie_name, 0, function (rsc, res_body, count) {
                    });
                } else {
                    flag_base_mode++
                    if (flag_base_mode > 16) {
                        flag_base_mode = 16;
                    }
                }
            } else {
                flag_base_mode = 0;

                my_sortie_name = 'disarm';
                my_cnt_name = my_parent_cnt_name + '/' + my_sortie_name;
            }
        } else if (msg_id == mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) { // #33
            var time_boot_ms = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var lat = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var lon = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var relative_alt = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 8;
            var vx = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 4;
            var vy = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 4;
            var vz = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();
            base_offset += 4;
            var hdg = mavPacket.substring(base_offset, base_offset + 8).toLowerCase();

            fc.global_position_int = {};
            fc.global_position_int.lat = Buffer.from(lat, 'hex').readInt32LE(0);
            fc.global_position_int.lon = Buffer.from(lon, 'hex').readInt32LE(0);
            fc.global_position_int.alt = Buffer.from(alt, 'hex').readInt32LE(0);
            fc.global_position_int.relative_alt = Buffer.from(relative_alt, 'hex').readInt32LE(0);
            // fc.global_position_int.vx = Buffer.from(vx, 'hex').readInt16LE(0);
            // fc.global_position_int.vy = Buffer.from(vy, 'hex').readInt16LE(0);
            // fc.global_position_int.vz = Buffer.from(vz, 'hex').readInt16LE(0);
            fc.global_position_int.hdg = Buffer.from(hdg, 'hex').readUInt16LE(0);
            fc.global_position_int.drone_name = my_drone_name;
        }
    } catch (e) {
        console.log('[parseMavFromDrone Error]', msg_id + '\n' + e);
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

function rfPortOpening() {
    if (rfPort === null) {
        rfPort = new SerialPort({
            path: rfPortNum,
            baudRate: parseInt(rfBaudrate, 10),
        });
        rfPort.on('open', rfPortOpen);
        rfPort.on('close', rfPortClose);
        rfPort.on('error', rfPortError);
        rfPort.on('data', rfPortData);
    } else {
        if (rfPort.isOpen) {
            rfPort.close();
            rfPort = null;
            setTimeout(rfPortOpening, 2000);
        } else {
            rfPort.open();
        }
    }
}

function rfPortOpen() {
    console.log('rfPort(' + rfPort.path + '), rfPort rate: ' + rfPort.baudRate + ' open.');
}

function rfPortClose() {
    console.log('rfPort closed.');

    setTimeout(rfPortOpening, 2000);
}

function rfPortError(error) {
    console.log('[rfPort error]: ' + error.message);

    setTimeout(rfPortOpening, 2000);
}

function rfPortData(message) {
    console.log('rfPortData ', message.toString('hex'));

    if (mavPort !== null) {
        mavPort.write(message, () => {
            console.log('Received FC command( ' + message.toString('hex') + ' ) from GCS');
        });
    }
}

function rcPortOpening() {
    if (rcPort === null) {
        rcPort = new SerialPort({
            path: rcPortNum,
            baudRate: parseInt(rcBaudrate, 10),
        });
        rcPort.on('open', rcPortOpen);
        rcPort.on('close', rcPortClose);
        rcPort.on('error', rcPortError);
        rcPort.on('data', rcPortData);
    } else {
        if (rcPort.isOpen) {
            rcPort.close();
            rcPort = null;
            setTimeout(rcPortOpening, 2000);
        } else {
            rcPort.open();
        }
    }
}

function rcPortOpen() {
    console.log('rcPort(' + rcPort.path + '), rcPort rate: ' + rcPort.baudRate + ' open.');
}

function rcPortClose() {
    console.log('rcPort closed.');

    setTimeout(rcPortOpening, 2000);
}

function rcPortError(error) {
    console.log('[rcPort error]: ' + error.message);

    setTimeout(rcPortOpening, 2000);
}

const RC_LENGTH = 68;
let RCstrFromGCS = '';

function rcPortData(message) {
    RCstrFromGCS += message.toString().toLowerCase();

    while (RCstrFromGCS.length >= RC_LENGTH) {
        let header1 = RCstrFromGCS.substring(0, 2);
        if (header1 === 'ff') {
            let rc_data = RCstrFromGCS.substring(0, RC_LENGTH);
            // console.log('(Serial) receive rc data - ' + rc_data);

            if (sbusPort !== null) {
                // console.log('ready to send');

                sbusPort.write(Buffer.from(rc_data, 'hex'), () => {
                    console.log('write to sbusPort ' + rc_data);
                });
            }

            let mission_value = {};
            mission_value.target_system = my_sysid;
            mission_value.target_component = 1;
            mission_value.ch1_raw = SBUS2RC(parseInt(rc_data.substring(36, 38), 16));   // CH 18 - Tilt
            mission_value.ch2_raw = SBUS2RC(parseInt(rc_data.substring(34, 36), 16));   // CH 17 - Pan
            mission_value.ch3_raw = SBUS2RC(parseInt(rc_data.substring(38, 40), 16));   // CH 19 - Zoom
            mission_value.ch4_raw = SBUS2RC(parseInt(rc_data.substring(54, 56), 16));   // CH 27 - Gun
            // mission_value.ch4_raw = SBUS2RC(parseInt(rc_data.substring(40, 42), 16));   // CH 20
            mission_value.ch5_raw = SBUS2RC(parseInt(rc_data.substring(12, 14), 16));   // CH 6 - Drop
            mission_value.ch6_raw = SBUS2RC(parseInt(rc_data.substring(42, 44), 16));   // CH 21 - Camera direction
            mission_value.ch7_raw = SBUS2RC(parseInt(rc_data.substring(44, 46), 16));   // CH 22 - camera mode
            mission_value.ch8_raw = SBUS2RC(parseInt(rc_data.substring(46, 48), 16));   // CH 23 - sub
            mission_value.ch9_raw = SBUS2RC(parseInt(rc_data.substring(48, 50), 16));   // CH 24
            mission_value.ch10_raw = SBUS2RC(parseInt(rc_data.substring(50, 52), 16));   // CH 25
            mission_value.ch11_raw = SBUS2RC(parseInt(rc_data.substring(52, 54), 16));   // CH 26
            mission_value.ch12_raw = SBUS2RC(parseInt(rc_data.substring(56, 58), 16));   // CH 28
            mission_value.ch13_raw = SBUS2RC(parseInt(rc_data.substring(58, 60), 16));   // CH 29
            mission_value.ch14_raw = SBUS2RC(parseInt(rc_data.substring(60, 62), 16));   // CH 30
            mission_value.ch15_raw = SBUS2RC(parseInt(rc_data.substring(62, 64), 16));   // CH 31
            mission_value.ch16_raw = SBUS2RC(parseInt(rc_data.substring(64, 66), 16));   // CH 32

            try {
                let mission_signal = mavlinkGenerateMessage(255, 0xbe, mavlink.MAVLINK_MSG_ID_RC_CHANNELS_OVERRIDE, mission_value);
                if (mission_signal == null) {
                    console.log("mavlink message is null");
                } else {
                    if (rcPort !== null) {
                        rcPort.write(mission_signal, () => {
                            console.log('write rcPort ' + mission_signal.toString('hex'));
                        });
                    }
                }
            } catch (ex) {
                console.log('[ERROR] ' + ex);
            }
        }
    }
}

function sbusPortOpening() {
    if (sbusPort === null) {
        sbusPort = new SerialPort({
            path: sbusPortNum,
            baudRate: parseInt(sbusBaudrate, 10),
        });
        sbusPort.on('open', sbusPortOpen);
        sbusPort.on('close', sbusPortClose);
        sbusPort.on('error', sbusPortError);
        sbusPort.on('data', sbusPortData);
    } else {
        if (sbusPort.isOpen) {
            sbusPort.close();
            sbusPort = null;
            setTimeout(sbusPortOpening, 2000);
        } else {
            sbusPort.open();
        }
    }
}

function sbusPortOpen() {
    console.log('sbusPort(' + sbusPort.path + '), sbusPort rate: ' + sbusPort.baudRate + ' open.');
}

function sbusPortClose() {
    console.log('sbusPort closed.');

    setTimeout(sbusPortOpening, 2000);
}

function sbusPortError(error) {
    console.log('[sbusPort error]: ' + error.message);

    setTimeout(sbusPortOpening, 2000);
}

function sbusPortData(message) {
    // console.log('Received res from sbus module');

    if (rcPort !== null) {
        rcPort.write(message, () => {
            // console.log("send res to RC");
        });
    }
}
