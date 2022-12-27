/**
 * Created by Wonseok Jung in KETI on 2022-12-27.
 */
const mqtt = require("mqtt")
const {nanoid} = require("nanoid")
const fs = require("fs")

global.sh_adn = require('./http_adn');
let tas_mav = null

global.my_host = '127.0.0.1'
global.my_gcs_name = ''
global.my_simul = 'on'
global.my_sysid = 250

let mobius_sub_rc_topic = '/Mobius/'
global.mobius_pub_drone_topic = '/Mobius/'

let MQTT_SUBSCRIPTION_ENABLE = 0;

global.my_parent_cnt_name = '';
global.my_cnt_name = '';
global.pre_my_cnt_name = '';
global.my_sortie_name = 'disarm'
global.my_command_parent_name = '';
global.my_command_name = '';

const retry_interval = 2500;
const normal_interval = 100;

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

global.drone_info = {};

function retrieve_my_cnt_name(callback) {
    sh_adn.rtvct('/Mobius/' + conf.ae.approval_gcs + '/approval/' + conf.ae.name + '/la', 0, (rsc, res_body, count) => {
        if (rsc == 2000) {
            drone_info = res_body[Object.keys(res_body)[0]].con;
            // console.log(drone_info);

            if (drone_info.hasOwnProperty('update')) {
                if (drone_info.update === 'enable' || drone_info.update === 'nCube') {
                    const shell = require('shelljs')

                    if (shell.exec('git reset --hard HEAD && git pull').code !== 0) {
                        shell.echo('Error: command failed')
                        shell.exit(1)
                    } else {
                        console.log('Finish update !');
                        drone_info.update = 'disable';
                        sh_adn.crtci('/Mobius/' + conf.ae.approval_gcs + '/approval/' + conf.ae.name, 0, JSON.stringify(drone_info), null, function () {
                            if (drone_info.update === 'disable') {
                                shell.exec('pm2 restart TELE-LVC')
                            }
                        });
                    }
                }
            }

            conf.sub = [];
            conf.cnt = [];
            conf.fc = [];

            if (drone_info.hasOwnProperty('gcs')) {
                my_gcs_name = drone_info.gcs;
            } else {
                my_gcs_name = 'KETI_MUV';
            }
            mobius_sub_rc_topic = mobius_sub_rc_topic + my_gcs_name + '/RC_Data'

            if (drone_info.hasOwnProperty('host')) {
                conf.cse.host = drone_info.host;
            } else {
            }

            console.log("gcs host is " + conf.cse.host);

            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'Drone_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/Drone_Data';
            info.name = my_drone_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info.parent = '/Mobius/' + drone_info.gcs + '/Drone_Data/' + my_drone_name;
            info.name = my_sortie_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_parent_cnt_name = info.parent;
            my_cnt_name = my_parent_cnt_name + '/' + info.name;

            if (drone_info.hasOwnProperty('secure')) {
                my_secure = drone_info.secure;
            } else {
                my_secure = 'off';
            }

            if (drone_info.hasOwnProperty('system_id')) {
                my_sysid = drone_info.system_id;
            } else {
                my_sysid = 8;
            }

            var info = {};
            info.parent = '/Mobius/' + drone_info.gcs;
            info.name = 'GCS_Data';
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            info = {};
            info.parent = '/Mobius/' + drone_info.gcs + '/GCS_Data';
            info.name = my_drone_name;
            conf.cnt.push(JSON.parse(JSON.stringify(info)));

            my_command_parent_name = info.parent;
            my_command_name = my_command_parent_name + '/' + info.name;

            MQTT_SUBSCRIPTION_ENABLE = 1;
            sh_state = 'crtae';
            setTimeout(http_watchdog, normal_interval);

            drone_info.id = conf.ae.name;
            // console.log(drone_info);
            fs.writeFileSync('drone_info.json', JSON.stringify(drone_info, null, 4), 'utf8');

            if (my_simul === 'on') {
                mqtt_connect('127.0.0.1')
            } else {
                mqtt_connect(my_host)
            }
            tas_mav = require('./thyme_tas_mav')

            callback();
        } else {
            console.log('x-m2m-rsc : ' + rsc + ' <----' + res_body);
            setTimeout(http_watchdog, retry_interval);
            callback();
        }
    });
}

function http_watchdog() {
    if (sh_state === 'rtvct') {
        retrieve_my_cnt_name(function () {

        });
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
            conf.ae.id = 'S' + shortid.generate();
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

                    tas_mav.ready();

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

        mqtt_client = mqtt.connect(connectOptions)

        mqtt_client.on('connect', () => {
            console.log('mqtt is connected to ( ' + serverip + ' )')

            if (mobius_sub_rc_topic !== '') {
                mqtt_client.subscribe(mobius_sub_rc_topic, () => {
                    console.log('[mqtt] mobius_sub_rc_topic is subscribed: ' + mobius_sub_rc_topic)
                })
            }
            if (my_command_name !== '') {
                mqtt_client.subscribe(my_command_name, () => {
                    console.log('[mqtt] my_command_name is subscribed: ' + my_command_name)
                })
            }
        })

        mqtt_client.on('message', (topic, message) => {
            if (topic === mobius_sub_rc_topic) {
                tas_mav.gcs_noti_handler(message.toString('hex'));
            } else if (topic === my_command_name) {
                tas_mav.gcs_noti_handler(message.toString('hex'));
            } else {
                console.log('Received Message ' + message.toString('hex') + ' From ' + topic)
            }
        })

        mqtt_client.on('error', function (err) {
            console.log('[mqtt] (error) ' + err.message)
            mqtt_client = null
            mqtt_connect(serverip)
        })
    }
}
