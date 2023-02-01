/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */
const mqtt = require("mqtt");
const {nanoid} = require("nanoid");
const fs = require("fs");
const {exec} = require("child_process");

let tas_mav = null;

let mobius_sub_rc_topic = '/Mobius/';

let MQTT_SUBSCRIPTION_ENABLE = 0;

global.my_parent_cnt_name = '';
global.my_cnt_name = '';
global.pre_my_cnt_name = '';
global.my_sortie_name = 'disarm'
global.my_command_parent_name = '';
global.my_command_name = '';

const retry_interval = 2500;
const normal_interval = 100;

let sub_sim_info_for_start = '/LVC/start';
global.pub_start_init = '/LVC/init';

global.init_flag = false;
let init_t = null;

global.getType = function (p) {
    var type = 'string';
    if (Array.isArray(p)) {
        type = 'array';
    } else if (typeof p === 'string') {
        try {
            var _p = JSON.parse(p);
            if (typeof _p === 'object') {
                type = 'string_object';
            } else {
                type = 'string';
            }
        } catch (e) {
            type = 'string';
            return type;
        }
    } else if (p != null && typeof p === 'object') {
        type = 'object';
    } else {
        type = 'other';
    }

    return type;
};

var return_count = 0;
var request_count = 0;

function ae_response_action(status, res_body, callback) {
    var aeid = res_body['m2m:ae']['aei'];
    conf.ae.id = aeid;
    callback(status, aeid);
}

function create_cnt_all(count, callback) {
    if (conf.cnt.length == 0) {
        callback(2001, count);
    } else {
        if (conf.cnt.hasOwnProperty(count)) {
            var parent = conf.cnt[count].parent;
            var rn = conf.cnt[count].name;
            sh_adn.crtct(parent, rn, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_cnt_all(++count, function (status, count) {
                        callback(status, count);
                    });
                } else {
                    callback(9999, count);
                }
            });
        } else {
            callback(2001, count);
        }
    }
}

function delete_sub_all(count, callback) {
    if (conf.sub.length == 0) {
        callback(2001, count);
    } else {
        if (conf.sub.hasOwnProperty(count)) {
            var target = conf.sub[count].parent + '/' + conf.sub[count].name;
            sh_adn.delsub(target, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2002 || rsc == 2000 || rsc == 4105 || rsc == 4004) {
                    delete_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                } else {
                    callback(9999, count);
                }
            });
        } else {
            callback(2001, count);
        }
    }
}

function create_sub_all(count, callback) {
    if (conf.sub.length == 0) {
        callback(2001, count);
    } else {
        if (conf.sub.hasOwnProperty(count)) {
            var parent = conf.sub[count].parent;
            var rn = conf.sub[count].name;
            var nu = conf.sub[count].nu;
            sh_adn.crtsub(parent, rn, nu, count, function (rsc, res_body, count) {
                if (rsc == 5106 || rsc == 2001 || rsc == 4105) {
                    create_sub_all(++count, function (status, count) {
                        callback(status, count);
                    });
                } else {
                    callback('9999', count);
                }
            });
        } else {
            callback(2001, count);
        }
    }
}

function retrieve_my_cnt_name() {
    mobius_sub_rc_topic = mobius_sub_rc_topic + my_gcs_name + '/RC_Data';

    console.log("gcs host is " + conf.cse.host);

    var info = {};
    info.parent = '/Mobius/' + my_gcs_name;
    info.name = 'Drone_Data';
    conf.cnt.push(JSON.parse(JSON.stringify(info)));

    info = {};
    info.parent = '/Mobius/' + my_gcs_name + '/Drone_Data';
    info.name = my_drone_name;
    conf.cnt.push(JSON.parse(JSON.stringify(info)));

    info.parent = '/Mobius/' + my_gcs_name + '/Drone_Data/' + my_drone_name;
    info.name = my_sortie_name;
    conf.cnt.push(JSON.parse(JSON.stringify(info)));

    my_parent_cnt_name = info.parent;
    my_cnt_name = my_parent_cnt_name + '/' + info.name;

    var info = {};
    info.parent = '/Mobius/' + my_gcs_name;
    info.name = 'GCS_Data';
    conf.cnt.push(JSON.parse(JSON.stringify(info)));

    info = {};
    info.parent = '/Mobius/' + my_gcs_name + '/GCS_Data';
    info.name = my_drone_name;
    conf.cnt.push(JSON.parse(JSON.stringify(info)));

    my_command_parent_name = info.parent;
    my_command_name = my_command_parent_name + '/' + info.name;

    MQTT_SUBSCRIPTION_ENABLE = 1;
    sh_state = 'crtae';
    setTimeout(http_watchdog, normal_interval);

    tas_mav = require('./thyme_tas_mav');

    mqtt_connect('127.0.0.1');

    if (my_simul.toLowerCase() === 'on') {
        if (mqtt_client !== null) {
            let drone_info = {};
            drone_info.drone_name = my_drone_name;
            init_t = setInterval(() => {
                if (!init_flag) {
                    mqtt_client.publish(pub_start_init, JSON.stringify(drone_info));
                } else {
                    clearInterval(init_t)
                }
            }, 5 * 1000);
        }
    }
}

function http_watchdog() {
    if (sh_state === 'rtvct') {
        retrieve_my_cnt_name();
    } else if (sh_state === 'crtae') {
        console.log('[sh_state] : ' + sh_state);
        sh_adn.crtae(conf.ae.parent, conf.ae.name, conf.ae.appid, function (status, res_body) {
            console.log(res_body);
            if (status == 2001) {
                ae_response_action(status, res_body, function (status, aeid) {
                    console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');
                    sh_state = 'rtvae';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                });
            } else if (status == 5106 || status == 4105) {
                console.log('x-m2m-rsc : ' + status + ' <----');
                sh_state = 'rtvae';

                setTimeout(http_watchdog, normal_interval);
            } else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    } else if (sh_state === 'rtvae') {
        if (conf.ae.id === 'S') {
            conf.ae.id = 'S' + nanoid(9);
        }

        console.log('[sh_state] : ' + sh_state);
        sh_adn.rtvae(conf.ae.parent + '/' + conf.ae.name, function (status, res_body) {
            if (status == 2000) {
                var aeid = res_body['m2m:ae']['aei'];
                console.log('x-m2m-rsc : ' + status + ' - ' + aeid + ' <----');

                if (conf.ae.id != aeid && conf.ae.id != ('/' + aeid)) {
                    console.log('AE-ID created is ' + aeid + ' not equal to device AE-ID is ' + conf.ae.id);
                } else {
                    sh_state = 'crtct';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            } else {
                console.log('x-m2m-rsc : ' + status + ' <----');
                setTimeout(http_watchdog, retry_interval);
            }
        });
    } else if (sh_state === 'crtct') {
        console.log('[sh_state] : ' + sh_state);
        create_cnt_all(request_count, function (status, count) {
            if (status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            } else {
                request_count = ++count;
                return_count = 0;
                if (conf.cnt.length <= count) {
                    sh_state = 'delsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    } else if (sh_state === 'delsub') {
        console.log('[sh_state] : ' + sh_state);
        delete_sub_all(request_count, function (status, count) {
            if (status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            } else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtsub';
                    request_count = 0;
                    return_count = 0;

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    } else if (sh_state === 'crtsub') {
        console.log('[sh_state] : ' + sh_state);
        create_sub_all(request_count, function (status, count) {
            if (status == 9999) {
                setTimeout(http_watchdog, retry_interval);
            } else {
                request_count = ++count;
                return_count = 0;
                if (conf.sub.length <= count) {
                    sh_state = 'crtci';

                    if (my_simul.toLowerCase() === 'off') {
                        console.log("====================================\n\t Using real drone \t\t\n====================================");
                        tas_mav.ready()
                    }

                    setTimeout(http_watchdog, normal_interval);
                }
            }
        });
    } else if (sh_state === 'crtci') {
        //setTimeout(check_rtv_cnt, 10000);
    }
}

setTimeout(http_watchdog, normal_interval);

function mqtt_connect(serverip) {
    if (mqtt_client === null) {
        if (conf.usesecure === 'disable') {
            var connectOptions = {
                host: serverip,
                port: conf.cse.mqttport,
                protocol: "mqtt",
                keepalive: 10,
                clientId: 'TELE_RF_' + nanoid(15),
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
                clientId: 'TELE_RF_' + nanoid(15),
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

        mqtt_client = mqtt.connect(connectOptions);

        mqtt_client.on('connect', () => {
            console.log('mqtt is connected to ( ' + serverip + ' )')

            if (mobius_sub_rc_topic !== '') {
                mqtt_client.subscribe(mobius_sub_rc_topic, () => {
                    console.log('[mqtt] mobius_sub_rc_topic is subscribed: ' + mobius_sub_rc_topic);
                });
            }
            if (my_command_name !== '') {
                mqtt_client.subscribe(my_command_name, () => {
                    console.log('[mqtt] my_command_name is subscribed: ' + my_command_name);
                });
            }
            if (sub_sim_info_for_start !== '') {
                mqtt_client.subscribe(sub_sim_info_for_start, () => {
                    console.log('[mqtt] sub_sim_info_for_start is subscribed: ' + sub_sim_info_for_start);
                });
            }
        })

        mqtt_client.on('message', (topic, message) => {
            if (topic === mobius_sub_rc_topic) {
                tas_mav.gcs_noti_handler(message.toString('hex'));
            } else if (topic === my_command_name) {
                tas_mav.gcs_noti_handler(message.toString('hex'));
            } else if (topic === sub_sim_info_for_start) {
                // TODO: 버퍼에 감싸서 보내는지, JSON 그대로 보내는지
                let init_info = JSON.parse(message.toString());
                console.log(init_info)
                if (!started) {
                    console.log("==============================\n\t Using SITL \t\t\n==============================");
                    tas_mav.ready()
                    // TODO: heading(Hdg) 값 필요함, dronelocation 무슨 값인지??
                    console.log('sh start_sitl.sh ' + init_info.dronelocation.Lat + ' ' + init_info.dronelocation.Lon + ' ' + init_info.dronelocation.Alt + ' ' + init_info.dronelocation.Hdg);
                    exec('sh start_sitl.sh ' + init_info.dronelocation.Lat + ' ' + init_info.dronelocation.Lon + ' ' + init_info.dronelocation.Alt + ' ' + init_info.dronelocation.Hdg, {cwd: process.cwd()}, (error, stdout, stderr) => {
                        if (error) {
                            console.log('error - ' + error);
                        }
                        if (stdout) {
                            console.log('stdout - ' + stdout);
                        }
                        if (stderr) {
                            console.log('stderr - ' + stderr);
                        }
                    });
                    started = true;
                    init_flag = true;
                }
            } else {
                console.log('Received Message ' + message.toString('hex') + ' From ' + topic);
            }
        })

        mqtt_client.on('error', function (err) {
            console.log('[mqtt] (error) ' + err.message);
            mqtt_client = null;
            mqtt_connect(serverip);
        })
    }
}
